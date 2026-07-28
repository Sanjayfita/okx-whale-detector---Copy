import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CorrelatedAlertRecorder,
  type CorrelatedAlertRecord,
  type CorrelatedAlertRecordWriter,
} from '../src/recording/CorrelatedAlertRecorder';

import type { CorrelatedAlert } from '../src/types/correlatedAlert';

const createAlert = (
  overrides: Partial<CorrelatedAlert> = {},
): CorrelatedAlert => ({
  id: 'alert-1',
  symbol: 'BTC-USDT',
  severity: 'STRONG',
  eventType: 'AGREEMENT',
  bias: 'BULLISH',
  relationship: 'AGREEMENT',
  combinedConfidence: 74,
  okxConfidence: 81,
  externalEffectiveConfidence: 53,
  externalSignalsUsed: 2,
  ignoredExternalSignals: 0,
  reason: 'OKX and external intelligence agree.',
  createdAt: 1_785_200_000_000,
  ...overrides,
});

describe('CorrelatedAlertRecorder', () => {
  let directory: string;
  let outputPath: string;

  beforeEach(() => {
    directory = mkdtempSync(
      path.join(tmpdir(), 'okx-correlated-alert-recorder-'),
    );
    outputPath = path.join(directory, 'nested', 'alerts.jsonl');
  });

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  it('appends one valid JSON object per line', () => {
    const recorder = new CorrelatedAlertRecorder({
      outputPath,
      clock: () => 1_785_200_000_100,
    });

    recorder.record(createAlert());
    recorder.close();

    const lines = readFileSync(outputPath, 'utf8').trim().split('\n');
    const record = JSON.parse(lines[0] ?? '') as CorrelatedAlertRecord;

    expect(lines).toHaveLength(1);
    expect(record).toEqual({
      schemaVersion: 1,
      recordedAt: 1_785_200_000_100,
      alert: createAlert(),
    });
  });

  it('creates a missing parent directory', () => {
    const recorder = new CorrelatedAlertRecorder({ outputPath });

    expect(existsSync(path.dirname(outputPath))).toBe(false);

    recorder.record(createAlert());
    recorder.close();

    expect(existsSync(outputPath)).toBe(true);
  });

  it('preserves existing records after restart', () => {
    const first = new CorrelatedAlertRecorder({ outputPath });
    first.record(createAlert({ id: 'first' }));
    first.close();

    const second = new CorrelatedAlertRecorder({ outputPath });
    second.record(createAlert({ id: 'second' }));
    second.close();

    const records = readFileSync(outputPath, 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as CorrelatedAlertRecord);

    expect(records.map((record) => record.alert.id)).toEqual([
      'first',
      'second',
    ]);
  });

  it('records multiple alerts in order', () => {
    const recorder = new CorrelatedAlertRecorder({ outputPath });

    recorder.record(createAlert({ id: 'one' }));
    recorder.record(createAlert({ id: 'two' }));
    recorder.record(createAlert({ id: 'three' }));
    recorder.close();

    const ids = readFileSync(outputPath, 'utf8')
      .trim()
      .split('\n')
      .map((line) => (JSON.parse(line) as CorrelatedAlertRecord).alert.id);

    expect(ids).toEqual(['one', 'two', 'three']);
  });

  it('creates no file when disabled', () => {
    const recorder = new CorrelatedAlertRecorder({
      enabled: false,
      outputPath,
    });

    recorder.record(createAlert());
    recorder.close();

    expect(existsSync(outputPath)).toBe(false);
  });

  it('does not throw when a write fails', () => {
    const warn = vi.fn();
    const recorder = new CorrelatedAlertRecorder({
      outputPath,
      warn,
      writerFactory: () => ({
        append: () => {
          throw new Error('disk unavailable');
        },
        close: vi.fn(),
      }),
    });

    expect(() => recorder.record(createAlert())).not.toThrow();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining(`${outputPath}: disk unavailable`),
    );
  });

  it('warns only once during repeated failures', () => {
    const warn = vi.fn();
    const recorder = new CorrelatedAlertRecorder({
      outputPath,
      warn,
      writerFactory: () => ({
        append: () => {
          throw new Error('disk unavailable');
        },
        close: vi.fn(),
      }),
    });

    recorder.record(createAlert({ id: 'one' }));
    recorder.record(createAlert({ id: 'two' }));
    recorder.record(createAlert({ id: 'three' }));

    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('retries retained records after a later successful write', () => {
    const written: CorrelatedAlertRecord[] = [];
    let shouldFail = true;
    const writer: CorrelatedAlertRecordWriter = {
      append: (line) => {
        if (shouldFail) {
          throw new Error('temporary failure');
        }
        written.push(JSON.parse(line) as CorrelatedAlertRecord);
      },
      close: vi.fn(),
    };
    const recorder = new CorrelatedAlertRecorder({
      outputPath,
      writerFactory: () => writer,
      warn: vi.fn(),
    });

    recorder.record(createAlert({ id: 'first' }));
    shouldFail = false;
    recorder.record(createAlert({ id: 'second' }));

    expect(written.map((record) => record.alert.id)).toEqual([
      'first',
      'second',
    ]);
  });

  it('closes safely when no file was opened', () => {
    const writerFactory = vi.fn();
    const recorder = new CorrelatedAlertRecorder({
      outputPath,
      writerFactory,
    });

    expect(() => recorder.close()).not.toThrow();
    expect(writerFactory).not.toHaveBeenCalled();
  });

  it('flushes writer-managed pending data on close', () => {
    const persisted: string[] = [];
    const pending: string[] = [];
    const writer: CorrelatedAlertRecordWriter = {
      append: (line, flush) => {
        if (flush) {
          persisted.push(line);
        } else {
          pending.push(line);
        }
      },
      close: () => {
        persisted.push(...pending);
        pending.length = 0;
      },
    };
    const recorder = new CorrelatedAlertRecorder({
      outputPath,
      flushAfterEachAlert: false,
      writerFactory: () => writer,
    });

    recorder.record(createAlert());

    expect(persisted).toHaveLength(0);

    recorder.close();

    expect(persisted).toHaveLength(1);
  });
});
