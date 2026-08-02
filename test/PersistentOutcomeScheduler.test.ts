import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { createAlertOutcomeObservation } from '../src/research/alertOutcomeObservation';
import { createQualifiedAlertEvidenceRecord } from '../src/research/qualifiedAlertEvidence';
import { PersistentOutcomeScheduler } from '../src/research/persistentOutcomeScheduler';

const makeEvidence = () =>
  createQualifiedAlertEvidenceRecord({
    evaluationId: 'eval-r2',
    alertId: 'alert-1',
    instrumentId: 'BTC-USDT',
    detectedAt: 1_000_000,
    recordedAt: 1_000_100,
    direction: 'BULLISH',
    signalType: 'ABSORPTION',
    confidence: 90,
    referencePrice: 100,
    bestBid: 99.9,
    bestAsk: 100.1,
    spreadPercent: 0.2,
    sourceCommit: 'abc123',
    configurationFingerprint: 'fingerprint',
    qualified: true,
  });

const makeDirectory = async (): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), 'outcome-scheduler-'));
  await writeFile(join(directory, 'pending-observations.json'), '[]\n', 'utf8');
  await writeFile(join(directory, 'outcomes.ndjson'), '', 'utf8');
  return directory;
};

describe('PersistentOutcomeScheduler', () => {
  it('creates exactly five persistent horizon jobs in chronological order', async () => {
    const directory = await makeDirectory();
    const scheduler = new PersistentOutcomeScheduler(directory);
    await scheduler.initialize();

    const created = await scheduler.scheduleAlert(makeEvidence());

    expect(created.map((job) => job.horizonMinutes)).toEqual([1, 5, 15, 30, 60]);
    expect(scheduler.getPendingJobs()).toHaveLength(5);
    expect(scheduler.getPendingJobs()[0]?.dueAt).toBe(1_060_000);

    const persisted = JSON.parse(
      await readFile(join(directory, 'pending-observations.json'), 'utf8'),
    ) as { pending: unknown[] };
    expect(persisted.pending).toHaveLength(5);
  });

  it('is idempotent when the same alert is scheduled twice', async () => {
    const scheduler = new PersistentOutcomeScheduler(await makeDirectory());
    await scheduler.initialize();
    await scheduler.scheduleAlert(makeEvidence());

    const duplicateJobs = await scheduler.scheduleAlert(makeEvidence());

    expect(duplicateJobs).toHaveLength(0);
    expect(scheduler.getPendingJobs()).toHaveLength(5);
  });

  it('recovers pending jobs after a restart and returns only due jobs', async () => {
    const directory = await makeDirectory();
    const first = new PersistentOutcomeScheduler(directory);
    await first.initialize();
    await first.scheduleAlert(makeEvidence());

    const recovered = new PersistentOutcomeScheduler(directory);
    await recovered.initialize();

    expect(recovered.getPendingJobs()).toHaveLength(5);
    expect(recovered.getDueJobs(1_059_999)).toHaveLength(0);
    expect(recovered.getDueJobs(1_060_000).map((job) => job.horizonMinutes)).toEqual([1]);
  });

  it('appends a completed observation and removes its pending job', async () => {
    const directory = await makeDirectory();
    const scheduler = new PersistentOutcomeScheduler(directory);
    await scheduler.initialize();
    await scheduler.scheduleAlert(makeEvidence());

    const observation = createAlertOutcomeObservation({
      evaluationId: 'eval-r2',
      alertId: 'alert-1',
      instrumentId: 'BTC-USDT',
      detectedAt: 1_000_000,
      horizonMinutes: 1,
      observedAt: 1_060_000,
      referencePrice: 100,
      observedPrice: 101,
      rawReturnPercent: 1,
      directionAdjustedReturnPercent: 1,
      maximumFavorableExcursionPercent: 1.2,
      maximumAdverseExcursionPercent: 0.3,
    });

    await scheduler.completeObservation(observation);

    expect(scheduler.getPendingJobs()).toHaveLength(4);
    expect(
      await readFile(join(directory, 'outcomes.ndjson'), 'utf8'),
    ).toContain('"horizonMinutes":1');
  });

  it('rejects an observation without a matching pending job', async () => {
    const scheduler = new PersistentOutcomeScheduler(await makeDirectory());
    await scheduler.initialize();

    const observation = createAlertOutcomeObservation({
      evaluationId: 'eval-r2',
      alertId: 'missing',
      instrumentId: 'BTC-USDT',
      detectedAt: 1_000_000,
      horizonMinutes: 1,
      observedAt: 1_060_000,
      referencePrice: 100,
      observedPrice: 101,
      rawReturnPercent: 1,
      directionAdjustedReturnPercent: 1,
      maximumFavorableExcursionPercent: 1,
      maximumAdverseExcursionPercent: 0,
    });

    await expect(scheduler.completeObservation(observation)).rejects.toThrow(
      'No matching pending observation job exists',
    );
  });
});
