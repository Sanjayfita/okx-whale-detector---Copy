import { createAlertOutcomeObservation } from './alertOutcomeObservation';
import { PersistentOutcomeScheduler } from './persistentOutcomeScheduler';
import { QualifiedAlertRecorder } from './qualifiedAlertRecorder';
import type { QualifiedAlertEvidenceRecord } from './qualifiedAlertEvidence';

export interface LivePriceSnapshot {
  instrumentId: string;
  observedAt: number;
  price: number;
  maximumFavorableExcursionPercent: number;
  maximumAdverseExcursionPercent: number;
}

export interface LiveEvidenceCollectorDependencies {
  recorder: QualifiedAlertRecorder;
  scheduler: PersistentOutcomeScheduler;
  readPrice: (instrumentId: string, dueAt: number) => Promise<LivePriceSnapshot>;
}

export class LiveEvidenceCollector {
  private initialized = false;

  public constructor(private readonly dependencies: LiveEvidenceCollectorDependencies) {}

  public async initialize(): Promise<void> {
    await this.dependencies.recorder.initialize();
    await this.dependencies.scheduler.initialize();
    this.initialized = true;
  }

  public async recordQualifiedAlert(
    evidence: QualifiedAlertEvidenceRecord,
  ): Promise<void> {
    this.requireInitialized();
    await this.dependencies.recorder.record(evidence);
    await this.dependencies.scheduler.scheduleAlert(evidence);
  }

  public async processDueObservations(now: number): Promise<number> {
    this.requireInitialized();
    const dueJobs = this.dependencies.scheduler.getDueJobs(now);
    let completed = 0;

    for (const job of dueJobs) {
      const snapshot = await this.dependencies.readPrice(job.instrumentId, job.dueAt);
      if (snapshot.instrumentId !== job.instrumentId) {
        throw new Error('Price snapshot instrument does not match the pending job');
      }
      if (!Number.isFinite(snapshot.price) || snapshot.price <= 0) {
        throw new Error('Price snapshot must contain a positive finite price');
      }
      if (snapshot.observedAt < job.dueAt) {
        throw new Error('Price snapshot was captured before the pending job was due');
      }

      const rawReturnPercent =
        ((snapshot.price - job.referencePrice) / job.referencePrice) * 100;
      const directionAdjustedReturnPercent =
        job.direction === 'BEARISH' ? -rawReturnPercent : rawReturnPercent;

      const observation = createAlertOutcomeObservation({
        evaluationId: job.evaluationId,
        alertId: job.alertId,
        instrumentId: job.instrumentId,
        detectedAt: job.detectedAt,
        horizonMinutes: job.horizonMinutes,
        observedAt: snapshot.observedAt,
        referencePrice: job.referencePrice,
        observedPrice: snapshot.price,
        rawReturnPercent,
        directionAdjustedReturnPercent,
        maximumFavorableExcursionPercent:
          snapshot.maximumFavorableExcursionPercent,
        maximumAdverseExcursionPercent:
          snapshot.maximumAdverseExcursionPercent,
      });

      await this.dependencies.scheduler.completeObservation(observation);
      completed += 1;
    }

    return completed;
  }

  private requireInitialized(): void {
    if (!this.initialized) {
      throw new Error('LiveEvidenceCollector must be initialized first');
    }
  }
}
