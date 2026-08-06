import type { MarketState } from '../core/MarketState';
import type { StrategyEvaluationContext } from '../strategies/Strategy';

export interface RuntimeStrategyFeaturePolicy {
  readonly candleIntervalMs: number;
  readonly fastLookbackCandles: number;
  readonly slowLookbackCandles: number;
  readonly volatilityLookbackCandles: number;
  readonly minimumTradeNotionalQuote: number;
}

const requirePositiveInteger = (value: number, name: string): number => {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive safe integer`);
  }
  return value;
};

const percentageReturn = (start: number, end: number): number =>
  ((end - start) / start) * 100;

const realizedVolatilityPercent = (closes: readonly number[]): number => {
  if (closes.length < 2) return 0;
  const returns: number[] = [];
  for (let index = 1; index < closes.length; index += 1) {
    const previous = closes[index - 1];
    const current = closes[index];
    if (previous === undefined || current === undefined) continue;
    returns.push(Math.log(current / previous) * 100);
  }
  if (returns.length === 0) return 0;
  const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  const variance =
    returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
    returns.length;
  return Math.sqrt(variance);
};

export class RuntimeStrategyFeatureAdapter {
  public constructor(private readonly policy: RuntimeStrategyFeaturePolicy) {
    requirePositiveInteger(policy.candleIntervalMs, 'candleIntervalMs');
    requirePositiveInteger(policy.fastLookbackCandles, 'fastLookbackCandles');
    requirePositiveInteger(policy.slowLookbackCandles, 'slowLookbackCandles');
    requirePositiveInteger(
      policy.volatilityLookbackCandles,
      'volatilityLookbackCandles',
    );
    if (policy.fastLookbackCandles >= policy.slowLookbackCandles) {
      throw new Error(
        'fastLookbackCandles must be smaller than slowLookbackCandles',
      );
    }
    if (
      !Number.isFinite(policy.minimumTradeNotionalQuote) ||
      policy.minimumTradeNotionalQuote < 0
    ) {
      throw new Error('minimumTradeNotionalQuote must be non-negative');
    }
  }

  public createContext(
    state: MarketState,
    observedAt: number,
  ): StrategyEvaluationContext | undefined {
    if (!Number.isSafeInteger(observedAt) || observedAt < 0) {
      throw new Error('observedAt must be a non-negative safe integer');
    }

    const orderBook = state.orderBookManager.getOrderBook();
    const bestBid = state.orderBookManager.getBestBid();
    const bestAsk = state.orderBookManager.getBestAsk();
    if (
      !orderBook.initialized ||
      orderBook.status !== 'SYNCED' ||
      orderBook.updatedAt > observedAt ||
      bestBid === undefined ||
      bestAsk === undefined ||
      bestBid.price >= bestAsk.price
    ) {
      return undefined;
    }

    const confirmedCandles = state.candleHistory
      .getAll()
      .filter(
        (candle) =>
          candle.confirm &&
          candle.timestamp + this.policy.candleIntervalMs <= observedAt,
      )
      .sort((left, right) => left.timestamp - right.timestamp);
    const requiredLookback = Math.max(
      this.policy.slowLookbackCandles,
      this.policy.volatilityLookbackCandles,
    );
    if (confirmedCandles.length < requiredLookback + 1) {
      return undefined;
    }

    const latest = confirmedCandles[confirmedCandles.length - 1];
    const fastAnchor =
      confirmedCandles[
        confirmedCandles.length - 1 - this.policy.fastLookbackCandles
      ];
    const slowAnchor =
      confirmedCandles[
        confirmedCandles.length - 1 - this.policy.slowLookbackCandles
      ];
    if (
      latest === undefined ||
      fastAnchor === undefined ||
      slowAnchor === undefined
    ) {
      return undefined;
    }

    const volatilityCandles = confirmedCandles.slice(
      -(this.policy.volatilityLookbackCandles + 1),
    );
    const midpoint = (bestBid.price + bestAsk.price) / 2;
    const spreadPercent = ((bestAsk.price - bestBid.price) / midpoint) * 100;
    const depthNotionalQuote = [
      ...orderBook.bids.values(),
      ...orderBook.asks.values(),
    ].reduce((sum, level) => sum + level.notionalQuote, 0);
    const tradeFlow = state.tradeFlowTracker.getSnapshot(observedAt);
    const totalAggressiveNotional =
      tradeFlow.aggressiveBuyNotionalQuote +
      tradeFlow.aggressiveSellNotionalQuote;
    const orderFlowImbalance =
      totalAggressiveNotional < this.policy.minimumTradeNotionalQuote ||
      totalAggressiveNotional === 0
        ? 0
        : (tradeFlow.aggressiveBuyNotionalQuote -
            tradeFlow.aggressiveSellNotionalQuote) /
          totalAggressiveNotional;

    const context: StrategyEvaluationContext = {
      instrumentId: state.instrument.instId,
      observedAt,
      referencePrice: midpoint,
      fastReturnPercent: percentageReturn(fastAnchor.close, latest.close),
      slowReturnPercent: percentageReturn(slowAnchor.close, latest.close),
      orderFlowImbalance,
      realizedVolatilityPercent: realizedVolatilityPercent(
        volatilityCandles.map((candle) => candle.close),
      ),
      spreadPercent,
      depthNotionalQuote,
    };
    if (
      Object.values(context).some(
        (value) => typeof value === 'number' && !Number.isFinite(value),
      )
    ) {
      return undefined;
    }
    return Object.freeze(context);
  }
}
