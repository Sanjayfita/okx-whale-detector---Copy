import { describe, expect, it } from 'vitest';

import { evaluateClusterBootstrap } from '../src/research/clusterBootstrapEvaluation';

const observation = (
  alertId: string,
  detectedAt: number,
  directionAdjustedReturnPercent: number,
) => ({
  alertId,
  instrumentId: 'BTC-USDT',
  direction: 'BULLISH' as const,
  detectedAt,
  directionAdjustedReturnPercent,
});

describe('evaluateClusterBootstrap', () => {
  it('counts overlapping alerts as one independent episode', () => {
    const evaluation = evaluateClusterBootstrap({
      observations: [
        observation('alert:1', 0, 0.5),
        observation('alert:2', 30_000, 0.5),
        observation('alert:3', 120_001, 0.5),
      ],
      episodeWindowMs: 60_000,
      roundTripCostPercent: 0.2,
      bootstrapIterations: 500,
      seed: 7,
    });

    expect(evaluation.observationCount).toBe(3);
    expect(evaluation.episodeCount).toBe(2);
    expect(evaluation.dependencyRatio).toBe(1.5);
    expect(evaluation.meanNetReturnPercent).toBeCloseTo(0.3);
    expect(evaluation.lowerBoundPercent).toBeCloseTo(0.3);
    expect(evaluation.verdict).toBe('POSITIVE_EDGE_CANDIDATE');
    expect(evaluation.orderExecutionAuthorized).toBe(false);
  });

  it('classifies uniformly negative episode returns as negative edge', () => {
    const evaluation = evaluateClusterBootstrap({
      observations: [
        observation('alert:1', 0, -0.1),
        observation('alert:2', 120_001, -0.1),
        observation('alert:3', 240_002, -0.1),
      ],
      episodeWindowMs: 60_000,
      roundTripCostPercent: 0.2,
      bootstrapIterations: 500,
      seed: 11,
    });

    expect(evaluation.meanNetReturnPercent).toBeCloseTo(-0.3);
    expect(evaluation.upperBoundPercent).toBeCloseTo(-0.3);
    expect(evaluation.verdict).toBe('NEGATIVE_EDGE');
  });

  it('is reproducible for the same seed', () => {
    const input = {
      observations: [
        observation('alert:1', 0, -0.3),
        observation('alert:2', 120_001, 0.7),
        observation('alert:3', 240_002, 0.1),
      ],
      episodeWindowMs: 60_000,
      roundTripCostPercent: 0.2,
      bootstrapIterations: 500,
      seed: 17,
    } as const;

    expect(evaluateClusterBootstrap(input)).toEqual(
      evaluateClusterBootstrap(input),
    );
  });

  it('requires enough independent episodes and valid bootstrap settings', () => {
    expect(() =>
      evaluateClusterBootstrap({
        observations: [observation('alert:1', 0, 0.1)],
        episodeWindowMs: 60_000,
        roundTripCostPercent: 0.2,
      }),
    ).toThrow('At least two independent alert episodes are required');

    expect(() =>
      evaluateClusterBootstrap({
        observations: [
          observation('alert:1', 0, 0.1),
          observation('alert:2', 120_001, 0.1),
        ],
        episodeWindowMs: 60_000,
        roundTripCostPercent: 0.2,
        bootstrapIterations: 99,
      }),
    ).toThrow('bootstrapIterations must be a safe integer of at least 100');
  });
});
