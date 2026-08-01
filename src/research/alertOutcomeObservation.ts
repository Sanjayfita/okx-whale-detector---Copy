export const ALERT_OUTCOME_OBSERVATION_SCHEMA_VERSION = 1 as const;

export const ALERT_OUTCOME_HORIZONS_MINUTES = [1, 5, 15, 30, 60] as const;

export type AlertOutcomeHorizonMinutes =
  (typeof ALERT_OUTCOME_HORIZONS_MINUTES)[number];

export interface AlertOutcomeObservation {
  schemaVersion: typeof ALERT_OUTCOME_OBSERVATION_SCHEMA_VERSION;
  evaluationId: string;
  alertId: string;
  instrumentId: string;
  detectedAt: number;
  horizonMinutes: AlertOutcomeHorizonMinutes;
  observedAt: number;
  referencePrice: number;
  observedPrice: number;
  rawReturnPercent: number;
  directionAdjustedReturnPercent: number;
  maximumFavorableExcursionPercent: number;
  maximumAdverseExcursionPercent: number;
  complete: true;
  liveOrderExecutionAllowed: false;
}

const requireNonEmpty = (value: string, name: string): string => {
  const normalized = value.trim();
  if (normalized.length === 0) throw new Error(`${name} must not be empty`);
  return normalized;
};

const requireTimestamp = (value: number, name: string): number => {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative safe integer`);
  }
  return value;
};

const requireFinitePositive = (value: number, name: string): number => {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive finite number`);
  }
  return value;
};

const requireFiniteNonNegative = (value: number, name: string): number => {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be a non-negative finite number`);
  }
  return value;
};

export const createAlertOutcomeObservation = (
  input: Omit<
    AlertOutcomeObservation,
    'schemaVersion' | 'complete' | 'liveOrderExecutionAllowed'
  >,
): AlertOutcomeObservation => {
  const detectedAt = requireTimestamp(input.detectedAt, 'detectedAt');
  const observedAt = requireTimestamp(input.observedAt, 'observedAt');
  const expectedObservedAt = detectedAt + input.horizonMinutes * 60_000;

  if (!ALERT_OUTCOME_HORIZONS_MINUTES.includes(input.horizonMinutes)) {
    throw new Error('horizonMinutes must be one of 1, 5, 15, 30, or 60');
  }
  if (observedAt < expectedObservedAt) {
    throw new Error('observedAt cannot be earlier than the requested horizon');
  }

  return Object.freeze({
    schemaVersion: ALERT_OUTCOME_OBSERVATION_SCHEMA_VERSION,
    evaluationId: requireNonEmpty(input.evaluationId, 'evaluationId'),
    alertId: requireNonEmpty(input.alertId, 'alertId'),
    instrumentId: requireNonEmpty(input.instrumentId, 'instrumentId'),
    detectedAt,
    horizonMinutes: input.horizonMinutes,
    observedAt,
    referencePrice: requireFinitePositive(input.referencePrice, 'referencePrice'),
    observedPrice: requireFinitePositive(input.observedPrice, 'observedPrice'),
    rawReturnPercent: input.rawReturnPercent,
    directionAdjustedReturnPercent: input.directionAdjustedReturnPercent,
    maximumFavorableExcursionPercent: requireFiniteNonNegative(
      input.maximumFavorableExcursionPercent,
      'maximumFavorableExcursionPercent',
    ),
    maximumAdverseExcursionPercent: requireFiniteNonNegative(
      input.maximumAdverseExcursionPercent,
      'maximumAdverseExcursionPercent',
    ),
    complete: true,
    liveOrderExecutionAllowed: false,
  });
};
