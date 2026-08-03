import type { OKXTradeUpdate } from '../clients/okx/OKXWebSocketClient';
import type { Whale } from '../types/whale';

export type WhaleRemovalClassification =
  | 'LIKELY_EXECUTED'
  | 'POSSIBLE_CANCELLATION'
  | 'UNCONFIRMED_DISAPPEARANCE';

export interface WhaleRemovalAssessment {
  readonly classification: WhaleRemovalClassification;
  readonly confidence: number;
  readonly matchingAggressiveNotionalQuote: number;
  readonly executedRatio: number;
  readonly liquidityShare: number;
  readonly reason: string;
}

export interface TradeFlowSnapshot {
  readonly tradeCount: number;
  readonly aggressiveBuyNotionalQuote: number;
  readonly aggressiveSellNotionalQuote: number;
  readonly oldestTimestamp?: number;
  readonly newestTimestamp?: number;
}

export interface TradeFlowTrackerOptions {
  readonly lookbackMs?: number;
  readonly priceBandPercent?: number;
  readonly executionConfirmationRatio?: number;
  readonly cancellationMaximumExecutionRatio?: number;
  readonly cancellationMaximumAgeSeconds?: number;
  readonly maximumTrades?: number;
  readonly clock?: () => number;
}

interface RecordedTrade extends OKXTradeUpdate {
  readonly notionalQuote: number;
}

const DEFAULT_LOOKBACK_MS = 5_000;
const DEFAULT_PRICE_BAND_PERCENT = 0.15;
const DEFAULT_EXECUTION_CONFIRMATION_RATIO = 0.25;
const DEFAULT_CANCELLATION_MAXIMUM_EXECUTION_RATIO = 0.03;
const DEFAULT_CANCELLATION_MAXIMUM_AGE_SECONDS = 3;
const DEFAULT_MAXIMUM_TRADES = 10_000;

export class TradeFlowTracker {
  private readonly trades: RecordedTrade[] = [];
  private readonly tradeIds = new Set<string>();
  private readonly lookbackMs: number;
  private readonly priceBandPercent: number;
  private readonly executionConfirmationRatio: number;
  private readonly cancellationMaximumExecutionRatio: number;
  private readonly cancellationMaximumAgeSeconds: number;
  private readonly maximumTrades: number;
  private readonly clock: () => number;

  public constructor(
    private readonly baseUnitsPerSize = 1,
    options: TradeFlowTrackerOptions = {},
  ) {
    this.lookbackMs = options.lookbackMs ?? DEFAULT_LOOKBACK_MS;
    this.priceBandPercent =
      options.priceBandPercent ?? DEFAULT_PRICE_BAND_PERCENT;
    this.executionConfirmationRatio =
      options.executionConfirmationRatio ??
      DEFAULT_EXECUTION_CONFIRMATION_RATIO;
    this.cancellationMaximumExecutionRatio =
      options.cancellationMaximumExecutionRatio ??
      DEFAULT_CANCELLATION_MAXIMUM_EXECUTION_RATIO;
    this.cancellationMaximumAgeSeconds =
      options.cancellationMaximumAgeSeconds ??
      DEFAULT_CANCELLATION_MAXIMUM_AGE_SECONDS;
    this.maximumTrades = options.maximumTrades ?? DEFAULT_MAXIMUM_TRADES;
    this.clock = options.clock ?? Date.now;

    if (!Number.isFinite(baseUnitsPerSize) || baseUnitsPerSize <= 0) {
      throw new Error('baseUnitsPerSize must be greater than 0');
    }
    if (!Number.isFinite(this.lookbackMs) || this.lookbackMs <= 0) {
      throw new Error('lookbackMs must be greater than 0');
    }
    if (!Number.isFinite(this.priceBandPercent) || this.priceBandPercent < 0) {
      throw new Error('priceBandPercent must be non-negative');
    }
    if (
      !Number.isFinite(this.executionConfirmationRatio) ||
      this.executionConfirmationRatio <= 0
    ) {
      throw new Error('executionConfirmationRatio must be greater than 0');
    }
    if (
      !Number.isFinite(this.cancellationMaximumExecutionRatio) ||
      this.cancellationMaximumExecutionRatio < 0
    ) {
      throw new Error('cancellationMaximumExecutionRatio must be non-negative');
    }
    if (
      !Number.isInteger(this.cancellationMaximumAgeSeconds) ||
      this.cancellationMaximumAgeSeconds < 0
    ) {
      throw new Error('cancellationMaximumAgeSeconds must be non-negative');
    }
    if (!Number.isInteger(this.maximumTrades) || this.maximumTrades <= 0) {
      throw new Error('maximumTrades must be a positive integer');
    }
  }

  public record(update: OKXTradeUpdate): boolean {
    if (this.tradeIds.has(update.tradeId)) {
      return false;
    }

