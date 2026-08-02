import type { CorrelatedAlert } from '../types/correlatedAlert';
import type { CorrelatedAlertRecordContext } from '../types/correlatedAlertEvaluation';
import type { CorrelatedAlertEvidenceBridge } from './correlatedAlertEvidenceBridge';
import type { LiveEvidenceCollector } from './liveEvidenceCollector';

export interface EvidenceCollectionRuntimeOptions {
  bridge: CorrelatedAlertEvidenceBridge;
  collector: LiveEvidenceCollector;
  intervalMs?: number;
  clock?: () => number;
  setIntervalFn?: (callback: () => void, intervalMs: number) => NodeJS.Timeout;
  clearIntervalFn?: (timer: NodeJS.Timeout) => void;
  onError?: (error: unknown) => void;
}

export class EvidenceCollectionRuntime {
  private readonly intervalMs: number;
  private readonly clock: () => number;
  private readonly setIntervalFn: (
    callback: () => void,
    intervalMs: number,
  ) => NodeJS.Timeout;
  private readonly clearIntervalFn: (timer: NodeJS.Timeout) => void;
  private readonly onError: (error: unknown) => void;

  private initialized = false;
  private timer?: NodeJS.Timeout;
  private workChain: Promise<void> = Promise.resolve();

  public constructor(private readonly options: EvidenceCollectionRuntimeOptions) {
    this.intervalMs = options.intervalMs ?? 5_000;
    this.clock = options.clock ?? Date.now;
    this.setIntervalFn = options.setIntervalFn ?? setInterval;
    this.clearIntervalFn = options.clearIntervalFn ?? clearInterval;
    this.onError = options.onError ?? console.error;

    if (!Number.isSafeInteger(this.intervalMs) || this.intervalMs <= 0) {
      throw new Error('intervalMs must be a positive safe integer');
    }
  }

  public async start(): Promise<void> {
    if (this.initialized) {
      return;
    }

    await this.options.collector.initialize();
    this.initialized = true;
    this.timer = this.setIntervalFn(() => {
      this.enqueue(async () => {
        await this.options.collector.processDueObservations(this.clock());
      });
    }, this.intervalMs);
  }

  public onPersistedLiveAlert = (
    alert: CorrelatedAlert,
    context: CorrelatedAlertRecordContext,
  ): void => {
    if (!this.initialized) {
      this.onError(
        new Error('EvidenceCollectionRuntime must be started before collecting alerts'),
      );
      return;
    }

    this.enqueue(async () => {
      const evidence = this.options.bridge.createEvidence({
        alert,
        evaluationContext: context.evaluationContext,
        recordedAt: this.clock(),
      });
      await this.options.collector.recordQualifiedAlert(evidence);
    });
  };

  public async processNow(): Promise<number> {
    this.requireStarted();
    let completed = 0;
    this.enqueue(async () => {
      completed = await this.options.collector.processDueObservations(this.clock());
    });
    await this.workChain;
    return completed;
  }

  public async stop(): Promise<void> {
    if (this.timer !== undefined) {
      this.clearIntervalFn(this.timer);
      this.timer = undefined;
    }

    await this.workChain;
    this.initialized = false;
  }

  private enqueue(work: () => Promise<void>): void {
    const next = this.workChain.then(work);
    this.workChain = next.catch((error: unknown) => {
      this.onError(error);
    });
  }

  private requireStarted(): void {
    if (!this.initialized) {
      throw new Error('EvidenceCollectionRuntime must be started first');
    }
  }
}
