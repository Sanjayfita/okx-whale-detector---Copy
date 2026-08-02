import { describe, expect, it } from 'vitest';

import type { AlertOutcomeObservation } from '../src/research/alertOutcomeObservation';
import { createEvidenceProfitabilityReport } from '../src/research/evidenceProfitability';
import type { QualifiedAlertEvidenceRecord } from '../src/research/qualifiedAlertEvidence';

const alert = (overrides: Partial<QualifiedAlertEvidenceRecord> = {}): QualifiedAlertEvidenceRecord => ({
  schemaVersion: 1,
  evaluationId: 'eval-test',
  alertId: 'alert-1',
  instrumentId: 'BTC-USDT',
  detectedAt: 1_000,
  recordedAt: 1_001,
  direction: 'BULLISH',
  signalType: 'BUY_PRESSURE',
  confidence: 80,
  referencePrice: 100,
  bestBid: 99.9,
  bestAsk: 100.1,
  spreadPercent: 0.2,
  sourceCommit: 'commit',
  configurationFingerprint: 'fingerprint',
  qualified: true,
  liveOrderExecutionAllowed: false,
  ...overrides,
});

const outcome = (overrides: Partial<AlertOutcomeObservation> = {}): AlertOutcomeObservation => ({
  schemaVersion: 1,
  evaluationId: 'eval-test',
  alertId: 'alert-1',
  instrumentId: 'BTC-USDT',
  detectedAt: 1_000,
  horizonMinutes: 1,
  observedAt: 61_000,
  referencePrice: 100,
  observedPrice: 101,
  rawReturnPercent: 1,
  directionAdjustedReturnPercent: 1,
  maximumFavorableExcursionPercent: 1.2,
  maximumAdverseExcursionPercent: 0.3,
  complete: true,
  liveOrderExecutionAllowed: false,
  ...overrides,
});

describe('createEvidenceProfitabilityReport', () => {
  it('calculates cost-adjusted hypothetical profitability without authorizing execution', () => {
    const report = createEvidenceProfitabilityReport({
      generatedAt: 70_000,
      evaluationId: 'eval-test',
      alerts: [alert(), alert({ alertId: 'alert-2', direction: 'BEARISH', instrumentId: 'ETH-USDT' })],
      outcomes: [
        outcome(),
        outcome({
          alertId: 'alert-2',
          instrumentId: 'ETH-USDT',
          horizonMinutes: 5,
          observedAt: 301_000,
          directionAdjustedReturnPercent: -0.5,
          maximumFavorableExcursionPercent: 0.4,
          maximumAdverseExcursionPercent: 0.8,
        }),
      ],
      policy: { positionNotional: 100, roundTripCostPercent: 0.2 },
    });

    expect(report.overall.observations).toBe(2);
    expect(report.overall.wins).toBe(1);
    expect(report.overall.losses).toBe(1);
    expect(report.overall.averageGrossReturnPercent).toBe(0.25);
    expect(report.overall.averageNetReturnPercent).toBe(0.05);
    expect(report.overall.hypotheticalNetPnlUsdt).toBe(0.1);
    expect(report.byHorizon.map((group) => group.key)).toEqual(['1m', '5m']);
    expect(report.byInstrument).toHaveLength(2);
    expect(report.insufficientData).toBe(true);
    expect(report.liveOrderExecutionAllowed).toBe(false);
    expect(report.orderExecutionAuthorized).toBe(false);
  });

  it('counts observations without matching qualified alerts', () => {
    const report = createEvidenceProfitabilityReport({
      generatedAt: 70_000,
      evaluationId: 'eval-test',
      alerts: [],
      outcomes: [outcome()],
    });

    expect(report.unmatchedObservations).toBe(1);
    expect(report.overall.observations).toBe(0);
  });
});
