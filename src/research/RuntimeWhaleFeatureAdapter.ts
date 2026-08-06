import type { WhaleFeatureSnapshot } from '../confirmation/WhaleConfirmationEngine';
import type { MarketState } from '../core/MarketState';
import type { WhaleScanResult } from '../core/WhaleTracker';

export interface RuntimeWhaleFeaturePolicy {
  readonly directionalDominanceThreshold: number;
  readonly persistentAfterMs: number;
  readonly maximumAuthenticDistanceFromMidPercent: number;
}

const clampScore = (value: number): number => Math.max(0, Math.min(100, value));

export class RuntimeWhaleFeatureAdapter {
  public constructor(private readonly policy: RuntimeWhaleFeaturePolicy) {
    if (
      !Number.isFinite(policy.directionalDominanceThreshold) ||
      policy.directionalDominanceThreshold < 0 ||
      policy.directionalDominanceThreshold > 1
    ) {
      throw new Error('directionalDominanceThreshold must be between 0 and 1');
    }
    if (
      !Number.isSafeInteger(policy.persistentAfterMs) ||
      policy.persistentAfterMs <= 0
    ) {
      throw new Error('persistentAfterMs must be a positive safe integer');
    }
    if (
      !Number.isFinite(policy.maximumAuthenticDistanceFromMidPercent) ||
      policy.maximumAuthenticDistanceFromMidPercent <= 0
    ) {
      throw new Error(
        'maximumAuthenticDistanceFromMidPercent must be a positive finite number',
      );
    }
  }

  public createSnapshot(input: {
    readonly state: MarketState;
    readonly whaleScan: WhaleScanResult;
    readonly currentPrice: number;
    readonly observedAt: number;
  }): WhaleFeatureSnapshot {
    if (!Number.isFinite(input.currentPrice) || input.currentPrice <= 0) {
      throw new Error('currentPrice must be a positive finite number');
    }
    if (!Number.isSafeInteger(input.observedAt) || input.observedAt < 0) {
      throw new Error('observedAt must be a non-negative safe integer');
    }

    const bidNotional = input.whaleScan.totalBidNotionalQuote;
    const askNotional = input.whaleScan.totalAskNotionalQuote;
    const totalNotional = bidNotional + askNotional;
    const imbalance =
      totalNotional === 0 ? 0 : (bidNotional - askNotional) / totalNotional;
    const directionalBias =
      imbalance >= this.policy.directionalDominanceThreshold
        ? 'BULLISH'
        : imbalance <= -this.policy.directionalDominanceThreshold
          ? 'BEARISH'
          : 'NEUTRAL';
    const requiredSide = directionalBias === 'BULLISH' ? 'BID' : 'ASK';
    const relevantWhales =
      directionalBias === 'NEUTRAL'
        ? input.whaleScan.active
        : input.whaleScan.active.filter((whale) => whale.side === requiredSide);
    const strongest = [...relevantWhales].sort(
      (left, right) =>
        right.notionalQuote - left.notionalQuote ||
        left.wallId.localeCompare(right.wallId),
    )[0];
    const persistenceMs = Math.max(
      0,
      ...relevantWhales.map((whale) => (whale.ageSeconds ?? 0) * 1_000),
    );
    const persistenceScore = clampScore(
      (persistenceMs / this.policy.persistentAfterMs) * 100,
    );
    const tradeFlow = input.state.tradeFlowTracker.getSnapshot(input.observedAt);
    const totalAggressive =
      tradeFlow.aggressiveBuyNotionalQuote +
      tradeFlow.aggressiveSellNotionalQuote;
    const aggressiveImbalance =
      totalAggressive === 0
        ? 0
        : (tradeFlow.aggressiveBuyNotionalQuote -
            tradeFlow.aggressiveSellNotionalQuote) /
          totalAggressive;
    const alignedTradeFlow =
      directionalBias === 'BULLISH'
        ? Math.max(0, aggressiveImbalance)
        : directionalBias === 'BEARISH'
          ? Math.max(0, -aggressiveImbalance)
          : 0;
    const distanceFromMidPercent =
      strongest === undefined
        ? 0
        : (Math.abs(strongest.price - input.currentPrice) /
            input.currentPrice) *
          100;
    const spoofProbability =
      strongest === undefined
        ? 50
        : persistenceScore >= 50 &&
            distanceFromMidPercent <=
              this.policy.maximumAuthenticDistanceFromMidPercent
          ? 25
          : 50;

    return Object.freeze({
      instrumentId: input.state.instrument.instId,
      observedAt: input.observedAt,
      directionalBias,
      persistenceScore,
      absorptionScore: 0,
      tradeFlowConfirmationScore: clampScore(alignedTradeFlow * 100),
      spoofProbability,
      distanceFromMidPercent,
    });
  }
}
