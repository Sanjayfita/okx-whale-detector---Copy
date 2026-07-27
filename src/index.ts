import { OKXInstrumentClient } from './clients/okx/OKXInstrumentClient';
import { OKXMarketDiscoveryClient } from './clients/okx/OKXMarketDiscoveryClient';
import { appConfig } from './config/appConfig';
import { healthConfig, validateHealthConfig } from './config/healthConfig';
import {
  marketDiscoveryConfig,
  validateMarketDiscoveryConfig,
} from './config/marketDiscoveryConfig';
import {
  performanceConfig,
  validatePerformanceConfig,
} from './config/performanceConfig';
import {
  subscriptionConfig,
  validateSubscriptionConfig,
} from './config/subscriptionConfig';
import { resolveSymbolConfig, SYMBOL_PROFILES } from './config/symbolProfiles';
import { validateAppConfig } from './config/validateAppConfig';
import { CandleUpdateHandler } from './core/CandleUpdateHandler';
import { MarketHealthMonitor } from './core/MarketHealthMonitor';
import { MarketState } from './core/MarketState';
import { SubscriptionManager } from './core/SubscriptionManager';
import { SummaryThrottle } from './core/SummaryThrottle';
import { MarketEngine } from './market/MarketEngine';

const start = async (): Promise<void> => {
  validateAppConfig(appConfig);
  validateHealthConfig(healthConfig);
  validateMarketDiscoveryConfig(marketDiscoveryConfig);
  validatePerformanceConfig(performanceConfig);
  validateSubscriptionConfig(subscriptionConfig);

  console.log('OKX Whale Detector starting...');
  console.log('Discovering eligible OKX markets...');

  const discoveryClient = new OKXMarketDiscoveryClient();
  const activeProfiles = await discoveryClient.discoverProfiles(
    SYMBOL_PROFILES,
    marketDiscoveryConfig,
  );

  console.log(
    `Selected ${activeProfiles.length} markets ` +
      `(${SYMBOL_PROFILES.length} required, ` +
      `${activeProfiles.length - SYMBOL_PROFILES.length} discovered).`,
  );
  console.log('Loading OKX instrument metadata...');

  const instrumentClient = new OKXInstrumentClient();
  const instruments =
    await instrumentClient.loadMarketInstruments(activeProfiles);

  console.log(`Loaded metadata for ${instruments.size} instruments.`);

  const marketStates = new Map<string, MarketState>();
  const summaryThrottle = new SummaryThrottle(
    appConfig.reporting.summaryIntervalMs,
  );

  const requireInstrument = (symbol: string) => {
    const instrument = instruments.get(symbol);

    if (!instrument) {
      throw new Error(`Missing resolved instrument metadata for ${symbol}`);
    }

    return instrument;
  };

  const createMarketState = (symbol: string): MarketState =>
    new MarketState(resolveSymbolConfig(symbol), requireInstrument(symbol));

  for (const profile of activeProfiles) {
    marketStates.set(profile.symbol, createMarketState(profile.symbol));
  }

  const marketEngine = new MarketEngine(marketStates, summaryThrottle);
  const candleUpdateHandler = new CandleUpdateHandler(marketStates);
  const healthMonitor = new MarketHealthMonitor(
    activeProfiles.map((profile) => profile.symbol),
    healthConfig,
  );

  const subscriptionManager = new SubscriptionManager({
    maximumSymbolsPerConnection: subscriptionConfig.maximumSymbolsPerConnection,
    onOrderBook: (update) => {
      healthMonitor.recordOrderBook(update.instId);
      marketEngine.processOrderBookUpdate(update);
    },
    onCandle: (candle) => {
      healthMonitor.recordCandle(candle.instId);
      candleUpdateHandler.handle(candle);
    },
    onShardReconnect: (symbols) => {
      console.warn(
        `🔄 OKX order-book shard reconnected for ${symbols.length} markets. ` +
          'Resetting only its local market state...',
      );

      for (const symbol of symbols) {
        marketStates.set(symbol, createMarketState(symbol));
      }

      candleUpdateHandler.resetSymbols(symbols);
      marketEngine.resetSymbols(symbols);
      healthMonitor.resetSymbols(symbols);

      console.log(
        `✅ Reset ${symbols.length} markets. Waiting for fresh snapshots...`,
      );
    },
  });

  const activeInstruments = activeProfiles.map((profile) =>
    requireInstrument(profile.symbol),
  );

  subscriptionManager.start(activeInstruments);
  healthMonitor.start();

  const shards = subscriptionManager.getShards();

  console.log(
    `Started ${shards.length} subscription shard${shards.length === 1 ? '' : 's'} ` +
      `with up to ${subscriptionConfig.maximumSymbolsPerConnection} markets each.`,
  );
  console.log(
    `Started market health monitoring for ${activeProfiles.length} markets.`,
  );

  let isShuttingDown = false;

  const shutdown = (signal: NodeJS.Signals): void => {
    if (isShuttingDown) {
      return;
    }

    isShuttingDown = true;

    console.log(`Received ${signal}; closing OKX connections.`);

    healthMonitor.stop();
    subscriptionManager.close();
  };

  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
};

void start().catch((error: unknown) => {
  console.error('Failed to start OKX Whale Detector:', error);
  process.exitCode = 1;
});
