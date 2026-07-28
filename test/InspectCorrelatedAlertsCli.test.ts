import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { runCorrelatedAlertInspectionCli } from '../src/tools/inspectCorrelatedAlerts';

const createRecord = () => ({
  schemaVersion: 1,
  recordedAt: 1_000,
  alert: {
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
    createdAt: 1_000,
  },
});

describe('correlated alert inspection CLI', () => {
  let directory: string;
  let defaultFilePath: string;
  let log: ReturnType<typeof vi.fn>;
  let warn: ReturnType<typeof vi.fn>;
  let error: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    directory = mkdtempSync(path.join(tmpdir(), 'okx-alert-inspector-'));
    defaultFilePath = path.join(directory, 'default-alerts.jsonl');
    log = vi.fn();
    warn = vi.fn();
    error = vi.fn();
  });

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  it('treats a missing default file as an empty not-yet-created log', async () => {
    const exitCode = await runCorrelatedAlertInspectionCli([], {
      defaultFilePath,
      log,
      warn,
      error,
    });
    const output = log.mock.calls.flat().join('\n');

    expect(exitCode).toBe(0);
    expect(output).toContain('No correlated alert log exists yet.');
    expect(output).toContain(`Expected file: ${path.resolve(defaultFilePath)}`);
    expect(output).toContain('created lazily after the first correlated alert');
    expect(error).not.toHaveBeenCalled();
  });

  it('treats a missing explicitly supplied file the same way', async () => {
    const customFilePath = path.join(directory, 'custom-alerts.jsonl');

    const exitCode = await runCorrelatedAlertInspectionCli(
      ['--file', customFilePath],
      {
        defaultFilePath,
        log,
        warn,
        error,
      },
    );

    expect(exitCode).toBe(0);
    expect(log.mock.calls.flat().join('\n')).toContain(
      `Expected file: ${path.resolve(customFilePath)}`,
    );
  });

  it('does not create an empty file while inspecting a missing path', async () => {
    await runCorrelatedAlertInspectionCli([], {
      defaultFilePath,
      log,
      warn,
      error,
    });

    expect(existsSync(defaultFilePath)).toBe(false);
  });

  it('retains a nonzero exit code for unexpected filesystem errors', async () => {
    const permissionError = Object.assign(new Error('permission denied'), {
      code: 'EACCES',
    });

    const exitCode = await runCorrelatedAlertInspectionCli([], {
      defaultFilePath,
      reader: {
        read: async () => {
          throw permissionError;
        },
      },
      log,
      warn,
      error,
    });

    expect(exitCode).toBe(1);
    expect(error).toHaveBeenCalledWith(
      'Correlated alert inspection failed:',
      'permission denied',
    );
  });

  it('preserves existing valid-file output', async () => {
    writeFileSync(
      defaultFilePath,
      `${JSON.stringify(createRecord())}\n`,
      'utf8',
    );

    const exitCode = await runCorrelatedAlertInspectionCli([], {
      defaultFilePath,
      log,
      warn,
      error,
    });
    const output = log.mock.calls.flat().join('\n');

    expect(exitCode).toBe(0);
    expect(output).toContain('Valid alerts: 1');
    expect(output).toContain('STRONG: 1');
    expect(output).toContain('AGREEMENT: 1');
    expect(output).toContain('BTC-USDT: 1');
    expect(error).not.toHaveBeenCalled();
  });
});
