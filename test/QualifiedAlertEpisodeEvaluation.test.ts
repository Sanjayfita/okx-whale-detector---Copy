import { describe, expect, it } from 'vitest';

import {
  ALERT_OUTCOME_HORIZONS_MINUTES,
  type AlertOutcomeHorizonMinutes,
  createAlertOutcomeObservation,
} from '../src/research/alertOutcomeObservation';
import { createQualifiedAlertEvidenceRecord } from '../src/research/qualifiedAlertEvidence';
import { evaluateQualifiedAlertEpisodes } from '../src/research/qualifiedAlertEpisodeEvaluation';
import { createQualifiedAlertOutcomeBundle } from '../src/research/qualifiedAlertOutcomeBundle';

const createBundle = (input: {
  alertId: string;
  detectedAt: number;
  evaluationId?: string;
  returns?: Partial<Record<AlertOutcomeHorizonMinutes, number>>;
}) => {
  const evaluationId = input.evaluationId ?? 'evaluation:1';
  const evidence = createQualifiedAlertEvidenceRecord({
    evaluationId,
    alertId: input.alertId,
    instrumentId: 'BTC-USDT',
    detectedAt: input.detectedAt,
    recordedAt: input.detectedAt,
    direction: 'BULLISH',
    signalType: 'AGREEMENT:WATCH',
    confidence: 60,
    referencePrice: 100,
    bestBid: 99.9,
    bestAsk: 100.1,
    spreadPercent: 0.2,
    sourceCommit: 'abc123',
    configurationFingerprint: 'config:1',
  });
  const observations = ALERT_OUTCOME_HORIZONS_MINUTES.map((horizonMinutes) => {
    const directionAdjustedReturnPercent =
      input.returns?.[horizonMinutes] ?? 0.5;
    const observedPrice =
      evidence.referencePrice * (1 + directionAdjustedReturnPercent / 100);

    return createAlertOutcomeObservation({
      evaluationId,
      alertId: input.alertId,
      instrumentId: evidence.instrumentId,
      detectedAt: input.detectedAt,
      horizonMinutes,
      observedAt: input.detectedAt + horizonMinutes * 60_000,
      referencePrice: evidence.referencePrice,
      observedPrice,
      rawReturnPercent: directionAdjustedReturnPercent,
      directionAdjustedReturnPercent,
      maximumFavorableExcursionPercent: Math.max(
        0,
        directionAdjustedReturnPercent,
      ),
      maximumAdverseExcursionPercent: Math.max(
        0,
        -directionAdjustedReturnPercent,
      ),
    });
  });

  return createQualifiedAlertOutcomeBundle({ evidence, observations });
};

describe('evaluateQualifiedAlertEpisodes', () => {
  it('evaluates the requested horizon using existing qualified bundles', () => {
    const evaluation = evaluateQualifiedAlertEpisodes({
      bundles: [
        createBundle({
          alertId: 'alert:1',
          detectedAt: 0,
          returns: { 5: 0.5 },
        }),
        createBundle({
          alertId: 'alert:2',
          detectedAt: 3_600_001,
          returns: { 5: 0.7 },
        }),
      ],
      horizonMinutes: 5,
      roundTripCostPercent: 0.2,
      bootstrapIterations: 500,
      seed: 13,
    });

    expect(evaluation.episodeCount).toBe(2);
    expect(evaluation.meanNetReturnPercent).toBeCloseTo(0.4);
    expect(evaluation.verdict).toBe('POSITIVE_EDGE_CANDIDATE');
  });

  it('rejects bundles from different frozen evaluations', () => {
    expect(() =>
      evaluateQualifiedAlertEpisodes({
        bundles: [
          createBundle({ alertId: 'alert:1', detectedAt: 0 }),
          createBundle({
            alertId: 'alert:2',
            detectedAt: 3_600_001,
            evaluationId: 'evaluation:2',
          }),
        ],
        horizonMinutes: 5,
        roundTripCostPercent: 0.2,
      }),
    ).toThrow('All bundles must belong to the same evaluation');
  });
});
