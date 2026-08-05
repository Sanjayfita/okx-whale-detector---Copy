import { describe, expect, it } from 'vitest';

import { WhaleConfirmationEngine } from '../src/confirmation/WhaleConfirmationEngine';
import { createStrategyCandidate } from '../src/strategies/StrategyCandidate';

const candidate = createStrategyCandidate({
  candidateId: 'candidate-1',
  strategyId: 'trend-continuation-v1',
  instrumentId: 'BTC-USDT-SWAP',
  direction: 'BULLISH',
  generatedAt: 1_000,
  referencePrice: 100,
  expectedMovePercent: 0.5,
  holdingHorizonMinutes: 15,
  baseConfidence: 70,
  regime: 'TRENDING',
  rationale: ['Independent trend strategy generated the candidate'],
});

describe('WhaleConfirmationEngine', () => {
  it('supports a candidate only when authenticated whale flow aligns', () => {
    const assessment = new WhaleConfirmationEngine().assess(candidate, {
      instrumentId: 'BTC-USDT-SWAP',
      observedAt: 1_001,
      directionalBias: 'BULLISH',
      persistenceScore: 80,
      absorptionScore: 20,
      tradeFlowConfirmationScore: 75,
      spoofProbability: 10,
      distanceFromMidPercent: 0.1,
    });

    expect(assessment.alignment).toBe('SUPPORTS');
    expect(assessment.blocksCandidate).toBe(false);
    expect(assessment.confidenceAdjustment).toBe(10);
    expect(assessment.liveOrderExecutionAllowed).toBe(false);
  });

  it('blocks a candidate when confirmed non-spoof whale flow opposes it', () => {
    const assessment = new WhaleConfirmationEngine().assess(candidate, {
      instrumentId: 'BTC-USDT-SWAP',
      observedAt: 1_001,
      directionalBias: 'BEARISH',
      persistenceScore: 80,
      absorptionScore: 10,
      tradeFlowConfirmationScore: 90,
      spoofProbability: 5,
      distanceFromMidPercent: 0.1,
    });

    expect(assessment.alignment).toBe('CONTRADICTS');
    expect(assessment.blocksCandidate).toBe(true);
    expect(assessment.confidenceAdjustment).toBe(-20);
  });

  it('does not let likely spoof liquidity become directional confirmation', () => {
    const assessment = new WhaleConfirmationEngine().assess(candidate, {
      instrumentId: 'BTC-USDT-SWAP',
      observedAt: 1_001,
      directionalBias: 'BULLISH',
      persistenceScore: 90,
      absorptionScore: 10,
      tradeFlowConfirmationScore: 90,
      spoofProbability: 85,
      distanceFromMidPercent: 0.1,
    });

    expect(assessment.authenticity).toBe('LIKELY_SPOOF');
    expect(assessment.alignment).toBe('NEUTRAL');
    expect(assessment.confidenceAdjustment).toBe(-10);
  });
});
