import { describe, expect, it } from 'vitest';

import type { AlertOutcomeObservation } from '../src/research/alertOutcomeObservation';
import type { QualifiedAlertEvidenceRecord } from '../src/research/qualifiedAlertEvidence';
import {
  applyBenjaminiHochberg,
  blockBootstrapMeanConfidenceInterval,
  createStatisticalValidationReport,
} from '../src/research/statisticalValidation';

const createEvidence = (count: number): {
  alerts: QualifiedAlertEvidenceRecord[];
  outcomes: AlertOutcomeObservation[];
} => {
  const alerts: QualifiedAlertEvidenceRecord[] = [];
  const outcomes: AlertOutcomeObservation[] = [];

  for (let index = 0; index < count; index += 1) {
    const detectedAt = 1_000_000 + index * 2 * 60 * 60_000;
    const alertId = `alert-${index}`;
    alerts.push({
      schemaVersion: 1,
      evaluationId: 'eval-statistics',
      alertId,
      instrumentId: index % 2 === 0 ? 'BTC-USDT' : 'ETH-USDT',
      detectedAt,
      recordedAt: detectedAt + 1,
      direction: 'BULLISH',
      signalType: 'BUY_PRESSURE',
      confidence: 80,
      referencePrice: 100,
      bestBid: 99.9,
      bestAsk: 100.1,
      spreadPercent: 0.2,
      sourceCommit: 'test',
      configurationFingerprint: 'test',
      qualified: true,
      liveOrderExecutionAllowed: false,
    });
    outcomes.push({
      schemaVersion: 1,
      evaluationId: 'eval-statistics',
      alertId,
      instrumentId: alerts.at(-1)?.instrumentId ?? 'BTC-USDT',
      detectedAt,
      horizonMinutes: 1,
      observedAt: detectedAt + 60_000,
      referencePrice: 100,
      observedPrice: 101,
      rawReturnPercent: 1,
      directionAdjustedReturnPercent: 1,
      maximumFavorableExcursionPercent: 1.2,
      maximumAdverseExcursionPercent: 0.2,
      complete: true,
      liveOrderExecutionAllowed: false,
    });
  }

  return { alerts, outcomes };
};

describe('statistical validation', () => {
  it('creates a deterministic block-bootstrap interval', () => {
    const values = [0.5, 1, 1.5, 2, 2.5];
    let seed = 0;
    const random = (): number => {
      seed = (seed + 0.37) % 1;
      return seed;
    };

    const interval = blockBootstrapMeanConfidenceInterval(values, {
      iterations: 100,
      blockSize: 2,
      random,
    });

    expect(interval.mean).toBe(1.5);
    expect(interval.lower).toBeLessThanOrEqual(interval.mean);
    expect(interval.upper).toBeGreaterThanOrEqual(interval.mean);
  });

  it('applies Benjamini-Hochberg correction without changing input order', () => {
    const results = applyBenjaminiHochberg([
      { key: 'a', pValue: 0.001 },
      { key: 'b', pValue: 0.02 },
      { key: 'c', pValue: 0.8 },
    ]);

    expect(results.map((result) => result.key)).toEqual(['a', 'b', 'c']);
    expect(results[0]?.rejected).toBe(true);
    expect(results[2]?.rejected).toBe(false);
  });

  it('requires positive out-of-sample evidence before qualification', () => {
    const { alerts, outcomes } = createEvidence(30);
    const report = createStatisticalValidationReport({
      generatedAt: 9_999,
      evaluationId: 'eval-statistics',
      alerts,
      outcomes,
      policy: {
        startingCapital: 10_000,
        positionNotional: 100,
        roundTripCostPercent: 0.2,
      },
      options: {
        minimumSampleSize: 30,
        bootstrapIterations: 200,
        bootstrapBlockSize: 3,
        purgeMs: 30 * 60_000,
        randomSeed: 123,
      },
    });

    expect(report.sampleRequirementMet).toBe(true);
    expect(report.overallConfidenceInterval.lower).toBeGreaterThan(0);
    expect(report.chronologicalSplit.testCount).toBeGreaterThan(0);
    expect(report.chronologicalSplit.testMeanNetReturnPercent).toBeGreaterThan(0);
    expect(report.readyForQualification).toBe(true);
    expect(report.liveOrderExecutionAllowed).toBe(false);
    expect(report.orderExecutionAuthorized).toBe(false);
  });

  it('blocks qualification for insufficient data', () => {
    const { alerts, outcomes } = createEvidence(5);
    const report = createStatisticalValidationReport({
      generatedAt: 9_999,
      evaluationId: 'eval-statistics',
      alerts,
      outcomes,
      policy: {
        startingCapital: 10_000,
        positionNotional: 100,
        roundTripCostPercent: 0.2,
      },
      options: {
        minimumSampleSize: 100,
        bootstrapIterations: 20,
      },
    });

    expect(report.readyForQualification).toBe(false);
    expect(report.reasons[0]).toContain('Requires at least 100');
  });
});
