export const QUALIFIED_ALERT_EVIDENCE_SCHEMA_VERSION = 1 as const;

export type QualifiedAlertDirection = 'BULLISH' | 'BEARISH' | 'NEUTRAL';

export interface QualifiedAlertEvidenceRecord {
  schemaVersion: typeof QUALIFIED_ALERT_EVIDENCE_SCHEMA_VERSION;
  evaluationId: string;
  alertId: string;
  instrumentId: string;
  detectedAt: number;
  recordedAt: number;
  direction: QualifiedAlertDirection;
  signalType: string;
  confidence: number;
  referencePrice: number;
  bestBid: number;
  bestAsk: number;
  spreadPercent: number;
  sourceCommit: string;
  configurationFingerprint: string;
  qualified: true;
  liveOrderExecutionAllowed: false;
}

const requireNonEmpty = (value: string, name: string): string => {
  const normalized = value.trim();
  if (normalized.length === 0) throw new Error(`${name} must not be empty`);
  return normalized;
};

const requireFinitePositive = (value: number, name: string): number => {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive finite number`);
  }
  return value;
};

const requireTimestamp = (value: number, name: string): number => {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative safe integer`);
  }
  return value;
};

export const createQualifiedAlertEvidenceRecord = (
  input: Omit<
    QualifiedAlertEvidenceRecord,
    'schemaVersion' | 'qualified' | 'liveOrderExecutionAllowed'
  >,
): QualifiedAlertEvidenceRecord => {
  const detectedAt = requireTimestamp(input.detectedAt, 'detectedAt');
  const recordedAt = requireTimestamp(input.recordedAt, 'recordedAt');
  if (recordedAt < detectedAt) {
    throw new Error('recordedAt cannot be earlier than detectedAt');
  }
  if (!Number.isFinite(input.confidence) || input.confidence < 0 || input.confidence > 100) {
    throw new Error('confidence must be between 0 and 100');
  }
  if (!Number.isFinite(input.spreadPercent) || input.spreadPercent < 0) {
    throw new Error('spreadPercent must be a non-negative finite number');
  }

  return Object.freeze({
    schemaVersion: QUALIFIED_ALERT_EVIDENCE_SCHEMA_VERSION,
    evaluationId: requireNonEmpty(input.evaluationId, 'evaluationId'),
    alertId: requireNonEmpty(input.alertId, 'alertId'),
    instrumentId: requireNonEmpty(input.instrumentId, 'instrumentId'),
    detectedAt,
    recordedAt,
    direction: input.direction,
    signalType: requireNonEmpty(input.signalType, 'signalType'),
    confidence: input.confidence,
    referencePrice: requireFinitePositive(input.referencePrice, 'referencePrice'),
    bestBid: requireFinitePositive(input.bestBid, 'bestBid'),
    bestAsk: requireFinitePositive(input.bestAsk, 'bestAsk'),
    spreadPercent: input.spreadPercent,
    sourceCommit: requireNonEmpty(input.sourceCommit, 'sourceCommit'),
    configurationFingerprint: requireNonEmpty(
      input.configurationFingerprint,
      'configurationFingerprint',
    ),
    qualified: true,
    liveOrderExecutionAllowed: false,
  });
};
