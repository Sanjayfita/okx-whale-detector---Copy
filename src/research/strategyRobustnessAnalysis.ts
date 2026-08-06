import { blockBootstrapMeanConfidenceInterval } from './statisticalValidation';
import type { StrategyOutcomeObservation } from './strategyResearchTypes';

export interface StrategyCostScenario {
  readonly scenarioId: string;
  readonly feePercent: number;
  readonly slippagePercent: number;
  readonly spreadMultiplier: number;
}

export type LiquidityRegime = 'LOW' | 'MEDIUM' | 'HIGH';
export type VolatilityRegime = 'LOW' | 'MEDIUM' | 'HIGH';
export type SpreadRegime = 'TIGHT' | 'NORMAL' | 'WIDE';

export interface StrategyRobustnessPolicy {
  readonly scenarios: readonly StrategyCostScenario[];
  readonly lowLiquidityMaximumDepthNotionalQuote: number;
  readonly highLiquidityMinimumDepthNotionalQuote: number;
  readonly lowVolatilityMaximumPercent: number;
  readonly highVolatilityMinimumPercent: number;
  readonly tightSpreadMaximumPercent?: number;
  readonly wideSpreadMinimumPercent?: number;
  readonly confidenceLevel: number;
  readonly bootstrapIterations: number;
  readonly bootstrapBlockSize: number;
  readonly randomSeed: number;
}

export interface RobustnessBucketSummary {
  readonly bucket: string;
  readonly observations: number;
  readonly meanNetReturnPercent: number;
  readonly winRatePercent: number;
}

export interface StrategyCostScenarioSummary {
  readonly scenario: StrategyCostScenario;
  readonly observations: number;
  readonly meanNetReturnPercent: number;
  readonly winRatePercent: number;
  readonly confidenceIntervalLower: number;
  readonly confidenceIntervalUpper: number;
  readonly positiveLowerBound: boolean;
  readonly byLiquidityRegime: readonly RobustnessBucketSummary[];
  readonly byVolatilityRegime: readonly RobustnessBucketSummary[];
  readonly bySpreadRegime: readonly RobustnessBucketSummary[];
}

