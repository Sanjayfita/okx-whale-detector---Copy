import type {
  Whale,
  WhaleChange,
} from '../types/whale';

import type {
  Wall,
} from '../types/wall';

import type {
  WhaleBehavior,
} from '../core/WhaleBehaviorEngine';

import type {
  WhaleEvent,
} from '../core/WhaleEventDetector';

import type {
  WhaleRefillEvent,
} from '../core/WhaleRefillDetector';

import type {
  WhaleScore,
} from '../core/WhaleScoreEngine';

export interface MarketSummarySignal {
  bias:
    | 'BULLISH'
    | 'BEARISH'
    | 'NEUTRAL';

  confidence:
    number;

  reason:
    string;

  bidPressure:
    number;

  askPressure:
    number;
}

export interface MarketSummaryInput {
  symbol:
    string;

  currentPrice:
    number;

  bestBidPrice?:
    number;

  bestAskPrice?:
    number;

  activeWhales:
    Whale[];

  walls:
    Wall[];

  scoredWhales:
    WhaleScore[];

  marketSignal:
    MarketSummarySignal;
}

export class MarketReporter {
  public reportSequenceGap(
    symbol: string,
  ): void {
    console.error(
      `Order-book sequence gap for ${symbol}. ` +
      'Detector output is paused until a new snapshot is received.',
    );
  }

  public reportBehavior(
    behavior: WhaleBehavior,
  ): void {
    console.log(
      `🧠 ${behavior.type} | ` +
      `${behavior.whale.side} | ` +
      `Confidence: ` +
      `${behavior.confidence.toFixed(
        0,
      )}% | ` +
      `${behavior.reason}`,
    );
  }

  public reportSpoof(
    spoof: WhaleBehavior,
  ): void {
    console.log(
      `🎭 SPOOF DETECTED | ` +
      `${spoof.whale.side} | ` +
      `Price: ${spoof.whale.price} | ` +
      `Value: ` +
      `${this.formatQuote(
        spoof.whale
          .notionalQuote,
      )} USDT | ` +
      `Confidence: ` +
      `${spoof.confidence}%`,
    );
  }

  public reportWhaleEvent(
    event: WhaleEvent,
  ): void {
    const whale =
      event.whale;

    const value =
      this.formatQuote(
        whale.notionalQuote,
      );

    switch (event.type) {
      case 'NEW':
        console.log(
          `🆕 NEW ${whale.side} WHALE | ` +
          `Price: ${whale.price} | ` +
          `Value: ${value} USDT`,
        );

        break;

      case 'REMOVED':
        console.log(
          `💥 REMOVED ${whale.side} WHALE | ` +
          `Price: ${whale.price} | ` +
          `Value: ${value} USDT`,
        );

        break;

      case 'INCREASED':
        console.log(
          `📈 INCREASED ${whale.side} WHALE | ` +
          `Price: ${whale.price} | ` +
          `Value: ${value} USDT`,
        );

        break;

      case 'DECREASED':
        console.log(
          `📉 DECREASED ${whale.side} WHALE | ` +
          `Price: ${whale.price} | ` +
          `Value: ${value} USDT`,
        );

        break;

      case 'MOVED':
        /*
         * WhaleTracker already prints its
         * detailed moved-wall event.
         */
        break;
    }
  }

  public reportRefill(
    refill: WhaleRefillEvent,
  ): void {
    console.log(
      `🔄 REFILLING ${refill.whale.side} WHALE | ` +
      `Price: ${refill.whale.price} | ` +
      `Refill: ` +
      `${this.formatQuote(
        refill.refillAmountQuote,
      )} USDT | ` +
      `Count: ${refill.refillCount}`,
    );
  }

  public reportMovedWhale(
    moved: WhaleChange,
  ): void {
    console.log(
      `🚚 MOVED ${moved.side} WHALE | ` +
      `Price: ` +
      `${moved.previousPrice} → ` +
      `${moved.price} | ` +
      `Value: ` +
      `${this.formatQuote(
        moved.currentNotionalQuote,
      )} USDT`,
    );
  }

