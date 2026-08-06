import path from 'node:path';

import { WhaleConfirmationEngine } from '../confirmation/WhaleConfirmationEngine';
import type { StrategyResearchConfig } from '../config/strategyResearchConfig';
import type { MarketState } from '../core/MarketState';
import type { WhaleScanResult } from '../core/WhaleTracker';
import { MarketRegimeClassifier } from '../regime/MarketRegimeClassifier';
import { StrategyResearchRecorder } from '../recording/StrategyResearchRecorder';
import { CandidateDeduplicator } from '../selection/CandidateDeduplicator';
import {
  CandidatePipeline,
  type CandidatePipelineResult,
} from '../selection/CandidatePipeline';
import {
  TradeQualificationEngine,
  type PaperTradeCandidate,
} from '../selection/TradeQualificationEngine';
import type { StrategyEvaluationContext } from '../strategies/Strategy';
import { StrategyRegistry } from '../strategies/StrategyRegistry';
import { TrendContinuationStrategy } from '../strategies/TrendContinuationStrategy';
import {
  PENDING_STRATEGY_OUTCOME_SCHEMA_VERSION,
  PersistentStrategyOutcomeStore,
  type PendingStrategyOutcomeRecord,
} from './PersistentStrategyOutcomeStore';
import { RuntimeStrategyFeatureAdapter } from './RuntimeStrategyFeatureAdapter';
import { RuntimeWhaleFeatureAdapter } from './RuntimeWhaleFeatureAdapter';
import {
  STRATEGY_OUTCOME_OBSERVATION_SCHEMA_VERSION,
  type StrategyOutcomeObservation,
  type WhaleDecisionGroup,
} from './strategyResearchTypes';

export interface StrategyShadowRuntimeDependencies {
  readonly sourceSessionId: string;
  readonly config: StrategyResearchConfig;
  readonly clock?: () => number;
  readonly recorder?: StrategyResearchRecorder;
  readonly pendingOutcomeStore?: PersistentStrategyOutcomeStore;
}

const whaleGroup = (
  qualification: PaperTradeCandidate,
): WhaleDecisionGroup => {
  switch (qualification.whaleAssessment.alignment) {
    case 'SUPPORTS':
      return 'WHALE_SUPPORTS';
    case 'CONTRADICTS':
      return 'WHALE_CONTRADICTS';
    case 'NEUTRAL':
      return 'WHALE_NEUTRAL';
  }
};

const grossReturnPercent = (
  qualification: PaperTradeCandidate,
  outcomePrice: number,
): number => {
  const referencePrice = qualification.candidate.referencePrice;
  return qualification.candidate.direction === 'BULLISH'
    ? ((outcomePrice - referencePrice) / referencePrice) * 100
    : ((referencePrice - outcomePrice) / referencePrice) * 100;
};

export class StrategyShadowRuntime {
  public readonly paperOnly = true as const;
  public readonly liveOrderExecutionAllowed = false as const;

  private readonly pendingOutcomes = new Map<
    string,
    PendingStrategyOutcomeRecord
  >();

  public constructor(
    private readonly sourceSessionId: string,
    private readonly featureAdapter: RuntimeStrategyFeatureAdapter,
    private readonly whaleFeatureAdapter: RuntimeWhaleFeatureAdapter,
    private readonly candidatePipeline: CandidatePipeline,
    private readonly recorder: StrategyResearchRecorder,
    private readonly pendingOutcomeStore?: PersistentStrategyOutcomeStore,
  ) {
    if (sourceSessionId.trim().length === 0) {
      throw new Error('sourceSessionId must not be empty');
    }
    const restored = pendingOutcomeStore?.getAll() ?? [];
    for (const pending of restored) {
      this.pendingOutcomes.set(
        pending.qualification.candidate.candidateId,
        pending,
      );
    }
    this.restorePendingCandidateMemory();
  }

  public evaluate(input: {
    readonly state: MarketState;
    readonly whaleScan: WhaleScanResult;
    readonly observedAt: number;
  }): CandidatePipelineResult | undefined {
    if (!Number.isSafeInteger(input.observedAt) || input.observedAt < 0) {
      throw new Error('observedAt must be a non-negative safe integer');
    }
    const currentPrice = input.state.orderBookManager.getMidPrice();
    if (currentPrice === undefined) return undefined;
    this.resolveDueOutcomes(
      input.state.instrument.instId,
      input.observedAt,
      currentPrice,
    );

    const strategyContext = this.featureAdapter.createContext(
      input.state,
      input.observedAt,
    );
    if (strategyContext === undefined) return undefined;

    const whaleFeatures = this.whaleFeatureAdapter.createSnapshot({
      state: input.state,
      whaleScan: input.whaleScan,
      currentPrice,
      observedAt: input.observedAt,
    });
    const result = this.candidatePipeline.evaluate({
      strategyContext,
      whaleFeaturesByInstrument: new Map([
        [strategyContext.instrumentId, whaleFeatures],
      ]),
    });
    this.recorder.recordEvaluation({
      sourceSessionId: this.sourceSessionId,
      strategyContext,
      result,
    });
    this.scheduleOutcomes(strategyContext, [
      ...result.qualified,
      ...result.rejected,
    ]);
    return result;
  }

  public getPendingOutcomeCount(): number {
    return this.pendingOutcomes.size;
  }

  public reset(): void {
    this.candidatePipeline.reset();
    // Pending outcomes are evidence obligations, not order-book-derived state.
    // Keep them through transient runtime resets and restore their event memory
    // so a reconnect cannot emit a duplicate candidate inside the frozen window.
    this.restorePendingCandidateMemory();
  }

