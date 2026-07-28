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
  recordingConfig,
  validateRecordingConfig,
} from './config/recordingConfig';
import {
  subscriptionConfig,
  validateSubscriptionConfig,
} from './config/subscriptionConfig';
import {
  throughputConfig,
  validateThroughputConfig,
} from './config/throughputConfig';
import { resolveSymbolConfig, SYMBOL_PROFILES } from './config/symbolProfiles';
import { validateAppConfig } from './config/validateAppConfig';
import { CandleUpdateHandler } from './core/CandleUpdateHandler';
import { MarketHealthMonitor } from './core/MarketHealthMonitor';
import { MarketState } from './core/MarketState';
import { SubscriptionManager } from './core/SubscriptionManager';
import { SummaryThrottle } from './core/SummaryThrottle';
import { ThroughputMonitor } from './core/ThroughputMonitor';
import { MarketEngine } from './market/MarketEngine';
import { ExternalSignalCorrelationService } from './external/core/ExternalSignalCorrelationService';
import { MarketDataRecorder } from './recording/MarketDataRecorder';

const start = async (): Promise<void> => {
  validateAppConfig(appConfig);
  validateHealthConfig(healthConfig);
  validateMarketDiscoveryConfig(marketDiscoveryConfig);
  validatePerformanceConfig(performanceConfig);
  validateRecordingConfig(recordingConfig);
  validateSubscriptionConfig(subscriptionConfig);
  validateThroughputConfig(throughputConfig);

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

  const activeInstruments = activeProfiles.map((profile) =>
    requireInstrument(profile.symbol),
  );
  const recorder = recordingConfig.enabled
    ? new MarketDataRecorder(recordingConfig.directory, activeInstruments)
    : undefined;
  const externalSignalCorrelationService =
    new ExternalSignalCorrelationService();
  const marketEngine = new MarketEngine(
    marketStates,
    summaryThrottle,
    undefined,
    undefined,
    undefined,
    externalSignalCorrelationService,
  );
  const candleUpdateHandler = new CandleUpdateHandler(marketStates);
  const activeSymbols = activeProfiles.map((profile) => profile.symbol);
  const healthMonitor = new MarketHealthMonitor(activeSymbols, healthConfig);
  const throughputMonitor = new ThroughputMonitor(throughputConfig);

  const subscriptionManager = new SubscriptionManager({
    maximumSymbolsPerConnection: subscriptionConfig.maximumSymbolsPerConnection,
    onOrderBook: (update) => {
      recorder?.recordOrderBook(update);
      healthMonitor.recordOrderBook(update.instId);
      throughputMonitor.record(update.instId, 'orderBook');
      marketEngine.processOrderBookUpdate(update);
    },
    onCandle: (candle) => {
      recorder?.recordCandle(candle);
      healthMonitor.recordCandle(candle.instId);
      throughputMonitor.record(candle.instId, 'candle');
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
      throughputMonitor.resetSymbols(symbols);

      console.log(
        `✅ Reset ${symbols.length} markets. Waiting for fresh snapshots...`,
      );
    },
  });

  subscriptionManager.start(activeInstruments);
  healthMonitor.start();
  throughputMonitor.start();

  const shards = subscriptionManager.getShards();

  console.log(
    `Started ${shards.length} subscription shard${shards.length === 1 ? '' : 's'} ` +
      `with up to ${subscriptionConfig.maximumSymbolsPerConnection} markets each.`,
  );
  console.log(
    `Started market health monitoring for ${activeProfiles.length} markets.`,
  );
  console.log('Started throughput and event-loop monitoring.');

  if (recorder) {
    console.log(`Recording order-book and candle data to ${recorder.filePath}`);
  }

  let isShuttingDown = false;

  const shutdown = (signal: NodeJS.Signals): void => {
    if (isShuttingDown) {
      return;
    }

    isShuttingDown = true;

    console.log(`Received ${signal}; closing OKX connections.`);

    healthMonitor.stop();
    throughputMonitor.stop();
    recorder?.close();
    subscriptionManager.close();
  };

  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
};

void start().catch((error: unknown) => {
  console.error('Failed to start OKX Whale Detector:', error);
  process.exitCode = 1;
});
