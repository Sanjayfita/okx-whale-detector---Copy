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
  candleUpdateHandler.reset();

    /*
     * src/index.ts currently uses this
     * separate score-engine map, so it
     * must also be replaced.
     */
  }
summaryThrottle.reset();

  console.log(
    '✅ Local market state reset. ' +
    'Waiting for fresh snapshots...',
  );
});


client.onOrderBook(
  (update) => {
    const state =
      marketStates.get(
        update.instId,
      );


    if (
      !state
    ) {
      return;
    }


    const wasApplied =
  state.orderBookManager.applyUpdate(
    update.bids,
    update.asks,
    update.timestamp,
    update.seqId,
    update.prevSeqId,
    update.action,
  );

if (!wasApplied) {
  console.error(
    `Order-book sequence gap for ${update.instId}. ` +
    'Detector output is paused until a new snapshot is received.',
  );

  return;
}
const orderBook =
  state.orderBookManager
    .getOrderBook();

if (
  !orderBook.initialized ||
  orderBook.status !== 'SYNCED'
) {
  return;
}

    const result =
  state.whaleTracker.scan(
    orderBook,
  );

const currentPrice =
  state.orderBookManager.getMidPrice();

if (
  currentPrice ===
  undefined
) {
  return;
}

const scoredWhales =
  state.whaleScoreEngine.scoreMany(
    result.active,
    currentPrice,
  );

state.whaleScoreEngine.prune(
  result.active,
);

  for (
  const whale
  of result.active
) {
  const behaviors =
    state.whaleBehaviorEngine.analyze(
  whale,
);

  for (
    const behavior
    of behaviors
  ) {
    console.log(
      `🧠 ${behavior.type} | ` +
      `${behavior.whale.side} | ` +
      `Confidence: ` +
      `${behavior.confidence.toFixed(0)}% | ` +
      `${behavior.reason}`,
    );
  }
}

state.whaleBehaviorEngine.prune(
  result.active,
);

const walls =
  state.wallDetector.detect(
    orderBook,
  );
    /*
     * WHALE EVENTS
     */

    const whaleEvents =
      state.whaleEventDetector.detect(
        result.active,
      );


    for (
const event of whaleEvents
    ) {
      const whale =
        event.whale;

if (
  event.type ===
  'REMOVED'
) {
  const spoof =
    state.whaleBehaviorEngine
      .analyzeRemoval(
        event.whale,
      );

  if (
    spoof
  ) {
    console.log(
      `🎭 SPOOF DETECTED | ` +
      `${spoof.whale.side} | ` +
      `Price: ${spoof.whale.price} | ` +
      `Value: $` +
      `${spoof.whale.notionalUSD.toLocaleString(
        undefined,
        {
          maximumFractionDigits:
            0,
        },
      )} | ` +
      `Confidence: ` +
      `${spoof.confidence}%`,
    );
  }
}


      const value =
        whale.notionalUSD.toLocaleString(
          undefined,

          {
            maximumFractionDigits:
              0,
          },
        );


      if (
        event.type ===
        'NEW'
      ) {
        console.log(
          `🆕 NEW ${whale.side} WHALE | ` +
          `Price: ${whale.price} | ` +
          `Value: $${value}`,
        );
      }


      if (
        event.type ===
        'REMOVED'
      ) {
        console.log(
          `💥 REMOVED ${whale.side} WHALE | ` +
          `Price: ${whale.price} | ` +
          `Value: $${value}`,
        );
      }


      if (
        event.type ===
        'INCREASED'
      ) {
        console.log(
          `📈 INCREASED ${whale.side} WHALE | ` +
          `Price: ${whale.price} | ` +
          `Value: $${value}`,
        );
      }


      if (
        event.type ===
        'DECREASED'
      ) {
        console.log(
          `📉 DECREASED ${whale.side} WHALE | ` +
          `Price: ${whale.price} | ` +
          `Value: $${value}`,
        );
      }
    }

for (
  const whale
  of result.active
) {
  const refill =
    state.whaleRefillDetector.detect(
      whale,
    );

  if (!refill) {
    continue;
  }

  console.log(
    `🔄 REFILLING ${whale.side} WHALE | ` +
    `Price: ${whale.price} | ` +
    `Refill: $` +
    `${refill.refillAmountUSD.toLocaleString(
      undefined,
      {
        maximumFractionDigits:
          0,
      },
    )} | ` +
    `Count: ${refill.refillCount}`,
  );
}

state.whaleRefillDetector.prune(
  result.active,
);

    /*
     * MOVED WALL EVENTS
     */

    for (
      const moved
      of result.movedWhales
    ) {
      console.log(
        `🚚 MOVED ${moved.side} WHALE | ` +
        `Price: ` +
        `${moved.previousPrice} → ` +
        `${moved.price} | ` +
        `Value: $` +
        `${moved.currentNotionalUSD.toLocaleString(
          undefined,

          {
            maximumFractionDigits:
              0,
          },
        )}`,
      );
    }


    /*
     * DISPLAY SUMMARY
     */

 if (
  !summaryThrottle.shouldDisplay(
    update.instId,
  )
) {
  return;
}

    const newWalls =
      walls.filter(
        wall =>
          wall.status ===
          'NEW',
      );

     const activeWalls =
  walls.filter(
    wall =>
      wall.status ===
      'ACTIVE',
  ); 

    const persistentWalls =
      walls.filter(
        wall =>
          wall.status ===
          'PERSISTENT',
      );


    const strongWalls =
      walls.filter(
        wall =>
          wall.status ===
          'STRONG',
      );


    const bestBid =
      state.orderBookManager
        .getBestBid();


    const bestAsk =
      state.orderBookManager
        .getBestAsk();

for (
  const scored
  of scoredWhales
) {
  console.log(
    `🐋 ${scored.whale.side} ` +
    `WHALE SCORE: ` +
    `${scored.totalScore}/100 | ` +
    `${scored.strength} | ` +
    `Price: ` +
    `${scored.whale.price}`,
  );
}
state.whaleScoreEngine.prune(
  result.active,
);

    const marketSignal =
      state.marketAnalyzer.analyze(
        result.active,

        currentPrice ??
        0,
      );


    const bidWhales =
      result.active.filter(
        whale =>
          whale.side ===
          'BID',
      );


    const askWhales =
      result.active.filter(
        whale =>
          whale.side ===
          'ASK',
      );


    const totalBidValue =
      bidWhales.reduce(
        (
          total,

          whale,
        ) =>
          total +
          whale.notionalUSD,

        0,
      );


    const totalAskValue =
      askWhales.reduce(
        (
          total,

          whale,
        ) =>
          total +
          whale.notionalUSD,

        0,
      );


    console.log(
      '\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    );


    console.log(
      `📡 ${update.instId}`,
    );


    console.log(
      `💵 Best Bid: ${bestBid?.price} | ` +
      `Best Ask: ${bestAsk?.price}`,
    );


    console.log(
      `💵 Current Price: ${currentPrice}`,
    );


    console.log(
      `🟢 Active BID Whales: ` +
      `${bidWhales.length} ` +
      `($${totalBidValue.toLocaleString(
        undefined,

        {
          maximumFractionDigits:
            0,
        },
      )})`,
    );


    console.log(
      `🔴 Active ASK Whales: ` +
      `${askWhales.length} ` +
      `($${totalAskValue.toLocaleString(
        undefined,

        {
          maximumFractionDigits:
            0,
        },
      )})`,
    );


    console.log(
      `🐋 Total Active Whale Walls: ` +
      `${result.active.length}`,
    );


    console.log(
      `🧱 Tracked Walls: ` +
      `${walls.length}`,
    );

    console.log(
  `🆕 New Walls: ` +
  `${newWalls.length}`,
);

console.log(
  `🔵 Active Walls: ` +
  `${activeWalls.length}`,
);

console.log(
  `🟠 Persistent Walls: ` +
  `${persistentWalls.length}`,
);


    console.log(
      `🔴 Strong Walls: ` +
      `${strongWalls.length}`,
    );


    console.log(
      '\n📊 MARKET BIAS',
    );


    if (
      marketSignal.bias ===
      'BULLISH'
    ) {
      console.log(
        `🟢 BULLISH |Pressure Strength: ` +
        `${marketSignal.confidence.toFixed(
          1,
        )}%`,
      );
    } else if (
      marketSignal.bias ===
      'BEARISH'
    ) {
      console.log(
        `🔴 BEARISH |Pressure Strength: ` +
        `${marketSignal.confidence.toFixed(
          1,
        )}%`,
      );
    } else {
      console.log(
        `⚪ NEUTRAL |Pressure Strength: ` +
        `${marketSignal.confidence.toFixed(
          1,
        )}%`,
      );
    }


    console.log(
      `💡 ${marketSignal.reason}`,
    );


    console.log(
      '\n📊 PRESSURE ANALYSIS',
    );


    console.log(
      `🟢 BID PRESSURE: ` +
      `${marketSignal.bidPressure.toFixed(
        1,
      )}%`,
    );


    console.log(
      `🔴 ASK PRESSURE: ` +
      `${marketSignal.askPressure.toFixed(
        1,
      )}%`,
    );


    console.log(
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n',
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