  public reportWhaleScore(
    scored: WhaleScore,
  ): void {
    console.log(
      `🐋 ${scored.whale.side} ` +
      `WHALE SCORE: ` +
      `${scored.totalScore}/100 | ` +
      `${scored.strength} | ` +
      `Price: ${scored.whale.price}`,
    );
  }

  public reportSummary(
    input: MarketSummaryInput,
  ): void {
    const bidWhales =
      input.activeWhales.filter(
        whale =>
          whale.side ===
          'BID',
      );

    const askWhales =
      input.activeWhales.filter(
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
          whale.notionalQuote,

        0,
      );

    const totalAskValue =
      askWhales.reduce(
        (
          total,
          whale,
        ) =>
          total +
          whale.notionalQuote,

        0,
      );

    const newWalls =
      input.walls.filter(
        wall =>
          wall.status ===
          'NEW',
      );

    const activeWalls =
      input.walls.filter(
        wall =>
          wall.status ===
          'ACTIVE',
      );

    const persistentWalls =
      input.walls.filter(
        wall =>
          wall.status ===
          'PERSISTENT',
      );

    const strongWalls =
      input.walls.filter(
        wall =>
          wall.status ===
          'STRONG',
      );

    for (
      const scored
      of input.scoredWhales
    ) {
      this.reportWhaleScore(
        scored,
      );
    }

    console.log(
      '\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    );

    console.log(
      `📡 ${input.symbol}`,
    );

    console.log(
      `💵 Best Bid: ` +
      `${input.bestBidPrice} | ` +
      `Best Ask: ` +
      `${input.bestAskPrice}`,
    );

    console.log(
      `💵 Current Price: ` +
      `${input.currentPrice}`,
    );

    console.log(
      `🟢 Active BID Whales: ` +
      `${bidWhales.length} ` +
      `(${this.formatQuote(
        totalBidValue,
      )} USDT)`,
    );

    console.log(
      `🔴 Active ASK Whales: ` +
      `${askWhales.length} ` +
      `(${this.formatQuote(
        totalAskValue,
      )} USDT)`,
    );

    console.log(
      `🐋 Total Active Whale Walls: ` +
      `${input.activeWhales.length}`,
    );

    console.log(
      `🧱 Tracked Walls: ` +
      `${input.walls.length}`,
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

    this.reportMarketBias(
      input.marketSignal,
    );

    console.log(
      `💡 ${input.marketSignal.reason}`,
    );

    console.log(
      '\n📊 PRESSURE ANALYSIS',
    );

    console.log(
      `🟢 BID PRESSURE: ` +
      `${input.marketSignal.bidPressure.toFixed(
        1,
      )}%`,
    );

    console.log(
      `🔴 ASK PRESSURE: ` +
      `${input.marketSignal.askPressure.toFixed(
        1,
      )}%`,
    );

    console.log(
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n',
    );
  }

  private reportMarketBias(
    signal: MarketSummarySignal,
  ): void {
    const confidence =
      signal.confidence.toFixed(
        1,
      );

    if (
      signal.bias ===
      'BULLISH'
    ) {
      console.log(
        `🟢 BULLISH | Pressure Strength: ` +
        `${confidence}%`,
      );

      return;
    }

    if (
      signal.bias ===
      'BEARISH'
    ) {
      console.log(
        `🔴 BEARISH | Pressure Strength: ` +
        `${confidence}%`,
      );

      return;
    }

    console.log(
      `⚪ NEUTRAL | Pressure Strength: ` +
      `${confidence}%`,
    );
  }

  private formatQuote(
    value: number,
  ): string {
    return value.toLocaleString(
      'en-US',
      {
        maximumFractionDigits:
          0,
      },
    );
  }
}