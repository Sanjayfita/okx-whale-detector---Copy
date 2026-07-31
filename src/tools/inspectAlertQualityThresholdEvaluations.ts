import {
  readAlertQualityThresholdEvaluations,
  type PersistedAlertQualityThresholdEvaluation,
} from '../evaluation';

export interface AlertQualityThresholdInspectorCliDependencies {
  log?: (...values: unknown[]) => void;
  error?: (...values: unknown[]) => void;
}

const printEvaluation = (
  evaluation: PersistedAlertQualityThresholdEvaluation,
  log: (...values: unknown[]) => void,
): void => {
  log(`Evaluation run: ${evaluation.evaluationRunId} @ ${evaluation.generatedAt}`);
  log(
    `Source report: ${evaluation.sourceReportRunId} @ ${evaluation.sourceReportGeneratedAt}`,
  );
  log(`Policy fingerprint: ${evaluation.policyFingerprint}`);
  log(`Groups evaluated: ${evaluation.evaluations.length}`);
  log(`PASS: ${evaluation.passedCount}`);
  log(`FAIL: ${evaluation.failedCount}`);
  log(`INSUFFICIENT_DATA: ${evaluation.insufficientDataCount}`);

  for (const group of evaluation.evaluations) {
    log(`${group.status} | ${group.groupKey}`);
    if (group.reasons.length > 0) log(`Reasons: ${group.reasons.join(', ')}`);
  }
};

export const runAlertQualityThresholdInspectorCli = async (
  args: readonly string[],
  dependencies: AlertQualityThresholdInspectorCliDependencies = {},
): Promise<number> => {
  const log = dependencies.log ?? console.log;
  const errorLog = dependencies.error ?? console.error;

  try {
    if (args.length !== 2 || args[0] !== '--file' || !args[1]) {
      throw new Error('Usage: --file <threshold-evaluations.jsonl>');
    }

    const result = await readAlertQualityThresholdEvaluations(args[1]);
    if (result.issues.length > 0) {
      throw new Error(`Threshold evaluation file contains ${result.issues.length} read issue(s)`);
    }
    if (result.evaluations.length === 0) {
      throw new Error('Threshold evaluation file contains no evaluations');
    }

    log('PERSISTED ALERT QUALITY THRESHOLD EVALUATIONS');
    log(`Evaluations: ${result.evaluations.length}`);
    log(`Exact duplicates ignored: ${result.exactDuplicateCount}`);
    result.evaluations.forEach((evaluation, index) => {
      if (index > 0) log('---');
      printEvaluation(evaluation, log);
    });
    log('Research analytics only. This output is not a trading recommendation.');
    return 0;
  } catch (error: unknown) {
    errorLog(
      'Alert-quality threshold evaluation inspection failed:',
      error instanceof Error ? error.message : error,
    );
    return 1;
  }
};

if (require.main === module) {
  void runAlertQualityThresholdInspectorCli(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}
