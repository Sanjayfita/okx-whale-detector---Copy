import { appendFile, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import {
  ALERT_OUTCOME_HORIZONS_MINUTES,
  type AlertOutcomeHorizonMinutes,
  type AlertOutcomeObservation,
} from './alertOutcomeObservation';
import type { QualifiedAlertEvidenceRecord } from './qualifiedAlertEvidence';

export const PENDING_OUTCOME_JOB_SCHEMA_VERSION = 1 as const;

export interface PendingOutcomeJob {
  schemaVersion: typeof PENDING_OUTCOME_JOB_SCHEMA_VERSION;
  evaluationId: string;
  alertId: string;
  instrumentId: string;
  detectedAt: number;
  direction: QualifiedAlertEvidenceRecord['direction'];
  referencePrice: number;
  horizonMinutes: AlertOutcomeHorizonMinutes;
  dueAt: number;
  liveOrderExecutionAllowed: false;
}

interface PersistentOutcomeSchedulerState {
  schemaVersion: 1;
  pending: readonly PendingOutcomeJob[];
  liveOrderExecutionAllowed: false;
}

const emptyState = (): PersistentOutcomeSchedulerState => ({
  schemaVersion: 1,
  pending: [],
  liveOrderExecutionAllowed: false,
});

const jobKey = (job: Pick<PendingOutcomeJob, 'alertId' | 'horizonMinutes'>): string =>
  `${job.alertId}:${job.horizonMinutes}`;

export class PersistentOutcomeScheduler {
  private state: PersistentOutcomeSchedulerState = emptyState();
  private writeChain: Promise<void> = Promise.resolve();

  public constructor(private readonly evaluationDirectory: string) {}

  private get pendingPath(): string {
    return join(this.evaluationDirectory, 'pending-observations.json');
  }

  private get outcomesPath(): string {
    return join(this.evaluationDirectory, 'outcomes.ndjson');
  }

  public async initialize(): Promise<void> {
    try {
      const parsed = JSON.parse(
        await readFile(this.pendingPath, 'utf8'),
      ) as PersistentOutcomeSchedulerState | readonly PendingOutcomeJob[];

      const pending = Array.isArray(parsed) ? parsed : parsed.pending;
      if (!Array.isArray(pending)) {
        throw new Error('pending-observations.json must contain a pending array');
      }

      this.state = {
        schemaVersion: 1,
        pending: Object.freeze(
          pending.map((job) => this.validateJob(job as PendingOutcomeJob)),
        ),
        liveOrderExecutionAllowed: false,
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      await this.persist(emptyState());
    }
  }

  public async scheduleAlert(
    evidence: QualifiedAlertEvidenceRecord,
  ): Promise<readonly PendingOutcomeJob[]> {
    if (evidence.liveOrderExecutionAllowed !== false || !evidence.qualified) {
      throw new Error('Only qualified, execution-disabled alerts may be scheduled');
    }

    const existingKeys = new Set(this.state.pending.map(jobKey));
    const created = ALERT_OUTCOME_HORIZONS_MINUTES.map((horizonMinutes) =>
      Object.freeze({
        schemaVersion: PENDING_OUTCOME_JOB_SCHEMA_VERSION,
        evaluationId: evidence.evaluationId,
        alertId: evidence.alertId,
        instrumentId: evidence.instrumentId,
        detectedAt: evidence.detectedAt,
        direction: evidence.direction,
        referencePrice: evidence.referencePrice,
        horizonMinutes,
        dueAt: evidence.detectedAt + horizonMinutes * 60_000,
        liveOrderExecutionAllowed: false as const,
      }),
    ).filter((job) => !existingKeys.has(jobKey(job)));

    if (created.length === 0) return Object.freeze([]);

    await this.enqueue(async () => {
      const next = [...this.state.pending, ...created].sort(
        (left, right) => left.dueAt - right.dueAt,
      );
      await this.persist({
        schemaVersion: 1,
        pending: next,
        liveOrderExecutionAllowed: false,
      });
    });

    return Object.freeze(created);
  }

  public getDueJobs(now: number): readonly PendingOutcomeJob[] {
    if (!Number.isSafeInteger(now) || now < 0) {
      throw new Error('now must be a non-negative safe integer');
    }
    return Object.freeze(this.state.pending.filter((job) => job.dueAt <= now));
  }

  public getPendingJobs(): readonly PendingOutcomeJob[] {
    return Object.freeze([...this.state.pending]);
  }

  public async completeObservation(
    observation: AlertOutcomeObservation,
  ): Promise<void> {
    if (observation.liveOrderExecutionAllowed !== false || !observation.complete) {
      throw new Error('Only complete, execution-disabled observations may be saved');
    }

    await this.enqueue(async () => {
      const key = jobKey(observation);
      const scheduled = this.state.pending.find((job) => jobKey(job) === key);
      if (scheduled === undefined) {
        throw new Error('No matching pending observation job exists');
      }
      if (
        scheduled.evaluationId !== observation.evaluationId ||
        scheduled.instrumentId !== observation.instrumentId ||
        scheduled.detectedAt !== observation.detectedAt ||
        scheduled.referencePrice !== observation.referencePrice
      ) {
        throw new Error('Observation does not match its scheduled alert evidence');
      }

      await appendFile(this.outcomesPath, `${JSON.stringify(observation)}\n`, 'utf8');
      await this.persist({
        schemaVersion: 1,
        pending: this.state.pending.filter((job) => jobKey(job) !== key),
        liveOrderExecutionAllowed: false,
      });
    });
  }

  private validateJob(job: PendingOutcomeJob): PendingOutcomeJob {
    if (
      job.schemaVersion !== PENDING_OUTCOME_JOB_SCHEMA_VERSION ||
      job.liveOrderExecutionAllowed !== false ||
      !ALERT_OUTCOME_HORIZONS_MINUTES.includes(job.horizonMinutes) ||
      job.dueAt !== job.detectedAt + job.horizonMinutes * 60_000
    ) {
      throw new Error('Invalid pending outcome job');
    }
    return Object.freeze({ ...job });
  }

  private async persist(state: PersistentOutcomeSchedulerState): Promise<void> {
    const normalized: PersistentOutcomeSchedulerState = {
      schemaVersion: 1,
      pending: Object.freeze([...state.pending]),
      liveOrderExecutionAllowed: false,
    };
    const temporaryPath = `${this.pendingPath}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
    await rename(temporaryPath, this.pendingPath);
    this.state = normalized;
  }

  private async enqueue(operation: () => Promise<void>): Promise<void> {
    const next = this.writeChain.then(operation, operation);
    this.writeChain = next.catch(() => undefined);
    await next;
  }
}
