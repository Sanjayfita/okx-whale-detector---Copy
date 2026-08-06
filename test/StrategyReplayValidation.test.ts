import { describe, expect, it } from 'vitest';

import { WhaleConfirmationEngine } from '../src/confirmation/WhaleConfirmationEngine';
import { MarketRegimeClassifier } from '../src/regime/MarketRegimeClassifier';
import { runDeterministicStrategyReplay } from '../src/research/strategyReplay';
import { createWalkForwardValidationReport } from '../src/research/walkForwardValidation';
import { CandidateDeduplicator } from '../src/selection/CandidateDeduplicator';
import { CandidatePipeline } from '../src/selection/CandidatePipeline';
import { TradeQualificationEngine } from '../src/selection/TradeQualificationEngine';
import { StrategyRegistry } from '../src/strategies/StrategyRegistry';
import { TrendContinuationStrategy } from '../src/strategies/TrendContinuationStrategy';

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

const createEvents = (count: number) =>
  Array.from({ length: count }, (_, index) => {
    const observedAt = 1_000_000 + index * 61 * 60_000;
    return Object.freeze({
      eventId: `event-${index}`,
      availabilityTimestamp: observedAt,
      strategyContext: Object.freeze({
        instrumentId: 'BTC-USDT-SWAP',
        observedAt,
        referencePrice: 100,
        fastReturnPercent: 0.35,
        slowReturnPercent: 0.5,
        orderFlowImbalance: 0.5,
        realizedVolatilityPercent: 0.5,
        spreadPercent: 0.02,
        depthNotionalQuote: 2_000_000,
      }),
      whaleFeatures: Object.freeze([]),
      outcomes: Object.freeze([
        Object.freeze({
          horizonMinutes: 60,
          observedAt: observedAt + 60 * 60_000,
          price: 100.8,
        }),
      ]),
    });
  });

describe('deterministic strategy replay', () => {
  it('produces the same fingerprint and never authorizes execution', () => {
    const events = createEvents(12);
    const first = runDeterministicStrategyReplay({
      events,
      pipeline: createPipeline(),
    });
    const second = runDeterministicStrategyReplay({
      events,
      pipeline: createPipeline(),
    });

    expect(first.deterministicFingerprint).toBe(
      second.deterministicFingerprint,
    );
    expect(first.observations).toHaveLength(12);
    expect(first.lookAheadAllowed).toBe(false);
    expect(first.paperOnly).toBe(true);
    expect(first.orderExecutionAuthorized).toBe(false);
  });

  it('rejects an outcome that is available before the holding horizon', () => {
    const [event] = createEvents(1);
    expect(event).toBeDefined();
    const invalid = {
      ...event,
      outcomes: [
        {
          horizonMinutes: 60,
          observedAt: event!.availabilityTimestamp + 59 * 60_000,
          price: 100.8,
        },
      ],
    };

    expect(() =>
      runDeterministicStrategyReplay({
        events: [invalid],
        pipeline: createPipeline(),
      }),
    ).toThrow('available before its holding horizon');
  });
});

describe('walk-forward validation', () => {
  it('uses fixed chronological folds with no tuning or look-ahead', () => {
    const replay = runDeterministicStrategyReplay({
      events: createEvents(18),
      pipeline: createPipeline(),
    });
    const report = createWalkForwardValidationReport({
      observations: replay.observations,
      policy: {
        initialTrainingObservations: 6,
        validationObservations: 3,
        testingObservations: 3,
        stepObservations: 3,
        purgeMs: 0,
        embargoMs: 0,
        roundTripCostPercent: 0.2,
      },
    });

    expect(report.folds.length).toBeGreaterThan(0);
    expect(report.allValidationFoldsPositive).toBe(true);
    expect(report.allTestingFoldsPositive).toBe(true);
    expect(report.chronological).toBe(true);
    expect(report.frozenWindows).toBe(true);
    expect(report.lookAheadAllowed).toBe(false);
    expect(report.parameterTuningAllowed).toBe(false);
  });
});
