import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

interface EvaluationManifestSummary {
  evaluationId: string;
  collectionStartedAt: number;
  minimumCollectionDays: number;
  minimumQualifiedAlerts: number;
  liveOrderExecutionAllowed: false;
}

interface PendingState {
  pending: readonly unknown[];
  liveOrderExecutionAllowed: false;
}

export interface EvidenceProgressReport {
  evaluationId: string;
  collectionDays: number;
  qualifiedAlertCount: number;
  completedObservationCount: number;
  completeBundleCount: number;
  pendingObservationCount: number;
  malformedRecordCount: number;
  minimumCollectionDays: number;
  minimumQualifiedAlerts: number;
  durationRequirementMet: boolean;
  alertRequirementMet: boolean;
  readyForFinalEvaluation: boolean;
  liveOrderExecutionAllowed: false;
}

const parseNdjson = (content: string): { records: unknown[]; malformed: number } => {
  const records: unknown[] = [];
  let malformed = 0;

  for (const line of content.split(/\r?\n/u)) {
    if (line.trim().length === 0) continue;
    try {
      records.push(JSON.parse(line) as unknown);
    } catch {
      malformed += 1;
    }
  }

  return { records, malformed };
};

const readOptionalText = async (path: string): Promise<string> => {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return '';
    throw error;
  }
};

const isPendingState = (value: unknown): value is PendingState =>
  typeof value === 'object' &&
  value !== null &&
  'pending' in value &&
  Array.isArray((value as { pending?: unknown }).pending);

export const inspectEvidenceProgress = async (
  evaluationDirectory: string,
  now: number = Date.now(),
): Promise<EvidenceProgressReport> => {
  if (!Number.isSafeInteger(now) || now < 0) {
    throw new Error('now must be a non-negative safe integer');
  }

  const parsedManifest = JSON.parse(
    await readFile(join(evaluationDirectory, 'manifest.json'), 'utf8'),
  ) as Partial<EvaluationManifestSummary>;

  if (
    typeof parsedManifest.evaluationId !== 'string' ||
    !Number.isSafeInteger(parsedManifest.collectionStartedAt) ||
    !Number.isSafeInteger(parsedManifest.minimumCollectionDays) ||
    !Number.isSafeInteger(parsedManifest.minimumQualifiedAlerts) ||
    parsedManifest.liveOrderExecutionAllowed !== false
  ) {
    throw new Error('Evaluation manifest is invalid');
  }

  const manifest: EvaluationManifestSummary = {
    evaluationId: parsedManifest.evaluationId,
    collectionStartedAt: parsedManifest.collectionStartedAt as number,
    minimumCollectionDays: parsedManifest.minimumCollectionDays as number,
    minimumQualifiedAlerts: parsedManifest.minimumQualifiedAlerts as number,
    liveOrderExecutionAllowed: false,
  };

  const alerts = parseNdjson(
    await readOptionalText(join(evaluationDirectory, 'qualified-alerts.ndjson')),
  );
  const outcomes = parseNdjson(
    await readOptionalText(join(evaluationDirectory, 'outcomes.ndjson')),
  );

  let pendingObservationCount = 0;
  const pendingText = await readOptionalText(
    join(evaluationDirectory, 'pending-observations.json'),
  );
  let malformedRecordCount = alerts.malformed + outcomes.malformed;

  if (pendingText.trim().length > 0) {
    try {
      const parsed = JSON.parse(pendingText) as unknown;
      const pending = Array.isArray(parsed)
        ? parsed
        : isPendingState(parsed)
          ? parsed.pending
          : undefined;
      if (!Array.isArray(pending)) throw new Error('pending must be an array');
      pendingObservationCount = pending.length;
    } catch {
      malformedRecordCount += 1;
    }
  }

  const completedByAlert = new Map<string, Set<number>>();
  for (const record of outcomes.records) {
    if (typeof record !== 'object' || record === null) continue;
    const candidate = record as { alertId?: unknown; horizonMinutes?: unknown };
    if (typeof candidate.alertId !== 'string' || typeof candidate.horizonMinutes !== 'number') {
      malformedRecordCount += 1;
      continue;
    }
    const horizons = completedByAlert.get(candidate.alertId) ?? new Set<number>();
    horizons.add(candidate.horizonMinutes);
    completedByAlert.set(candidate.alertId, horizons);
  }

  const completeBundleCount = [...completedByAlert.values()].filter(
    (horizons) => horizons.size === 5,
  ).length;
  const collectionDays = Math.max(
    0,
    (now - manifest.collectionStartedAt) / 86_400_000,
  );
  const durationRequirementMet = collectionDays >= manifest.minimumCollectionDays;
  const alertRequirementMet = alerts.records.length >= manifest.minimumQualifiedAlerts;

  return Object.freeze({
    evaluationId: manifest.evaluationId,
    collectionDays,
    qualifiedAlertCount: alerts.records.length,
    completedObservationCount: outcomes.records.length,
    completeBundleCount,
    pendingObservationCount,
    malformedRecordCount,
    minimumCollectionDays: manifest.minimumCollectionDays,
    minimumQualifiedAlerts: manifest.minimumQualifiedAlerts,
    durationRequirementMet,
    alertRequirementMet,
    readyForFinalEvaluation:
      durationRequirementMet && alertRequirementMet && malformedRecordCount === 0,
    liveOrderExecutionAllowed: false,
  });
};
