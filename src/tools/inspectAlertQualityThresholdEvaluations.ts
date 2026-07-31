import { readAlertQualityThresholdEvaluations } from '../evaluation';

export interface InspectAlertQualityThresholdEvaluationsCliDependencies {
  log?: (...values: unknown[]) => void;
  error?: (...values: unknown[]) => void;
}

export const runInspectAlertQualityThresholdEvaluationsCli = async (
  args: readonly string[],
  dependencies: InspectAlertQualityThresholdEvaluationsCliDependencies = {},
): Promise<number> => {
  const log = dependencies.log ?? console.log;
  const errorLog = dependencies.error ?? console.error;

  try {
    if (args.length !== 2 || args[0] !== '--file' || !args[1]) {
      throw new Error('Usage: --file <threshold-evaluations.jsonl>');
    }
    const read = await readAlertQualityThresholdEvaluations(args[1]);
    if (read.issues.length > 0) {
      throw new Error(`Threshold evaluation file contains ${read.issues.length} read issue(s)`);
    }

    log('PERSISTED ALERT QUALITY THRESHOLD EVALUATIONS');
    log(`Evaluations: ${read.evaluations.length}`);
    log(`Exact duplicates ignored: ${read.exactDuplicateCount}`);
    read.evaluations.forEach((evaluation) => {
      log(`${evaluation.evaluationRunId} @ ${evaluation.generatedAt}`);
      log(`Source: ${evaluation.sourceReportRunId} @ ${evaluation.sourceReportGeneratedAt}`);
      log(`Policy fingerprint: ${evaluation.policyFingerprint}`);
      log(`Groups: ${evaluation.evaluations.length}`);
      log(`PASS: ${evaluation.passedCount}`);
      log(`FAIL: ${evaluation.failedCount}`);
      log(`INSUFFICIENT_DATA: ${evaluation.insufficientDataCount}`);
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
  void runInspectAlertQualityThresholdEvaluationsCli(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}
