import { resolve } from 'node:path';

import { inspectEvidenceProgress } from '../research/evidenceProgressInspector';

const evaluationId = process.argv[2] ?? 'eval-2026-08-02-v1';
const evaluationDirectory = resolve('data', 'evaluations', evaluationId);

void inspectEvidenceProgress(evaluationDirectory)
  .then((report) => {
    console.log('Evidence progress report');
    console.log(`Evaluation ID: ${report.evaluationId}`);
    console.log(`Collection days: ${report.collectionDays.toFixed(2)}`);
    console.log(`Qualified alerts: ${report.qualifiedAlertCount}`);
    console.log(`Completed observations: ${report.completedObservationCount}`);
    console.log(`Complete bundles: ${report.completeBundleCount}`);
    console.log(`Pending observations: ${report.pendingObservationCount}`);
    console.log(`Malformed records: ${report.malformedRecordCount}`);
    console.log(`Duration requirement met: ${report.durationRequirementMet}`);
    console.log(`Alert requirement met: ${report.alertRequirementMet}`);
    console.log(`Ready for final evaluation: ${report.readyForFinalEvaluation}`);
    console.log('Live order execution remains disabled.');
  })
  .catch((error: unknown) => {
    console.error('Failed to inspect evidence progress:', error);
    process.exitCode = 1;
  });
