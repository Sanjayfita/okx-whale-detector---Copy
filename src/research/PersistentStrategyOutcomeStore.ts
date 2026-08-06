import {
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';

import type { PaperTradeCandidate } from '../selection/TradeQualificationEngine';
import type { StrategyEvaluationContext } from '../strategies/Strategy';

export const PENDING_STRATEGY_OUTCOME_SCHEMA_VERSION = 1 as const;

export interface PendingStrategyOutcomeRecord {
  readonly schemaVersion: typeof PENDING_STRATEGY_OUTCOME_SCHEMA_VERSION;
  readonly qualification: PaperTradeCandidate;
  readonly strategyContext: StrategyEvaluationContext;
  readonly dueAt: number;
  readonly paperOnly: true;
  readonly liveOrderExecutionAllowed: false;
  readonly orderExecutionAuthorized: false;
  readonly transportDispatchAllowed: false;
  readonly testnetExecutionAuthorized: false;
}

interface PendingStrategyOutcomeState {
  readonly schemaVersion: typeof PENDING_STRATEGY_OUTCOME_SCHEMA_VERSION;
  readonly pending: readonly PendingStrategyOutcomeRecord[];
  readonly paperOnly: true;
  readonly liveOrderExecutionAllowed: false;
  readonly orderExecutionAuthorized: false;
  readonly transportDispatchAllowed: false;
  readonly testnetExecutionAuthorized: false;
}

const emptyState = (): PendingStrategyOutcomeState =>
  Object.freeze({
    schemaVersion: PENDING_STRATEGY_OUTCOME_SCHEMA_VERSION,
    pending: Object.freeze([]),
    paperOnly: true,
    liveOrderExecutionAllowed: false,
    orderExecutionAuthorized: false,
    transportDispatchAllowed: false,
    testnetExecutionAuthorized: false,
  });

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const parsePendingRecord = (
  value: unknown,
): PendingStrategyOutcomeRecord | undefined => {
  if (!isRecord(value) || !isRecord(value.qualification)) return undefined;
  const qualification = value.qualification as unknown as PaperTradeCandidate;
  const strategyContext = value.strategyContext as
    | StrategyEvaluationContext
    | undefined;
  const candidate = qualification.candidate;
  const dueAt = value.dueAt;
  if (
    value.schemaVersion !== PENDING_STRATEGY_OUTCOME_SCHEMA_VERSION ||
    value.paperOnly !== true ||
    value.liveOrderExecutionAllowed !== false ||
    value.orderExecutionAuthorized !== false ||
    value.transportDispatchAllowed !== false ||
    value.testnetExecutionAuthorized !== false ||
    candidate === undefined ||
    typeof candidate.candidateId !== 'string' ||
    candidate.candidateId.trim().length === 0 ||
    typeof candidate.instrumentId !== 'string' ||
    candidate.instrumentId.trim().length === 0 ||
    candidate.liveOrderExecutionAllowed !== false ||
    qualification.paperOnly !== true ||
    qualification.liveOrderExecutionAllowed !== false ||
    qualification.orderExecutionAuthorized !== false ||
    qualification.transportDispatchAllowed !== false ||
    qualification.testnetExecutionAuthorized !== false ||
    strategyContext === undefined ||
    strategyContext.instrumentId !== candidate.instrumentId ||
    strategyContext.observedAt !== candidate.generatedAt ||
    typeof dueAt !== 'number' ||
    !Number.isSafeInteger(dueAt) ||
    dueAt !== candidate.generatedAt + candidate.holdingHorizonMinutes * 60_000
  ) {
    return undefined;
  }

  return Object.freeze({
    schemaVersion: PENDING_STRATEGY_OUTCOME_SCHEMA_VERSION,
    qualification,
    strategyContext: Object.freeze({ ...strategyContext }),
    dueAt,
    paperOnly: true,
    liveOrderExecutionAllowed: false,
    orderExecutionAuthorized: false,
    transportDispatchAllowed: false,
    testnetExecutionAuthorized: false,
  });
};

const parseState = (value: unknown): PendingStrategyOutcomeState | undefined => {
  if (
    !isRecord(value) ||
    value.schemaVersion !== PENDING_STRATEGY_OUTCOME_SCHEMA_VERSION ||
    value.paperOnly !== true ||
    value.liveOrderExecutionAllowed !== false ||
    value.orderExecutionAuthorized !== false ||
    value.transportDispatchAllowed !== false ||
    value.testnetExecutionAuthorized !== false ||
    !Array.isArray(value.pending)
  ) {
    return undefined;
  }
  const pending = value.pending.map(parsePendingRecord);
  if (pending.some((record) => record === undefined)) return undefined;
  const records = pending.filter(
    (record): record is PendingStrategyOutcomeRecord => record !== undefined,
  );
  const ids = records.map(
    (record) => record.qualification.candidate.candidateId,
  );
  if (new Set(ids).size !== ids.length) return undefined;
  return Object.freeze({
    schemaVersion: PENDING_STRATEGY_OUTCOME_SCHEMA_VERSION,
    pending: Object.freeze(
      records.sort(
        (left, right) =>
          left.dueAt - right.dueAt ||
          left.qualification.candidate.candidateId.localeCompare(
            right.qualification.candidate.candidateId,
          ),
      ),
    ),
    paperOnly: true,
    liveOrderExecutionAllowed: false,
    orderExecutionAuthorized: false,
    transportDispatchAllowed: false,
    testnetExecutionAuthorized: false,
  });
};

export class PersistentStrategyOutcomeStore {
  private state: PendingStrategyOutcomeState;

  public constructor(
    public readonly filePath: string,
    private readonly enabled: boolean = true,
  ) {
    if (filePath.trim().length === 0) {
      throw new Error('Pending strategy outcome path must not be empty');
    }
    this.state = this.enabled ? this.load() : emptyState();
  }

  public getAll(): readonly PendingStrategyOutcomeRecord[] {
    return Object.freeze([...this.state.pending]);
  }

  public replace(records: readonly PendingStrategyOutcomeRecord[]): void {
    if (!this.enabled) return;
    const parsed = parseState({
      schemaVersion: PENDING_STRATEGY_OUTCOME_SCHEMA_VERSION,
      pending: records,
      paperOnly: true,
      liveOrderExecutionAllowed: false,
      orderExecutionAuthorized: false,
      transportDispatchAllowed: false,
      testnetExecutionAuthorized: false,
    });
    if (parsed === undefined) {
      throw new Error('Pending strategy outcome records are invalid');
    }
    this.persist(parsed);
  }

  public clear(): void {
    this.replace([]);
  }

  private load(): PendingStrategyOutcomeState {
    try {
      const parsed = parseState(
        JSON.parse(readFileSync(this.filePath, 'utf8')) as unknown,
      );
      if (parsed === undefined) {
        throw new Error('Pending strategy outcome state is invalid');
      }
      return parsed;
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      const state = emptyState();
      this.persist(state);
      return state;
    }
  }

  private persist(state: PendingStrategyOutcomeState): void {
    mkdirSync(path.dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.${process.pid}.tmp`;
    writeFileSync(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, {
      encoding: 'utf8',
      flush: true,
    });
    renameSync(temporaryPath, this.filePath);
    this.state = state;
  }
}
