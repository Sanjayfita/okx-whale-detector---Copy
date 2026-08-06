export type WhaleStudyGroup = 'BASE_ONLY' | 'WHALE_SUPPORTS' | 'WHALE_CONTRADICTS';

export interface WhaleIncrementalValueObservation {
  readonly observationId: string;
  readonly group: WhaleStudyGroup;
  readonly netReturnPercent: number;
}

export interface WhaleIncrementalValueGroupSummary {
  readonly group: WhaleStudyGroup;
  readonly observations: number;
  readonly meanNetReturnPercent: number;
  readonly winRatePercent: number;
}

export interface WhaleIncrementalValueReport {
  readonly groups: readonly WhaleIncrementalValueGroupSummary[];
  readonly supportIncrementPercent: number | undefined;
  readonly contradictionIncrementPercent: number | undefined;
  readonly sufficientForInference: boolean;
  readonly minimumObservationsPerGroup: number;
  readonly liveOrderExecutionAllowed: false;
}

const summarize = (
  group: WhaleStudyGroup,
  observations: readonly WhaleIncrementalValueObservation[],
): WhaleIncrementalValueGroupSummary => {
  const matching = observations.filter((observation) => observation.group === group);
  const meanNetReturnPercent =
    matching.length === 0
      ? 0
      : matching.reduce((sum, observation) => sum + observation.netReturnPercent, 0) /
        matching.length;
  const wins = matching.filter((observation) => observation.netReturnPercent > 0).length;
  return Object.freeze({
    group,
    observations: matching.length,
    meanNetReturnPercent,
    winRatePercent: matching.length === 0 ? 0 : (wins / matching.length) * 100,
  });
};

export const analyzeWhaleIncrementalValue = (
  observations: readonly WhaleIncrementalValueObservation[],
  minimumObservationsPerGroup: number = 100,
): WhaleIncrementalValueReport => {
  if (
    !Number.isSafeInteger(minimumObservationsPerGroup) ||
    minimumObservationsPerGroup <= 0
  ) {
    throw new Error('minimumObservationsPerGroup must be a positive safe integer');
  }
  if (
    observations.some(
      (observation) =>
        observation.observationId.trim().length === 0 ||
        !Number.isFinite(observation.netReturnPercent),
    )
  ) {
    throw new Error('Invalid whale incremental-value observation');
  }

  const base = summarize('BASE_ONLY', observations);
  const supports = summarize('WHALE_SUPPORTS', observations);
  const contradicts = summarize('WHALE_CONTRADICTS', observations);
  const sufficientForInference = [base, supports, contradicts].every(
    (summary) => summary.observations >= minimumObservationsPerGroup,
  );

  return Object.freeze({
    groups: Object.freeze([base, supports, contradicts]),
    supportIncrementPercent:
      base.observations > 0 && supports.observations > 0
        ? supports.meanNetReturnPercent - base.meanNetReturnPercent
        : undefined,
    contradictionIncrementPercent:
      base.observations > 0 && contradicts.observations > 0
        ? contradicts.meanNetReturnPercent - base.meanNetReturnPercent
        : undefined,
    sufficientForInference,
    minimumObservationsPerGroup,
    liveOrderExecutionAllowed: false,
  });
};
