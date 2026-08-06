import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  runFrozenStrategyEvaluation,
  validateFrozenStrategyEvaluationManifest,
  type FrozenStrategyEvaluationManifest,
} from '../research/frozenStrategyEvaluation';
import type { StrategyOutcomeObservation } from '../research/strategyResearchTypes';

const requireSafeId = (value: string): string => {
  const normalized = value.trim();
  if (
    normalized.length === 0 ||
    normalized === '.' ||
    normalized === '..' ||
    normalized.includes('/') ||
    normalized.includes('\\')
  ) {
    throw new Error('evaluationId must be a safe directory name');
  }
  return normalized;
};

const readNdjson = <T>(path: string): readonly T[] =>
  readFileSync(path, 'utf8')
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line, index) => {
      try {
        return JSON.parse(line) as T;
      } catch (error: unknown) {
        throw new Error(
          `Invalid NDJSON at line ${index + 1}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    });

export const generateFrozenStrategyEvaluation = (input: {
  readonly evaluationId: string;
  readonly projectDirectory?: string;
  readonly sourceCommit?: string;
  readonly gitStatus?: string;
}) => {
  const projectDirectory = input.projectDirectory ?? process.cwd();
  const evaluationId = requireSafeId(input.evaluationId);
  const directory = resolve(
    projectDirectory,
    'data',
    'strategy-evaluations',
    evaluationId,
  );
  const manifest = validateFrozenStrategyEvaluationManifest(
    JSON.parse(
      readFileSync(resolve(directory, 'manifest.json'), 'utf8'),
    ) as FrozenStrategyEvaluationManifest,
  );
  const sourceCommit =
    input.sourceCommit ??
    execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: projectDirectory,
      encoding: 'utf8',
    }).trim();
  const gitStatus =
    input.gitStatus ??
    execFileSync('git', ['status', '--porcelain', '--untracked-files=normal'], {
      cwd: projectDirectory,
      encoding: 'utf8',
    });
  if (sourceCommit !== manifest.sourceCommit || gitStatus.trim().length > 0) {
    throw new Error(
      'Frozen evaluation requires its original clean source commit',
    );
  }
  const observations = readNdjson<StrategyOutcomeObservation>(
    resolve(directory, 'strategy-outcomes.ndjson'),
  );
  const report = runFrozenStrategyEvaluation({ manifest, observations });
  const outputPath = resolve(directory, 'evaluation-report.json');
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, {
    flush: true,
  });
  return Object.freeze({ directory, outputPath, report });
};

const main = (): void => {
  const evaluationId = process.argv[2]?.trim();
  if (!evaluationId) {
    throw new Error(
      'Usage: npm run strategy:evaluation:run -- <evaluation-id>',
    );
  }
  const result = generateFrozenStrategyEvaluation({ evaluationId });
  console.log('Frozen strategy evaluation complete');
  console.log(`Observations: ${result.report.observations}`);
  console.log(
    `Ready for another paper evaluation: ${result.report.readyForNextPaperEvaluation}`,
  );
  for (const reason of result.report.reasons) console.log(`- ${reason}`);
  for (const warning of result.report.warnings) {
    console.log(`WARNING: ${warning}`);
  }
  console.log(`Report: ${result.outputPath}`);
  console.log('Order execution remains disabled.');
};

if (require.main === module) {
  try {
    main();
  } catch (error: unknown) {
    console.error(
      `Frozen strategy evaluation failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    process.exitCode = 1;
  }
}
