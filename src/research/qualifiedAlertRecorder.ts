import { appendFile, readFile } from 'node:fs/promises';
import path from 'node:path';

import type { QualifiedAlertEvidenceRecord } from './qualifiedAlertEvidence';

interface EvaluationManifestIdentity {
  evaluationId: string;
  sourceCommit: string;
  configurationFingerprint: string;
  liveOrderExecutionAllowed: false;
}

export interface QualifiedAlertRecorderOptions {
  evaluationDirectory: string;
}

export class QualifiedAlertRecorder {
  private readonly manifestPath: string;
  private readonly outputPath: string;
  private manifest?: EvaluationManifestIdentity;
  private writeChain: Promise<void> = Promise.resolve();

  constructor(options: QualifiedAlertRecorderOptions) {
    this.manifestPath = path.join(options.evaluationDirectory, 'manifest.json');
    this.outputPath = path.join(
      options.evaluationDirectory,
      'qualified-alerts.ndjson',
    );
  }

  async initialize(): Promise<void> {
    const parsed = JSON.parse(
      await readFile(this.manifestPath, 'utf8'),
    ) as Partial<EvaluationManifestIdentity>;

    if (
      typeof parsed.evaluationId !== 'string' ||
      typeof parsed.sourceCommit !== 'string' ||
      typeof parsed.configurationFingerprint !== 'string' ||
      parsed.liveOrderExecutionAllowed !== false
    ) {
      throw new Error('Evaluation manifest identity is invalid');
    }

    this.manifest = {
      evaluationId: parsed.evaluationId,
      sourceCommit: parsed.sourceCommit,
      configurationFingerprint: parsed.configurationFingerprint,
      liveOrderExecutionAllowed: false,
    };
  }

  async record(record: QualifiedAlertEvidenceRecord): Promise<void> {
    const manifest = this.manifest;
    if (manifest === undefined) {
      throw new Error('QualifiedAlertRecorder must be initialized first');
    }

    if (
      record.evaluationId !== manifest.evaluationId ||
      record.sourceCommit !== manifest.sourceCommit ||
      record.configurationFingerprint !== manifest.configurationFingerprint
    ) {
      throw new Error('Qualified alert does not match the frozen evaluation');
    }

    if (!record.qualified || record.liveOrderExecutionAllowed !== false) {
      throw new Error('Only qualified research-only alerts can be recorded');
    }

    const line = `${JSON.stringify(record)}\n`;
    const write = this.writeChain.then(() => appendFile(this.outputPath, line, 'utf8'));
    this.writeChain = write.catch(() => undefined);
    await write;
  }
}
