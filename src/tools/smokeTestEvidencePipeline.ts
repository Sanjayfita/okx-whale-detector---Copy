import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { CorrelatedAlertEvidenceBridge } from '../research/correlatedAlertEvidenceBridge';
import { inspectEvidenceProgress } from '../research/evidenceProgressInspector';
import { LiveEvidenceCollector } from '../research/liveEvidenceCollector';
import { PersistentOutcomeScheduler } from '../research/persistentOutcomeScheduler';
import { QualifiedAlertRecorder } from '../research/qualifiedAlertRecorder';
import type { CorrelatedAlert } from '../types/correlatedAlert';
import type { CorrelatedAlertEvaluationContext } from '../types/correlatedAlertEvaluation';

export interface EvidencePipelineSmokeResult {
  qualifiedAlertCount: number;
  completedObservationCount: number;
  completeBundleCount: number;
  pendingObservationCount: number;
  malformedRecordCount: number;
  liveOrderExecutionAllowed: false;
}

export const runEvidencePipelineSmokeTest = async (): Promise<EvidencePipelineSmokeResult> => {
  const directory = await mkdtemp(join(tmpdir(), 'okx-evidence-smoke-'));
  const evaluationId = 'smoke-evaluation';
  const sourceCommit = 'smoke-source-commit';
  const configurationFingerprint = 'smoke-configuration-fingerprint';
  const detectedAt = 1_800_000_000_000;

  try {
    await writeFile(
      join(directory, 'manifest.json'),
      `${JSON.stringify({
        evaluationId,
        sourceCommit,
        configurationFingerprint,
        collectionStartedAt: detectedAt,
        minimumCollectionDays: 30,
        minimumQualifiedAlerts: 1_000,
        liveOrderExecutionAllowed: false,
      })}\n`,
      'utf8',
    );
    await writeFile(join(directory, 'qualified-alerts.ndjson'), '', 'utf8');
    await writeFile(join(directory, 'outcomes.ndjson'), '', 'utf8');
    await writeFile(
      join(directory, 'pending-observations.json'),
      `${JSON.stringify({
        schemaVersion: 1,
        pending: [],
        liveOrderExecutionAllowed: false,
      })}\n`,
      'utf8',
    );

    const recorder = new QualifiedAlertRecorder({ evaluationDirectory: directory });
    const scheduler = new PersistentOutcomeScheduler(directory);
    const collector = new LiveEvidenceCollector({
      recorder,
      scheduler,
      readPrice: async (instrumentId, dueAt) => ({
        instrumentId,
        observedAt: dueAt,
        price: 101,
        maximumFavorableExcursionPercent: 1,
        maximumAdverseExcursionPercent: 0,
      }),
    });
    await collector.initialize();

    const bridge = new CorrelatedAlertEvidenceBridge({
      evaluationId,
      sourceCommit,
      configurationFingerprint,
    });
    const alert: CorrelatedAlert = {
      id: 'smoke-alert-1',
      sourceSessionId: 'smoke-session',
      alertSequence: 1,
      symbol: 'BTC-USDT',
      severity: 'STRONG',
      eventType: 'AGREEMENT',
      bias: 'BULLISH',
      relationship: 'AGREEMENT',
      combinedConfidence: 80,
      alertImportance: 80,
      okxConfidence: 75,
      externalEffectiveConfidence: 70,
      externalSignalsUsed: 1,
      ignoredExternalSignals: 0,
      reason: 'R6 smoke test',
      createdAt: detectedAt,
    };
    const evaluationContext: CorrelatedAlertEvaluationContext = {
      instId: 'BTC-USDT',
      instType: 'SWAP',
      okxBias: 'BULLISH',
      externalBias: 'BULLISH',
      sourceSignalTimestamp: detectedAt,
      sourceMarketTimestamp: detectedAt,
      referenceTimestamp: detectedAt,
      referenceMidpoint: 100,
      referenceBestBid: 99.9,
      referenceBestAsk: 100.1,
      referenceSpread: 0.2,
      referenceSpreadPercent: 0.2,
      sourceSignalIds: ['smoke-signal'],
    };

    await collector.recordQualifiedAlert(
      bridge.createEvidence({
        alert,
        evaluationContext,
        recordedAt: detectedAt,
      }),
    );
    await collector.processDueObservations(detectedAt + 60 * 60_000);

    const progress = await inspectEvidenceProgress(
      directory,
      detectedAt + 60 * 60_000,
    );
    const outcomes = (await readFile(join(directory, 'outcomes.ndjson'), 'utf8'))
      .trim()
      .split(/\r?\n/u)
      .filter((line) => line.length > 0);

    if (
      progress.qualifiedAlertCount !== 1 ||
      outcomes.length !== 5 ||
      progress.completeBundleCount !== 1 ||
      progress.pendingObservationCount !== 0 ||
      progress.malformedRecordCount !== 0
    ) {
      throw new Error('Evidence pipeline smoke test produced unexpected counts');
    }

    return Object.freeze({
      qualifiedAlertCount: progress.qualifiedAlertCount,
      completedObservationCount: progress.completedObservationCount,
      completeBundleCount: progress.completeBundleCount,
      pendingObservationCount: progress.pendingObservationCount,
      malformedRecordCount: progress.malformedRecordCount,
      liveOrderExecutionAllowed: false,
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
};

if (require.main === module) {
  void runEvidencePipelineSmokeTest()
    .then((result) => {
      console.log('EVIDENCE PIPELINE SMOKE TEST PASSED');
      console.log(`Qualified alerts: ${result.qualifiedAlertCount}`);
      console.log(`Completed observations: ${result.completedObservationCount}`);
      console.log(`Complete bundles: ${result.completeBundleCount}`);
      console.log(`Pending observations: ${result.pendingObservationCount}`);
      console.log(`Malformed records: ${result.malformedRecordCount}`);
      console.log('Live order execution remains disabled.');
    })
    .catch((error: unknown) => {
      console.error('Evidence pipeline smoke test failed:', error);
      process.exitCode = 1;
    });
}
