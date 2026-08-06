import { describe, expect, it } from 'vitest';

import type { ClusterBootstrapEvaluation } from '../src/research/clusterBootstrapEvaluation';
import { evaluateStatisticalEdgeGate } from '../src/research/statisticalEdgeGate';

const bootstrap = (
  overrides: Partial<ClusterBootstrapEvaluation> = {},
): ClusterBootstrapEvaluation => ({
  observationCount: 1_500,
  episodeCount: 300,
  dependencyRatio: 5,
  roundTripCostPercent: 0.2,
  meanNetReturnPercent: 0.1,
  confidenceLevel: 0.95,
  lowerBoundPercent: 0.02,
  upperBoundPercent: 0.18,
  bootstrapIterations: 5_000,
  seed: 1,
  verdict: 'POSITIVE_EDGE_CANDIDATE',
  episodeReturns: [],
  orderExecutionAuthorized: false,
  ...overrides,
});

const baseInput = () => ({
  bootstrap: bootstrap(),
  qualifiedAlertCount: 400,
  completedObservationCount: 1_500,
  purgedTestMeanPercent: 0.08,
  unmatchedObservationCount: 0,
  malformedRecordCount: 0,
});

describe('evaluateStatisticalEdgeGate', () => {
  it('blocks the strategy when expectancy and purged performance are negative', () => {
    const decision = evaluateStatisticalEdgeGate({
      ...baseInput(),
      bootstrap: bootstrap({
        meanNetReturnPercent: -0.1799,
        lowerBoundPercent: -0.2069,
        upperBoundPercent: -0.12,
        verdict: 'NEGATIVE_EDGE',
      }),
      purgedTestMeanPercent: -0.2425,
    });

    expect(decision.outcome).toBe('BLOCKED_NEGATIVE_EDGE');
    expect(decision.eligibleForTestnetReview).toBe(false);
    expect(decision.testnetExecutionAuthorized).toBe(false);
    expect(decision.orderExecutionAuthorized).toBe(false);
  });

  it('blocks malformed or unmatched evidence before judging performance', () => {
    const decision = evaluateStatisticalEdgeGate({
      ...baseInput(),
      unmatchedObservationCount: 1,
    });

    expect(decision.outcome).toBe('BLOCKED_DATA_QUALITY');
    expect(decision.reasons).toContain(
      'One or more outcome observations are unmatched',
    );
  });

  it('requires more independent episodes even when observed returns are positive', () => {
    const decision = evaluateStatisticalEdgeGate({
      ...baseInput(),
      bootstrap: bootstrap({ episodeCount: 50 }),
    });

    expect(decision.outcome).toBe('MORE_EVIDENCE_REQUIRED');
    expect(decision.reasons).toContain(
      'Minimum independent alert episode count was not met',
    );
  });

  it('permits manual testnet review only after every statistical requirement passes', () => {
    const decision = evaluateStatisticalEdgeGate(baseInput());

    expect(decision.outcome).toBe('EDGE_CANDIDATE');
    expect(decision.eligibleForTestnetReview).toBe(true);
    expect(decision.testnetExecutionAuthorized).toBe(false);
    expect(decision.orderExecutionAuthorized).toBe(false);
  });
});
