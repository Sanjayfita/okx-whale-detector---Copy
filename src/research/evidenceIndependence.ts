import type { QualifiedAlertEvidenceRecord } from './qualifiedAlertEvidence';

export interface EvidenceIndependenceMetrics {
  readonly maximumOutcomeHorizonMinutes: number;
  readonly independentAlertCount: number;
  readonly dependentAlertCount: number;
}

const compareAlerts = (
  left: Pick<QualifiedAlertEvidenceRecord, 'detectedAt' | 'alertId'>,
  right: Pick<QualifiedAlertEvidenceRecord, 'detectedAt' | 'alertId'>,
): number =>
  left.detectedAt - right.detectedAt || left.alertId.localeCompare(right.alertId);

/**
 * Counts deterministic, non-overlapping label windows per instrument.
 *
 * Alerts whose maximum configured outcome window overlaps a previously
 * accepted alert from the same instrument are dependent observations. They
 * remain in the dataset, but cannot satisfy the minimum independent-sample
 * requirement used for final evaluation readiness.
 */
export const measureEvidenceIndependence = (
  alerts: readonly Pick<
    QualifiedAlertEvidenceRecord,
    'alertId' | 'instrumentId' | 'detectedAt'
  >[],
  horizonsMinutes: readonly number[],
): EvidenceIndependenceMetrics => {
  if (
    horizonsMinutes.length === 0 ||
    horizonsMinutes.some(
      (horizon) => !Number.isSafeInteger(horizon) || horizon <= 0,
    )
  ) {
    throw new Error('Evidence outcome horizons must be positive safe integers');
  }

  const maximumOutcomeHorizonMinutes = Math.max(...horizonsMinutes);
  const labelWindowMs = maximumOutcomeHorizonMinutes * 60_000;
  if (!Number.isSafeInteger(labelWindowMs)) {
    throw new Error('Maximum evidence outcome horizon is too large');
  }

  const alertsByInstrument = new Map<
    string,
    Array<Pick<QualifiedAlertEvidenceRecord, 'alertId' | 'detectedAt'>>
  >();
  for (const alert of alerts) {
    if (
      alert.instrumentId.trim().length === 0 ||
      alert.alertId.trim().length === 0 ||
      !Number.isSafeInteger(alert.detectedAt) ||
      alert.detectedAt < 0
    ) {
      throw new Error('Evidence alert identity or timestamp is invalid');
    }
    const instrumentAlerts = alertsByInstrument.get(alert.instrumentId) ?? [];
    instrumentAlerts.push({ alertId: alert.alertId, detectedAt: alert.detectedAt });
    alertsByInstrument.set(alert.instrumentId, instrumentAlerts);
  }

  let independentAlertCount = 0;
  for (const instrumentAlerts of alertsByInstrument.values()) {
    instrumentAlerts.sort(compareAlerts);
    let nextIndependentAt = Number.NEGATIVE_INFINITY;

    for (const alert of instrumentAlerts) {
      if (alert.detectedAt < nextIndependentAt) {
        continue;
      }
      independentAlertCount += 1;
      const next = alert.detectedAt + labelWindowMs;
      nextIndependentAt = Number.isSafeInteger(next)
        ? next
        : Number.POSITIVE_INFINITY;
    }
  }

  return Object.freeze({
    maximumOutcomeHorizonMinutes,
    independentAlertCount,
    dependentAlertCount: alerts.length - independentAlertCount,
  });
};
