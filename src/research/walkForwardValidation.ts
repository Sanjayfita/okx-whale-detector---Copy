import type { StrategyOutcomeObservation } from './strategyResearchTypes';

export interface WalkForwardPolicy {
  readonly initialTrainingObservations: number;
  readonly validationObservations: number;
  readonly testingObservations: number;
  readonly stepObservations: number;
  readonly purgeMs: number;
  readonly embargoMs: number;
  readonly roundTripCostPercent: number;
}

export interface WalkForwardFold {
  readonly fold: number;
  readonly trainingStartedAt: number;
  readonly validationStartedAt: number;
  readonly testingStartedAt: number;
  readonly testingEndedAt: number;
  readonly trainingObservations: number;
  readonly validationObservations: number;
  readonly testingObservations: number;
  readonly purgedTrainingObservations: number;
  readonly purgedValidationObservations: number;
  readonly trainingMeanNetReturnPercent: number;
  readonly validationMeanNetReturnPercent: number;
  readonly testingMeanNetReturnPercent: number;
  readonly validationPositive: boolean;
  readonly testingPositive: boolean;
}

export interface WalkForwardValidationReport {
  readonly policy: WalkForwardPolicy;
  readonly folds: readonly WalkForwardFold[];
  readonly totalTestingObservations: number;
  readonly meanValidationNetReturnPercent: number;
  readonly meanTestingNetReturnPercent: number;
  readonly allValidationFoldsPositive: boolean;
  readonly allTestingFoldsPositive: boolean;
  readonly chronological: true;
  readonly frozenWindows: true;
  readonly lookAheadAllowed: false;
  readonly parameterTuningAllowed: false;
  readonly liveOrderExecutionAllowed: false;
}

const average = (values: readonly number[]): number =>
  values.length === 0
    ? 0
    : values.reduce((sum, value) => sum + value, 0) / values.length;

const meanNetReturn = (
  observations: readonly StrategyOutcomeObservation[],
  roundTripCostPercent: number,
): number =>
  average(
    observations.map(
      (observation) =>
        observation.grossReturnPercent - roundTripCostPercent,
    ),
  );

const validatePolicy = (policy: WalkForwardPolicy): void => {
  for (const [name, value] of Object.entries({
    initialTrainingObservations: policy.initialTrainingObservations,
    validationObservations: policy.validationObservations,
    testingObservations: policy.testingObservations,
    stepObservations: policy.stepObservations,
  })) {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new Error(`${name} must be a positive safe integer`);
    }
  }
  if (
    !Number.isSafeInteger(policy.purgeMs) ||
    policy.purgeMs < 0 ||
    !Number.isSafeInteger(policy.embargoMs) ||
    policy.embargoMs < 0
  ) {
    throw new Error('purgeMs and embargoMs must be non-negative safe integers');
  }
  if (
    !Number.isFinite(policy.roundTripCostPercent) ||
    policy.roundTripCostPercent < 0
  ) {
    throw new Error('roundTripCostPercent must be non-negative');
  }
};

export const createWalkForwardValidationReport = (input: {
  readonly observations: readonly StrategyOutcomeObservation[];
  readonly policy: WalkForwardPolicy;
}): WalkForwardValidationReport => {
  validatePolicy(input.policy);
  const ordered = input.observations
    .filter((observation) => observation.baseQualified)
    .sort(
      (left, right) =>
        left.generatedAt - right.generatedAt ||
        left.candidateId.localeCompare(right.candidateId),
    );
  const folds: WalkForwardFold[] = [];
  const required =
    input.policy.initialTrainingObservations +
    input.policy.validationObservations +
    input.policy.testingObservations;

  for (
    let trainingEnd = input.policy.initialTrainingObservations;
    trainingEnd +
        input.policy.validationObservations +
        input.policy.testingObservations <=
      ordered.length;
    trainingEnd += input.policy.stepObservations
  ) {
    const validationEnd = trainingEnd + input.policy.validationObservations;
    const testingEnd = validationEnd + input.policy.testingObservations;
    const trainingCandidates = ordered.slice(0, trainingEnd);
    const validationCandidates = ordered.slice(trainingEnd, validationEnd);
    const testing = ordered.slice(validationEnd, testingEnd);
    const validationStartedAt = validationCandidates[0]?.generatedAt;
    const testingStartedAt = testing[0]?.generatedAt;
    const testingEndedAt = testing[testing.length - 1]?.outcomeObservedAt;
    if (
      validationStartedAt === undefined ||
      testingStartedAt === undefined ||
      testingEndedAt === undefined
    ) {
      continue;
    }

    const training = trainingCandidates.filter(
      (observation) =>
        observation.outcomeObservedAt <=
          validationStartedAt - input.policy.purgeMs &&
        observation.generatedAt <
          validationStartedAt - input.policy.embargoMs,
    );
    const validation = validationCandidates.filter(
      (observation) =>
        observation.outcomeObservedAt <=
          testingStartedAt - input.policy.purgeMs &&
        observation.generatedAt < testingStartedAt - input.policy.embargoMs,
    );
    const trainingMean = meanNetReturn(
      training,
      input.policy.roundTripCostPercent,
    );
    const validationMean = meanNetReturn(
      validation,
      input.policy.roundTripCostPercent,
    );
    const testingMean = meanNetReturn(
      testing,
      input.policy.roundTripCostPercent,
    );

    folds.push(
      Object.freeze({
        fold: folds.length + 1,
        trainingStartedAt: training[0]?.generatedAt ?? 0,
        validationStartedAt,
        testingStartedAt,
        testingEndedAt,
        trainingObservations: training.length,
        validationObservations: validation.length,
        testingObservations: testing.length,
        purgedTrainingObservations:
          trainingCandidates.length - training.length,
        purgedValidationObservations:
          validationCandidates.length - validation.length,
        trainingMeanNetReturnPercent: trainingMean,
        validationMeanNetReturnPercent: validationMean,
        testingMeanNetReturnPercent: testingMean,
        validationPositive: validation.length > 0 && validationMean > 0,
        testingPositive: testing.length > 0 && testingMean > 0,
      }),
    );
  }

  if (ordered.length >= required && folds.length === 0) {
    throw new Error('Unable to construct a non-empty walk-forward fold');
  }
  const validationValues = folds
    .filter((fold) => fold.validationObservations > 0)
    .map((fold) => fold.validationMeanNetReturnPercent);
  const testingValues = folds
    .filter((fold) => fold.testingObservations > 0)
    .map((fold) => fold.testingMeanNetReturnPercent);

  return Object.freeze({
    policy: Object.freeze({ ...input.policy }),
    folds: Object.freeze(folds),
    totalTestingObservations: folds.reduce(
      (sum, fold) => sum + fold.testingObservations,
      0,
    ),
    meanValidationNetReturnPercent: average(validationValues),
    meanTestingNetReturnPercent: average(testingValues),
    allValidationFoldsPositive:
      folds.length > 0 && folds.every((fold) => fold.validationPositive),
    allTestingFoldsPositive:
      folds.length > 0 && folds.every((fold) => fold.testingPositive),
    chronological: true,
    frozenWindows: true,
    lookAheadAllowed: false,
    parameterTuningAllowed: false,
    liveOrderExecutionAllowed: false,
  });
};
