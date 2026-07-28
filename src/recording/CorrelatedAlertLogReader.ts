import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';

import {
  CORRELATED_ALERT_SCHEMA_VERSION,
  type CorrelatedAlertRecord,
} from './CorrelatedAlertRecorder';
import type {
  CorrelatedAlertEventType,
  CorrelatedAlertSeverity,
} from '../types/correlatedAlert';

export interface MalformedCorrelatedAlertLine {
  lineNumber: number;
  message: string;
}

export interface CorrelatedAlertLogReadResult {
  records: CorrelatedAlertRecord[];
  malformedLines: MalformedCorrelatedAlertLine[];
}

export interface CorrelatedAlertLogReadOptions {
  maximumRecords?: number;
}

const ALERT_SEVERITIES = new Set<CorrelatedAlertSeverity>([
  'INFO',
  'WATCH',
  'STRONG',
  'CRITICAL',
]);
const ALERT_EVENT_TYPES = new Set<CorrelatedAlertEventType>([
  'NEW_SIGNAL',
  'CONFIDENCE_INCREASED',
  'DIRECTION_CHANGED',
  'AGREEMENT',
  'CONTRADICTION',
]);
const MARKET_BIASES = new Set(['BULLISH', 'BEARISH', 'NEUTRAL']);
const RELATIONSHIPS = new Set([
  'AGREEMENT',
  'CONTRADICTION',
  'EXTERNAL_ONLY',
  'OKX_ONLY',
  'NEUTRAL',
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

export const parseCorrelatedAlertRecord = (
  line: string,
): CorrelatedAlertRecord => {
  const value: unknown = JSON.parse(line);

  if (
    !isRecord(value) ||
    value.schemaVersion !== CORRELATED_ALERT_SCHEMA_VERSION ||
    !isFiniteNumber(value.recordedAt) ||
    !isRecord(value.alert)
  ) {
    throw new Error('Invalid correlated alert record');
  }

  const alert = value.alert;

  if (
    typeof alert.id !== 'string' ||
    typeof alert.symbol !== 'string' ||
    !ALERT_SEVERITIES.has(alert.severity as CorrelatedAlertSeverity) ||
    !ALERT_EVENT_TYPES.has(alert.eventType as CorrelatedAlertEventType) ||
    !MARKET_BIASES.has(String(alert.bias)) ||
    !RELATIONSHIPS.has(String(alert.relationship)) ||
    !isFiniteNumber(alert.combinedConfidence) ||
    !isFiniteNumber(alert.okxConfidence) ||
    !isFiniteNumber(alert.externalEffectiveConfidence) ||
    !isFiniteNumber(alert.externalSignalsUsed) ||
    !isFiniteNumber(alert.ignoredExternalSignals) ||
    typeof alert.reason !== 'string' ||
    !isFiniteNumber(alert.createdAt)
  ) {
    throw new Error('Invalid correlated alert payload');
  }

  return value as unknown as CorrelatedAlertRecord;
};

export class CorrelatedAlertLogReader {
  public async read(
    filePath: string,
    options: CorrelatedAlertLogReadOptions = {},
  ): Promise<CorrelatedAlertLogReadResult> {
    const maximumRecords = options.maximumRecords;

    if (
      maximumRecords !== undefined &&
      (!Number.isInteger(maximumRecords) || maximumRecords <= 0)
    ) {
      throw new Error('maximumRecords must be a positive integer');
    }

    const records: CorrelatedAlertRecord[] = [];
    const malformedLines: MalformedCorrelatedAlertLine[] = [];
    const input = createInterface({
      input: createReadStream(filePath, { encoding: 'utf8' }),
      crlfDelay: Number.POSITIVE_INFINITY,
    });
    let lineNumber = 0;

    for await (const line of input) {
      lineNumber += 1;

      if (line.trim().length === 0) {
        continue;
      }

      try {
        records.push(parseCorrelatedAlertRecord(line));
      } catch (error: unknown) {
        malformedLines.push({
          lineNumber,
          message: error instanceof Error ? error.message : String(error),
        });
      }

      if (maximumRecords !== undefined && records.length >= maximumRecords) {
        break;
      }
    }

    return { records, malformedLines };
  }
}
