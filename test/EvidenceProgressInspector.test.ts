import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { inspectEvidenceProgress } from '../src/research/evidenceProgressInspector';

const createEvaluation = async (): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), 'evidence-progress-'));
  await writeFile(
    join(directory, 'manifest.json'),
    JSON.stringify({
      evaluationId: 'eval-test',
      collectionStartedAt: 1_000,
      minimumCollectionDays: 1,
      minimumQualifiedAlerts: 1,
      liveOrderExecutionAllowed: false,
    }),
    'utf8',
  );
  return directory;
};

describe('inspectEvidenceProgress', () => {
  it('reports progress and readiness from persisted evidence', async () => {
    const directory = await createEvaluation();
    await writeFile(join(directory, 'qualified-alerts.ndjson'), '{"alertId":"a1"}\n', 'utf8');
    await writeFile(
      join(directory, 'outcomes.ndjson'),
      [1, 5, 15, 30, 60]
        .map((horizonMinutes) => JSON.stringify({ alertId: 'a1', horizonMinutes }))
        .join('\n') + '\n',
      'utf8',
    );
    await writeFile(
      join(directory, 'pending-observations.json'),
      JSON.stringify({ pending: [], liveOrderExecutionAllowed: false }),
      'utf8',
    );

    const report = await inspectEvidenceProgress(directory, 86_401_000);

    expect(report.qualifiedAlertCount).toBe(1);
    expect(report.completedObservationCount).toBe(5);
    expect(report.completeBundleCount).toBe(1);
    expect(report.pendingObservationCount).toBe(0);
    expect(report.malformedRecordCount).toBe(0);
    expect(report.readyForFinalEvaluation).toBe(true);
    expect(report.liveOrderExecutionAllowed).toBe(false);
  });

  it('counts malformed lines and blocks readiness', async () => {
    const directory = await createEvaluation();
    await writeFile(join(directory, 'qualified-alerts.ndjson'), 'not-json\n', 'utf8');

    const report = await inspectEvidenceProgress(directory, 86_401_000);

    expect(report.malformedRecordCount).toBe(1);
    expect(report.readyForFinalEvaluation).toBe(false);
  });
});
