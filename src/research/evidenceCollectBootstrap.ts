import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import type { EvaluationSessionManifest } from './evaluationSessionManifest';

export interface EvidenceCollectBootstrap {
  evaluationDirectory: string;
  manifest: EvaluationSessionManifest;
  liveOrderExecutionAllowed: false;
}

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const isPositiveIntegerArray = (value: unknown): value is readonly number[] =>
  Array.isArray(value) &&
  value.length > 0 &&
  value.every((entry) => Number.isInteger(entry) && entry > 0);

export const loadEvidenceCollectBootstrap = async (
  evaluationId: string,
  projectDirectory: string = process.cwd(),
): Promise<EvidenceCollectBootstrap> => {
  const normalizedEvaluationId = evaluationId.trim();
  if (normalizedEvaluationId.length === 0) {
    throw new Error('evaluationId must not be empty');
  }
  if (
    normalizedEvaluationId.includes('/') ||
    normalizedEvaluationId.includes('\\') ||
    normalizedEvaluationId === '.' ||
    normalizedEvaluationId === '..'
  ) {
    throw new Error('evaluationId must be a safe directory name');
  }

  const evaluationDirectory = resolve(
    projectDirectory,
    'data',
    'evaluations',
    normalizedEvaluationId,
  );
  const parsed = JSON.parse(
    await readFile(resolve(evaluationDirectory, 'manifest.json'), 'utf8'),
  ) as Partial<EvaluationSessionManifest>;

  if (
    parsed.schemaVersion !== 1 ||
    parsed.evaluationId !== normalizedEvaluationId ||
    !isNonEmptyString(parsed.sourceCommit) ||
    !isNonEmptyString(parsed.configurationFingerprint) ||
    typeof parsed.configuration !== 'object' ||
    parsed.configuration === null ||
    !Array.isArray(parsed.instruments) ||
    parsed.instruments.length === 0 ||
    !parsed.instruments.every(isNonEmptyString) ||
    !isPositiveIntegerArray(parsed.horizonsMinutes) ||
    !Number.isInteger(parsed.minimumCollectionDays) ||
    (parsed.minimumCollectionDays ?? 0) <= 0 ||
    !Number.isInteger(parsed.minimumQualifiedAlerts) ||
    (parsed.minimumQualifiedAlerts ?? 0) <= 0 ||
    !Number.isSafeInteger(parsed.createdAt) ||
    (parsed.createdAt ?? -1) < 0 ||
    parsed.configurationChangesAllowed !== false ||
    parsed.liveOrderExecutionAllowed !== false ||
    parsed.orderExecutionAuthorized !== false ||
    parsed.dryRunOnly !== true ||
    parsed.transportDispatchAllowed !== false ||
    parsed.testnetExecutionAuthorized !== false
  ) {
    throw new Error('Evaluation manifest is invalid or execution safety is not locked');
  }

  return Object.freeze({
    evaluationDirectory,
    manifest: parsed as EvaluationSessionManifest,
    liveOrderExecutionAllowed: false,
  });
};
