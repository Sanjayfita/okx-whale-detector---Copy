import type { ClusterBootstrapEvaluation } from './clusterBootstrapEvaluation';

export type StatisticalEdgeGateOutcome =
  | 'BLOCKED_NEGATIVE_EDGE'
  | 'BLOCKED_DATA_QUALITY'
  | 'MORE_EVIDENCE_REQUIRED'
  | 'EDGE_CANDIDATE';

export interface StatisticalEdgeGateDecision {
  outcome: StatisticalEdgeGateOutcome;
  qualifiedAlertCount: number;
  completedObservationCount: number;
  independentEpisodeCount: number;
  minimumQualifiedAlertCount: number;
  minimumCompletedObservationCount: number;
  minimumIndependentEpisodeCount: number;
  netExpectancyPercent: number;
  bootstrapLowerBoundPercent: number;
  bootstrapUpperBoundPercent: number;
  purgedTestMeanPercent: number;
  unmatchedObservationCount: number;
  malformedRecordCount: number;
  reasons: readonly string[];
  eligibleForTestnetReview: boolean;
  testnetExecutionAuthorized: false;
  orderExecutionAuthorized: false;
}

const requireNonNegativeInteger = (value: number, name: string): number => {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative safe integer`);
  }
  return value;
};

const requirePositiveInteger = (value: number, name: string): number => {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive safe integer`);
  }
  return value;
};

const requireFinite = (value: number, name: string): number => {
  if (!Number.isFinite(value)) {
    throw new Error(`${name} must be finite`);
  }
  return value;
};

export const evaluateStatisticalEdgeGate = (input: {
  bootstrap: ClusterBootstrapEvaluation;
  qualifiedAlertCount: number;
  completedObservationCount: number;
  purgedTestMeanPercent: number;
  unmatchedObservationCount: number;
  malformedRecordCount: number;
  minimumQualifiedAlertCount?: number;
  minimumCompletedObservationCount?: number;
  minimumIndependentEpisodeCount?: number;
}): StatisticalEdgeGateDecision => {
  const qualifiedAlertCount = requireNonNegativeInteger(
    input.qualifiedAlertCount,
    'qualifiedAlertCount',
  );
  const completedObservationCount = requireNonNegativeInteger(
    input.completedObservationCount,
    'completedObservationCount',
  );
  const unmatchedObservationCount = requireNonNegativeInteger(
    input.unmatchedObservationCount,
    'unmatchedObservationCount',
  );
  const malformedRecordCount = requireNonNegativeInteger(
    input.malformedRecordCount,
    'malformedRecordCount',
  );
  const minimumQualifiedAlertCount = requirePositiveInteger(
    input.minimumQualifiedAlertCount ?? 300,
    'minimumQualifiedAlertCount',
  );
  const minimumCompletedObservationCount = requirePositiveInteger(
    input.minimumCompletedObservationCount ?? 1_000,
    'minimumCompletedObservationCount',
  );
  const minimumIndependentEpisodeCount = requirePositiveInteger(
    input.minimumIndependentEpisodeCount ?? 100,
    'minimumIndependentEpisodeCount',
  );
  const purgedTestMeanPercent = requireFinite(
    input.purgedTestMeanPercent,
    'purgedTestMeanPercent',
  );
  const netExpectancyPercent = requireFinite(
    input.bootstrap.meanNetReturnPercent,
    'bootstrap.meanNetReturnPercent',
  );
  const bootstrapLowerBoundPercent = requireFinite(
    input.bootstrap.lowerBoundPercent,
    'bootstrap.lowerBoundPercent',
  );
  const bootstrapUpperBoundPercent = requireFinite(
    input.bootstrap.upperBoundPercent,
    'bootstrap.upperBoundPercent',
  );
  const independentEpisodeCount = requireNonNegativeInteger(
    input.bootstrap.episodeCount,
    'bootstrap.episodeCount',
  );
  const reasons: string[] = [];
  let outcome: StatisticalEdgeGateOutcome;

  if (unmatchedObservationCount > 0 || malformedRecordCount > 0) {
    outcome = 'BLOCKED_DATA_QUALITY';
    if (unmatchedObservationCount > 0) {
      reasons.push('One or more outcome observations are unmatched');
    }
    if (malformedRecordCount > 0) {
      reasons.push('One or more evidence records are malformed');
    }
  } else if (
    netExpectancyPercent <= 0 ||
    purgedTestMeanPercent <= 0 ||
    input.bootstrap.verdict === 'NEGATIVE_EDGE' ||
    bootstrapUpperBoundPercent < 0
  ) {
    outcome = 'BLOCKED_NEGATIVE_EDGE';
    if (netExpectancyPercent <= 0) {
      reasons.push('Cluster-adjusted net expectancy is not positive');
    }
    if (purgedTestMeanPercent <= 0) {
      reasons.push('Purged chronological test mean is not positive');
    }
    if (
      input.bootstrap.verdict === 'NEGATIVE_EDGE' ||
      bootstrapUpperBoundPercent < 0
    ) {
      reasons.push('Cluster bootstrap evidence indicates negative edge');
    }
  } else if (
    qualifiedAlertCount < minimumQualifiedAlertCount ||
    completedObservationCount < minimumCompletedObservationCount ||
    independentEpisodeCount < minimumIndependentEpisodeCount ||
    input.bootstrap.verdict !== 'POSITIVE_EDGE_CANDIDATE' ||
    bootstrapLowerBoundPercent <= 0
  ) {
    outcome = 'MORE_EVIDENCE_REQUIRED';
    if (qualifiedAlertCount < minimumQualifiedAlertCount) {
      reasons.push('Minimum qualified alert count was not met');
    }
    if (completedObservationCount < minimumCompletedObservationCount) {
      reasons.push('Minimum completed observation count was not met');
    }
    if (independentEpisodeCount < minimumIndependentEpisodeCount) {
      reasons.push('Minimum independent alert episode count was not met');
    }
    if (
      input.bootstrap.verdict !== 'POSITIVE_EDGE_CANDIDATE' ||
      bootstrapLowerBoundPercent <= 0
    ) {
      reasons.push('The cluster-bootstrap lower confidence bound is not positive');
    }
  } else {
    outcome = 'EDGE_CANDIDATE';
    reasons.push(
      'Positive edge remains after costs, dependency-aware bootstrap, and purged testing',
    );
  }

  const eligibleForTestnetReview = outcome === 'EDGE_CANDIDATE';
  reasons.push('This gate never authorizes testnet or real-order execution');

  return Object.freeze({
    outcome,
    qualifiedAlertCount,
    completedObservationCount,
    independentEpisodeCount,
    minimumQualifiedAlertCount,
    minimumCompletedObservationCount,
    minimumIndependentEpisodeCount,
    netExpectancyPercent,
    bootstrapLowerBoundPercent,
    bootstrapUpperBoundPercent,
    purgedTestMeanPercent,
    unmatchedObservationCount,
    malformedRecordCount,
    reasons: Object.freeze(reasons),
    eligibleForTestnetReview,
    testnetExecutionAuthorized: false,
    orderExecutionAuthorized: false,
  });
};
