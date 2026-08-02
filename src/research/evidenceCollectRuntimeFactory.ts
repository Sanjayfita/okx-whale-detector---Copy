import { CorrelatedAlertEvidenceBridge } from './correlatedAlertEvidenceBridge';
import type { EvidenceCollectBootstrap } from './evidenceCollectBootstrap';
import { EvidenceCollectionRuntime } from './evidenceCollectionRuntime';
import {
  LiveEvidenceCollector,
  type LivePriceSnapshot,
} from './liveEvidenceCollector';
import { PersistentOutcomeScheduler } from './persistentOutcomeScheduler';
import { QualifiedAlertRecorder } from './qualifiedAlertRecorder';

export interface EvidenceCollectRuntimeFactoryOptions {
  bootstrap: EvidenceCollectBootstrap;
  readPrice: (
    instrumentId: string,
    dueAt: number,
  ) => Promise<LivePriceSnapshot>;
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
  const { bootstrap } = options;

  if (
    bootstrap.liveOrderExecutionAllowed !== false ||
    bootstrap.manifest.liveOrderExecutionAllowed !== false ||
    bootstrap.manifest.orderExecutionAuthorized !== false ||
    bootstrap.manifest.dryRunOnly !== true ||
    bootstrap.manifest.transportDispatchAllowed !== false ||
    bootstrap.manifest.testnetExecutionAuthorized !== false
  ) {
    throw new Error('Evidence collection safety locks are invalid');
  }

  const recorder = new QualifiedAlertRecorder({
    evaluationDirectory: bootstrap.evaluationDirectory,
  });
  const scheduler = new PersistentOutcomeScheduler(
    bootstrap.evaluationDirectory,
  );
  const collector = new LiveEvidenceCollector({
    recorder,
    scheduler,
    readPrice: options.readPrice,
  });
  const bridge = new CorrelatedAlertEvidenceBridge({
    evaluationId: bootstrap.manifest.evaluationId,
    sourceCommit: bootstrap.manifest.sourceCommit,
    configurationFingerprint:
      bootstrap.manifest.configurationFingerprint,
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
