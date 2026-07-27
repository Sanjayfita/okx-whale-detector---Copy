import { describe, expect, it } from 'vitest';

import {
  calculateReplayDelayMs,
  parseReplayOptions,
  parseReplaySpeed,
} from '../src/recording/replayOptions';

describe('replay options', () => {
  it('defaults to instant replay for all symbols', () => {
    expect(parseReplayOptions(['session.ndjson'])).toEqual({
      filePath: 'session.ndjson',
      speed: 'instant',
      symbol: undefined,
    });
  });

  it('parses a symbol and accelerated speed', () => {
    expect(
      parseReplayOptions([
        'session.ndjson',
        '--symbol',
        'BTC-USDT',
        '--speed',
        '10x',
      ]),
    ).toEqual({
      filePath: 'session.ndjson',
      symbol: 'BTC-USDT',
      speed: 10,
    });
  });

  it('parses realtime speed', () => {
    expect(parseReplaySpeed('realtime')).toBe('realtime');
  });

  it('rejects an invalid speed', () => {
    expect(() => parseReplaySpeed('fast')).toThrow('Replay speed');
  });

  it('rejects an unknown option', () => {
    expect(() => parseReplayOptions(['session.ndjson', '--unknown'])).toThrow(
      'Unknown replay option',
    );
  });

  it('returns no delay for instant replay', () => {
    expect(calculateReplayDelayMs(1_000, 2_000, 'instant')).toBe(0);
  });

  it('preserves the original delay for realtime replay', () => {
    expect(calculateReplayDelayMs(1_000, 2_500, 'realtime')).toBe(1_500);
  });

  it('divides delays by an acceleration multiplier', () => {
    expect(calculateReplayDelayMs(1_000, 3_000, 10)).toBe(200);
  });
});
