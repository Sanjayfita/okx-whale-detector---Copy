import type { Whale } from '../types/whale';
import type {
  MarketBias,
  MarketSignal,
} from '../types/signal';

export class MarketAnalyzer {
  public analyze(
    activeWhales: Whale[],
    currentPrice: number,
  ): MarketSignal {
    if (activeWhales.length === 0) {
      return {
  bias: 'NEUTRAL',
  confidence: 0,
  bidPressure: 0,
  askPressure: 0,
  netPressure: 0,
  reason: 'No active whale walls',
  timestamp: Date.now(),
};
    }

    let bidPressure = 0;
    let askPressure = 0;

    for (const whale of activeWhales) {
      const distancePercent =
        Math.abs(
          (whale.price - currentPrice) /
          currentPrice,
        ) * 100;

      /*
       * Closer whale walls receive more weight.
       *
       * Example:
       * 0.1% away  = very strong influence
       * 1.0% away  = weaker influence
       */
      const distanceWeight =
        1 / (1 + distancePercent);

      const weightedPressure =
        whale.notionalUSD * distanceWeight;

      if (whale.side === 'BID') {
        bidPressure += weightedPressure;
      } else {
        askPressure += weightedPressure;
      }
    }

    const totalPressure =
      bidPressure + askPressure;

    if (totalPressure === 0) {
      return {
  bias: 'NEUTRAL',
  confidence: 0,
  bidPressure: 0,
  askPressure: 0,
  netPressure: 0,
  reason: 'No measurable whale pressure',
  timestamp: Date.now(),
};
    }

    const bidRatio =
      bidPressure / totalPressure;

    const askRatio =
      askPressure / totalPressure;

    let bias: MarketBias;
    let confidence: number;
    let reason: string;

    if (bidRatio > askRatio) {
      bias = 'BULLISH';
      confidence = bidRatio * 100;
      reason =
        'Distance-weighted bid pressure dominates';
    } else if (askRatio > bidRatio) {
      bias = 'BEARISH';
      confidence = askRatio * 100;
      reason =
        'Distance-weighted ask pressure dominates';
    } else {
      bias = 'NEUTRAL';
      confidence = 50;
      reason =
        'Distance-weighted whale pressure is balanced';
    }

        const bidPressurePercent =
      bidRatio * 100;

    const askPressurePercent =
      askRatio * 100;

    const netPressure =
      bidPressurePercent -
      askPressurePercent;

    return {
      bias,
      confidence,
      bidPressure: bidPressurePercent,
      askPressure: askPressurePercent,
      netPressure,
      reason,
      timestamp: Date.now(),
    };
  }
}