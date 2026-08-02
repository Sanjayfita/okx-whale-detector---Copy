import { createHash } from 'node:crypto';

export const EVALUATION_SESSION_MANIFEST_SCHEMA_VERSION = 1 as const;
export const DEFAULT_EVALUATION_HORIZONS_MINUTES = [1, 5, 15, 30, 60] as const;

export interface EvaluationSessionManifest {
  schemaVersion: typeof EVALUATION_SESSION_MANIFEST_SCHEMA_VERSION;
  evaluationId: string;
  sourceCommit: string;
  configurationFingerprint: string;
  configuration: Readonly<Record<string, unknown>>;
  instruments: readonly string[];
  horizonsMinutes: readonly number[];
  minimumCollectionDays: number;
  minimumQualifiedAlerts: number;
  createdAt: number;
  configurationChangesAllowed: false;
  liveOrderExecutionAllowed: false;
  orderExecutionAuthorized: false;
  dryRunOnly: true;
  transportDispatchAllowed: false;
  testnetExecutionAuthorized: false;
}

const requireNonEmpty = (value: string, name: string): string => {
  const normalized = value.trim();
  if (normalized.length === 0) throw new Error(`${name} must not be empty`);
  return normalized;
};

const stableValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, stableValue(nested)]),
    );
  }
  return value;
};

export const createConfigurationFingerprint = (
  configuration: Readonly<Record<string, unknown>>,
): string =>
  createHash('sha256')
    .update(JSON.stringify(stableValue(configuration)))
    .digest('hex');

export const createEvaluationSessionManifest = (input: {
  evaluationId: string;
  sourceCommit: string;
  configuration: Readonly<Record<string, unknown>>;
  instruments: readonly string[];
  createdAt: number;
  minimumCollectionDays?: number;
  minimumQualifiedAlerts?: number;
  horizonsMinutes?: readonly number[];
}): EvaluationSessionManifest => {
  const instruments = [...new Set(input.instruments.map((value) => requireNonEmpty(value, 'instrument')))].sort();
  if (instruments.length === 0) throw new Error('At least one instrument is required');
  if (!Number.isSafeInteger(input.createdAt) || input.createdAt < 0) {
    throw new Error('createdAt must be a non-negative safe integer');
  }

  const minimumCollectionDays = input.minimumCollectionDays ?? 30;
  const minimumQualifiedAlerts = input.minimumQualifiedAlerts ?? 1_000;
  if (!Number.isInteger(minimumCollectionDays) || minimumCollectionDays <= 0) {
    throw new Error('minimumCollectionDays must be a positive integer');
  }
  if (!Number.isInteger(minimumQualifiedAlerts) || minimumQualifiedAlerts <= 0) {
    throw new Error('minimumQualifiedAlerts must be a positive integer');
  }

  const horizonsMinutes = [...(input.horizonsMinutes ?? DEFAULT_EVALUATION_HORIZONS_MINUTES)];
  if (horizonsMinutes.some((value) => !Number.isInteger(value) || value <= 0)) {
    throw new Error('horizonsMinutes must contain positive integers');
  }
  if (new Set(horizonsMinutes).size !== horizonsMinutes.length) {
    throw new Error('horizonsMinutes must not contain duplicates');
  }

  const configuration = Object.freeze({ ...input.configuration });

  return Object.freeze({
    schemaVersion: EVALUATION_SESSION_MANIFEST_SCHEMA_VERSION,
    evaluationId: requireNonEmpty(input.evaluationId, 'evaluationId'),
    sourceCommit: requireNonEmpty(input.sourceCommit, 'sourceCommit'),
    configurationFingerprint: createConfigurationFingerprint(configuration),
    configuration,
    instruments: Object.freeze(instruments),
    horizonsMinutes: Object.freeze(horizonsMinutes.sort((a, b) => a - b)),
    minimumCollectionDays,
    minimumQualifiedAlerts,
    createdAt: input.createdAt,
    configurationChangesAllowed: false,
    liveOrderExecutionAllowed: false,
    orderExecutionAuthorized: false,
    dryRunOnly: true,
    transportDispatchAllowed: false,
    testnetExecutionAuthorized: false,
  });
};
