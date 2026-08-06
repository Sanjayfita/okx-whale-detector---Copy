import path from 'node:path';

import type { MarketRegimePolicy } from '../regime/MarketRegimeClassifier';
import type { RuntimeStrategyFeaturePolicy } from '../research/RuntimeStrategyFeatureAdapter';
import type { RuntimeWhaleFeaturePolicy } from '../research/RuntimeWhaleFeatureAdapter';
import type { TradeQualificationPolicy } from '../selection/TradeQualificationEngine';
import type { TrendContinuationPolicy } from '../strategies/TrendContinuationStrategy';

export interface StrategyResearchConfig {
  readonly enabled: boolean;
  readonly outputDirectory: string;
  readonly flushAfterEachRecord: boolean;
  readonly candidateEventWindowMs: number;
  readonly featurePolicy: RuntimeStrategyFeaturePolicy;
  readonly whaleFeaturePolicy: RuntimeWhaleFeaturePolicy;
  readonly regimePolicy: MarketRegimePolicy;
  readonly trendPolicy: TrendContinuationPolicy;
  readonly qualificationPolicy: TradeQualificationPolicy;
  readonly paperOnly: true;
  readonly liveOrderExecutionAllowed: false;
  readonly orderExecutionAuthorized: false;
  readonly transportDispatchAllowed: false;
  readonly testnetExecutionAuthorized: false;
}

export const strategyResearchConfig: StrategyResearchConfig = Object.freeze({
  enabled: process.env.STRATEGY_RESEARCH_ENABLED === 'true',
  outputDirectory:
    process.env.STRATEGY_RESEARCH_DIRECTORY ??
    path.join('data', 'strategy-research'),
  flushAfterEachRecord:
    process.env.STRATEGY_RESEARCH_FLUSH_EACH_RECORD !== 'false',
  candidateEventWindowMs: 60 * 60_000,
  featurePolicy: Object.freeze({
    candleIntervalMs: 60_000,
    fastLookbackCandles: 5,
    slowLookbackCandles: 15,
    volatilityLookbackCandles: 20,
    minimumTradeNotionalQuote: 0,
  }),
  whaleFeaturePolicy: Object.freeze({
    directionalDominanceThreshold: 0.15,
    persistentAfterMs: 60_000,
    maximumAuthenticDistanceFromMidPercent: 1,
  }),
  regimePolicy: Object.freeze({
    minimumTrendStrength: 0.1,
    volatileThresholdPercent: 2,
    maximumSpreadPercent: 0.08,
    minimumDepthNotionalQuote: 100_000,
  }),
  trendPolicy: Object.freeze({
    minimumFastReturnPercent: 0.05,
    minimumSlowReturnPercent: 0.1,
    minimumOrderFlowImbalance: 0.2,
    minimumExpectedMovePercent: 0.35,
    holdingHorizonMinutes: 60,
    baseConfidence: 65,
  }),
  qualificationPolicy: Object.freeze({
    estimatedRoundTripCostPercent: 0.2,
    minimumNetEdgePercent: 0.1,
    minimumBaseConfidence: 60,
    blockedRegimes: Object.freeze([
      'RANGING',
      'VOLATILE',
      'ILLIQUID',
      'UNKNOWN',
    ]),
  }),
  paperOnly: true,
  liveOrderExecutionAllowed: false,
  orderExecutionAuthorized: false,
  transportDispatchAllowed: false,
  testnetExecutionAuthorized: false,
});

export const validateStrategyResearchConfig = (
  config: StrategyResearchConfig,
): void => {
  if (typeof config.enabled !== 'boolean') {
    throw new Error('strategyResearch.enabled must be a boolean');
  }
  if (
    config.outputDirectory.trim().length === 0 ||
    path.isAbsolute(config.outputDirectory) ||
    config.outputDirectory.split(/[\\/]/u).includes('..')
  ) {
    throw new Error(
      'strategyResearch.outputDirectory must be a safe project-relative path',
    );
  }
  if (typeof config.flushAfterEachRecord !== 'boolean') {
    throw new Error(
      'strategyResearch.flushAfterEachRecord must be a boolean',
    );
  }
  if (
    !Number.isSafeInteger(config.candidateEventWindowMs) ||
    config.candidateEventWindowMs <= 0
  ) {
    throw new Error(
      'strategyResearch.candidateEventWindowMs must be a positive safe integer',
    );
  }
  if (
    config.paperOnly !== true ||
    config.liveOrderExecutionAllowed !== false ||
    config.orderExecutionAuthorized !== false ||
    config.transportDispatchAllowed !== false ||
    config.testnetExecutionAuthorized !== false
  ) {
    throw new Error('strategyResearch execution safety must remain locked');
  }
};
