import { describe, expect, it } from 'vitest';

import { WhaleConfirmationEngine } from '../src/confirmation/WhaleConfirmationEngine';
import { CandidateDeduplicator } from '../src/selection/CandidateDeduplicator';
import { TradeQualificationEngine } from '../src/selection/TradeQualificationEngine';
import { createStrategyCandidate } from '../src/strategies/StrategyCandidate';

const makeCandidate = (input: {
  id: string;
  generatedAt: number;
  confidence: number;
  expectedMovePercent: number;
}) =>
  createStrategyCandidate({
    candidateId: input.id,
    strategyId: 'momentum-breakout-v1',
    instrumentId: 'ETH-USDT-SWAP',
    direction: 'BEARISH',
    generatedAt: input.generatedAt,
    referencePrice: 100,
    expectedMovePercent: input.expectedMovePercent,
    holdingHorizonMinutes: 30,
    baseConfidence: input.confidence,
    regime: 'TRENDING',
    rationale: ['Independent momentum setup'],
  });

describe('R21 strategy qualification pipeline', () => {
  it('keeps only the strongest same-event candidate', () => {
    const weak = makeCandidate({
      id: 'weak',
      generatedAt: 1_000,
      confidence: 60,
      expectedMovePercent: 0.3,
    });
    const strong = makeCandidate({
      id: 'strong',
      generatedAt: 2_000,
      confidence: 80,
      expectedMovePercent: 0.6,
    });

    const result = new CandidateDeduplicator().deduplicate([weak, strong]);

    expect(result.accepted.map((candidate) => candidate.candidateId)).toEqual([
      'strong',
    ]);
    expect(result.rejectedCandidateIds).toEqual(['weak']);
  });

  it('requires an independently viable base strategy and keeps all execution locks', () => {
    const candidate = makeCandidate({
      id: 'viable',
      generatedAt: 1_000,
      confidence: 75,
      expectedMovePercent: 0.55,
    });
    const whaleAssessment = new WhaleConfirmationEngine().assess(candidate, {
      instrumentId: 'ETH-USDT-SWAP',
      observedAt: 1_001,
      directionalBias: 'NEUTRAL',
      persistenceScore: 20,
      absorptionScore: 20,
      tradeFlowConfirmationScore: 20,
      spoofProbability: 50,
      distanceFromMidPercent: 0.2,
    });
    const result = new TradeQualificationEngine({
      estimatedRoundTripCostPercent: 0.2,
      minimumNetEdgePercent: 0.1,
      minimumBaseConfidence: 70,
      blockedRegimes: ['ILLIQUID'],
    }).qualify(candidate, whaleAssessment);

    expect(result.qualified).toBe(true);
    expect(result.estimatedNetEdgePercent).toBeCloseTo(0.35);
    expect(result.paperOnly).toBe(true);
    expect(result.liveOrderExecutionAllowed).toBe(false);
    expect(result.orderExecutionAuthorized).toBe(false);
    expect(result.transportDispatchAllowed).toBe(false);
    expect(result.testnetExecutionAuthorized).toBe(false);
  });

  it('does not allow whale support to rescue a weak base strategy', () => {
    const candidate = makeCandidate({
      id: 'weak-base',
      generatedAt: 1_000,
      confidence: 40,
      expectedMovePercent: 0.1,
    });
    const whaleAssessment = new WhaleConfirmationEngine().assess(candidate, {
      instrumentId: 'ETH-USDT-SWAP',
      observedAt: 1_001,
      directionalBias: 'BEARISH',
      persistenceScore: 90,
      absorptionScore: 10,
      tradeFlowConfirmationScore: 90,
      spoofProbability: 5,
      distanceFromMidPercent: 0.1,
    });
    const result = new TradeQualificationEngine({
      estimatedRoundTripCostPercent: 0.2,
      minimumNetEdgePercent: 0.1,
      minimumBaseConfidence: 70,
      blockedRegimes: [],
    }).qualify(candidate, whaleAssessment);

    expect(whaleAssessment.alignment).toBe('SUPPORTS');
    expect(result.qualified).toBe(false);
    expect(result.reasons).toContain(
      'Expected movement does not exceed cost and safety margin',
    );
    expect(result.reasons).toContain(
      'Base strategy confidence is below the required threshold',
    );
  });
});
