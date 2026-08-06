import type { WhaleFeatureSnapshot } from '../confirmation/WhaleConfirmationEngine';
import type { StrategyEvaluationContext } from '../strategies/Strategy';
import type { StrategyDirection } from '../strategies/StrategyCandidate';

export const STRATEGY_OUTCOME_OBSERVATION_SCHEMA_VERSION = 1 as const;

export type WhaleDecisionGroup =
  | 'WHALE_SUPPORTS'
  | 'WHALE_NEUTRAL'
  | 'WHALE_CONTRADICTS';

export interface StrategyReplayOutcomePrice {
  readonly horizonMinutes: number;
  readonly observedAt: number;
  readonly price: number;
}

export interface StrategyReplayDecisionEvent {
  readonly eventId: string;
  readonly availabilityTimestamp: number;
  readonly strategyContext: StrategyEvaluationContext;
  readonly whaleFeatures: readonly WhaleFeatureSnapshot[];
  readonly outcomes: readonly StrategyReplayOutcomePrice[];
}

export interface StrategyOutcomeObservation {
  readonly schemaVersion: typeof STRATEGY_OUTCOME_OBSERVATION_SCHEMA_VERSION;
  readonly eventId: string;
  readonly candidateId: string;
  readonly strategyId: string;
  readonly instrumentId: string;
  readonly direction: StrategyDirection;
  readonly generatedAt: number;
  readonly outcomeObservedAt: number;
  readonly horizonMinutes: number;
  readonly referencePrice: number;
  readonly outcomePrice: number;
  readonly grossReturnPercent: number;
  readonly whaleGroup: WhaleDecisionGroup;
  readonly baseQualified: boolean;
  readonly finalQualified: boolean;
  readonly spreadPercent: number;
  readonly depthNotionalQuote: number;
  readonly realizedVolatilityPercent: number;
  readonly paperOnly: true;
  readonly liveOrderExecutionAllowed: false;
  readonly orderExecutionAuthorized: false;
}