  public resetSymbols(instrumentIds: readonly string[]): void {
    this.candidatePipeline.resetInstruments(instrumentIds);
    const instruments = new Set(instrumentIds);
    this.candidatePipeline.restoreAcceptedCandidates(
      [...this.pendingOutcomes.values()]
        .filter((pending) =>
          instruments.has(pending.qualification.candidate.instrumentId),
        )
        .map((pending) => pending.qualification.candidate),
    );
  }

  public close(): void {
    this.persistPendingOutcomes();
    this.recorder.close();
  }

  private scheduleOutcomes(
    strategyContext: StrategyEvaluationContext,
    qualifications: readonly PaperTradeCandidate[],
  ): void {
    let changed = false;
    for (const qualification of qualifications) {
      if (!qualification.baseQualified) continue;
      const candidateId = qualification.candidate.candidateId;
      if (this.pendingOutcomes.has(candidateId)) continue;
      const dueAt =
        qualification.candidate.generatedAt +
        qualification.candidate.holdingHorizonMinutes * 60_000;
      if (!Number.isSafeInteger(dueAt) || dueAt < qualification.candidate.generatedAt) {
        throw new Error(`Invalid outcome due time for ${candidateId}`);
      }
      this.pendingOutcomes.set(
        candidateId,
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
      );
      changed = true;
    }
    if (changed) this.persistPendingOutcomes();
  }

  private resolveDueOutcomes(
    instrumentId: string,
    observedAt: number,
    outcomePrice: number,
  ): void {
    const due = [...this.pendingOutcomes.entries()]
      .filter(
        ([, pending]) =>
          pending.qualification.candidate.instrumentId === instrumentId &&
          pending.dueAt <= observedAt,
      )
      .sort(
        ([leftId, left], [rightId, right]) =>
          left.dueAt - right.dueAt || leftId.localeCompare(rightId),
      );

    for (const [candidateId, pending] of due) {
      const qualification = pending.qualification;
      const observation: StrategyOutcomeObservation = Object.freeze({
        schemaVersion: STRATEGY_OUTCOME_OBSERVATION_SCHEMA_VERSION,
        eventId: candidateId,
        candidateId,
        strategyId: qualification.candidate.strategyId,
        instrumentId: qualification.candidate.instrumentId,
        direction: qualification.candidate.direction,
        generatedAt: qualification.candidate.generatedAt,
        outcomeObservedAt: observedAt,
        horizonMinutes: qualification.candidate.holdingHorizonMinutes,
        referencePrice: qualification.candidate.referencePrice,
        outcomePrice,
        grossReturnPercent: grossReturnPercent(qualification, outcomePrice),
        whaleGroup: whaleGroup(qualification),
        baseQualified: qualification.baseQualified,
        finalQualified: qualification.qualified,
        spreadPercent: pending.strategyContext.spreadPercent,
        depthNotionalQuote: pending.strategyContext.depthNotionalQuote,
        realizedVolatilityPercent:
          pending.strategyContext.realizedVolatilityPercent,
        paperOnly: true,
        liveOrderExecutionAllowed: false,
        orderExecutionAuthorized: false,
      });
      this.recorder.recordOutcome({
        sourceSessionId: this.sourceSessionId,
        observation,
      });
      this.pendingOutcomes.delete(candidateId);
    }
    if (due.length > 0) this.persistPendingOutcomes();
  }

  private restorePendingCandidateMemory(): void {
    this.candidatePipeline.restoreAcceptedCandidates(
      [...this.pendingOutcomes.values()].map(
        (pending) => pending.qualification.candidate,
      ),
    );
  }

  private persistPendingOutcomes(): void {
    this.pendingOutcomeStore?.replace([...this.pendingOutcomes.values()]);
  }
}

export const createStrategyShadowRuntime = (
  dependencies: StrategyShadowRuntimeDependencies,
): StrategyShadowRuntime => {
  const classifier = new MarketRegimeClassifier(
    dependencies.config.regimePolicy,
  );
  const registry = new StrategyRegistry();
  registry.register(
    new TrendContinuationStrategy(
      classifier,
      dependencies.config.trendPolicy,
    ),
  );
  const candidatePipeline = new CandidatePipeline(
    registry,
    new CandidateDeduplicator(dependencies.config.candidateEventWindowMs),
    new WhaleConfirmationEngine(),
    new TradeQualificationEngine(dependencies.config.qualificationPolicy),
  );
  const recorder =
    dependencies.recorder ??
    new StrategyResearchRecorder({
      enabled: dependencies.config.enabled,
      outputDirectory: dependencies.config.outputDirectory,
      flushAfterEachRecord: dependencies.config.flushAfterEachRecord,
      clock: dependencies.clock,
    });
  const pendingOutcomeStore =
    dependencies.pendingOutcomeStore ??
    new PersistentStrategyOutcomeStore(
      path.join(
        dependencies.config.outputDirectory,
        'pending-strategy-outcomes.json',
      ),
      dependencies.config.enabled,
    );

  return new StrategyShadowRuntime(
    dependencies.sourceSessionId,
    new RuntimeStrategyFeatureAdapter(dependencies.config.featurePolicy),
    new RuntimeWhaleFeatureAdapter(dependencies.config.whaleFeaturePolicy),
    candidatePipeline,
    recorder,
    pendingOutcomeStore,
  );
};
