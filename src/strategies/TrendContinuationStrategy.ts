import { MarketRegimeClassifier } from '../regime/MarketRegimeClassifier';
import type { Strategy, StrategyEvaluationContext } from './Strategy';
import {
  createStrategyCandidate,
  type StrategyCandidate,
} from './StrategyCandidate';

export interface TrendContinuationPolicy {
  readonly minimumFastReturnPercent: number;
  readonly minimumSlowReturnPercent: number;
  readonly minimumOrderFlowImbalance: number;
  readonly minimumExpectedMovePercent: number;
  readonly holdingHorizonMinutes: number;
  readonly baseConfidence: number;
}

export class TrendContinuationStrategy implements Strategy {
  public readonly strategyId = 'TREND_CONTINUATION_V1';

  public constructor(
    private readonly regimeClassifier: MarketRegimeClassifier,
    private readonly policy: TrendContinuationPolicy,
  ) {
    if (
      !Number.isFinite(policy.minimumFastReturnPercent) ||
      policy.minimumFastReturnPercent <= 0 ||
      !Number.isFinite(policy.minimumSlowReturnPercent) ||
      policy.minimumSlowReturnPercent <= 0 ||
      !Number.isFinite(policy.minimumOrderFlowImbalance) ||
      policy.minimumOrderFlowImbalance <= 0 ||
      policy.minimumOrderFlowImbalance > 1 ||
      !Number.isFinite(policy.minimumExpectedMovePercent) ||
      policy.minimumExpectedMovePercent <= 0 ||
      !Number.isSafeInteger(policy.holdingHorizonMinutes) ||
      policy.holdingHorizonMinutes <= 0 ||
      !Number.isFinite(policy.baseConfidence) ||
      policy.baseConfidence < 0 ||
      policy.baseConfidence > 100
    ) {
      throw new Error('Invalid trend continuation policy');
    }
  }

  public evaluate(
    context: StrategyEvaluationContext,
  ): StrategyCandidate | undefined {
    const regime = this.regimeClassifier.classify({
      trendStrength: context.slowReturnPercent,
      realizedVolatilityPercent: context.realizedVolatilityPercent,
      spreadPercent: context.spreadPercent,
      depthNotionalQuote: context.depthNotionalQuote,
    });
    if (regime !== 'TRENDING') return undefined;

    const bullish =
      context.fastReturnPercent >= this.policy.minimumFastReturnPercent &&
      context.slowReturnPercent >= this.policy.minimumSlowReturnPercent &&
      context.orderFlowImbalance >= this.policy.minimumOrderFlowImbalance;
    const bearish =
      context.fastReturnPercent <= -this.policy.minimumFastReturnPercent &&
      context.slowReturnPercent <= -this.policy.minimumSlowReturnPercent &&
      context.orderFlowImbalance <= -this.policy.minimumOrderFlowImbalance;
    if (!bullish && !bearish) return undefined;

    // The slow return is an observable momentum proxy, not a guaranteed forecast.
    // Never raise a weak observed move to the configured minimum: doing so would
    // fabricate edge and allow the downstream cost gate to pass without data.
    const expectedMovePercent = Math.abs(context.slowReturnPercent);
    if (expectedMovePercent < this.policy.minimumExpectedMovePercent) {
      return undefined;
    }

    const direction = bullish ? 'BULLISH' : 'BEARISH';

    return createStrategyCandidate({
      candidateId: `${this.strategyId}:${context.instrumentId}:${context.observedAt}:${direction}`,
      strategyId: this.strategyId,
      instrumentId: context.instrumentId,
      direction,
      generatedAt: context.observedAt,
      referencePrice: context.referencePrice,
      expectedMovePercent,
      holdingHorizonMinutes: this.policy.holdingHorizonMinutes,
      baseConfidence: this.policy.baseConfidence,
      regime,
      rationale: Object.freeze([
        'Fast and slow returns agree with the candidate direction',
        'Order-flow imbalance confirms the candidate direction',
        'Observed slow-trend magnitude exceeds the frozen expected-move gate',
        'Liquidity and spread pass the market-regime gate',
      ]),
    });
  }
}
