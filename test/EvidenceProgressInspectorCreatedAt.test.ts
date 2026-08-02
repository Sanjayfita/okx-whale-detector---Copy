import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { inspectEvidenceProgress } from '../src/research/evidenceProgressInspector';

const writeEvaluationFixture = async (createdAt: number): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), 'evidence-progress-'));
  await writeFile(
    join(directory, 'manifest.json'),
    JSON.stringify({
      schemaVersion: 1,
      evaluationId: 'eval-test',
      sourceCommit: 'abc123',
      configurationFingerprint: 'fingerprint',
      configuration: {},
      instruments: ['BTC-USDT'],
      horizonsMinutes: [1, 5, 15, 30, 60],
      minimumCollectionDays: 30,
      minimumQualifiedAlerts: 1_000,
      createdAt,
      configurationChangesAllowed: false,
      liveOrderExecutionAllowed: false,
      orderExecutionAuthorized: false,
      dryRunOnly: true,
      transportDispatchAllowed: false,
      testnetExecutionAuthorized: false,
    }),
    'utf8',
  );
  await writeFile(join(directory, 'qualified-alerts.ndjson'), '', 'utf8');
  await writeFile(join(directory, 'outcomes.ndjson'), '', 'utf8');
  await writeFile(join(directory, 'pending-observations.json'), '[]\n', 'utf8');
  return directory;
};

describe('inspectEvidenceProgress createdAt manifest compatibility', () => {
  it('uses createdAt as the frozen collection start timestamp', async () => {
    const createdAt = 1_000_000;
    const directory = await writeEvaluationFixture(createdAt);

    const report = await inspectEvidenceProgress(
      directory,
      createdAt + 2 * 86_400_000,
    );

    expect(report.evaluationId).toBe('eval-test');
    expect(report.collectionDays).toBe(2);
    expect(report.qualifiedAlertCount).toBe(0);
    expect(report.completedObservationCount).toBe(0);
    expect(report.pendingObservationCount).toBe(0);
    expect(report.malformedRecordCount).toBe(0);
    expect(report.liveOrderExecutionAllowed).toBe(false);
  });
});