export interface StrategyRobustnessReport {
  readonly policy: StrategyRobustnessPolicy;
  readonly scenarios: readonly StrategyCostScenarioSummary[];
  readonly profitableUnderEveryScenario: boolean;
  readonly liveOrderExecutionAllowed: false;
  readonly orderExecutionAuthorized: false;
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

const spreadThresholds = (
  policy: StrategyRobustnessPolicy,
): Readonly<{ tight: number; wide: number }> =>
  Object.freeze({
    tight: policy.tightSpreadMaximumPercent ?? 0.03,
    wide: policy.wideSpreadMinimumPercent ?? 0.08,
  });

const validatePolicy = (policy: StrategyRobustnessPolicy): void => {
  if (policy.scenarios.length === 0) {
    throw new Error('At least one robustness scenario is required');
  }
  const scenarioIds = new Set<string>();
  for (const scenario of policy.scenarios) {
    if (
      scenario.scenarioId.trim().length === 0 ||
      scenarioIds.has(scenario.scenarioId) ||
      !Number.isFinite(scenario.feePercent) ||
      scenario.feePercent < 0 ||
      !Number.isFinite(scenario.slippagePercent) ||
      scenario.slippagePercent < 0 ||
      !Number.isFinite(scenario.spreadMultiplier) ||
      scenario.spreadMultiplier < 0
    ) {
      throw new Error('Robustness scenarios must be unique and non-negative');
    }
    scenarioIds.add(scenario.scenarioId);
  }
  if (
    !Number.isFinite(policy.lowLiquidityMaximumDepthNotionalQuote) ||
    policy.lowLiquidityMaximumDepthNotionalQuote < 0 ||
    !Number.isFinite(policy.highLiquidityMinimumDepthNotionalQuote) ||
    policy.highLiquidityMinimumDepthNotionalQuote <=
      policy.lowLiquidityMaximumDepthNotionalQuote
  ) {
    throw new Error('Liquidity regime thresholds are invalid');
  }
  if (
    !Number.isFinite(policy.lowVolatilityMaximumPercent) ||
    policy.lowVolatilityMaximumPercent < 0 ||
    !Number.isFinite(policy.highVolatilityMinimumPercent) ||
    policy.highVolatilityMinimumPercent <=
      policy.lowVolatilityMaximumPercent
  ) {
    throw new Error('Volatility regime thresholds are invalid');
  }
  const spread = spreadThresholds(policy);
  if (
    !Number.isFinite(spread.tight) ||
    spread.tight < 0 ||
    !Number.isFinite(spread.wide) ||
    spread.wide <= spread.tight
  ) {
    throw new Error('Spread regime thresholds are invalid');
  }
  if (
    !Number.isFinite(policy.confidenceLevel) ||
    policy.confidenceLevel <= 0 ||
    policy.confidenceLevel >= 1 ||
    !Number.isSafeInteger(policy.bootstrapIterations) ||
    policy.bootstrapIterations <= 0 ||
    !Number.isSafeInteger(policy.bootstrapBlockSize) ||
    policy.bootstrapBlockSize <= 0 ||
    !Number.isSafeInteger(policy.randomSeed) ||
    policy.randomSeed < 0
  ) {
    throw new Error('Bootstrap robustness policy is invalid');
  }
};

const liquidityRegime = (
  observation: StrategyOutcomeObservation,
  policy: StrategyRobustnessPolicy,
): LiquidityRegime =>
  observation.depthNotionalQuote <=
  policy.lowLiquidityMaximumDepthNotionalQuote
    ? 'LOW'
    : observation.depthNotionalQuote >=
        policy.highLiquidityMinimumDepthNotionalQuote
      ? 'HIGH'
      : 'MEDIUM';

const volatilityRegime = (
  observation: StrategyOutcomeObservation,
  policy: StrategyRobustnessPolicy,
): VolatilityRegime =>
  observation.realizedVolatilityPercent <=
  policy.lowVolatilityMaximumPercent
    ? 'LOW'
    : observation.realizedVolatilityPercent >=
        policy.highVolatilityMinimumPercent
      ? 'HIGH'
      : 'MEDIUM';

const spreadRegime = (
  observation: StrategyOutcomeObservation,
  policy: StrategyRobustnessPolicy,
): SpreadRegime => {
  const thresholds = spreadThresholds(policy);
  return observation.spreadPercent <= thresholds.tight
    ? 'TIGHT'
    : observation.spreadPercent >= thresholds.wide
      ? 'WIDE'
      : 'NORMAL';
};

const netReturn = (
  observation: StrategyOutcomeObservation,
  scenario: StrategyCostScenario,
): number =>
  observation.grossReturnPercent -
  scenario.feePercent -
  scenario.slippagePercent -
  observation.spreadPercent * scenario.spreadMultiplier;

const summarizeBucket = (
  bucket: string,
  observations: readonly StrategyOutcomeObservation[],
  scenario: StrategyCostScenario,
): RobustnessBucketSummary => {
  const values = observations.map((observation) =>
    netReturn(observation, scenario),
  );
  return Object.freeze({
    bucket,
    observations: values.length,
    meanNetReturnPercent: average(values),
    winRatePercent:
      values.length === 0
        ? 0
        : (values.filter((value) => value > 0).length / values.length) * 100,
  });
};

export const analyzeStrategyRobustness = (input: {
  readonly observations: readonly StrategyOutcomeObservation[];
  readonly policy: StrategyRobustnessPolicy;
}): StrategyRobustnessReport => {
  validatePolicy(input.policy);
  const observations = input.observations
    .filter((observation) => observation.baseQualified)
    .sort(
      (left, right) =>
        left.generatedAt - right.generatedAt ||
        left.candidateId.localeCompare(right.candidateId),
    );
  const scenarios = input.policy.scenarios.map((scenario, scenarioIndex) => {
    const values = observations.map((observation) =>
      netReturn(observation, scenario),
    );
    const confidenceInterval = blockBootstrapMeanConfidenceInterval(values, {
      confidenceLevel: input.policy.confidenceLevel,
      iterations: input.policy.bootstrapIterations,
      blockSize: input.policy.bootstrapBlockSize,
      random: createRandom(input.policy.randomSeed + scenarioIndex),
    });
    const byLiquidityRegime = (['LOW', 'MEDIUM', 'HIGH'] as const).map(
      (regime) =>
        summarizeBucket(
          regime,
          observations.filter(
            (observation) =>
              liquidityRegime(observation, input.policy) === regime,
          ),
          scenario,
        ),
    );
    const byVolatilityRegime = (['LOW', 'MEDIUM', 'HIGH'] as const).map(
      (regime) =>
        summarizeBucket(
          regime,
          observations.filter(
            (observation) =>
              volatilityRegime(observation, input.policy) === regime,
          ),
          scenario,
        ),
    );
    const bySpreadRegime = (['TIGHT', 'NORMAL', 'WIDE'] as const).map(
      (regime) =>
        summarizeBucket(
          regime,
          observations.filter(
            (observation) => spreadRegime(observation, input.policy) === regime,
          ),
          scenario,
        ),
    );

    return Object.freeze({
      scenario: Object.freeze({ ...scenario }),
      observations: values.length,
      meanNetReturnPercent: average(values),
      winRatePercent:
        values.length === 0
          ? 0
          : (values.filter((value) => value > 0).length / values.length) * 100,
      confidenceIntervalLower: confidenceInterval.lower,
      confidenceIntervalUpper: confidenceInterval.upper,
      positiveLowerBound: confidenceInterval.lower > 0,
      byLiquidityRegime: Object.freeze(byLiquidityRegime),
      byVolatilityRegime: Object.freeze(byVolatilityRegime),
      bySpreadRegime: Object.freeze(bySpreadRegime),
    });
  });

  return Object.freeze({
    policy: Object.freeze({
      ...input.policy,
      scenarios: Object.freeze(
        input.policy.scenarios.map((scenario) => Object.freeze({ ...scenario })),
      ),
    }),
    scenarios: Object.freeze(scenarios),
    profitableUnderEveryScenario:
      scenarios.length > 0 &&
      scenarios.every((scenario) => scenario.positiveLowerBound),
    liveOrderExecutionAllowed: false,
    orderExecutionAuthorized: false,
  });
};
