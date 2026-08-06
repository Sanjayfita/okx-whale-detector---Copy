import {
  WhaleConfirmationEngine,
  type WhaleFeatureSnapshot,
} from '../confirmation/WhaleConfirmationEngine';
import type { StrategyEvaluationContext } from '../strategies/Strategy';
import type { StrategyCandidate } from '../strategies/StrategyCandidate';
import { StrategyRegistry } from '../strategies/StrategyRegistry';
import { CandidateDeduplicator } from './CandidateDeduplicator';
import {
  TradeQualificationEngine,
  type PaperTradeCandidate,
} from './TradeQualificationEngine';

export interface CandidatePipelineInput {
  readonly strategyContext: StrategyEvaluationContext;
  readonly whaleFeaturesByInstrument: ReadonlyMap<string, WhaleFeatureSnapshot>;
}

export interface CandidatePipelineResult {
  readonly generated: readonly StrategyCandidate[];
  readonly accepted: readonly StrategyCandidate[];
  readonly qualified: readonly PaperTradeCandidate[];
  readonly rejected: readonly PaperTradeCandidate[];
  readonly duplicateCandidateIds: readonly string[];
  readonly paperOnly: true;
  readonly liveOrderExecutionAllowed: false;
}

export class CandidatePipeline {
  public constructor(
    private readonly registry: StrategyRegistry,
    private readonly deduplicator: CandidateDeduplicator,
    private readonly whaleConfirmationEngine: WhaleConfirmationEngine,
    private readonly qualificationEngine: TradeQualificationEngine,
  ) {}

  public evaluate(input: CandidatePipelineInput): CandidatePipelineResult {
    const generated = this.registry.evaluate(input.strategyContext);
    const deduplicated = this.deduplicator.deduplicate(generated);
    const qualified: PaperTradeCandidate[] = [];
    const rejected: PaperTradeCandidate[] = [];

    for (const candidate of deduplicated.accepted) {
      const features = input.whaleFeaturesByInstrument.get(
        candidate.instrumentId,
      ) ?? {
        instrumentId: candidate.instrumentId,
        observedAt: candidate.generatedAt,
        directionalBias: 'NEUTRAL' as const,
        persistenceScore: 0,
        absorptionScore: 0,
        tradeFlowConfirmationScore: 0,
        spoofProbability: 50,
        distanceFromMidPercent: 0,
      };
      const assessment = this.whaleConfirmationEngine.assess(candidate, features);
      const result = this.qualificationEngine.qualify(candidate, assessment);
      (result.qualified ? qualified : rejected).push(result);
    }

    return Object.freeze({
      generated,
      accepted: deduplicated.accepted,
      qualified: Object.freeze(qualified),
      rejected: Object.freeze(rejected),
      duplicateCandidateIds: deduplicated.rejectedCandidateIds,
      paperOnly: true,
      liveOrderExecutionAllowed: false,
    });
  }

  public restoreAcceptedCandidates(
    candidates: readonly StrategyCandidate[],
  ): void {
    this.deduplicator.restore(candidates);
  }

  public reset(): void {
    this.deduplicator.reset();
  }

  public resetInstruments(instrumentIds: readonly string[]): void {
    this.deduplicator.resetInstruments(instrumentIds);
  }
}
