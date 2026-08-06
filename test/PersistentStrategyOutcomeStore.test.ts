import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { WhaleConfirmationEngine } from '../src/confirmation/WhaleConfirmationEngine';
import { MarketRegimeClassifier } from '../src/regime/MarketRegimeClassifier';
import type { StrategyResearchRecorder } from '../src/recording/StrategyResearchRecorder';
import {
  PENDING_STRATEGY_OUTCOME_SCHEMA_VERSION,
  PersistentStrategyOutcomeStore,
} from '../src/research/PersistentStrategyOutcomeStore';
import type { RuntimeStrategyFeatureAdapter } from '../src/research/RuntimeStrategyFeatureAdapter';
import type { RuntimeWhaleFeatureAdapter } from '../src/research/RuntimeWhaleFeatureAdapter';
import { StrategyShadowRuntime } from '../src/research/StrategyShadowRuntime';
import { CandidateDeduplicator } from '../src/selection/CandidateDeduplicator';
import { CandidatePipeline } from '../src/selection/CandidatePipeline';
import { TradeQualificationEngine } from '../src/selection/TradeQualificationEngine';
import { StrategyRegistry } from '../src/strategies/StrategyRegistry';
import { TrendContinuationStrategy } from '../src/strategies/TrendContinuationStrategy';

let directory: string | undefined;

afterEach(() => {
  if (directory !== undefined) {
    rmSync(directory, { recursive: true, force: true });
  }
  directory = undefined;
});

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
        minimumExpectedMovePercent: 0.3,
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

const createQualification = () => {
  const strategyContext = Object.freeze({
    instrumentId: 'BTC-USDT-SWAP',
    observedAt: 1_000_000,
    referencePrice: 100,
    fastReturnPercent: 0.35,
    slowReturnPercent: 0.5,
    orderFlowImbalance: 0.5,
    realizedVolatilityPercent: 0.5,
    spreadPercent: 0.02,
    depthNotionalQuote: 2_000_000,
  });
  const qualification = createPipeline().evaluate({
    strategyContext,
    whaleFeaturesByInstrument: new Map(),
  }).qualified[0];
  if (qualification === undefined) {
    throw new Error('Test qualification was not generated');
  }
  return { qualification, strategyContext };
};

const persistQualification = (filePath: string) => {
  const { qualification, strategyContext } = createQualification();
  const dueAt =
    qualification.candidate.generatedAt +
    qualification.candidate.holdingHorizonMinutes * 60_000;
  const store = new PersistentStrategyOutcomeStore(filePath);
  store.replace([
    Object.freeze({
      schemaVersion: PENDING_STRATEGY_OUTCOME_SCHEMA_VERSION,
      qualification,
      strategyContext,
      dueAt,
      paperOnly: true,
      liveOrderExecutionAllowed: false,
      orderExecutionAuthorized: false,
      transportDispatchAllowed: false,
      testnetExecutionAuthorized: false,
    }),
  ]);
  return { qualification, strategyContext, store };
};

describe('PersistentStrategyOutcomeStore', () => {
  it('persists and restores execution-disabled pending outcomes', () => {
    directory = mkdtempSync(join(tmpdir(), 'pending-strategy-'));
    const filePath = join(directory, 'pending.json');
    const { qualification } = persistQualification(filePath);

    const restored = new PersistentStrategyOutcomeStore(filePath).getAll();
    expect(restored).toHaveLength(1);
    expect(restored[0]?.qualification.candidate.candidateId).toBe(
      qualification.candidate.candidateId,
    );
    expect(restored[0]).toMatchObject({
      paperOnly: true,
      liveOrderExecutionAllowed: false,
      orderExecutionAuthorized: false,
      transportDispatchAllowed: false,
      testnetExecutionAuthorized: false,
    });
  });

  it('preserves pending evidence obligations across transient runtime resets', () => {
    directory = mkdtempSync(join(tmpdir(), 'pending-strategy-'));
    const filePath = join(directory, 'pending.json');
    const { store } = persistQualification(filePath);
    const runtime = new StrategyShadowRuntime(
      'test-session',
      {} as RuntimeStrategyFeatureAdapter,
      {} as RuntimeWhaleFeatureAdapter,
      createPipeline(),
      {} as StrategyResearchRecorder,
      store,
    );

    expect(runtime.getPendingOutcomeCount()).toBe(1);
    runtime.resetSymbols(['BTC-USDT-SWAP']);
    expect(runtime.getPendingOutcomeCount()).toBe(1);
    runtime.reset();
    expect(runtime.getPendingOutcomeCount()).toBe(1);
    expect(new PersistentStrategyOutcomeStore(filePath).getAll()).toHaveLength(1);
  });

  it('rejects a persisted state that weakens execution safety', () => {
    directory = mkdtempSync(join(tmpdir(), 'pending-strategy-'));
    const filePath = join(directory, 'pending.json');
    writeFileSync(
      filePath,
      JSON.stringify({
        schemaVersion: PENDING_STRATEGY_OUTCOME_SCHEMA_VERSION,
        pending: [],
        paperOnly: false,
        liveOrderExecutionAllowed: true,
        orderExecutionAuthorized: true,
        transportDispatchAllowed: true,
        testnetExecutionAuthorized: true,
      }),
    );

    expect(() => new PersistentStrategyOutcomeStore(filePath)).toThrow(
      'Pending strategy outcome state is invalid',
    );
  });
});
