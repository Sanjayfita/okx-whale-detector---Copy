import { createHash } from 'node:crypto';

import type { MarketRegimePolicy } from '../regime/MarketRegimeClassifier';
import type { TradeQualificationPolicy } from '../selection/TradeQualificationEngine';
import type { TrendContinuationPolicy } from '../strategies/TrendContinuationStrategy';
import type { RuntimeStrategyFeaturePolicy } from './RuntimeStrategyFeatureAdapter';
import type { RuntimeWhaleFeaturePolicy } from './RuntimeWhaleFeatureAdapter';
import { createConfigurationFingerprint } from './evaluationSessionManifest';
import {
  analyzeStrategyRobustness,
  type StrategyRobustnessPolicy,
  type StrategyRobustnessReport,
} from './strategyRobustnessAnalysis';
import {
  STRATEGY_OUTCOME_OBSERVATION_SCHEMA_VERSION,
  type StrategyOutcomeObservation,
} from './strategyResearchTypes';
import {
  analyzeWhaleIncrementalValue,
  type WhaleIncrementalValueReport,
} from './whaleIncrementalValueResearch';
import {
  createWalkForwardValidationReport,
  type WalkForwardPolicy,
  type WalkForwardValidationReport,
} from './walkForwardValidation';

export const FROZEN_STRATEGY_EVALUATION_SCHEMA_VERSION = 1 as const;

export interface FrozenStrategyConfiguration
  extends Readonly<Record<string, unknown>> {
  readonly strategyIds: readonly string[];
  readonly candidateEventWindowMs: number;
  readonly featurePolicy: RuntimeStrategyFeaturePolicy;
  readonly whaleFeaturePolicy: RuntimeWhaleFeaturePolicy;
  readonly regimePolicy: MarketRegimePolicy;
  readonly trendPolicy: TrendContinuationPolicy;
  readonly qualificationPolicy: TradeQualificationPolicy;
  readonly walkForwardPolicy: WalkForwardPolicy;
  readonly robustnessPolicy: StrategyRobustnessPolicy;
  readonly minimumOutcomeObservations: number;
  readonly minimumWhaleObservationsPerGroup: number;
}

export interface FrozenStrategyEvaluationManifest {
  readonly schemaVersion: typeof FROZEN_STRATEGY_EVALUATION_SCHEMA_VERSION;
  readonly evaluationId: string;
  readonly sourceCommit: string;
  readonly createdAt: number;
  readonly configurationFingerprint: string;
  readonly configuration: FrozenStrategyConfiguration;
  readonly parameterTuningAllowed: false;
  readonly paperOnly: true;
  readonly liveOrderExecutionAllowed: false;
  readonly orderExecutionAuthorized: false;
  readonly transportDispatchAllowed: false;
  readonly testnetExecutionAuthorized: false;
}

export interface FrozenStrategyEvaluationReport {
  readonly evaluationId: string;
  readonly sourceCommit: string;
  readonly configurationFingerprint: string;
  readonly observations: number;
  readonly walkForward: WalkForwardValidationReport;
  readonly robustness: StrategyRobustnessReport;
  readonly whaleIncrementalValue: WhaleIncrementalValueReport;
  readonly readyForNextPaperEvaluation: boolean;
  readonly reasons: readonly string[];
  readonly warnings: readonly string[];
  readonly deterministicFingerprint: string;
  readonly parameterTuningAllowed: false;
  readonly paperOnly: true;
  readonly liveOrderExecutionAllowed: false;
  readonly orderExecutionAuthorized: false;
  readonly transportDispatchAllowed: false;
  readonly testnetExecutionAuthorized: false;
}

const requireText = (value: string, name: string): string => {
  const normalized = value.trim();
  if (normalized.length === 0) throw new Error(`${name} must not be empty`);
  return normalized;
};

const stableValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, stableValue(nested)]),
    );
  }
  return value;
};

const stableFingerprint = (value: unknown): string =>
  createHash('sha256').update(JSON.stringify(stableValue(value))).digest('hex');

