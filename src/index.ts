import { OKXWebSocketClient } from './clients/okx/OKXWebSocketClient';
import { OKXCandleWebSocketClient } from './clients/okx/OKXCandleWebSocketClient';
import { appConfig } from './config/appConfig';
import {
  resolveMarketInstrument,
  resolveSymbolConfig,
} from './config/symbolProfiles';
import { validateAppConfig } from './config/validateAppConfig';
import { WATCHLIST } from './config/symbols';
import { MarketState } from './core/MarketState';
import { SummaryThrottle } from './core/SummaryThrottle';
import { CandleUpdateHandler } from './core/CandleUpdateHandler';
import { MarketEngine } from './market/MarketEngine';

validateAppConfig(appConfig);

console.log('OKX Whale Detector starting...');

const client = new OKXWebSocketClient();
const candleClient = new OKXCandleWebSocketClient();
const marketStates = new Map<string, MarketState>();
const summaryThrottle = new SummaryThrottle(
  appConfig.reporting.summaryIntervalMs,
);

const createMarketState = (symbol: string): MarketState =>
  new MarketState(
    resolveSymbolConfig(symbol),
    resolveMarketInstrument(symbol),
  );

for (const symbol of WATCHLIST) {
  marketStates.set(symbol, createMarketState(symbol));
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

  for (const symbol of WATCHLIST) {
    /*
     * A new MarketState resets:
     * - OrderBookManager
     * - WhaleTracker
     * - WhaleEventDetector
     * - WallDetector
     * - WhaleRefillDetector
     * - WhaleBehaviorEngine
     * - internal WhaleScoreEngine
     * - MarketAnalyzer
     */
    marketStates.set(symbol, createMarketState(symbol));
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

for (const symbol of WATCHLIST) {
  const instrument = resolveMarketInstrument(symbol);

  client.subscribeToOrderBook(symbol, instrument.instType);
  candleClient.subscribeToCandle(symbol);
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
