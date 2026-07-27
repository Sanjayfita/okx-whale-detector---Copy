import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MarketReporter } from '../src/reporting/MarketReporter';

import type { Whale, WhaleChange } from '../src/types/whale';

const createWhale = (overrides: Partial<Whale> = {}): Whale => ({
  wallId: 'wall-1',

  side: 'BID',

  price: 100,

  size: 10_000,

  notionalQuote: 1_000_000,

  quoteCurrency: 'USDT',

  detectedAt: 1_000,

  firstSeenAt: 1_000,

  lastSeenAt: 1_000,

  ageSeconds: 30,

  updateCount: 1,

  maxNotionalQuote: 1_000_000,

  strength: 1,

  ...overrides,
});

const createNeutralSummary = (
  symbol: string,
  currentPrice: number,
  bestBidPrice: number,
  bestAskPrice: number,
) => ({
  symbol,
  currentPrice,
  bestBidPrice,
  bestAskPrice,
  activeWhales: [],
  walls: [],
  scoredWhales: [],
  marketSignal: {
    bias: 'NEUTRAL' as const,

    confidence: 0,

    reason: 'No active whale walls',

    bidPressure: 0,

    askPressure: 0,
  },
});

describe('MarketReporter', () => {
  const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

  const errorSpy = vi
    .spyOn(console, 'error')
    .mockImplementation(() => undefined);

  beforeEach(() => {
    logSpy.mockClear();
    errorSpy.mockClear();
  });

  it('reports a sequence gap', () => {
    const reporter = new MarketReporter();

    reporter.reportSequenceGap('BTC-USDT');

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Order-book sequence gap for BTC-USDT'),
    );
  });

  it('formats a behavior transition', () => {
    const reporter = new MarketReporter();

    const whale = createWhale();

    reporter.reportBehavior({
      type: 'PERSISTENT',

      whale,

      confidence: 80,

      reason: 'Whale has remained active for 30s',

      detectedAt: 1_000,
    });

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('🧠 PERSISTENT | BID'),
    );
  });

  it('formats quote values using en-US separators', () => {
    const reporter = new MarketReporter();

    reporter.reportWhaleEvent('BTC-USDT', {
      type: 'NEW',

      whale: createWhale({
        price: 64_665.149999999994,

        notionalQuote: 1_234_567,
      }),
    });

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('Price: 64665.15'),
    );

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('1,234,567 USDT'),
    );
  });

  it('reports moved whale prices using symbol precision', () => {
    const reporter = new MarketReporter();

    const moved: WhaleChange = {
      wallId: 'wall-1',

      type: 'MOVED',

      side: 'BID',

      price: 1.0972499999999998,

      previousPrice: 1.0968499999999999,

      previousSize: 10_000,

      currentSize: 10_000,

      sizeDifference: 0,

      previousNotionalQuote: 1_000_000,

      currentNotionalQuote: 1_000_100,

      timestamp: 1_000,
    };

    reporter.reportMovedWhale('XRP-USDT', moved);

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('Price: 1.0968 → 1.0972'),
    );
  });

  it('formats all configured symbols with their intended precision', () => {
    const reporter = new MarketReporter();

    const cases = [
      {
        symbol: 'BTC-USDT',
        value: 64_665.149999999994,
        expected: '64665.15',
      },
      {
        symbol: 'ETH-USDT',
        value: 1_894.0150000000001,
        expected: '1894.02',
      },
      {
        symbol: 'SOL-USDT',
        value: 74.92500000000001,
        expected: '74.93',
      },
      {
        symbol: 'XRP-USDT',
        value: 1.0968499999999999,
        expected: '1.0968',
      },
      {
        symbol: 'DOGE-USDT',
        value: 0.07289500000000001,
        expected: '0.0729',
      },
    ];

    for (const testCase of cases) {
      logSpy.mockClear();

      reporter.reportSummary(
        createNeutralSummary(
          testCase.symbol,
          testCase.value,
          testCase.value,
          testCase.value,
        ),
      );

      const output = logSpy.mock.calls
        .map((call) => String(call[0]))
        .join('\n');

      expect(output).toContain(`Current Price: ${testCase.expected}`);
    }
  });

  it('uses up to eight decimals for an unknown symbol', () => {
    const reporter = new MarketReporter();

    reporter.reportSummary(
      createNeutralSummary('NEW-USDT', 0.123456789, 0.123456789, 0.123456789),
    );

    const output = logSpy.mock.calls.map((call) => String(call[0])).join('\n');

    expect(output).toContain('Current Price: 0.12345679');
  });

  it('reports unavailable bid and ask prices as N/A', () => {
    const reporter = new MarketReporter();

    reporter.reportSummary({
      ...createNeutralSummary('BTC-USDT', 100.5, 100, 101),
      bestBidPrice: undefined,
      bestAskPrice: undefined,
    });

    const output = logSpy.mock.calls.map((call) => String(call[0])).join('\n');

    expect(output).toContain('Best Bid: N/A | Best Ask: N/A');
  });

  it('reports a complete neutral market summary', () => {
    const reporter = new MarketReporter();

    reporter.reportSummary(createNeutralSummary('BTC-USDT', 100.5, 100, 101));

    const output = logSpy.mock.calls.map((call) => String(call[0])).join('\n');

    expect(output).toContain('📡 BTC-USDT');

    expect(output).toContain('⚪ NEUTRAL');

    expect(output).toContain('No active whale walls');
  });
});
