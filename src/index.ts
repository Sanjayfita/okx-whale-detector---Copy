import { OKXWebSocketClient } from './clients/okx/OKXWebSocketClient';
import { OKXCandleWebSocketClient } from './clients/okx/OKXCandleWebSocketClient';
import { OKXInstrumentClient } from './clients/okx/OKXInstrumentClient';
import { OKXMarketDiscoveryClient } from './clients/okx/OKXMarketDiscoveryClient';
import { appConfig } from './config/appConfig';
import {
  marketDiscoveryConfig,
  validateMarketDiscoveryConfig,
} from './config/marketDiscoveryConfig';
import { resolveSymbolConfig, SYMBOL_PROFILES } from './config/symbolProfiles';
import { validateAppConfig } from './config/validateAppConfig';
import { MarketState } from './core/MarketState';
import { SummaryThrottle } from './core/SummaryThrottle';
import { CandleUpdateHandler } from './core/CandleUpdateHandler';
import { MarketEngine } from './market/MarketEngine';

const start = async (): Promise<void> => {
  validateAppConfig(appConfig);
  validateMarketDiscoveryConfig(marketDiscoveryConfig);

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

  const client = new OKXWebSocketClient();
  const candleClient = new OKXCandleWebSocketClient();
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

  candleClient.onCandle((candle) => {
    candleUpdateHandler.handle(candle);
  });

  client.onReconnect(() => {
    console.warn(
      '🔄 OKX connection restored. ' + 'Resetting local market state...',
    );

    for (const profile of activeProfiles) {
      marketStates.set(profile.symbol, createMarketState(profile.symbol));
    }

    candleUpdateHandler.reset();
    marketEngine.reset();

    console.log(
      '✅ Local market state reset. ' + 'Waiting for fresh snapshots...',
    );
  });

  client.onOrderBook((update) => {
    marketEngine.processOrderBookUpdate(update);
  });

  for (const profile of activeProfiles) {
    const instrument = requireInstrument(profile.symbol);

    client.subscribeToOrderBook(instrument.instId, instrument.instType);
    candleClient.subscribeToCandle(instrument.instId);
  }

  let isShuttingDown = false;

  const shutdown = (signal: NodeJS.Signals): void => {
    if (isShuttingDown) {
      return;
    }

    isShuttingDown = true;

    console.log(`Received ${signal}; closing OKX connections.`);

    client.close();
    candleClient.close();
  };

  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
};

void start().catch((error: unknown) => {
  console.error('Failed to start OKX Whale Detector:', error);
  process.exitCode = 1;
});
