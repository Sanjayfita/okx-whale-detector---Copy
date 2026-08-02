import { CorrelatedAlertEvidenceBridge } from './correlatedAlertEvidenceBridge';
import type { EvidenceCollectBootstrap } from './evidenceCollectBootstrap';
import { EvidenceCollectionRuntime } from './evidenceCollectionRuntime';
import { LiveEvidenceCollector, type LivePriceSnapshot } from './liveEvidenceCollector';
import { PersistentOutcomeScheduler } from './persistentOutcomeScheduler';
import { QualifiedAlertRecorder } from './qualifiedAlertRecorder';

export interface EvidenceCollectRuntimeFactoryOptions {
  bootstrap: EvidenceCollectBootstrap;
  readPrice: (instrumentId: string, dueAt: number) => Promise<LivePriceSnapshot>;
  intervalMs?: number;
  clock?: () => number;
  onError?: (error: unknown) => void;
}

export interface EvidenceCollectRuntimeBundle {
  runtime: EvidenceCollectionRuntime;
  recorder: QualifiedAlertRecorder;
  scheduler: PersistentOutcomeScheduler;
  collector: LiveEvidenceCollector;
  bridge: CorrelatedAlertEvidenceBridge;
  liveOrderExecutionAllowed: false;
}

export const createEvidenceCollectRuntimeBundle = (
  options: EvidenceCollectRuntimeFactoryOptions,
): EvidenceCollectRuntimeBundle => {
  if (options.bootstrap.liveOrderExecutionAllowed !== false) {
    throw new Error('Evidence collection requires live execution to remain disabled');
  }

  const { manifest, evaluationDirectory } = options.bootstrap;
  if (
    manifest.liveOrderExecutionAllowed !== false ||
    manifest.orderExecutionAuthorized !== false ||
    manifest.dryRunOnly !== true ||
    manifest.transportDispatchAllowed !== false ||
    manifest.testnetExecutionAuthorized !== false
  ) {
    throw new Error('Evidence collection manifest safety locks are invalid');
  }

  const recorder = new QualifiedAlertRecorder({ evaluationDirectory });
  const scheduler = new PersistentOutcomeScheduler(evaluationDirectory);
  const collector = new LiveEvidenceCollector({
    recorder,
    scheduler,
    readPrice: options.readPrice,
  });
  const bridge = new CorrelatedAlertEvidenceBridge({
    evaluationId: manifest.evaluationId,
    sourceCommit: manifest.sourceCommit,
    configurationFingerprint: manifest.configurationFingerprint,
  });
  const runtime = new EvidenceCollectionRuntime({
    bridge,
    collector,
    intervalMs: options.intervalMs,
    clock: options.clock,
    onError: options.onError,
  });

  return Object.freeze({
    runtime,
    recorder,
    scheduler,
    collector,
    bridge,
    liveOrderExecutionAllowed: false,
  });
};
