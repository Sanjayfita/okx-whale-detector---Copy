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
import { TradeQualificationEngine } from '../selection/TradeQualificationEngine';
import { StrategyRegistry } from '../strategies/StrategyRegistry';
import { TrendContinuationStrategy } from '../strategies/TrendContinuationStrategy';
import { RuntimeStrategyFeatureAdapter } from './RuntimeStrategyFeatureAdapter';
import { RuntimeWhaleFeatureAdapter } from './RuntimeWhaleFeatureAdapter';

export interface StrategyShadowRuntimeDependencies {
  readonly sourceSessionId: string;
  readonly config: StrategyResearchConfig;
  readonly clock?: () => number;
  readonly recorder?: StrategyResearchRecorder;
}

export class StrategyShadowRuntime {
  public readonly paperOnly = true as const;
  public readonly liveOrderExecutionAllowed = false as const;

  public constructor(
    private readonly sourceSessionId: string,
    private readonly featureAdapter: RuntimeStrategyFeatureAdapter,
    private readonly whaleFeatureAdapter: RuntimeWhaleFeatureAdapter,
    private readonly candidatePipeline: CandidatePipeline,
    private readonly recorder: StrategyResearchRecorder,
  ) {
    if (sourceSessionId.trim().length === 0) {
      throw new Error('sourceSessionId must not be empty');
    }
  }

  public evaluate(input: {
    readonly state: MarketState;
    readonly whaleScan: WhaleScanResult;
    readonly observedAt: number;
  }): CandidatePipelineResult | undefined {
    const strategyContext = this.featureAdapter.createContext(
      input.state,
      input.observedAt,
    );
    if (strategyContext === undefined) return undefined;
    const currentPrice = input.state.orderBookManager.getMidPrice();
    if (currentPrice === undefined) return undefined;

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
    return result;
  }

  public reset(): void {
    this.candidatePipeline.reset();
  }

  public resetSymbols(instrumentIds: readonly string[]): void {
    this.candidatePipeline.resetInstruments(instrumentIds);
  }

  public close(): void {
    this.recorder.close();
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

  return new StrategyShadowRuntime(
    dependencies.sourceSessionId,
    new RuntimeStrategyFeatureAdapter(dependencies.config.featurePolicy),
    new RuntimeWhaleFeatureAdapter(dependencies.config.whaleFeaturePolicy),
    candidatePipeline,
    recorder,
  );
};
