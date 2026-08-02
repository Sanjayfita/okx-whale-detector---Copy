import type { AlertOutcomeObservation } from './alertOutcomeObservation';
import type { QualifiedAlertEvidenceRecord } from './qualifiedAlertEvidence';

export interface ProfitabilityPolicy {
  startingCapital: number;
  positionNotional: number;
  roundTripCostPercent: number;
}

export interface ProfitabilityGroup {
  key: string;
  observations: number;
  wins: number;
  losses: number;
  flat: number;
  winRatePercent: number;
  averageGrossReturnPercent: number;
  medianGrossReturnPercent: number;
  averageNetReturnPercent: number;
  grossExpectancyUsdt: number;
  netExpectancyUsdt: number;
  hypotheticalNetPnlUsdt: number;
  averageMfePercent: number;
  averageMaePercent: number;
}

export interface EvidenceProfitabilityReport {
  generatedAt: number;
  evaluationId: string;
  policy: ProfitabilityPolicy;
  qualifiedAlerts: number;
  completedObservations: number;
  unmatchedObservations: number;
  malformedRecords: number;
  overall: ProfitabilityGroup;
  byHorizon: readonly ProfitabilityGroup[];
  byInstrument: readonly ProfitabilityGroup[];
  byDirection: readonly ProfitabilityGroup[];
  insufficientData: boolean;
  liveOrderExecutionAllowed: false;
  orderExecutionAuthorized: false;
}

interface JoinedObservation {
  alert: QualifiedAlertEvidenceRecord;
  outcome: AlertOutcomeObservation;
}

const round = (value: number): number => Math.round(value * 1_000_000) / 1_000_000;

const average = (values: readonly number[]): number =>
  values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;

const median = (values: readonly number[]): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
    : (sorted[middle] ?? 0);
};

const validatePolicy = (policy: ProfitabilityPolicy): ProfitabilityPolicy => {
  if (!Number.isFinite(policy.startingCapital) || policy.startingCapital <= 0) {
    throw new Error('startingCapital must be a positive finite number');
  }
  if (!Number.isFinite(policy.positionNotional) || policy.positionNotional <= 0) {
    throw new Error('positionNotional must be a positive finite number');
  }
  if (!Number.isFinite(policy.roundTripCostPercent) || policy.roundTripCostPercent < 0) {
    throw new Error('roundTripCostPercent must be a non-negative finite number');
  }
  return Object.freeze({ ...policy });
};

const summarize = (
  key: string,
  observations: readonly JoinedObservation[],
  policy: ProfitabilityPolicy,
): ProfitabilityGroup => {
  const grossReturns = observations.map(
    ({ outcome }) => outcome.directionAdjustedReturnPercent,
  );
  const netReturns = grossReturns.map((value) => value - policy.roundTripCostPercent);
  const wins = netReturns.filter((value) => value > 0).length;
  const losses = netReturns.filter((value) => value < 0).length;
  const flat = netReturns.length - wins - losses;
  const notionalMultiplier = policy.positionNotional / 100;

  return Object.freeze({
    key,
    observations: observations.length,
    wins,
    losses,
    flat,
    winRatePercent: round(observations.length === 0 ? 0 : (wins / observations.length) * 100),
    averageGrossReturnPercent: round(average(grossReturns)),
    medianGrossReturnPercent: round(median(grossReturns)),
    averageNetReturnPercent: round(average(netReturns)),
    grossExpectancyUsdt: round(average(grossReturns) * notionalMultiplier),
    netExpectancyUsdt: round(average(netReturns) * notionalMultiplier),
    hypotheticalNetPnlUsdt: round(
      netReturns.reduce((sum, value) => sum + value * notionalMultiplier, 0),
    ),
    averageMfePercent: round(
      average(observations.map(({ outcome }) => outcome.maximumFavorableExcursionPercent)),
    ),
    averageMaePercent: round(
      average(observations.map(({ outcome }) => outcome.maximumAdverseExcursionPercent)),
    ),
  });
};

const groupBy = (
  observations: readonly JoinedObservation[],
  keyOf: (item: JoinedObservation) => string,
  policy: ProfitabilityPolicy,
): readonly ProfitabilityGroup[] => {
  const groups = new Map<string, JoinedObservation[]>();
  for (const item of observations) {
    const key = keyOf(item);
    const group = groups.get(key) ?? [];
    group.push(item);
    groups.set(key, group);
  }
  return Object.freeze(
    [...groups.entries()]
      .sort(([left], [right]) => left.localeCompare(right, undefined, { numeric: true }))
      .map(([key, values]) => summarize(key, values, policy)),
  );
};

export const createEvidenceProfitabilityReport = (input: {
  generatedAt: number;
  evaluationId: string;
  alerts: readonly QualifiedAlertEvidenceRecord[];
  outcomes: readonly AlertOutcomeObservation[];
  malformedRecords?: number;
  policy?: Partial<ProfitabilityPolicy>;
}): EvidenceProfitabilityReport => {
  const policy = validatePolicy({
    startingCapital: input.policy?.startingCapital ?? 10_000,
    positionNotional: input.policy?.positionNotional ?? 100,
    roundTripCostPercent: input.policy?.roundTripCostPercent ?? 0.2,
  });
  const alertById = new Map(input.alerts.map((alert) => [alert.alertId, alert]));
  const joined: JoinedObservation[] = [];
  let unmatchedObservations = 0;

  for (const outcome of input.outcomes) {
    const alert = alertById.get(outcome.alertId);
    if (alert === undefined) {
      unmatchedObservations += 1;
      continue;
    }
    joined.push({ alert, outcome });
  }

  return Object.freeze({
    generatedAt: input.generatedAt,
    evaluationId: input.evaluationId,
    policy,
    qualifiedAlerts: input.alerts.length,
    completedObservations: input.outcomes.length,
    unmatchedObservations,
    malformedRecords: input.malformedRecords ?? 0,
    overall: summarize('ALL', joined, policy),
    byHorizon: groupBy(joined, ({ outcome }) => `${outcome.horizonMinutes}m`, policy),
    byInstrument: groupBy(joined, ({ alert }) => alert.instrumentId, policy),
    byDirection: groupBy(joined, ({ alert }) => alert.direction, policy),
    insufficientData: joined.length < 100,
    liveOrderExecutionAllowed: false,
    orderExecutionAuthorized: false,
  });
};
