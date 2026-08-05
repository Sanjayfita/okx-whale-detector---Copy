import type { StrategyCandidate } from '../strategies/StrategyCandidate';

export type WhaleConfirmationAlignment =
  | 'SUPPORTS'
  | 'CONTRADICTS'
  | 'NEUTRAL';

export type WhaleAuthenticity =
  | 'LIKELY_REAL'
  | 'UNCERTAIN'
  | 'LIKELY_SPOOF';

export interface WhaleFeatureSnapshot {
  readonly instrumentId: string;
  readonly observedAt: number;
  readonly directionalBias: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  readonly persistenceScore: number;
  readonly absorptionScore: number;
  readonly tradeFlowConfirmationScore: number;
  readonly spoofProbability: number;
  readonly distanceFromMidPercent: number;
}

export interface WhaleConfirmationAssessment {
  readonly candidateId: string;
  readonly alignment: WhaleConfirmationAlignment;
  readonly authenticity: WhaleAuthenticity;
  readonly confidenceAdjustment: number;
  readonly blocksCandidate: boolean;
  readonly features: WhaleFeatureSnapshot;
  readonly reasons: readonly string[];
  readonly liveOrderExecutionAllowed: false;
}

const bounded = (value: number, name: string): number => {
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    throw new Error(`${name} must be between 0 and 100`);
  }
  return value;
};

export class WhaleConfirmationEngine {
  public assess(
    candidate: StrategyCandidate,
    features: WhaleFeatureSnapshot,
  ): WhaleConfirmationAssessment {
    if (candidate.instrumentId !== features.instrumentId) {
      throw new Error('Candidate and whale features must use the same instrument');
    }
    if (!Number.isSafeInteger(features.observedAt) || features.observedAt < 0) {
      throw new Error('observedAt must be a non-negative safe integer');
    }

    const persistence = bounded(
      features.persistenceScore,
      'persistenceScore',
    );
    const absorption = bounded(features.absorptionScore, 'absorptionScore');
    const tradeFlow = bounded(
      features.tradeFlowConfirmationScore,
      'tradeFlowConfirmationScore',
    );
    const spoofProbability = bounded(
      features.spoofProbability,
      'spoofProbability',
    );
    if (
      !Number.isFinite(features.distanceFromMidPercent) ||
      features.distanceFromMidPercent < 0
    ) {
      throw new Error('distanceFromMidPercent must be non-negative');
    }

    const directionMatches =
      features.directionalBias === candidate.direction;
    const directionOpposes =
      features.directionalBias !== 'NEUTRAL' && !directionMatches;
    const authenticity: WhaleAuthenticity =
      spoofProbability >= 70
        ? 'LIKELY_SPOOF'
        : spoofProbability <= 30 && persistence >= 50
          ? 'LIKELY_REAL'
          : 'UNCERTAIN';

    const reasons: string[] = [];
    let alignment: WhaleConfirmationAlignment = 'NEUTRAL';
    let confidenceAdjustment = 0;
    let blocksCandidate = false;

    if (authenticity === 'LIKELY_SPOOF') {
      reasons.push('Displayed whale liquidity has high spoof probability');
      confidenceAdjustment -= 10;
    }

    if (directionOpposes && tradeFlow >= 60) {
      alignment = 'CONTRADICTS';
      confidenceAdjustment -= 20;
      blocksCandidate = authenticity !== 'LIKELY_SPOOF';
      reasons.push('Confirmed whale-side trade flow opposes the base strategy');
    } else if (
      directionMatches &&
      tradeFlow >= 60 &&
      persistence >= 50 &&
      authenticity === 'LIKELY_REAL'
    ) {
      alignment = 'SUPPORTS';
      confidenceAdjustment += 10;
      reasons.push('Persistent authenticated whale activity supports the base strategy');
    } else if (absorption >= 70 && directionMatches) {
      alignment = 'CONTRADICTS';
      confidenceAdjustment -= 15;
      blocksCandidate = true;
      reasons.push('Strong absorption contradicts continuation in the candidate direction');
    } else {
      reasons.push('Whale evidence is neutral or too uncertain to affect qualification');
    }

    return Object.freeze({
      candidateId: candidate.candidateId,
      alignment,
      authenticity,
      confidenceAdjustment,
      blocksCandidate,
      features: Object.freeze({ ...features }),
      reasons: Object.freeze(reasons),
      liveOrderExecutionAllowed: false,
    });
  }
}
