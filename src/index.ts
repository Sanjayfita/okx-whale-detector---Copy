import { OKXWebSocketClient } from './clients/okx/OKXWebSocketClient';
import { OKXCandleWebSocketClient,} from './clients/okx/OKXCandleWebSocketClient';
import { WATCHLIST } from './config/symbols';
import { MarketState } from './core/MarketState';
import {
  SummaryThrottle,
} from './core/SummaryThrottle';  
import {
  CandleUpdateHandler,
} from './core/CandleUpdateHandler';
import {
  MarketEngine,
} from './market/MarketEngine';

console.log(
  'OKX Whale Detector starting...',
);


const client =
  new OKXWebSocketClient();

const candleClient =
  new OKXCandleWebSocketClient();

const marketStates =
  new Map<string, MarketState>();

const summaryThrottle =
  new SummaryThrottle(
    5_000,
  );

for (
  const symbol
  of WATCHLIST
) {
  marketStates.set(
    symbol,

    new MarketState(),
  );
}

const marketEngine =
  new MarketEngine(
    marketStates,
    summaryThrottle,
  );

  const candleUpdateHandler =
  new CandleUpdateHandler(
    marketStates,
  );


  candleClient.onCandle(
  candle => {
    candleUpdateHandler.handle(
      candle,
    );
  },
);

client.onReconnect(() => {
  console.warn(
    '🔄 OKX connection restored. ' +
    'Resetting local market state...',
  );

  for (
    const symbol
    of WATCHLIST
  ) {
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
    marketStates.set(
      symbol,
      new MarketState(),
    );
  }
    /*
     * src/index.ts currently uses this
     * separate score-engine map, so it
     * must also be replaced.
     */
candleUpdateHandler.reset(); 
  marketEngine.reset();


  console.log(
    '✅ Local market state reset. ' +
    'Waiting for fresh snapshots...',
  );
});


client.onOrderBook(
  update => {
    marketEngine.processOrderBookUpdate(
      update,
    );
  },
);

for (
  const symbol
  of WATCHLIST
) {
  client.subscribeToOrderBook(
    symbol,

    'SPOT',
  );


  candleClient.subscribeToCandle(
    symbol,
  );
}

let isShuttingDown = false;

const shutdown = (
  signal: NodeJS.Signals,
): void => {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;

  console.log(
    `Received ${signal}; closing OKX connections.`,
  );

  client.close();
  candleClient.close();
};

process.once(
  'SIGINT',
  () =>
    shutdown('SIGINT'),
);

process.once(
  'SIGTERM',
  () =>
    shutdown('SIGTERM'),
);