import type { StrategyCandidate } from './StrategyCandidate';

export interface StrategyEvaluationContext {
  readonly instrumentId: string;
  readonly observedAt: number;
  readonly referencePrice: number;
  readonly fastReturnPercent: number;
  readonly slowReturnPercent: number;
  readonly orderFlowImbalance: number;
  readonly realizedVolatilityPercent: number;
  readonly spreadPercent: number;
  readonly depthNotionalQuote: number;
}

export interface Strategy {
  readonly strategyId: string;
  evaluate(context: StrategyEvaluationContext): StrategyCandidate | undefined;
}
