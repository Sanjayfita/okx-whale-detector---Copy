import { describe, expect, it } from 'vitest';

import { parseRecordingRecord } from '../src/recording/recordingValidation';

describe('recording validation', () => {
  it('parses an instrument record', () => {
    const record = parseRecordingRecord(
      JSON.stringify({
        type: 'instrument',
        recordedAt: 1,
        instrument: {
          instId: 'BTC-USDT',
          instType: 'SPOT',
          quoteCurrency: 'USDT',
          baseUnitsPerSize: 1,
        },
      }),
    );

    expect(record.type).toBe('instrument');
  });

  it('parses an order-book record', () => {
    const record = parseRecordingRecord(
      JSON.stringify({
        type: 'orderBook',
        recordedAt: 2,
        update: {
          instId: 'BTC-USDT',
          action: 'snapshot',
          bids: [],
          asks: [],
          timestamp: 2,
          seqId: 1,
          prevSeqId: -1,
        },
      }),
    );

    expect(record.type).toBe('orderBook');
  });

  it('rejects an unsupported record type', () => {
    expect(() =>
      parseRecordingRecord(JSON.stringify({ type: 'candle', recordedAt: 1 })),
    ).toThrow('record type');
  });

  it('rejects a missing timestamp', () => {
    expect(() =>
      parseRecordingRecord(
        JSON.stringify({
          type: 'instrument',
          instrument: { instId: 'BTC-USDT' },
        }),
      ),
    ).toThrow('timestamp');
  });
});
