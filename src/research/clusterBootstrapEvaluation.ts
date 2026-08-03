import {
  clusterAlertEpisodes,
  type AlertEpisodeObservation,
} from './alertEpisodeClustering';

export interface ClusterReturnObservation extends AlertEpisodeObservation {
  directionAdjustedReturnPercent: number;
}

export type ClusterBootstrapVerdict =
  | 'POSITIVE_EDGE_CANDIDATE'
  | 'NEGATIVE_EDGE'
  | 'INCONCLUSIVE';

export interface AlertEpisodeReturn {
  episodeId: string;
  instrumentId: string;
  direction: ClusterReturnObservation['direction'];
  startedAt: number;
  endedAt: number;
  alertCount: number;
  meanGrossReturnPercent: number;
  meanNetReturnPercent: number;
}

export interface ClusterBootstrapEvaluation {
  observationCount: number;
  episodeCount: number;
  dependencyRatio: number;
  roundTripCostPercent: number;
  meanNetReturnPercent: number;
  confidenceLevel: number;
  lowerBoundPercent: number;
  upperBoundPercent: number;
  bootstrapIterations: number;
  seed: number;
  verdict: ClusterBootstrapVerdict;
  episodeReturns: readonly AlertEpisodeReturn[];
  orderExecutionAuthorized: false;
}

const mean = (values: readonly number[]): number =>
  values.reduce((sum, value) => sum + value, 0) / values.length;

const quantile = (ordered: readonly number[], probability: number): number => {
  const position = probability * (ordered.length - 1);
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);
  const lower = ordered[lowerIndex]!;
  const upper = ordered[upperIndex]!;
  const weight = position - lowerIndex;
  return lower + (upper - lower) * weight;
};

const createRandom = (seed: number): (() => number) => {
  let state = seed >>> 0;

  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
};

export const evaluateClusterBootstrap = (input: {
  observations: readonly ClusterReturnObservation[];
  episodeWindowMs: number;
  roundTripCostPercent: number;
  bootstrapIterations?: number;
  confidenceLevel?: number;
  seed?: number;
}): ClusterBootstrapEvaluation => {
  const bootstrapIterations = input.bootstrapIterations ?? 5_000;
  const confidenceLevel = input.confidenceLevel ?? 0.95;
  const seed = input.seed ?? 1;

  if (input.observations.length === 0) {
    throw new Error('At least one return observation is required');
  }
  if (
    !Number.isFinite(input.roundTripCostPercent) ||
    input.roundTripCostPercent < 0
  ) {
    throw new Error('roundTripCostPercent must be a non-negative finite number');
  }
  if (!Number.isSafeInteger(bootstrapIterations) || bootstrapIterations < 100) {
    throw new Error('bootstrapIterations must be a safe integer of at least 100');
  }
  if (
    !Number.isFinite(confidenceLevel) ||
    confidenceLevel <= 0.5 ||
    confidenceLevel >= 1
  ) {
    throw new Error('confidenceLevel must be greater than 0.5 and less than 1');
  }
  if (!Number.isSafeInteger(seed) || seed < 0) {
    throw new Error('seed must be a non-negative safe integer');
  }

  const returnByAlertId = new Map<string, number>();
  for (const [index, observation] of input.observations.entries()) {
    if (!Number.isFinite(observation.directionAdjustedReturnPercent)) {
      throw new Error(
        `observations[${index}].directionAdjustedReturnPercent must be finite`,
      );
    }
    returnByAlertId.set(
      observation.alertId,
      observation.directionAdjustedReturnPercent,
    );
  }

  const episodes = clusterAlertEpisodes({
    observations: input.observations,
    episodeWindowMs: input.episodeWindowMs,
  });

  if (episodes.length < 2) {
    throw new Error('At least two independent alert episodes are required');
  }

  const episodeReturns = episodes.map((episode): AlertEpisodeReturn => {
    const grossReturns = episode.alertIds.map((alertId) => {
      const value = returnByAlertId.get(alertId);
      if (value === undefined) {
        throw new Error(`Missing return for alert ${alertId}`);
      }
      return value;
    });
    const meanGrossReturnPercent = mean(grossReturns);

    return Object.freeze({
      episodeId: episode.episodeId,
      instrumentId: episode.instrumentId,
      direction: episode.direction,
      startedAt: episode.startedAt,
      endedAt: episode.endedAt,
      alertCount: episode.alertCount,
      meanGrossReturnPercent,
      meanNetReturnPercent:
        meanGrossReturnPercent - input.roundTripCostPercent,
    });
  });
  const episodeNetReturns = episodeReturns.map(
    (episode) => episode.meanNetReturnPercent,
  );
  const meanNetReturnPercent = mean(episodeNetReturns);
  const random = createRandom(seed);
  const bootstrapMeans: number[] = [];

  for (let iteration = 0; iteration < bootstrapIterations; iteration += 1) {
    let total = 0;
    for (let sample = 0; sample < episodeNetReturns.length; sample += 1) {
      const index = Math.floor(random() * episodeNetReturns.length);
      total += episodeNetReturns[index]!;
    }
    bootstrapMeans.push(total / episodeNetReturns.length);
  }

  bootstrapMeans.sort((left, right) => left - right);
  const tailProbability = (1 - confidenceLevel) / 2;
  const lowerBoundPercent = quantile(bootstrapMeans, tailProbability);
  const upperBoundPercent = quantile(bootstrapMeans, 1 - tailProbability);
  const verdict: ClusterBootstrapVerdict =
    lowerBoundPercent > 0
      ? 'POSITIVE_EDGE_CANDIDATE'
      : upperBoundPercent < 0
        ? 'NEGATIVE_EDGE'
        : 'INCONCLUSIVE';

  return Object.freeze({
    observationCount: input.observations.length,
    episodeCount: episodeReturns.length,
    dependencyRatio: input.observations.length / episodeReturns.length,
    roundTripCostPercent: input.roundTripCostPercent,
    meanNetReturnPercent,
    confidenceLevel,
    lowerBoundPercent,
    upperBoundPercent,
    bootstrapIterations,
    seed,
    verdict,
    episodeReturns: Object.freeze(episodeReturns),
    orderExecutionAuthorized: false,
  });
};
