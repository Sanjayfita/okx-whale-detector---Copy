import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  createPersistedAlertQualityThresholdEvaluation,
  writeAlertQualityThresholdEvaluations,
  type AlertQualityThresholdReport,
} from '../src/evaluation';
import { runGenerateAlertQualityThresholdEvaluationCli } from '../src/tools/generateAlertQualityThresholdEvaluation';
import { runInspectAlertQualityThresholdEvaluationsCli } from '../src/tools/inspectAlertQualityThresholdEvaluations';

const thresholdReport = (): AlertQualityThresholdReport => ({
  reportRunId: 'alert-quality-report:persistence-cli-test',
  generatedAt: 1_700_000_000_000,
  policy: {
    minimumSampleCount: 30,
    minimumEligibleRate: 0.8,
    minimumWinRate: 0.5,
    minimumExpectancyPercent: 0,
    maximumAmbiguityRate: 0.1,
  },
  evaluations: [],
  passedCount: 0,
  failedCount: 0,
  insufficientDataCount: 0,
});

describe('alert-quality threshold persistence CLIs', () => {
  it('inspects a valid persisted threshold evaluation', async () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'threshold-persistence-cli-'));
    const file = path.join(directory, 'evaluation.jsonl');
    try {
      await writeAlertQualityThresholdEvaluations(file, [
        createPersistedAlertQualityThresholdEvaluation({
          thresholdReport: thresholdReport(),
          evaluationRunId: 'threshold-evaluation:test',
          generatedAt: 1_700_000_000_001,
        }),
      ]);
      const output: string[] = [];
      const code = await runInspectAlertQualityThresholdEvaluationsCli(['--file', file], {
        log: (...values) => output.push(values.map(String).join(' ')),
      });

      expect(code).toBe(0);
      expect(output).toContain('Evaluations: 1');
      expect(output).toContain('threshold-evaluation:test @ 1700000000001');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('rejects missing generator options', async () => {
    const errors: string[] = [];
    const code = await runGenerateAlertQualityThresholdEvaluationCli([], {
      error: (...values) => errors.push(values.map(String).join(' ')),
    });

    expect(code).toBe(1);
    expect(errors.join('\n')).toContain('--file is required');
  });
});
