import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { analyzeAlphaResearchDataset } from '../research/alphaResearchAnalysis';
import { createAlphaResearchConfig } from '../research/alphaResearchConfig';
import { loadAlphaResearchDataset } from '../research/alphaResearchDatasetLoader';

export { loadAlphaResearchDataset } from '../research/alphaResearchDatasetLoader';

export const generateAlphaResearchReport = async (input: {
  readonly evaluationId: string;
  readonly evaluationDirectory?: string;
  readonly config?: ReturnType<typeof createAlphaResearchConfig>;
}) => {
  const config = input.config ?? createAlphaResearchConfig();
  const dataset = await loadAlphaResearchDataset({
    evaluationId: input.evaluationId,
    evaluationDirectory: input.evaluationDirectory,
    config,
  });
  return analyzeAlphaResearchDataset({ dataset, config });
};

const main = async (): Promise<void> => {
  const evaluationId = process.argv[2]?.trim();
  if (!evaluationId) {
    throw new Error('Usage: npm run alpha:research -- <evaluation-id>');
  }
  const evaluationDirectory = resolve('data', 'evaluations', evaluationId);
  const report = await generateAlphaResearchReport({
    evaluationId,
    evaluationDirectory,
  });
  const reportsDirectory = resolve(evaluationDirectory, 'reports');
  const outputPath = resolve(
    reportsDirectory,
    `alpha-research-report-${report.datasetFingerprint}.json`,
  );
  await mkdir(reportsDirectory, { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, {
    encoding: 'utf8',
    flag: 'wx',
  });

  console.log('WHALE-CONDITIONED ALPHA RESEARCH');
  console.log(`Evaluation ID: ${report.evaluationId}`);
  console.log(`Status: ${report.status}`);
  console.log(`Joined target rows: ${report.totalRows}`);
  console.log(`Final holdout rows: ${report.finalHoldoutRows}`);
  console.log(`Round-trip cost: ${report.roundTripCostPercent}%`);
  console.log(`Dataset fingerprint: ${report.datasetFingerprint}`);
  console.log(`Configuration fingerprint: ${report.configurationFingerprint}`);
  console.log(`Production features enabled: 0`);
  console.log(`Output: ${outputPath}`);
  console.log('Research analytics only. No orders were placed.');
};

if (require.main === module) {
  void main().catch((error: unknown) => {
    console.error(
      `Alpha research failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  });
}
