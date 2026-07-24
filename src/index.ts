import { OKXWebSocketClient } from './clients/okx/OKXWebSocketClient';
import { OrderBookManager } from './core/OrderBookManager';
import { WhaleTracker } from './services/WhaleTracker';
import { MarketAnalyzer } from './core/MarketAnalyzer';
import { WhaleEventDetector } from './core/WhaleEventDetector';
import { WhaleBehaviorEngine } from './core/WhaleBehaviorEngine';
import { WallDetector } from './core/WallDetector';
import { WhaleRefillDetector } from './core/WhaleRefillDetector';
import { OKXCandleWebSocketClient,} from './clients/okx/OKXCandleWebSocketClient';
import { WATCHLIST } from './config/symbols';
import { MarketState } from './core/MarketState';
import { WhaleScoreEngine } from './core/WhaleScoreEngine';

console.log(
  'OKX Whale Detector starting...',
);


const client =
  new OKXWebSocketClient();


const marketStates =
  new Map<string, MarketState>();

const whaleScoreEngines =
  new Map<string, WhaleScoreEngine>();

for (
  const symbol
  of WATCHLIST
) {
  marketStates.set(
    symbol,

    new MarketState(),
  );

  whaleScoreEngines.set(
    symbol,

    new WhaleScoreEngine(),
  );
}


const candleClient =
  new OKXCandleWebSocketClient();


let lastDisplayTime =
  0;

let candleCounter = 0;
candleClient.onCandle((candle) => {
  candleCounter++;
  if (candleCounter % 10 === 0) {
    // Only log every 10th candle
    console.log(`📊 ${candle.instId} 1m | O: ${candle.open} | ...`);
  }
  // ... rest of logic (keep running, just reduce logging)
});


candleClient.onCandle(
  (candle) => {
    const state =
      marketStates.get(
        candle.instId,
      );


    if (
      !state
    ) {
      return;
    }


    state.candleHistory.add(
      candle,
    );


    console.log(
      `🕯️ ${candle.instId} 1m | ` +
      `O: ${candle.open} | ` +
      `H: ${candle.high} | ` +
      `L: ${candle.low} | ` +
      `C: ${candle.close} | ` +
      `Closed: ${candle.confirm} | ` +
      `History: ` +
      `${state.candleHistory.getSize()}`,
    );
  },
);


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


    state.orderBookManager.applyUpdate(
      update.bids,

      update.asks,

      update.timestamp,

      update.seqId,
    );


    const orderBook =
      state.orderBookManager.getOrderBook();

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

const whaleScoreEngine =
  whaleScoreEngines.get(
    update.instId,
  );

if (
  !whaleScoreEngine
) {
  return;
}

const scoredWhales =
  whaleScoreEngine.scoreMany(
    result.active,
    currentPrice,
  );

  for (
  const whale
  of result.active
) {
  const behaviors =
    state.whaleBehaviorEngine.analyze(
      whale,
      currentPrice,
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

        const currentPrice =
  state.orderBookManager
    .getMidPrice();

    for (
  const whale
  of result.active
) {
  const refill =
    state.whaleRefillDetector.detect(
      whale,
    );

  if (
    refill
  ) {
    console.log(
      `🔄 REFILLING ` +
      `${whale.side} WHALE | ` +
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

    const now =
      Date.now();


    if (
      now -
      lastDisplayTime <
      5_000
    ) {
      return;
    }


    lastDisplayTime =
      now;


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
        `🟢 BULLISH | Confidence: ` +
        `${marketSignal.confidence.toFixed(
          1,
        )}%`,
      );
    } else if (
      marketSignal.bias ===
      'BEARISH'
    ) {
      console.log(
        `🔴 BEARISH | Confidence: ` +
        `${marketSignal.confidence.toFixed(
          1,
        )}%`,
      );
    } else {
      console.log(
        `⚪ NEUTRAL | Confidence: ` +
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


  candleClient.subscribeToCandles(
    symbol,
  );
}