    if (
      !Number.isFinite(update.price) ||
      update.price <= 0 ||
      !Number.isFinite(update.size) ||
      update.size <= 0 ||
      !Number.isFinite(update.timestamp)
    ) {
      return false;
    }

    const trade: RecordedTrade = {
      ...update,
      notionalQuote:
        update.price * update.size * this.baseUnitsPerSize,
    };
    this.trades.push(trade);
    this.tradeIds.add(trade.tradeId);
    this.prune(Math.max(this.clock(), trade.timestamp));
    return true;
  }

  public assessRemoval(
    whale: Whale,
    sameSideDepthNotionalQuote: number,
    now: number = this.clock(),
  ): WhaleRemovalAssessment {
    this.prune(now);

    const requiredTradeSide = whale.side === 'ASK' ? 'BUY' : 'SELL';
    const maximumPriceDifference =
      whale.price * (this.priceBandPercent / 100);
    let matchingAggressiveNotionalQuote = 0;

    for (const trade of this.trades) {
      if (
        trade.side === requiredTradeSide &&
        Math.abs(trade.price - whale.price) <= maximumPriceDifference
      ) {
        matchingAggressiveNotionalQuote += trade.notionalQuote;
      }
    }

    const executedRatio =
      matchingAggressiveNotionalQuote / Math.max(whale.notionalQuote, 1);
    const liquidityShare =
      whale.notionalQuote /
      Math.max(sameSideDepthNotionalQuote, whale.notionalQuote, 1);

    if (executedRatio >= this.executionConfirmationRatio) {
      const confidence = Math.min(95, 55 + executedRatio * 40);
      return {
        classification: 'LIKELY_EXECUTED',
        confidence,
        matchingAggressiveNotionalQuote,
        executedRatio,
        liquidityShare,
        reason:
          `${(executedRatio * 100).toFixed(1)}% of displayed notional ` +
          'was matched by nearby aggressive trade flow',
      };
    }

    const ageSeconds = whale.ageSeconds ?? 0;
    if (
      ageSeconds <= this.cancellationMaximumAgeSeconds &&
      executedRatio <= this.cancellationMaximumExecutionRatio
    ) {
      const confidence = Math.min(65, 35 + liquidityShare * 30);
      return {
        classification: 'POSSIBLE_CANCELLATION',
        confidence,
        matchingAggressiveNotionalQuote,
        executedRatio,
        liquidityShare,
        reason:
          'Large liquidity disappeared quickly without sufficient executed-trade confirmation',
      };
    }

    return {
      classification: 'UNCONFIRMED_DISAPPEARANCE',
      confidence: Math.min(50, 20 + liquidityShare * 25),
      matchingAggressiveNotionalQuote,
      executedRatio,
      liquidityShare,
      reason:
        'The order-book disappearance cannot be classified as execution or spoofing from current evidence',
    };
  }

  public getSnapshot(now: number = this.clock()): TradeFlowSnapshot {
    this.prune(now);
    let aggressiveBuyNotionalQuote = 0;
    let aggressiveSellNotionalQuote = 0;

    for (const trade of this.trades) {
      if (trade.side === 'BUY') {
        aggressiveBuyNotionalQuote += trade.notionalQuote;
      } else {
        aggressiveSellNotionalQuote += trade.notionalQuote;
      }
    }

    return {
      tradeCount: this.trades.length,
      aggressiveBuyNotionalQuote,
      aggressiveSellNotionalQuote,
      oldestTimestamp: this.trades[0]?.timestamp,
      newestTimestamp: this.trades.at(-1)?.timestamp,
    };
  }

  public reset(): void {
    this.trades.length = 0;
    this.tradeIds.clear();
  }

  public static calculateLiquidityNormalizedThreshold(
    depthNotionalQuote: number,
    absoluteMinimumNotionalQuote: number,
    minimumDepthShare: number,
  ): number {
    if (!Number.isFinite(depthNotionalQuote) || depthNotionalQuote < 0) {
      throw new Error('depthNotionalQuote must be non-negative');
    }
    if (
      !Number.isFinite(absoluteMinimumNotionalQuote) ||
      absoluteMinimumNotionalQuote < 0
    ) {
      throw new Error('absoluteMinimumNotionalQuote must be non-negative');
    }
    if (!Number.isFinite(minimumDepthShare) || minimumDepthShare < 0) {
      throw new Error('minimumDepthShare must be non-negative');
    }

    return Math.max(
      absoluteMinimumNotionalQuote,
      depthNotionalQuote * minimumDepthShare,
    );
  }

  private prune(now: number): void {
    const minimumTimestamp = now - this.lookbackMs;

    while (
      this.trades.length > 0 &&
      ((this.trades[0]?.timestamp ?? now) < minimumTimestamp ||
        this.trades.length > this.maximumTrades)
    ) {
      const removed = this.trades.shift();
      if (removed) {
        this.tradeIds.delete(removed.tradeId);
      }
    }
  }
}
