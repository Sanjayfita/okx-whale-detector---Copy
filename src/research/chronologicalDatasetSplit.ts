import type { QualifiedAlertOutcomeBundle } from './qualifiedAlertOutcomeBundle';

export const CHRONOLOGICAL_DATASET_SPLIT_SCHEMA_VERSION = 1 as const;

export interface ChronologicalDatasetSplit {
  schemaVersion: typeof CHRONOLOGICAL_DATASET_SPLIT_SCHEMA_VERSION;
  evaluationId: string;
  training: readonly QualifiedAlertOutcomeBundle[];
  validation: readonly QualifiedAlertOutcomeBundle[];
  testing: readonly QualifiedAlertOutcomeBundle[];
  trainingPercent: number;
  validationPercent: number;
  testingPercent: number;
  chronological: true;
  complete: true;
  liveOrderExecutionAllowed: false;
}

const requirePercent = (value: number, name: string): number => {
  if (!Number.isFinite(value) || value <= 0 || value >= 100) {
    throw new Error(`${name} must be greater than 0 and less than 100`);
  }
  return value;
};

export const createChronologicalDatasetSplit = (input: {
  bundles: readonly QualifiedAlertOutcomeBundle[];
  trainingPercent?: number;
  validationPercent?: number;
  testingPercent?: number;
}): ChronologicalDatasetSplit => {
  const trainingPercent = requirePercent(
    input.trainingPercent ?? 60,
    'trainingPercent',
  );
  const validationPercent = requirePercent(
    input.validationPercent ?? 20,
    'validationPercent',
  );
  const testingPercent = requirePercent(
    input.testingPercent ?? 20,
    'testingPercent',
  );

  if (trainingPercent + validationPercent + testingPercent !== 100) {
    throw new Error('Dataset split percentages must total exactly 100');
  }
  if (input.bundles.length < 5) {
    throw new Error('At least five completed bundles are required');
  }

  const evaluationId = input.bundles[0]!.evidence.evaluationId;

  for (const bundle of input.bundles) {
    if (!bundle.complete) {
      throw new Error('Every bundle must be complete');
    }
    if (bundle.evidence.evaluationId !== evaluationId) {
      throw new Error('All bundles must belong to the same evaluation');
    }
  }

  const ordered = [...input.bundles].sort(
    (left, right) => left.evidence.detectedAt - right.evidence.detectedAt,
  );

  for (let index = 1; index < ordered.length; index += 1) {
    if (
      ordered[index - 1]!.evidence.detectedAt ===
      ordered[index]!.evidence.detectedAt
    ) {
      throw new Error('Bundle detection timestamps must be unique');
    }
  }

  const trainingCount = Math.floor(
    ordered.length * (trainingPercent / 100),
  );
  const validationCount = Math.floor(
    ordered.length * (validationPercent / 100),
  );
  const testingCount = ordered.length - trainingCount - validationCount;

  if (trainingCount === 0 || validationCount === 0 || testingCount === 0) {
    throw new Error('Every chronological split must contain at least one bundle');
  }

  const training = ordered.slice(0, trainingCount);
  const validation = ordered.slice(
    trainingCount,
    trainingCount + validationCount,
  );
  const testing = ordered.slice(trainingCount + validationCount);

  return Object.freeze({
    schemaVersion: CHRONOLOGICAL_DATASET_SPLIT_SCHEMA_VERSION,
    evaluationId,
    training: Object.freeze(training),
    validation: Object.freeze(validation),
    testing: Object.freeze(testing),
    trainingPercent,
    validationPercent,
    testingPercent,
    chronological: true,
    complete: true,
    liveOrderExecutionAllowed: false,
  });
};
