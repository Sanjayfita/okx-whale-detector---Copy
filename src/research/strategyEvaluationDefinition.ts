import { strategyResearchConfig } from '../config/strategyResearchConfig';
import type { FrozenStrategyConfiguration } from './frozenStrategyEvaluation';

export const createCurrentFrozenStrategyConfiguration = (): FrozenStrategyConfiguration =>
  Object.freeze({
    strategyIds: Object.freeze(['TREND_CONTINUATION_V1']),
    candidateEventWindowMs: strategyResearchConfig.candidateEventWindowMs,
    featurePolicy: strategyResearchConfig.featurePolicy,
    whaleFeaturePolicy: strategyResearchConfig.whaleFeaturePolicy,
    regimePolicy: strategyResearchConfig.regimePolicy,
    trendPolicy: strategyResearchConfig.trendPolicy,
    qualificationPolicy: strategyResearchConfig.qualificationPolicy,
    walkForwardPolicy: Object.freeze({
      initialTrainingObservations: 200,
      validationObservations: 50,
      testingObservations: 50,
      stepObservations: 50,
      purgeMs: 60 * 60_000,
      embargoMs: 60 * 60_000,
      roundTripCostPercent: 0.2,
    }),
    robustnessPolicy: Object.freeze({
      scenarios: Object.freeze([
        Object.freeze({
          scenarioId: 'BASE',
          feePercent: 0.1,
          slippagePercent: 0.08,
          spreadMultiplier: 1,
        }),
        Object.freeze({
          scenarioId: 'CONSERVATIVE',
          feePercent: 0.12,
          slippagePercent: 0.12,
          spreadMultiplier: 1.25,
        }),
        Object.freeze({
          scenarioId: 'STRESS',
          feePercent: 0.15,
          slippagePercent: 0.2,
          spreadMultiplier: 1.5,
        }),
      ]),
      lowLiquidityMaximumDepthNotionalQuote: 250_000,
      highLiquidityMinimumDepthNotionalQuote: 2_000_000,
      lowVolatilityMaximumPercent: 0.2,
      highVolatilityMinimumPercent: 1,
      tightSpreadMaximumPercent: 0.03,
      wideSpreadMinimumPercent: 0.08,
      confidenceLevel: 0.95,
      bootstrapIterations: 2_000,
      bootstrapBlockSize: 10,
      randomSeed: 0x52_32_28,
    }),
    minimumOutcomeObservations: 1_000,
    minimumWhaleObservationsPerGroup: 100,
  });
