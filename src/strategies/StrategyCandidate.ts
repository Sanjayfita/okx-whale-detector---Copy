export type StrategyDirection = 'BULLISH' | 'BEARISH';

export type MarketRegime =
  | 'TRENDING'
  | 'RANGING'
  | 'VOLATILE'
  | 'ILLIQUID'
  | 'UNKNOWN';

export interface StrategyCandidate {
  readonly candidateId: string;
  readonly strategyId: string;
  readonly instrumentId: string;
  readonly direction: StrategyDirection;
  readonly generatedAt: number;
  readonly referencePrice: number;
  readonly expectedMovePercent: number;
  readonly holdingHorizonMinutes: number;
  readonly baseConfidence: number;
  readonly regime: MarketRegime;
  readonly rationale: readonly string[];
  readonly liveOrderExecutionAllowed: false;
}

const requireText = (value: string, name: string): string => {
  const normalized = value.trim();
  if (normalized.length === 0) throw new Error(`${name} must not be empty`);
  return normalized;
};

const requirePositive = (value: number, name: string): number => {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive finite number`);
  }
  return value;
};

export const createStrategyCandidate = (
  input: Omit<StrategyCandidate, 'liveOrderExecutionAllowed'>,
): StrategyCandidate => {
  if (!Number.isSafeInteger(input.generatedAt) || input.generatedAt < 0) {
    throw new Error('generatedAt must be a non-negative safe integer');
  }
  if (
    !Number.isFinite(input.baseConfidence) ||
    input.baseConfidence < 0 ||
    input.baseConfidence > 100
  ) {
    throw new Error('baseConfidence must be between 0 and 100');
  }
  if (
    !Number.isSafeInteger(input.holdingHorizonMinutes) ||
    input.holdingHorizonMinutes <= 0
  ) {
    throw new Error('holdingHorizonMinutes must be a positive safe integer');
  }

  return Object.freeze({
    candidateId: requireText(input.candidateId, 'candidateId'),
    strategyId: requireText(input.strategyId, 'strategyId'),
    instrumentId: requireText(input.instrumentId, 'instrumentId'),
    direction: input.direction,
    generatedAt: input.generatedAt,
    referencePrice: requirePositive(input.referencePrice, 'referencePrice'),
    expectedMovePercent: requirePositive(
      input.expectedMovePercent,
      'expectedMovePercent',
    ),
    holdingHorizonMinutes: input.holdingHorizonMinutes,
    baseConfidence: input.baseConfidence,
    regime: input.regime,
    rationale: Object.freeze(
      input.rationale.map((reason) => requireText(reason, 'rationale item')),
    ),
    liveOrderExecutionAllowed: false,
  });
};
