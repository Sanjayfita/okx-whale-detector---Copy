import { createHash } from 'node:crypto';

import { ReplayClock } from '../runtime/Clock';
import type { CandidatePipeline } from '../selection/CandidatePipeline';
import type { PaperTradeCandidate } from '../selection/TradeQualificationEngine';
import {
  STRATEGY_OUTCOME_OBSERVATION_SCHEMA_VERSION,
  type StrategyOutcomeObservation,
  type StrategyReplayDecisionEvent,
  type WhaleDecisionGroup,
} from './strategyResearchTypes';

export interface StrategyReplayReport {
  readonly processedEvents: number;
  readonly generatedCandidates: number;
  readonly acceptedCandidates: number;
  readonly duplicateCandidates: number;
  readonly missingOutcomes: number;
  readonly observations: readonly StrategyOutcomeObservation[];
  readonly deterministicFingerprint: string;
  readonly chronological: true;
  readonly lookAheadAllowed: false;
  readonly paperOnly: true;
  readonly liveOrderExecutionAllowed: false;
  readonly orderExecutionAuthorized: false;
}

const whaleGroup = (
  qualification: PaperTradeCandidate,
): WhaleDecisionGroup => {
  switch (qualification.whaleAssessment.alignment) {
    case 'SUPPORTS':
      return 'WHALE_SUPPORTS';
    case 'CONTRADICTS':
      return 'WHALE_CONTRADICTS';
    case 'NEUTRAL':
      return 'WHALE_NEUTRAL';
  }
};

const directionAdjustedReturnPercent = (
  qualification: PaperTradeCandidate,
  outcomePrice: number,
): number => {
  const referencePrice = qualification.candidate.referencePrice;
  return qualification.candidate.direction === 'BULLISH'
    ? ((outcomePrice - referencePrice) / referencePrice) * 100
    : ((referencePrice - outcomePrice) / referencePrice) * 100;
};

const stableFingerprint = (value: unknown): string =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');

const validateEvent = (event: StrategyReplayDecisionEvent): void => {
  if (
    event.eventId.trim().length === 0 ||
    !Number.isSafeInteger(event.availabilityTimestamp) ||
    event.availabilityTimestamp < 0 ||
    event.strategyContext.observedAt > event.availabilityTimestamp ||
    event.whaleFeatures.some(
      (feature) => feature.observedAt > event.availabilityTimestamp,
    )
  ) {
    throw new Error('Replay event violates event-time availability constraints');
  }
  for (const outcome of event.outcomes) {
    if (
      !Number.isSafeInteger(outcome.horizonMinutes) ||
      outcome.horizonMinutes <= 0 ||
      !Number.isSafeInteger(outcome.observedAt) ||
      outcome.observedAt < event.availabilityTimestamp ||
      !Number.isFinite(outcome.price) ||
      outcome.price <= 0
    ) {
      throw new Error('Replay outcome is invalid or available before its decision');
    }
  }
};

export const runDeterministicStrategyReplay = (input: {
  readonly events: readonly StrategyReplayDecisionEvent[];
  readonly pipeline: CandidatePipeline;
  readonly clock?: ReplayClock;
}): StrategyReplayReport => {
  if (input.events.length === 0) {
    throw new Error('At least one replay event is required');
  }
  const eventIds = new Set<string>();
  for (const event of input.events) {
    validateEvent(event);
    if (eventIds.has(event.eventId)) {
      throw new Error(`Duplicate replay eventId ${event.eventId}`);
    }
    eventIds.add(event.eventId);
  }

  const ordered = [...input.events].sort(
    (left, right) =>
      left.availabilityTimestamp - right.availabilityTimestamp ||
      left.eventId.localeCompare(right.eventId),
  );
  const clock = input.clock ?? new ReplayClock();
  input.pipeline.reset();
  const observations: StrategyOutcomeObservation[] = [];
  let generatedCandidates = 0;
  let acceptedCandidates = 0;
  let duplicateCandidates = 0;
  let missingOutcomes = 0;

  for (const event of ordered) {
    clock.observe(event.availabilityTimestamp);
    const whaleFeaturesByInstrument = new Map(
      event.whaleFeatures.map((feature) => [feature.instrumentId, feature]),
    );
    const result = input.pipeline.evaluate({
      strategyContext: event.strategyContext,
      whaleFeaturesByInstrument,
    });
    generatedCandidates += result.generated.length;
    acceptedCandidates += result.accepted.length;
    duplicateCandidates += result.duplicateCandidateIds.length;

    const qualifications = [...result.qualified, ...result.rejected];
    for (const qualification of qualifications) {
      const outcome = event.outcomes.find(
        (candidate) =>
          candidate.horizonMinutes ===
          qualification.candidate.holdingHorizonMinutes,
      );
      if (outcome === undefined) {
        missingOutcomes += 1;
        continue;
      }
      const minimumOutcomeTimestamp =
        qualification.candidate.generatedAt +
        qualification.candidate.holdingHorizonMinutes * 60_000;
      if (outcome.observedAt < minimumOutcomeTimestamp) {
        throw new Error(
          `Outcome for ${qualification.candidate.candidateId} is available before its holding horizon`,
        );
      }

      observations.push(
        Object.freeze({
          schemaVersion: STRATEGY_OUTCOME_OBSERVATION_SCHEMA_VERSION,
          eventId: event.eventId,
          candidateId: qualification.candidate.candidateId,
          strategyId: qualification.candidate.strategyId,
          instrumentId: qualification.candidate.instrumentId,
          direction: qualification.candidate.direction,
          generatedAt: qualification.candidate.generatedAt,
          outcomeObservedAt: outcome.observedAt,
          horizonMinutes: outcome.horizonMinutes,
          referencePrice: qualification.candidate.referencePrice,
          outcomePrice: outcome.price,
          grossReturnPercent: directionAdjustedReturnPercent(
            qualification,
            outcome.price,
          ),
          whaleGroup: whaleGroup(qualification),
          baseQualified: qualification.baseQualified,
          finalQualified: qualification.qualified,
          spreadPercent: event.strategyContext.spreadPercent,
          depthNotionalQuote: event.strategyContext.depthNotionalQuote,
          realizedVolatilityPercent:
            event.strategyContext.realizedVolatilityPercent,
          paperOnly: true,
          liveOrderExecutionAllowed: false,
          orderExecutionAuthorized: false,
        }),
      );
    }
  }

  const frozenObservations = Object.freeze(
    observations.sort(
      (left, right) =>
        left.generatedAt - right.generatedAt ||
        left.candidateId.localeCompare(right.candidateId),
    ),
  );
  return Object.freeze({
    processedEvents: ordered.length,
    generatedCandidates,
    acceptedCandidates,
    duplicateCandidates,
    missingOutcomes,
    observations: frozenObservations,
    deterministicFingerprint: stableFingerprint({
      processedEvents: ordered.length,
      generatedCandidates,
      acceptedCandidates,
      duplicateCandidates,
      missingOutcomes,
      observations: frozenObservations,
    }),
    chronological: true,
    lookAheadAllowed: false,
    paperOnly: true,
    liveOrderExecutionAllowed: false,
    orderExecutionAuthorized: false,
  });
};
