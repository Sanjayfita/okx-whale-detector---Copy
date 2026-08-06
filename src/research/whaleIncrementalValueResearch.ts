import { blockBootstrapMeanConfidenceInterval } from './statisticalValidation';
import type { WhaleDecisionGroup } from './strategyResearchTypes';

export type WhaleStudyGroup = 'BASE_ONLY' | WhaleDecisionGroup;

export interface WhaleIncrementalValueObservation {
  readonly observationId: string;
  readonly observedAt: number;
  readonly whaleGroup: WhaleDecisionGroup;
  readonly netReturnPercent: number;
}

export interface WhaleIncrementalValueGroupSummary {
  readonly group: WhaleStudyGroup;
  readonly observations: number;
  readonly meanNetReturnPercent: number;
  readonly winRatePercent: number;
  readonly confidenceInterval: {
    readonly confidenceLevel: number;
    readonly lower: number;
    readonly upper: number;
  };
  readonly sufficientForInference: boolean;
}

export interface WhaleIncrementalValueReport {
  readonly groups: readonly WhaleIncrementalValueGroupSummary[];
  readonly supportIncrementPercent: number | undefined;
  readonly neutralIncrementPercent: number | undefined;
  readonly contradictionIncrementPercent: number | undefined;
  readonly sufficientForInference: boolean;
  readonly minimumObservationsPerGroup: number;
  readonly liveOrderExecutionAllowed: false;
  readonly orderExecutionAuthorized: false;
}

export interface WhaleIncrementalValueOptions {
  readonly minimumObservationsPerGroup?: number;
  readonly confidenceLevel?: number;
  readonly bootstrapIterations?: number;
  readonly bootstrapBlockSize?: number;
  readonly randomSeed?: number;
}

const average = (values: readonly number[]): number =>
  values.length === 0
    ? 0
    : values.reduce((sum, value) => sum + value, 0) / values.length;

const createRandom = (seed: number): (() => number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
};

const summarize = (
  group: WhaleStudyGroup,
  observations: readonly WhaleIncrementalValueObservation[],
  options: Required<WhaleIncrementalValueOptions>,
  seedOffset: number,
): WhaleIncrementalValueGroupSummary => {
  const matching =
    group === 'BASE_ONLY'
      ? observations
      : observations.filter(
          (observation) => observation.whaleGroup === group,
        );
  const values = matching.map((observation) => observation.netReturnPercent);
  const confidenceInterval = blockBootstrapMeanConfidenceInterval(values, {
    confidenceLevel: options.confidenceLevel,
    iterations: options.bootstrapIterations,
    blockSize: options.bootstrapBlockSize,
    random: createRandom(options.randomSeed + seedOffset),
  });
  const wins = values.filter((value) => value > 0).length;
  return Object.freeze({
    group,
    observations: matching.length,
    meanNetReturnPercent: average(values),
    winRatePercent: values.length === 0 ? 0 : (wins / values.length) * 100,
    confidenceInterval: Object.freeze({
      confidenceLevel: confidenceInterval.confidenceLevel,
      lower: confidenceInterval.lower,
      upper: confidenceInterval.upper,
    }),
    sufficientForInference:
      matching.length >= options.minimumObservationsPerGroup,
  });
};

export const analyzeWhaleIncrementalValue = (
  observations: readonly WhaleIncrementalValueObservation[],
  inputOptions: WhaleIncrementalValueOptions = {},
): WhaleIncrementalValueReport => {
  const options: Required<WhaleIncrementalValueOptions> = {
    minimumObservationsPerGroup:
      inputOptions.minimumObservationsPerGroup ?? 100,
    confidenceLevel: inputOptions.confidenceLevel ?? 0.95,
    bootstrapIterations: inputOptions.bootstrapIterations ?? 2_000,
    bootstrapBlockSize: inputOptions.bootstrapBlockSize ?? 10,
    randomSeed: inputOptions.randomSeed ?? 0x52_32_24,
  };
  if (
    !Number.isSafeInteger(options.minimumObservationsPerGroup) ||
    options.minimumObservationsPerGroup <= 0
  ) {
    throw new Error(
      'minimumObservationsPerGroup must be a positive safe integer',
    );
  }
  if (
    observations.some(
      (observation) =>
        observation.observationId.trim().length === 0 ||
        !Number.isSafeInteger(observation.observedAt) ||
        observation.observedAt < 0 ||
        !Number.isFinite(observation.netReturnPercent),
    )
  ) {
    throw new Error('Invalid whale incremental-value observation');
  }
  if (
    new Set(observations.map((item) => item.observationId)).size !==
    observations.length
  ) {
    throw new Error('observationId values must be unique');
  }

  const ordered = [...observations].sort(
    (left, right) =>
      left.observedAt - right.observedAt ||
      left.observationId.localeCompare(right.observationId),
  );
  const base = summarize('BASE_ONLY', ordered, options, 0);
  const supports = summarize('WHALE_SUPPORTS', ordered, options, 1);
  const neutral = summarize('WHALE_NEUTRAL', ordered, options, 2);
  const contradicts = summarize('WHALE_CONTRADICTS', ordered, options, 3);
  const comparableGroups = [supports, neutral, contradicts].filter(
    (summary) => summary.observations > 0,
  );

  return Object.freeze({
    groups: Object.freeze([base, supports, neutral, contradicts]),
    supportIncrementPercent:
      supports.observations > 0
        ? supports.meanNetReturnPercent - base.meanNetReturnPercent
        : undefined,
    neutralIncrementPercent:
      neutral.observations > 0
        ? neutral.meanNetReturnPercent - base.meanNetReturnPercent
        : undefined,
    contradictionIncrementPercent:
      contradicts.observations > 0
        ? contradicts.meanNetReturnPercent - base.meanNetReturnPercent
        : undefined,
    sufficientForInference:
      base.sufficientForInference &&
      comparableGroups.length === 3 &&
      comparableGroups.every((summary) => summary.sufficientForInference),
    minimumObservationsPerGroup: options.minimumObservationsPerGroup,
    liveOrderExecutionAllowed: false,
    orderExecutionAuthorized: false,
  });
};
