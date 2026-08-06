import { describe, expect, it } from 'vitest';

import {
  createFrozenStrategyEvaluationManifest,
  runFrozenStrategyEvaluation,
} from '../src/research/frozenStrategyEvaluation';
import { analyzeStrategyRobustness } from '../src/research/strategyRobustnessAnalysis';
import {
  STRATEGY_OUTCOME_OBSERVATION_SCHEMA_VERSION,
  type StrategyOutcomeObservation,
} from '../src/research/strategyResearchTypes';

const observations: readonly StrategyOutcomeObservation[] = Object.freeze(
  Array.from({ length: 24 }, (_, index) =>
    Object.freeze({
      schemaVersion: STRATEGY_OUTCOME_OBSERVATION_SCHEMA_VERSION,
      eventId: `event-${index}`,
      candidateId: `candidate-${index}`,
      strategyId: 'TREND_CONTINUATION_V1',
      instrumentId: 'BTC-USDT-SWAP',
      direction: 'BULLISH' as const,
      generatedAt: 1_000_000 + index * 61 * 60_000,
      outcomeObservedAt:
        1_000_000 + index * 61 * 60_000 + 60 * 60_000,
      horizonMinutes: 60,
      referencePrice: 100,
      outcomePrice: 100.8,
      grossReturnPercent: 0.8,
      whaleGroup:
        index % 3 === 0
          ? ('WHALE_SUPPORTS' as const)
          : index % 3 === 1
            ? ('WHALE_NEUTRAL' as const)
            : ('WHALE_CONTRADICTS' as const),
      baseQualified: true,
      finalQualified: index % 3 !== 2,
      spreadPercent: 0.02,
      depthNotionalQuote: 2_500_000,
      realizedVolatilityPercent: 0.5,
      paperOnly: true,
      liveOrderExecutionAllowed: false,
      orderExecutionAuthorized: false,
    }),
  ),
);

const configuration = Object.freeze({
  strategyIds: Object.freeze(['TREND_CONTINUATION_V1']),
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
  walkForwardPolicy: Object.freeze({
    initialTrainingObservations: 9,
    validationObservations: 3,
    testingObservations: 3,
    stepObservations: 3,
    purgeMs: 0,
    embargoMs: 0,
    roundTripCostPercent: 0.2,
  }),
  robustnessPolicy: Object.freeze({
    scenarios: Object.freeze([
      Object.freeze({
        scenarioId: 'BASE',
        feePercent: 0.1,
        slippagePercent: 0.05,
        spreadMultiplier: 1,
      }),
      Object.freeze({
        scenarioId: 'STRESS',
        feePercent: 0.15,
        slippagePercent: 0.1,
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
    bootstrapIterations: 500,
    bootstrapBlockSize: 3,
    randomSeed: 52_322_800,
  }),
  minimumOutcomeObservations: 20,
  minimumWhaleObservationsPerGroup: 5,
});

describe('strategy robustness analysis', () => {
  it('applies fixed fee, slippage, spread, liquidity, and volatility scenarios', () => {
    const report = analyzeStrategyRobustness({
      observations,
      policy: configuration.robustnessPolicy,
    });

    expect(report.scenarios).toHaveLength(2);
    expect(
      report.scenarios.every((scenario) => scenario.positiveLowerBound),
    ).toBe(true);
    expect(report.scenarios[0]?.byLiquidityRegime).toHaveLength(3);
    expect(report.scenarios[0]?.byVolatilityRegime).toHaveLength(3);
    expect(report.scenarios[0]?.bySpreadRegime).toHaveLength(3);
    expect(report.orderExecutionAuthorized).toBe(false);
  });
});

describe('frozen strategy evaluation', () => {
  it('is deterministic, parameter-locked, paper-only, and independent of input order', () => {
    const manifest = createFrozenStrategyEvaluationManifest({
      evaluationId: 'eval-test',
      sourceCommit: 'abc123',
      createdAt: 1,
      configuration,
    });
    const first = runFrozenStrategyEvaluation({ manifest, observations });
    const second = runFrozenStrategyEvaluation({
      manifest,
      observations: [...observations].reverse(),
    });

    expect(first.deterministicFingerprint).toBe(
      second.deterministicFingerprint,
    );
    expect(first.readyForNextPaperEvaluation).toBe(true);
    expect(first.whaleIncrementalValue.sufficientForInference).toBe(true);
    expect(first.parameterTuningAllowed).toBe(false);
    expect(first.paperOnly).toBe(true);
    expect(first.liveOrderExecutionAllowed).toBe(false);
    expect(first.orderExecutionAuthorized).toBe(false);
    expect(first.transportDispatchAllowed).toBe(false);
    expect(first.testnetExecutionAuthorized).toBe(false);
  });

  it('rejects duplicated candidates and outcomes observed before their horizon', () => {
    const manifest = createFrozenStrategyEvaluationManifest({
      evaluationId: 'eval-invalid',
      sourceCommit: 'abc123',
      createdAt: 1,
      configuration,
    });
    const first = observations[0];
    expect(first).toBeDefined();

    expect(() =>
      runFrozenStrategyEvaluation({
        manifest,
        observations: [first!, first!],
      }),
    ).toThrow('invalid or duplicated');
    expect(() =>
      runFrozenStrategyEvaluation({
        manifest,
        observations: [
          {
            ...first!,
            outcomeObservedAt: first!.outcomeObservedAt - 1,
          },
        ],
      }),
    ).toThrow('invalid or duplicated');
  });
});
