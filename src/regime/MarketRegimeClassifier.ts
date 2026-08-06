import type { MarketRegime } from '../strategies/StrategyCandidate';

export interface MarketRegimeSnapshot {
  readonly trendStrength: number;
  readonly realizedVolatilityPercent: number;
  readonly spreadPercent: number;
  readonly depthNotionalQuote: number;
}

export interface MarketRegimePolicy {
  readonly minimumTrendStrength: number;
  readonly volatileThresholdPercent: number;
  readonly maximumSpreadPercent: number;
  readonly minimumDepthNotionalQuote: number;
}

export class MarketRegimeClassifier {
  public constructor(private readonly policy: MarketRegimePolicy) {
    if (
      !Number.isFinite(policy.minimumTrendStrength) ||
      policy.minimumTrendStrength < 0 ||
      !Number.isFinite(policy.volatileThresholdPercent) ||
      policy.volatileThresholdPercent <= 0 ||
      !Number.isFinite(policy.maximumSpreadPercent) ||
      policy.maximumSpreadPercent <= 0 ||
      !Number.isFinite(policy.minimumDepthNotionalQuote) ||
      policy.minimumDepthNotionalQuote <= 0
    ) {
      throw new Error('Invalid market regime policy');
    }
  }

  public classify(snapshot: MarketRegimeSnapshot): MarketRegime {
    if (
      !Number.isFinite(snapshot.trendStrength) ||
      !Number.isFinite(snapshot.realizedVolatilityPercent) ||
      !Number.isFinite(snapshot.spreadPercent) ||
      !Number.isFinite(snapshot.depthNotionalQuote)
    ) {
      return 'UNKNOWN';
    }
    if (
      snapshot.spreadPercent > this.policy.maximumSpreadPercent ||
      snapshot.depthNotionalQuote < this.policy.minimumDepthNotionalQuote
    ) {
      return 'ILLIQUID';
    }
    if (
      snapshot.realizedVolatilityPercent >=
      this.policy.volatileThresholdPercent
    ) {
      return 'VOLATILE';
    }
    if (Math.abs(snapshot.trendStrength) >= this.policy.minimumTrendStrength) {
      return 'TRENDING';
    }
    return 'RANGING';
  }
}
