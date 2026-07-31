import {
  createAlertQualityThresholdPolicy,
  createPersistedAlertQualityThresholdEvaluation,
  evaluateAlertQualityThresholds,
  readAlertQualityUnifiedReports,
  writeAlertQualityThresholdEvaluations,
  type AlertQualityThresholdPolicy,
} from '../evaluation';

export interface GenerateAlertQualityThresholdEvaluationCliDependencies {
  log?: (...values: unknown[]) => void;
  error?: (...values: unknown[]) => void;
  now?: () => number;
}

const parseValues = (args: readonly string[]): Map<string, string> => {
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    const value = args[index + 1];
    if (!flag?.startsWith('--') || !value || value.startsWith('--')) {
      throw new Error(`${flag ?? 'option'} requires a value`);
    }
    values.set(flag, value);
  }
  return values;
};

const parseNumber = (flag: string, value: string): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`${flag} must be a finite number`);
  return parsed;
};

export const runGenerateAlertQualityThresholdEvaluationCli = async (
  args: readonly string[],
  dependencies: GenerateAlertQualityThresholdEvaluationCliDependencies = {},
): Promise<number> => {
  const log = dependencies.log ?? console.log;
  const errorLog = dependencies.error ?? console.error;
  const now = dependencies.now ?? Date.now;

  try {
    const values = parseValues(args);
    const required = ['--file', '--output', '--evaluation-run-id'];
    required.forEach((flag) => {
      if (!values.has(flag)) throw new Error(`${flag} is required`);
    });
    const allowed = new Set([
      ...required,
      '--minimum-samples',
      '--minimum-eligible-rate',
      '--minimum-win-rate',
      '--minimum-expectancy',
      '--maximum-ambiguity-rate',
    ]);
    for (const flag of values.keys()) {
      if (!allowed.has(flag)) throw new Error(`Unknown threshold-generation option: ${flag}`);
    }

    const read = await readAlertQualityUnifiedReports(values.get('--file')!);
    if (read.issues.length > 0) {
      throw new Error(`Unified report file contains ${read.issues.length} read issue(s)`);
    }
    if (read.reports.length !== 1) {
      throw new Error('Unified report file must contain exactly one report');
    }

    const overrides: Partial<AlertQualityThresholdPolicy> = {};
    const numericOptions: Array<[string, keyof AlertQualityThresholdPolicy]> = [
      ['--minimum-samples', 'minimumSampleCount'],
      ['--minimum-eligible-rate', 'minimumEligibleRate'],
      ['--minimum-win-rate', 'minimumWinRate'],
      ['--minimum-expectancy', 'minimumExpectancyPercent'],
      ['--maximum-ambiguity-rate', 'maximumAmbiguityRate'],
    ];
    numericOptions.forEach(([flag, key]) => {
      const value = values.get(flag);
      if (value !== undefined) overrides[key] = parseNumber(flag, value);
    });

    const policy = createAlertQualityThresholdPolicy(overrides);
    const thresholdReport = evaluateAlertQualityThresholds({
      report: read.reports[0]!,
      policy,
    });
    const persisted = createPersistedAlertQualityThresholdEvaluation({
      thresholdReport,
      evaluationRunId: values.get('--evaluation-run-id')!,
      generatedAt: now(),
    });
    await writeAlertQualityThresholdEvaluations(values.get('--output')!, [persisted]);

    log('PERSISTED ALERT QUALITY THRESHOLD EVALUATION');
    log(`Evaluation run: ${persisted.evaluationRunId}`);
    log(`Source report: ${persisted.sourceReportRunId} @ ${persisted.sourceReportGeneratedAt}`);
    log(`PASS: ${persisted.passedCount}`);
    log(`FAIL: ${persisted.failedCount}`);
    log(`INSUFFICIENT_DATA: ${persisted.insufficientDataCount}`);
    log(`Output: ${values.get('--output')!}`);
    log('Research analytics only. This output is not a trading recommendation.');
    return 0;
  } catch (error: unknown) {
    errorLog(
      'Alert-quality threshold evaluation generation failed:',
      error instanceof Error ? error.message : error,
    );
    return 1;
  }
};

if (require.main === module) {
  void runGenerateAlertQualityThresholdEvaluationCli(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}
