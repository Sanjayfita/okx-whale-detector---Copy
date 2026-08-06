import { WhaleConfirmationEngine } from '../confirmation/WhaleConfirmationEngine';
import { MarketRegimeClassifier } from '../regime/MarketRegimeClassifier';
import {
  createFrozenStrategyEvaluationManifest,
  runFrozenStrategyEvaluation,
} from '../research/frozenStrategyEvaluation';
import { runDeterministicStrategyReplay } from '../research/strategyReplay';
import { CandidateDeduplicator } from '../selection/CandidateDeduplicator';
import { CandidatePipeline } from '../selection/CandidatePipeline';
import { TradeQualificationEngine } from '../selection/TradeQualificationEngine';
import { StrategyRegistry } from '../strategies/StrategyRegistry';
import { TrendContinuationStrategy } from '../strategies/TrendContinuationStrategy';

const createPipeline = (): CandidatePipeline => {
  const registry = new StrategyRegistry();
  registry.register(
    new TrendContinuationStrategy(
      new MarketRegimeClassifier({
        minimumTrendStrength: 0.1,
        volatileThresholdPercent: 2,
        maximumSpreadPercent: 0.08,
        minimumDepthNotionalQuote: 100_000,
      }),
      {
        minimumFastReturnPercent: 0.05,
        minimumSlowReturnPercent: 0.1,
        minimumOrderFlowImbalance: 0.2,
        minimumExpectedMovePercent: 0.35,
        holdingHorizonMinutes: 60,
        baseConfidence: 65,
      },
    ),
  );
  return new CandidatePipeline(
    registry,
    new CandidateDeduplicator(60 * 60_000),
    new WhaleConfirmationEngine(),
    new TradeQualificationEngine({
      estimatedRoundTripCostPercent: 0.2,
      minimumNetEdgePercent: 0.1,
      minimumBaseConfidence: 60,
      blockedRegimes: ['RANGING', 'VOLATILE', 'ILLIQUID', 'UNKNOWN'],
    }),
  );
};

const events = Array.from({ length: 24 }, (_, index) => {
  const availabilityTimestamp = 1_000_000 + index * 61 * 60_000;
  const group = index % 3;
  return Object.freeze({
    eventId: `event-${String(index).padStart(2, '0')}`,
    availabilityTimestamp,
    strategyContext: Object.freeze({
      instrumentId: 'BTC-USDT-SWAP',
      observedAt: availabilityTimestamp,
      referencePrice: 100,
      fastReturnPercent: 0.35,
      slowReturnPercent: 0.5,
      orderFlowImbalance: 0.5,
      realizedVolatilityPercent: 0.5,
      spreadPercent: 0.02,
      depthNotionalQuote: 2_500_000,
    }),
    whaleFeatures: Object.freeze([
      Object.freeze({
        instrumentId: 'BTC-USDT-SWAP',
        observedAt: availabilityTimestamp,
        directionalBias:
          group === 0
            ? ('BULLISH' as const)
            : group === 2
              ? ('BEARISH' as const)
              : ('NEUTRAL' as const),
        persistenceScore: group === 1 ? 0 : 80,
        absorptionScore: 0,
        tradeFlowConfirmationScore: group === 1 ? 0 : 80,
        spoofProbability: group === 1 ? 50 : 20,
        distanceFromMidPercent: 0.1,
      }),
    ]),
    outcomes: Object.freeze([
      Object.freeze({
        horizonMinutes: 60,
        observedAt: availabilityTimestamp + 60 * 60_000,
        price: 100.8,
      }),
    ]),
  });
});

const configuration = Object.freeze({
  strategyIds: Object.freeze(['TREND_CONTINUATION_V1']),
  candidateEventWindowMs: 60 * 60_000,
  featurePolicy: Object.freeze({
    candleIntervalMs: 60_000,
    fastLookbackCandles: 5,
    slowLookbackCandles: 15,
    volatilityLookbackCandles: 20,
    minimumTradeNotionalQuote: 0,
    maximumOrderBookAgeMs: 5_000,
    maximumCandleAgeMs: 120_000,
    maximumCandleGapMs: 90_000,
    depthLevelsPerSide: 20,
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

export const runStrategyResearchSimulation = (): void => {
  const first = runDeterministicStrategyReplay({
    events,
    pipeline: createPipeline(),
  });
  const second = runDeterministicStrategyReplay({
    events,
    pipeline: createPipeline(),
  });
  if (first.deterministicFingerprint !== second.deterministicFingerprint) {
    throw new Error('Strategy replay is not deterministic');
  }
  const manifest = createFrozenStrategyEvaluationManifest({
    evaluationId: 'simulation-r22-r28',
    sourceCommit: 'simulation-only',
    createdAt: 1,
    configuration,
  });
  const report = runFrozenStrategyEvaluation({
    manifest,
    observations: first.observations,
  });
  if (!report.readyForNextPaperEvaluation) {
    throw new Error(
      `Integrated strategy simulation did not pass: ${report.reasons.join('; ')}`,
    );
  }
  console.log('R22-R28 INTEGRATED STRATEGY SIMULATION PASSED');
  console.log(`Replay events: ${first.processedEvents}`);
  console.log(`Outcome observations: ${first.observations.length}`);
  console.log(`Walk-forward folds: ${report.walkForward.folds.length}`);
  console.log(`Cost scenarios: ${report.robustness.scenarios.length}`);
  console.log(
    `Whale study sufficient: ${report.whaleIncrementalValue.sufficientForInference}`,
  );
  console.log('Paper-only research. Order execution remains disabled.');
};

if (require.main === module) {
  try {
    runStrategyResearchSimulation();
  } catch (error: unknown) {
    console.error(
      `Strategy research simulation failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    process.exitCode = 1;
  }
}