export const createFrozenStrategyEvaluationManifest = (input: {
  readonly evaluationId: string;
  readonly sourceCommit: string;
  readonly createdAt: number;
  readonly configuration: FrozenStrategyConfiguration;
}): FrozenStrategyEvaluationManifest => {
  if (!Number.isSafeInteger(input.createdAt) || input.createdAt < 0) {
    throw new Error('createdAt must be a non-negative safe integer');
  }
  if (
    !Number.isSafeInteger(input.configuration.minimumOutcomeObservations) ||
    input.configuration.minimumOutcomeObservations <= 0 ||
    !Number.isSafeInteger(
      input.configuration.minimumWhaleObservationsPerGroup,
    ) ||
    input.configuration.minimumWhaleObservationsPerGroup <= 0 ||
    !Number.isSafeInteger(input.configuration.candidateEventWindowMs) ||
    input.configuration.candidateEventWindowMs <= 0 ||
    input.configuration.strategyIds.length === 0 ||
    input.configuration.strategyIds.some((strategyId) =>
      strategyId.trim().length === 0,
    ) ||
    new Set(input.configuration.strategyIds).size !==
      input.configuration.strategyIds.length
  ) {
    throw new Error('Frozen strategy configuration is invalid');
  }

  const configuration = Object.freeze({
    ...input.configuration,
    strategyIds: Object.freeze([...input.configuration.strategyIds].sort()),
  }) as FrozenStrategyConfiguration;
  return Object.freeze({
    schemaVersion: FROZEN_STRATEGY_EVALUATION_SCHEMA_VERSION,
    evaluationId: requireText(input.evaluationId, 'evaluationId'),
    sourceCommit: requireText(input.sourceCommit, 'sourceCommit'),
    createdAt: input.createdAt,
    configurationFingerprint: createConfigurationFingerprint(configuration),
    configuration,
    parameterTuningAllowed: false,
    paperOnly: true,
    liveOrderExecutionAllowed: false,
    orderExecutionAuthorized: false,
    transportDispatchAllowed: false,
    testnetExecutionAuthorized: false,
  });
};

export const validateFrozenStrategyEvaluationManifest = (
  manifest: FrozenStrategyEvaluationManifest,
): FrozenStrategyEvaluationManifest => {
  if (
    manifest.schemaVersion !== FROZEN_STRATEGY_EVALUATION_SCHEMA_VERSION ||
    manifest.evaluationId.trim().length === 0 ||
    manifest.sourceCommit.trim().length === 0 ||
    !Number.isSafeInteger(manifest.createdAt) ||
    manifest.createdAt < 0 ||
    manifest.configurationFingerprint !==
      createConfigurationFingerprint(manifest.configuration) ||
    manifest.parameterTuningAllowed !== false ||
    manifest.paperOnly !== true ||
    manifest.liveOrderExecutionAllowed !== false ||
    manifest.orderExecutionAuthorized !== false ||
    manifest.transportDispatchAllowed !== false ||
    manifest.testnetExecutionAuthorized !== false
  ) {
    throw new Error('Frozen strategy evaluation manifest is invalid');
  }
  return manifest;
};

const validateAndOrderObservations = (
  manifest: FrozenStrategyEvaluationManifest,
  input: readonly StrategyOutcomeObservation[],
): readonly StrategyOutcomeObservation[] => {
  const candidateIds = new Set<string>();
  const allowedStrategies = new Set(manifest.configuration.strategyIds);

  for (const observation of input) {
    const minimumOutcomeTimestamp =
      observation.generatedAt + observation.horizonMinutes * 60_000;
    if (
      observation.schemaVersion !==
        STRATEGY_OUTCOME_OBSERVATION_SCHEMA_VERSION ||
      observation.eventId.trim().length === 0 ||
      observation.candidateId.trim().length === 0 ||
      candidateIds.has(observation.candidateId) ||
      !allowedStrategies.has(observation.strategyId) ||
      observation.instrumentId.trim().length === 0 ||
      (observation.direction !== 'BULLISH' &&
        observation.direction !== 'BEARISH') ||
      !Number.isSafeInteger(observation.generatedAt) ||
      observation.generatedAt < 0 ||
      !Number.isSafeInteger(observation.horizonMinutes) ||
      observation.horizonMinutes <= 0 ||
      !Number.isSafeInteger(minimumOutcomeTimestamp) ||
      !Number.isSafeInteger(observation.outcomeObservedAt) ||
      observation.outcomeObservedAt < minimumOutcomeTimestamp ||
      !Number.isFinite(observation.referencePrice) ||
      observation.referencePrice <= 0 ||
      !Number.isFinite(observation.outcomePrice) ||
      observation.outcomePrice <= 0 ||
      !Number.isFinite(observation.grossReturnPercent) ||
      !Number.isFinite(observation.spreadPercent) ||
      observation.spreadPercent < 0 ||
      !Number.isFinite(observation.depthNotionalQuote) ||
      observation.depthNotionalQuote < 0 ||
      !Number.isFinite(observation.realizedVolatilityPercent) ||
      observation.realizedVolatilityPercent < 0 ||
      !['WHALE_SUPPORTS', 'WHALE_NEUTRAL', 'WHALE_CONTRADICTS'].includes(
        observation.whaleGroup,
      ) ||
      observation.paperOnly !== true ||
      observation.liveOrderExecutionAllowed !== false ||
      observation.orderExecutionAuthorized !== false
    ) {
      throw new Error('Frozen strategy observations are invalid or duplicated');
    }
    candidateIds.add(observation.candidateId);
  }

  return Object.freeze(
    [...input].sort(
      (left, right) =>
        left.generatedAt - right.generatedAt ||
        left.candidateId.localeCompare(right.candidateId),
    ),
  );
};

