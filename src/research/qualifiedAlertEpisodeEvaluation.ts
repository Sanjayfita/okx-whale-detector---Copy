import {
  evaluateClusterBootstrap,
  type ClusterBootstrapEvaluation,
} from './clusterBootstrapEvaluation';
import {
  ALERT_OUTCOME_HORIZONS_MINUTES,
  type AlertOutcomeHorizonMinutes,
} from './alertOutcomeObservation';
import type { QualifiedAlertOutcomeBundle } from './qualifiedAlertOutcomeBundle';

const DEFAULT_EPISODE_WINDOW_MS =
  Math.max(...ALERT_OUTCOME_HORIZONS_MINUTES) * 60_000;

export const evaluateQualifiedAlertEpisodes = (input: {
  bundles: readonly QualifiedAlertOutcomeBundle[];
  horizonMinutes: AlertOutcomeHorizonMinutes;
  roundTripCostPercent: number;
  episodeWindowMs?: number;
  bootstrapIterations?: number;
  confidenceLevel?: number;
  seed?: number;
}): ClusterBootstrapEvaluation => {
  if (input.bundles.length === 0) {
    throw new Error('At least one qualified alert outcome bundle is required');
  }
  if (!ALERT_OUTCOME_HORIZONS_MINUTES.includes(input.horizonMinutes)) {
    throw new Error('horizonMinutes must be one of 1, 5, 15, 30, or 60');
  }

  const evaluationId = input.bundles[0]!.evidence.evaluationId;
  const observations = input.bundles.map((bundle, index) => {
    if (!bundle.complete) {
      throw new Error(`bundles[${index}] must be complete`);
    }
    if (bundle.evidence.evaluationId !== evaluationId) {
      throw new Error('All bundles must belong to the same evaluation');
    }
    if (
      bundle.evidence.direction !== 'BULLISH' &&
      bundle.evidence.direction !== 'BEARISH'
    ) {
      throw new Error(`bundles[${index}] must contain a directional alert`);
    }

    const outcome = bundle.observations.find(
      (observation) =>
        observation.horizonMinutes === input.horizonMinutes,
    );
    if (outcome === undefined) {
      throw new Error(
        `bundles[${index}] is missing the requested outcome horizon`,
      );
    }

    return {
      alertId: bundle.evidence.alertId,
      instrumentId: bundle.evidence.instrumentId,
      direction: bundle.evidence.direction,
      detectedAt: bundle.evidence.detectedAt,
      directionAdjustedReturnPercent: outcome.directionAdjustedReturnPercent,
    };
  });

  return evaluateClusterBootstrap({
    observations,
    episodeWindowMs: input.episodeWindowMs ?? DEFAULT_EPISODE_WINDOW_MS,
    roundTripCostPercent: input.roundTripCostPercent,
    bootstrapIterations: input.bootstrapIterations,
    confidenceLevel: input.confidenceLevel,
    seed: input.seed,
  });
};
