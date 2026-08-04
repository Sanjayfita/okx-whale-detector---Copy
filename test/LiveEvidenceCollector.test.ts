import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { createQualifiedAlertEvidenceRecord } from '../src/research/qualifiedAlertEvidence';
import { LiveEvidenceCollector } from '../src/research/liveEvidenceCollector';
import { PersistentOutcomeScheduler } from '../src/research/persistentOutcomeScheduler';
import { QualifiedAlertRecorder } from '../src/research/qualifiedAlertRecorder';

const createEvaluationDirectory = async (): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), 'live-evidence-'));
  await writeFile(
    join(directory, 'manifest.json'),
    JSON.stringify({
      evaluationId: 'evaluation-1',
      sourceCommit: 'abc123',
      configurationFingerprint: 'fingerprint-1',
      liveOrderExecutionAllowed: false,
    }),
    'utf8',
  );
  await writeFile(join(directory, 'qualified-alerts.ndjson'), '', 'utf8');
  await writeFile(join(directory, 'outcomes.ndjson'), '', 'utf8');
  await writeFile(join(directory, 'pending-observations.json'), '[]', 'utf8');
  return directory;
};

const createEvidence = () =>
  createQualifiedAlertEvidenceRecord({
    evaluationId: 'evaluation-1',
    alertId: 'alert-1',
    instrumentId: 'BTC-USDT',
    detectedAt: 1_000,
    recordedAt: 1_001,
    direction: 'BULLISH',
    signalType: 'ABSORPTION',
    confidence: 80,
    referencePrice: 100,
    bestBid: 99.9,
    bestAsk: 100.1,
    spreadPercent: 0.2,
    sourceCommit: 'abc123',
    configurationFingerprint: 'fingerprint-1',
  });

describe('LiveEvidenceCollector', () => {
  it('records an alert, schedules horizons, and completes due observations', async () => {
    const directory = await createEvaluationDirectory();
    const scheduler = new PersistentOutcomeScheduler(directory);
    const collector = new LiveEvidenceCollector({
      recorder: new QualifiedAlertRecorder({ evaluationDirectory: directory }),
      scheduler,
      readPrice: async (instrumentId, dueAt) => ({
        instrumentId,
        observedAt: dueAt,
        price: 101,
        maximumFavorableExcursionPercent: 1.5,
        maximumAdverseExcursionPercent: 0.4,
        excursionMeasurement: 'OBSERVED_PATH',
      }),
    });

    await collector.initialize();
    await collector.recordQualifiedAlert(createEvidence());

    expect(scheduler.getPendingJobs()).toHaveLength(5);
    expect(await collector.processDueObservations(61_000)).toBe(1);
    expect(scheduler.getPendingJobs()).toHaveLength(4);

    const alerts = await readFile(
      join(directory, 'qualified-alerts.ndjson'),
      'utf8',
    );
    const outcomes = await readFile(join(directory, 'outcomes.ndjson'), 'utf8');
    expect(alerts).toContain('"alertId":"alert-1"');
    expect(outcomes).toContain('"horizonMinutes":1');
    expect(outcomes).toContain('"directionAdjustedReturnPercent":1');
    expect(outcomes).toContain('"excursionMeasurement":"OBSERVED_PATH"');
  });

  it('requires initialization before collecting evidence', async () => {
    const directory = await createEvaluationDirectory();
    const collector = new LiveEvidenceCollector({
      recorder: new QualifiedAlertRecorder({ evaluationDirectory: directory }),
      scheduler: new PersistentOutcomeScheduler(directory),
      readPrice: async () => {
        throw new Error('not used');
      },
    });

    await expect(
      collector.recordQualifiedAlert(createEvidence()),
    ).rejects.toThrow('must be initialized first');
  });

  it('keeps a job pending when its price timestamp is too late', async () => {
    const directory = await createEvaluationDirectory();
    const scheduler = new PersistentOutcomeScheduler(directory);
    const collector = new LiveEvidenceCollector({
      recorder: new QualifiedAlertRecorder({ evaluationDirectory: directory }),
      scheduler,
      maximumObservationDelayMs: 1_000,
      readPrice: async (instrumentId, dueAt) => ({
        instrumentId,
        observedAt: dueAt + 1_001,
        price: 101,
        maximumFavorableExcursionPercent: 1,
        maximumAdverseExcursionPercent: 0,
        excursionMeasurement: 'OBSERVED_PATH',
      }),
    });

    await collector.initialize();
    await collector.recordQualifiedAlert(createEvidence());

    await expect(collector.processDueObservations(62_001)).rejects.toThrow(
      'too late',
    );
    expect(scheduler.getPendingJobs()).toHaveLength(5);
  });
});