export const runFrozenStrategyEvaluation = (input: {
  readonly manifest: FrozenStrategyEvaluationManifest;
  readonly observations: readonly StrategyOutcomeObservation[];
}): FrozenStrategyEvaluationReport => {
  const manifest = validateFrozenStrategyEvaluationManifest(input.manifest);
  const observations = validateAndOrderObservations(
    manifest,
    input.observations,
  );

  const walkForward = createWalkForwardValidationReport({
    observations,
    policy: manifest.configuration.walkForwardPolicy,
  });
  const robustness = analyzeStrategyRobustness({
    observations,
    policy: manifest.configuration.robustnessPolicy,
  });
  const primaryScenario = manifest.configuration.robustnessPolicy.scenarios[0];
  if (primaryScenario === undefined) {
    throw new Error('Frozen robustness policy has no primary cost scenario');
  }
  const whaleIncrementalValue = analyzeWhaleIncrementalValue(
    observations
      .filter((observation) => observation.baseQualified)
      .map((observation) => ({
        observationId: observation.candidateId,
        observedAt: observation.generatedAt,
        whaleGroup: observation.whaleGroup,
        netReturnPercent:
          observation.grossReturnPercent -
          primaryScenario.feePercent -
          primaryScenario.slippagePercent -
          observation.spreadPercent * primaryScenario.spreadMultiplier,
      })),
    {
      minimumObservationsPerGroup:
        manifest.configuration.minimumWhaleObservationsPerGroup,
      confidenceLevel:
        manifest.configuration.robustnessPolicy.confidenceLevel,
      bootstrapIterations:
        manifest.configuration.robustnessPolicy.bootstrapIterations,
      bootstrapBlockSize:
        manifest.configuration.robustnessPolicy.bootstrapBlockSize,
      randomSeed: manifest.configuration.robustnessPolicy.randomSeed,
    },
  );

  const reasons: string[] = [];
  if (
    observations.length < manifest.configuration.minimumOutcomeObservations
  ) {
    reasons.push('Minimum frozen outcome observation count was not met');
  }
  if (walkForward.folds.length === 0) {
    reasons.push('No complete walk-forward folds are available');
  }
  if (!walkForward.allValidationFoldsPositive) {
    reasons.push('One or more frozen validation folds are not positive');
  }
  if (!walkForward.allTestingFoldsPositive) {
    reasons.push('One or more frozen testing folds are not positive');
  }
  if (!robustness.profitableUnderEveryScenario) {
    reasons.push(
      'The confidence-interval lower bound is not positive under every frozen cost scenario',
    );
  }
  const warnings: string[] = [];
  if (!whaleIncrementalValue.sufficientForInference) {
    warnings.push(
      'Whale incremental-value groups do not yet meet the frozen sample requirement; whale support remains informational only',
    );
  }
  const readyForNextPaperEvaluation = reasons.length === 0;
  if (readyForNextPaperEvaluation) {
    reasons.push(
      'Candidate passed frozen offline research gates for another paper-only evaluation',
    );
  }

  const reportWithoutFingerprint = {
    evaluationId: manifest.evaluationId,
    sourceCommit: manifest.sourceCommit,
    configurationFingerprint: manifest.configurationFingerprint,
    observations: observations.length,
    walkForward,
    robustness,
    whaleIncrementalValue,
    readyForNextPaperEvaluation,
    reasons: Object.freeze(reasons),
    warnings: Object.freeze(warnings),
    parameterTuningAllowed: false as const,
    paperOnly: true as const,
    liveOrderExecutionAllowed: false as const,
    orderExecutionAuthorized: false as const,
    transportDispatchAllowed: false as const,
    testnetExecutionAuthorized: false as const,
  };
  return Object.freeze({
    ...reportWithoutFingerprint,
    deterministicFingerprint: stableFingerprint(reportWithoutFingerprint),
  });
};
