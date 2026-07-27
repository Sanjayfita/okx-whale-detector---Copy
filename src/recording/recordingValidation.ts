import type { RecordingRecord } from './MarketDataRecorder';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

export const parseRecordingRecord = (line: string): RecordingRecord => {
  const value: unknown = JSON.parse(line);

  if (
    !isRecord(value) ||
    (value.type !== 'instrument' && value.type !== 'orderBook')
  ) {
    throw new Error('Invalid recording record type');
  }

  if (
    typeof value.recordedAt !== 'number' ||
    !Number.isFinite(value.recordedAt)
  ) {
    throw new Error('Invalid recording timestamp');
  }

  if (value.type === 'instrument') {
    if (
      !isRecord(value.instrument) ||
      typeof value.instrument.instId !== 'string'
    ) {
      throw new Error('Invalid recorded instrument');
    }

    return value as RecordingRecord;
  }

  if (!isRecord(value.update) || typeof value.update.instId !== 'string') {
    throw new Error('Invalid recorded order-book update');
  }

  return value as RecordingRecord;
};
