export type AlertEpisodeDirection = 'BULLISH' | 'BEARISH';

export interface AlertEpisodeObservation {
  alertId: string;
  instrumentId: string;
  direction: AlertEpisodeDirection;
  detectedAt: number;
}

export interface AlertEpisode {
  episodeId: string;
  instrumentId: string;
  direction: AlertEpisodeDirection;
  startedAt: number;
  endedAt: number;
  alertIds: readonly string[];
  alertCount: number;
}

const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/;

const validateObservation = (
  observation: AlertEpisodeObservation,
  index: number,
): void => {
  if (!IDENTIFIER_PATTERN.test(observation.alertId)) {
    throw new Error(`observations[${index}].alertId is invalid`);
  }
  if (!IDENTIFIER_PATTERN.test(observation.instrumentId)) {
    throw new Error(`observations[${index}].instrumentId is invalid`);
  }
  if (
    observation.direction !== 'BULLISH' &&
    observation.direction !== 'BEARISH'
  ) {
    throw new Error(`observations[${index}].direction must be directional`);
  }
  if (!Number.isSafeInteger(observation.detectedAt) || observation.detectedAt < 0) {
    throw new Error(
      `observations[${index}].detectedAt must be a non-negative safe integer`,
    );
  }
};

interface MutableAlertEpisode {
  episodeId: string;
  instrumentId: string;
  direction: AlertEpisodeDirection;
  startedAt: number;
  endedAt: number;
  alertIds: string[];
}

const episodeKey = (
  observation: Pick<AlertEpisodeObservation, 'instrumentId' | 'direction'>,
): string => `${observation.instrumentId}\u001f${observation.direction}`;

export const clusterAlertEpisodes = (input: {
  observations: readonly AlertEpisodeObservation[];
  episodeWindowMs: number;
}): readonly AlertEpisode[] => {
  if (!Number.isSafeInteger(input.episodeWindowMs) || input.episodeWindowMs <= 0) {
    throw new Error('episodeWindowMs must be a positive safe integer');
  }

  const seenAlertIds = new Set<string>();
  const ordered = input.observations
    .map((observation, index) => {
      validateObservation(observation, index);
      if (seenAlertIds.has(observation.alertId)) {
        throw new Error(`Duplicate alertId: ${observation.alertId}`);
      }
      seenAlertIds.add(observation.alertId);
      return observation;
    })
    .sort(
      (left, right) =>
        left.detectedAt - right.detectedAt ||
        left.instrumentId.localeCompare(right.instrumentId) ||
        left.direction.localeCompare(right.direction) ||
        left.alertId.localeCompare(right.alertId),
    );

  const episodes: MutableAlertEpisode[] = [];
  const activeByKey = new Map<string, MutableAlertEpisode>();

  for (const observation of ordered) {
    const key = episodeKey(observation);
    const active = activeByKey.get(key);
    const observationEnd = observation.detectedAt + input.episodeWindowMs;

    if (active && observation.detectedAt <= active.endedAt) {
      active.alertIds.push(observation.alertId);
      active.endedAt = Math.max(active.endedAt, observationEnd);
      continue;
    }

    const episode: MutableAlertEpisode = {
      episodeId: `alert-episode:${episodes.length + 1}`,
      instrumentId: observation.instrumentId,
      direction: observation.direction,
      startedAt: observation.detectedAt,
      endedAt: observationEnd,
      alertIds: [observation.alertId],
    };
    episodes.push(episode);
    activeByKey.set(key, episode);
  }

  return Object.freeze(
    episodes.map((episode) =>
      Object.freeze({
        episodeId: episode.episodeId,
        instrumentId: episode.instrumentId,
        direction: episode.direction,
        startedAt: episode.startedAt,
        endedAt: episode.endedAt,
        alertIds: Object.freeze([...episode.alertIds]),
        alertCount: episode.alertIds.length,
      }),
    ),
  );
};
