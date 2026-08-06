import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { createFrozenStrategyEvaluationManifest } from '../research/frozenStrategyEvaluation';
import { createCurrentFrozenStrategyConfiguration } from '../research/strategyEvaluationDefinition';

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

export const initializeFrozenStrategyEvaluation = (input: {
  readonly evaluationId: string;
  readonly projectDirectory?: string;
  readonly sourceCommit?: string;
  readonly gitStatus?: string;
  readonly createdAt?: number;
}) => {
  const projectDirectory = input.projectDirectory ?? process.cwd();
  const evaluationId = requireSafeId(input.evaluationId);
  const gitStatus =
    input.gitStatus ??
    execFileSync('git', ['status', '--porcelain', '--untracked-files=normal'], {
      cwd: projectDirectory,
      encoding: 'utf8',
    });
  if (gitStatus.trim().length > 0) {
    throw new Error(
      'Frozen strategy evaluation requires a clean committed worktree',
    );
  }
  const sourceCommit =
    input.sourceCommit ??
    execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: projectDirectory,
      encoding: 'utf8',
    }).trim();
  const manifest = createFrozenStrategyEvaluationManifest({
    evaluationId,
    sourceCommit,
    createdAt: input.createdAt ?? Date.now(),
    configuration: createCurrentFrozenStrategyConfiguration(),
  });
  const directory = resolve(
    projectDirectory,
    'data',
    'strategy-evaluations',
    evaluationId,
  );
  mkdirSync(resolve(projectDirectory, 'data', 'strategy-evaluations'), {
    recursive: true,
  });
  mkdirSync(directory);
  writeFileSync(
    resolve(directory, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    { flag: 'wx', flush: true },
  );
  writeFileSync(resolve(directory, 'strategy-outcomes.ndjson'), '', {
    flag: 'wx',
    flush: true,
  });

  return Object.freeze({
    directory,
    manifest,
    paperOnly: true as const,
    liveOrderExecutionAllowed: false as const,
  });
};

const main = (): void => {
  const evaluationId = process.argv[2]?.trim();
  if (!evaluationId) {
    throw new Error(
      'Usage: npm run strategy:evaluation:init -- <evaluation-id>',
    );
  }
  const result = initializeFrozenStrategyEvaluation({ evaluationId });
  console.log('Frozen strategy evaluation initialized');
  console.log(`Evaluation ID: ${result.manifest.evaluationId}`);
  console.log(`Directory: ${result.directory}`);
  console.log(`Source commit: ${result.manifest.sourceCommit}`);
  console.log(
    `Configuration fingerprint: ${result.manifest.configurationFingerprint}`,
  );
  console.log('Parameter tuning and all order execution remain disabled.');
};

if (require.main === module) {
  try {
    main();
  } catch (error: unknown) {
    console.error(
      `Frozen strategy initialization failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    process.exitCode = 1;
  }
}
