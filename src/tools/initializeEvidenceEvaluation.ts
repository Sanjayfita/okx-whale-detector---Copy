import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { createEvaluationSessionManifest } from '../research/evaluationSessionManifest';

const evaluationId = process.argv[2]?.trim() || `eval-${new Date().toISOString().slice(0, 10)}-v1`;
const rootDirectory = resolve(process.cwd(), 'data', 'evaluations', evaluationId);

if (existsSync(rootDirectory)) {
  throw new Error(`Evaluation already exists: ${rootDirectory}`);
}

const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], {
  encoding: 'utf8',
}).trim();

const configuration = {
  instruments: ['BTC-USDT', 'ETH-USDT', 'XRP-USDT'],
  minimumCollectionDays: 30,
  minimumQualifiedAlerts: 1_000,
  horizonsMinutes: [1, 5, 15, 30, 60],
};

const manifest = createEvaluationSessionManifest({
  evaluationId,
  sourceCommit,
  configuration,
  instruments: configuration.instruments,
  minimumCollectionDays: configuration.minimumCollectionDays,
  minimumQualifiedAlerts: configuration.minimumQualifiedAlerts,
  horizonsMinutes: configuration.horizonsMinutes,
  createdAt: Date.now(),
});

mkdirSync(rootDirectory, { recursive: true });
writeFileSync(resolve(rootDirectory, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, {
  flag: 'wx',
});
writeFileSync(resolve(rootDirectory, 'qualified-alerts.ndjson'), '', { flag: 'wx' });
writeFileSync(resolve(rootDirectory, 'outcomes.ndjson'), '', { flag: 'wx' });
writeFileSync(resolve(rootDirectory, 'pending-observations.json'), '[]\n', { flag: 'wx' });

console.log('Evidence evaluation initialized');
console.log(`Evaluation ID: ${manifest.evaluationId}`);
console.log(`Directory: ${rootDirectory}`);
console.log(`Source commit: ${manifest.sourceCommit}`);
console.log(`Configuration fingerprint: ${manifest.configurationFingerprint}`);
console.log('Live order execution remains disabled.');
