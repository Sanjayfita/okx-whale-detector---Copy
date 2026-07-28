import {
  closeSync,
  fsyncSync,
  mkdirSync,
  openSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';

import { isSafeCorrelatedAlertOutputPath } from './correlatedAlertPath';
import type { CorrelatedAlert } from '../types/correlatedAlert';

export const CORRELATED_ALERT_SCHEMA_VERSION = 1 as const;
export const DEFAULT_CORRELATED_ALERT_OUTPUT_PATH =
  'data/alerts/correlated-alerts.jsonl';

export interface CorrelatedAlertRecord {
  schemaVersion: typeof CORRELATED_ALERT_SCHEMA_VERSION;
  recordedAt: number;
  alert: CorrelatedAlert;
}

export interface CorrelatedAlertRecordWriter {
  append(line: string, flush: boolean): void;
  close(): void;
}

export interface CorrelatedAlertRecorderOptions {
  enabled?: boolean;
  outputPath?: string;
  flushAfterEachAlert?: boolean;
  clock?: () => number;
  writerFactory?: (outputPath: string) => CorrelatedAlertRecordWriter;
  warn?: (message: string) => void;
}

class AppendOnlyCorrelatedAlertWriter implements CorrelatedAlertRecordWriter {
  private readonly fileDescriptor: number;
  private closed = false;

  public constructor(outputPath: string) {
    mkdirSync(path.dirname(outputPath), { recursive: true });
    this.fileDescriptor = openSync(outputPath, 'a');
  }

  public append(line: string, flush: boolean): void {
    writeFileSync(this.fileDescriptor, line, { encoding: 'utf8' });

    if (flush) {
      fsyncSync(this.fileDescriptor);
    }
  }

  public close(): void {
    if (this.closed) {
      return;
    }

    let failure: unknown;

    try {
      fsyncSync(this.fileDescriptor);
    } catch (error: unknown) {
      failure = error;
    }

    try {
      closeSync(this.fileDescriptor);
    } catch (error: unknown) {
      failure ??= error;
    } finally {
      this.closed = true;
    }

    if (failure) {
      throw failure;
    }
  }
}

export class CorrelatedAlertRecorder {
  public readonly outputPath: string;

  private readonly enabled: boolean;
  private readonly flushAfterEachAlert: boolean;
  private readonly clock: () => number;
  private readonly writerFactory: (
    outputPath: string,
  ) => CorrelatedAlertRecordWriter;
  private readonly warn: (message: string) => void;
  private readonly pendingLines: string[] = [];

  private writer?: CorrelatedAlertRecordWriter;
  private failureWarned = false;
  private closed = false;

  public constructor(options: CorrelatedAlertRecorderOptions = {}) {
    this.enabled = options.enabled ?? true;
    this.outputPath =
      options.outputPath ?? DEFAULT_CORRELATED_ALERT_OUTPUT_PATH;
    this.flushAfterEachAlert = options.flushAfterEachAlert ?? true;
    this.clock = options.clock ?? Date.now;
    this.writerFactory =
      options.writerFactory ??
      ((outputPath) => new AppendOnlyCorrelatedAlertWriter(outputPath));
    this.warn = options.warn ?? console.warn;

    this.validateOptions();
  }

  public record(alert: CorrelatedAlert): void {
    if (!this.enabled || this.closed) {
      return;
    }

    const record: CorrelatedAlertRecord = {
      schemaVersion: CORRELATED_ALERT_SCHEMA_VERSION,
      recordedAt: this.clock(),
      alert,
    };

    this.pendingLines.push(`${JSON.stringify(record)}\n`);
    this.flushPending();
  }

  public close(): void {
    if (this.closed) {
      return;
    }

    if (this.enabled) {
      this.flushPending();

      if (this.writer) {
        try {
          this.writer.close();
          this.failureWarned = false;
        } catch (error: unknown) {
          this.reportFailure(error);
        }
      }
    }

    this.writer = undefined;
    this.closed = true;
  }

  private flushPending(): void {
    while (this.pendingLines.length > 0) {
      try {
        this.writer ??= this.writerFactory(this.outputPath);
        const line = this.pendingLines[0];

        if (line === undefined) {
          return;
        }

        this.writer.append(line, this.flushAfterEachAlert);
        this.pendingLines.shift();
        this.failureWarned = false;
      } catch (error: unknown) {
        this.reportFailure(error);
        return;
      }
    }
  }

  private reportFailure(error: unknown): void {
    if (this.failureWarned) {
      return;
    }

    const message = error instanceof Error ? error.message : String(error);
    this.warn(
      `Unable to record correlated alert to ${this.outputPath}: ${message}`,
    );
    this.failureWarned = true;
  }

  private validateOptions(): void {
    if (typeof this.enabled !== 'boolean') {
      throw new Error('enabled must be a boolean');
    }

    if (
      typeof this.outputPath !== 'string' ||
      this.outputPath.trim().length === 0
    ) {
      throw new Error('outputPath must be a non-empty string');
    }

    if (!isSafeCorrelatedAlertOutputPath(this.outputPath)) {
      throw new Error('outputPath must not traverse outside the project');
    }

    if (typeof this.flushAfterEachAlert !== 'boolean') {
      throw new Error('flushAfterEachAlert must be a boolean');
    }
  }
}
