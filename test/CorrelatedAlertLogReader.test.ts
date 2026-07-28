import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { CorrelatedAlertLogReader } from '../src/recording/CorrelatedAlertLogReader';

const createRecord = (id: string) => ({
  schemaVersion: 1,
  recordedAt: 1_000,
  alert: {
    id,
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
    createdAt: 1_000,
  },
});

describe('CorrelatedAlertLogReader', () => {
  let directory: string;
  let filePath: string;

  beforeEach(() => {
    directory = mkdtempSync(path.join(tmpdir(), 'okx-alert-reader-'));
    filePath = path.join(directory, 'alerts.jsonl');
  });

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  it('parses valid records', async () => {
    writeFileSync(filePath, `${JSON.stringify(createRecord('one'))}\n`, 'utf8');

    const result = await new CorrelatedAlertLogReader().read(filePath);

    expect(result.records).toHaveLength(1);
    expect(result.records[0]?.alert.id).toBe('one');
    expect(result.records[0]?.alert.alertImportance).toBe(74);
    expect(result.malformedLines).toEqual([]);
  });

  it('preserves an explicitly recorded alert importance', async () => {
    const record = createRecord('one');
    record.alert.alertImportance = 82;
    writeFileSync(filePath, `${JSON.stringify(record)}\n`, 'utf8');

    const result = await new CorrelatedAlertLogReader().read(filePath);

    expect(result.records[0]?.alert.alertImportance).toBe(82);
    expect(result.malformedLines).toEqual([]);
  });

  it('rejects invalid alert importance values', async () => {
    const record = createRecord('one');
    record.alert.alertImportance = 101;
    writeFileSync(filePath, `${JSON.stringify(record)}\n`, 'utf8');

    const result = await new CorrelatedAlertLogReader().read(filePath);

    expect(result.records).toHaveLength(0);
    expect(result.malformedLines).toHaveLength(1);
  });

  it('ignores blank lines', async () => {
    writeFileSync(
      filePath,
      `\n${JSON.stringify(createRecord('one'))}\n   \n`,
      'utf8',
    );

    const result = await new CorrelatedAlertLogReader().read(filePath);

    expect(result.records).toHaveLength(1);
    expect(result.malformedLines).toEqual([]);
  });

  it('reports malformed line numbers', async () => {
    writeFileSync(
      filePath,
      `${JSON.stringify(createRecord('one'))}\nnot-json\n{}\n`,
      'utf8',
    );

    const result = await new CorrelatedAlertLogReader().read(filePath);

    expect(result.malformedLines.map((line) => line.lineNumber)).toEqual([
      2, 3,
    ]);
  });

  it('returns valid records around malformed lines', async () => {
    writeFileSync(
      filePath,
      `${JSON.stringify(createRecord('one'))}\nbroken\n${JSON.stringify(
        createRecord('two'),
      )}\n`,
      'utf8',
    );

    const result = await new CorrelatedAlertLogReader().read(filePath);

    expect(result.records.map((record) => record.alert.id)).toEqual([
      'one',
      'two',
    ]);
    expect(result.malformedLines).toHaveLength(1);
  });

  it('stops after the maximum number of valid records', async () => {
    writeFileSync(
      filePath,
      ['one', 'two', 'three', 'four']
        .map((id) => JSON.stringify(createRecord(id)))
        .join('\n'),
      'utf8',
    );

    const result = await new CorrelatedAlertLogReader().read(filePath, {
      maximumRecords: 2,
    });

    expect(result.records.map((record) => record.alert.id)).toEqual([
      'one',
      'two',
    ]);
  });
});
