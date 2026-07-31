import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  createPersistedAlertQualityThresholdEvaluation,
  createAlertQualityThresholdPolicy,
  writeAlertQualityThresholdEvaluations,
  type AlertQualityThresholdReport,
} from '../src/evaluation';
import { runAlertQualityThresholdInspectorCli } from '../src/tools/inspectAlertQualityThresholdEvaluations';

const thresholdReport = (): AlertQualityThresholdReport => ({
  reportRunId: 'alert-quality-report:inspector-test',
  generatedAt: 1_700_000_000_000,
  policy: createAlertQualityThresholdPolicy(),
  evaluations: [
    {
      groupKey: 'overall',
      dimension: 'OVERALL',
      value: null,
      status: 'PASS',
      reasons: [],
      observation: {
        sampleCount: 50,
        eligibleRate: 0.9,
        winRate: 0.6,
        expectancyPercent: 0.2,
        ambiguityRate: 0.05,
      },
    },
  ],
  passedCount: 1,
  failedCount: 0,
  insufficientDataCount: 0,
});

describe('threshold evaluation inspector CLI', () => {
  it('prints persisted evaluation summaries', async () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'threshold-inspector-'));
    const filePath = path.join(directory, 'evaluations.jsonl');
    try {
      await writeAlertQualityThresholdEvaluations(filePath, [
        createPersistedAlertQualityThresholdEvaluation({
          thresholdReport: thresholdReport(),
          evaluationRunId: 'threshold-evaluation:inspector-test',
          generatedAt: 1_700_000_000_001,
        }),
      ]);
      const output: string[] = [];
      const code = await runAlertQualityThresholdInspectorCli(['--file', filePath], {
        log: (...values) => output.push(values.map(String).join(' ')),
      });
      expect(code).toBe(0);
      expect(output.join('\n')).toContain('PERSISTED ALERT QUALITY THRESHOLD EVALUATIONS');
      expect(output.join('\n')).toContain('PASS: 1');
      expect(output.join('\n')).toContain('PASS | overall');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('rejects missing arguments', async () => {
    const errors: string[] = [];
    const code = await runAlertQualityThresholdInspectorCli([], {
      error: (...values) => errors.push(values.map(String).join(' ')),
    });
    expect(code).toBe(1);
    expect(errors.join('\n')).toContain('Usage: --file');
  });
});
