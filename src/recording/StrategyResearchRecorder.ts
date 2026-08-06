import {
  closeSync,
  fsyncSync,
  mkdirSync,
  openSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';

import {
  type StrategyOutcomeObservation,
  type WhaleDecisionGroup,
} from '../research/strategyResearchTypes';
import type { CandidatePipelineResult } from '../selection/CandidatePipeline';
import type { PaperTradeCandidate } from '../selection/TradeQualificationEngine';
import type { StrategyEvaluationContext } from '../strategies/Strategy';
import type { StrategyCandidate } from '../strategies/StrategyCandidate';

export const STRATEGY_CANDIDATE_RECORD_SCHEMA_VERSION = 1 as const;
export const STRATEGY_QUALIFICATION_RECORD_SCHEMA_VERSION = 1 as const;
export const WHALE_INCREMENTAL_OUTCOME_SCHEMA_VERSION = 1 as const;

export interface StrategyCandidateRecord {
  readonly schemaVersion: typeof STRATEGY_CANDIDATE_RECORD_SCHEMA_VERSION;
  readonly recordedAt: number;
  readonly sourceSessionId: string;
  readonly strategyContext: StrategyEvaluationContext;
  readonly candidate: StrategyCandidate;
  readonly duplicate: boolean;
  readonly paperOnly: true;
  readonly liveOrderExecutionAllowed: false;
}

export interface StrategyQualificationRecord {
  readonly schemaVersion: typeof STRATEGY_QUALIFICATION_RECORD_SCHEMA_VERSION;
  readonly recordedAt: number;
  readonly sourceSessionId: string;
  readonly qualification: PaperTradeCandidate;
  readonly paperOnly: true;
  readonly liveOrderExecutionAllowed: false;
  readonly orderExecutionAuthorized: false;
}

export interface WhaleIncrementalOutcomeRecord {
  readonly schemaVersion: typeof WHALE_INCREMENTAL_OUTCOME_SCHEMA_VERSION;
  readonly recordedAt: number;
  readonly sourceSessionId: string;
  readonly observationId: string;
  readonly observedAt: number;
  readonly whaleGroup: WhaleDecisionGroup;
  readonly grossReturnPercent: number;
  readonly baseQualified: boolean;
  readonly finalQualified: boolean;
  readonly paperOnly: true;
  readonly liveOrderExecutionAllowed: false;
  readonly orderExecutionAuthorized: false;
}

export interface StrategyResearchRecorderOptions {
  readonly enabled?: boolean;
  readonly outputDirectory?: string;
  readonly flushAfterEachRecord?: boolean;
  readonly clock?: () => number;
  readonly warn?: (message: string) => void;
}

class AppendOnlyJsonlWriter {
  private readonly fileDescriptor: number;
  private closed = false;

  public constructor(public readonly filePath: string) {
    mkdirSync(path.dirname(filePath), { recursive: true });
    this.fileDescriptor = openSync(filePath, 'a');
  }

  public append(record: unknown, flush: boolean): void {
    if (this.closed) throw new Error(`Writer for ${this.filePath} is closed`);
    writeFileSync(this.fileDescriptor, `${JSON.stringify(record)}\n`, 'utf8');
    if (flush) fsyncSync(this.fileDescriptor);
  }

  public close(): void {
    if (this.closed) return;
    let failure: unknown;
    try {
      fsyncSync(this.fileDescriptor);
    } catch (error: unknown) {
      failure = error;
    }
    try {
      closeSync(this.fileDescriptor);
    } catch (error: unknown) {
      failure ??= error;
    } finally {
      this.closed = true;
    }
    if (failure) throw failure;
  }
}

const requireSafeDirectory = (directory: string): string => {
  const normalized = directory.trim();
  if (
    normalized.length === 0 ||
    path.isAbsolute(normalized) ||
    normalized.split(/[\\/]/u).includes('..')
  ) {
    throw new Error('outputDirectory must be a safe project-relative path');
  }
  return normalized;
};

export class StrategyResearchRecorder {
  public readonly candidateFilePath: string;
  public readonly qualificationFilePath: string;
  public readonly strategyOutcomeFilePath: string;
  public readonly whaleIncrementalFilePath: string;

  private readonly enabled: boolean;
  private readonly flushAfterEachRecord: boolean;
  private readonly clock: () => number;
  private readonly warn: (message: string) => void;
  private candidateWriter?: AppendOnlyJsonlWriter;
  private qualificationWriter?: AppendOnlyJsonlWriter;
  private outcomeWriter?: AppendOnlyJsonlWriter;
  private whaleWriter?: AppendOnlyJsonlWriter;
  private closed = false;
  private failureWarned = false;

  public constructor(options: StrategyResearchRecorderOptions = {}) {
    this.enabled = options.enabled ?? true;
    const directory = requireSafeDirectory(
      options.outputDirectory ?? path.join('data', 'strategy-research'),
    );
    this.candidateFilePath = path.join(
      directory,
      'strategy-candidates.ndjson',
    );
    this.qualificationFilePath = path.join(
      directory,
      'strategy-qualifications.ndjson',
    );
    this.strategyOutcomeFilePath = path.join(
      directory,
      'strategy-outcomes.ndjson',
    );
    this.whaleIncrementalFilePath = path.join(
      directory,
      'whale-incremental-observations.ndjson',
    );
    this.flushAfterEachRecord = options.flushAfterEachRecord ?? true;
    this.clock = options.clock ?? Date.now;
    this.warn = options.warn ?? console.warn;
  }

  public recordEvaluation(input: {
    readonly sourceSessionId: string;
    readonly strategyContext: StrategyEvaluationContext;
    readonly result: CandidatePipelineResult;
  }): void {
    if (!this.enabled || this.closed) return;
    this.requireSourceSessionId(input.sourceSessionId);
    const recordedAt = this.recordingTime();
    const duplicateIds = new Set(input.result.duplicateCandidateIds);
    try {
      for (const candidate of input.result.generated) {
        const record: StrategyCandidateRecord = Object.freeze({
          schemaVersion: STRATEGY_CANDIDATE_RECORD_SCHEMA_VERSION,
          recordedAt,
          sourceSessionId: input.sourceSessionId,
          strategyContext: input.strategyContext,
          candidate,
          duplicate: duplicateIds.has(candidate.candidateId),
          paperOnly: true,
          liveOrderExecutionAllowed: false,
        });
        this.candidateWriter ??= new AppendOnlyJsonlWriter(
          this.candidateFilePath,
        );
        this.candidateWriter.append(record, this.flushAfterEachRecord);
      }

      for (const qualification of [
        ...input.result.qualified,
        ...input.result.rejected,
      ]) {
        const record: StrategyQualificationRecord = Object.freeze({
          schemaVersion: STRATEGY_QUALIFICATION_RECORD_SCHEMA_VERSION,
          recordedAt,
          sourceSessionId: input.sourceSessionId,
          qualification,
          paperOnly: true,
          liveOrderExecutionAllowed: false,
          orderExecutionAuthorized: false,
        });
        this.qualificationWriter ??= new AppendOnlyJsonlWriter(
          this.qualificationFilePath,
        );
        this.qualificationWriter.append(record, this.flushAfterEachRecord);
      }
      this.failureWarned = false;
    } catch (error: unknown) {
      this.reportFailure(error);
    }
  }

  public recordOutcome(input: {
    readonly sourceSessionId: string;
    readonly observation: StrategyOutcomeObservation;
  }): void {
    if (!this.enabled || this.closed) return;
    this.requireSourceSessionId(input.sourceSessionId);
    const recordedAt = this.recordingTime();
    const whaleRecord: WhaleIncrementalOutcomeRecord = Object.freeze({
      schemaVersion: WHALE_INCREMENTAL_OUTCOME_SCHEMA_VERSION,
      recordedAt,
      sourceSessionId: input.sourceSessionId,
      observationId: input.observation.candidateId,
      observedAt: input.observation.generatedAt,
      whaleGroup: input.observation.whaleGroup,
      grossReturnPercent: input.observation.grossReturnPercent,
      baseQualified: input.observation.baseQualified,
      finalQualified: input.observation.finalQualified,
      paperOnly: true,
      liveOrderExecutionAllowed: false,
      orderExecutionAuthorized: false,
    });

    try {
      this.outcomeWriter ??= new AppendOnlyJsonlWriter(
        this.strategyOutcomeFilePath,
      );
      this.whaleWriter ??= new AppendOnlyJsonlWriter(
        this.whaleIncrementalFilePath,
      );
      this.outcomeWriter.append(
        input.observation,
        this.flushAfterEachRecord,
      );
      this.whaleWriter.append(whaleRecord, this.flushAfterEachRecord);
      this.failureWarned = false;
    } catch (error: unknown) {
      this.reportFailure(error);
    }
  }

  public close(): void {
    if (this.closed) return;
    let failure: unknown;
    for (const writer of [
      this.candidateWriter,
      this.qualificationWriter,
      this.outcomeWriter,
      this.whaleWriter,
    ]) {
      try {
        writer?.close();
      } catch (error: unknown) {
        failure ??= error;
      }
    }
    this.closed = true;
    if (failure) throw failure;
  }

  private requireSourceSessionId(sourceSessionId: string): void {
    if (sourceSessionId.trim().length === 0) {
      throw new Error('sourceSessionId must not be empty');
    }
  }

  private recordingTime(): number {
    const recordedAt = this.clock();
    if (!Number.isSafeInteger(recordedAt) || recordedAt < 0) {
      throw new Error('recording clock returned an invalid timestamp');
    }
    return recordedAt;
  }

  private reportFailure(error: unknown): void {
    if (this.failureWarned) return;
    const message = error instanceof Error ? error.message : String(error);
    this.warn(`Unable to record strategy research data: ${message}`);
    this.failureWarned = true;
  }
}
