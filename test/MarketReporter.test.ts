import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MarketReporter } from '../src/reporting/MarketReporter';

import type { MarketEvaluation } from '../src/types/marketEvaluation';
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

  it('preserves zero, small-price, and rounding-boundary output', () => {
    const reporter = new MarketReporter();
    const cases = [
      { symbol: 'BTC-USDT', value: 0, expected: '0' },
      { symbol: 'DOGE-USDT', value: 0.0000049, expected: '0' },
      { symbol: 'DOGE-USDT', value: 0.000005, expected: '0.00001' },
      { symbol: 'XRP-USDT', value: 1.23445, expected: '1.2345' },
      { symbol: 'NEW-USDT', value: 0.000000005, expected: '0.00000001' },
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

  it('preserves grouped quote totals and scored-whale price output', () => {
    const reporter = new MarketReporter();
    const whale = createWhale({
      price: 64_665.149999999994,
      notionalQuote: 9_876_543_210.6,
    });

    reporter.reportSummary({
      ...createNeutralSummary(
        'BTC-USDT',
        64_665.149999999994,
        64_665.14,
        64_665.16,
      ),
      activeWhales: [whale],
      scoredWhales: [
        {
          whale,
          totalScore: 75,
          strength: 'STRONG',
          components: {
            sizeScore: 25,
            distanceScore: 20,
            persistenceScore: 15,
            stabilityScore: 15,
          },
          explanation: [],
        },
      ],
    });

    const output = logSpy.mock.calls.map((call) => String(call[0])).join('\n');

    expect(output).toContain('Active BID Whales: 1 (9,876,543,211 USDT)');
    expect(output).toContain(
      'BID WHALE SCORE: 75/100 | STRONG | Price: 64665.15',
    );
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

  it('prints agreement directional confidence and alert importance', () => {
    const reporter = new MarketReporter();
    const evaluation: MarketEvaluation = {
      marketSignal: {
        bias: 'BULLISH',
        confidence: 68,
        reason: 'Strong OKX pressure',
        bidPressure: 70,
        askPressure: 20,
        netPressure: 50,
        timestamp: 1_700_000,
      },
      correlatedSignal: {
        symbol: 'BTC-USDT',
        bias: 'BULLISH',
        confidence: 51,
        alertImportance: 51,
        okxBias: 'BULLISH',
        okxConfidence: 68,
        externalBias: 'BULLISH',
        externalConfidence: 42,
        agreement: 'AGREEMENT',
        bullishExternalScore: 1,
        bearishExternalScore: 0,
        neutralExternalSignals: 0,
        consideredSignals: 1,
        ignoredSignals: 2,
        contributions: [],
        reason: 'OKX and external intelligence agree.',
        timestamp: 1_700_000,
      },
    };

    reporter.reportSummary({
      ...createNeutralSummary('BTC-USDT', 100.5, 100, 101),
      evaluation,
    } as never);

    const output = logSpy.mock.calls.map((call) => String(call[0])).join('\n');

    expect(output).toContain('📊 CORRELATED INTELLIGENCE');
    expect(output).toContain('Relationship: AGREEMENT');
    expect(output).toContain('Directional Confidence: 51.0%');
    expect(output).toContain('Alert Importance: 51.0%');
    expect(output).toContain('External signals used: 1');
    expect(output).toContain('Ignored external signals: 2');
  });

  it('prints a contradiction section with reduced confidence', () => {
    const reporter = new MarketReporter();
    const evaluation: MarketEvaluation = {
      marketSignal: {
        bias: 'BULLISH',
        confidence: 68,
        reason: 'Strong OKX pressure',
        bidPressure: 70,
        askPressure: 20,
        netPressure: 50,
        timestamp: 1_700_000,
      },
      correlatedSignal: {
        symbol: 'BTC-USDT',
        bias: 'BEARISH',
        confidence: 42,
        alertImportance: 68,
        okxBias: 'BULLISH',
        okxConfidence: 68,
        externalBias: 'BEARISH',
        externalConfidence: 42,
        agreement: 'CONTRADICTION',
        bullishExternalScore: 0,
        bearishExternalScore: 1,
        neutralExternalSignals: 0,
        consideredSignals: 1,
        ignoredSignals: 0,
        contributions: [],
        reason: 'External intelligence contradicts the OKX market signal.',
        timestamp: 1_700_000,
      },
    };

    reporter.reportSummary({
      ...createNeutralSummary('BTC-USDT', 100.5, 100, 101),
      evaluation,
    } as never);

    const output = logSpy.mock.calls.map((call) => String(call[0])).join('\n');

    expect(output).toContain('Relationship: CONTRADICTION');
    expect(output).toContain('Directional Confidence: 42.0%');
    expect(output).toContain('Alert Importance: 68.0%');
    expect(output).toContain(
      'Contradiction warning: alert importance measures source disagreement, not directional certainty.',
    );
  });

  it('prints external-only context when no OKX bias is present', () => {
    const reporter = new MarketReporter();
    const evaluation: MarketEvaluation = {
      marketSignal: {
        bias: 'NEUTRAL',
        confidence: 0,
        reason: 'No active whale walls',
        bidPressure: 0,
        askPressure: 0,
        netPressure: 0,
        timestamp: 1_700_000,
      },
      correlatedSignal: {
        symbol: 'BTC-USDT',
        bias: 'BULLISH',
        confidence: 70,
        alertImportance: 70,
        okxBias: 'NEUTRAL',
        okxConfidence: 0,
        externalBias: 'BULLISH',
        externalConfidence: 70,
        agreement: 'EXTERNAL_ONLY',
        bullishExternalScore: 1,
        bearishExternalScore: 0,
        neutralExternalSignals: 0,
        consideredSignals: 1,
        ignoredSignals: 0,
        contributions: [],
        reason:
          'Only external directional intelligence is currently available.',
        timestamp: 1_700_000,
      },
    };

    reporter.reportSummary({
      ...createNeutralSummary('BTC-USDT', 100.5, 100, 101),
      evaluation,
    } as never);

    const output = logSpy.mock.calls.map((call) => String(call[0])).join('\n');

    expect(output).toContain('Relationship: EXTERNAL_ONLY');
    expect(output).toContain('External Bias: BULLISH');
  });

  it('preserves the normal OKX summary for OKX-only correlation results', () => {
    const reporter = new MarketReporter();
    const evaluation: MarketEvaluation = {
      marketSignal: {
        bias: 'BULLISH',
        confidence: 68,
        reason: 'Strong OKX pressure',
        bidPressure: 70,
        askPressure: 20,
        netPressure: 50,
        timestamp: 1_700_000,
      },
      correlatedSignal: {
        symbol: 'BTC-USDT',
        bias: 'BULLISH',
        confidence: 68,
        alertImportance: 68,
        okxBias: 'BULLISH',
        okxConfidence: 68,
        externalBias: 'NEUTRAL',
        externalConfidence: 0,
        agreement: 'OKX_ONLY',
        bullishExternalScore: 0,
        bearishExternalScore: 0,
        neutralExternalSignals: 1,
        consideredSignals: 0,
        ignoredSignals: 2,
        contributions: [],
        reason: 'No qualifying external intelligence affected this result.',
        timestamp: 1_700_000,
      },
    };

    reporter.reportSummary({
      ...createNeutralSummary('BTC-USDT', 100.5, 100, 101),
      evaluation,
    } as never);

    const output = logSpy.mock.calls.map((call) => String(call[0])).join('\n');

    expect(output).toContain('📊 MARKET BIAS');
    expect(output).not.toContain('External Bias:');
    expect(output).not.toContain('External signals used: 0');
  });

  it('does not print misleading Polymarket values when no external signals exist', () => {
    const reporter = new MarketReporter();
    const evaluation: MarketEvaluation = {
      marketSignal: {
        bias: 'BULLISH',
        confidence: 68,
        reason: 'Strong OKX pressure',
        bidPressure: 70,
        askPressure: 20,
        netPressure: 50,
        timestamp: 1_700_000,
      },
      correlatedSignal: {
        symbol: 'BTC-USDT',
        bias: 'BULLISH',
        confidence: 68,
        alertImportance: 68,
        okxBias: 'BULLISH',
        okxConfidence: 68,
        externalBias: 'NEUTRAL',
        externalConfidence: 0,
        agreement: 'OKX_ONLY',
        bullishExternalScore: 0,
        bearishExternalScore: 0,
        neutralExternalSignals: 0,
        consideredSignals: 0,
        ignoredSignals: 2,
        contributions: [],
        reason: 'No qualifying external intelligence affected this result.',
        timestamp: 1_700_000,
      },
    };

    reporter.reportSummary({
      ...createNeutralSummary('BTC-USDT', 100.5, 100, 101),
      evaluation,
    } as never);

    const output = logSpy.mock.calls.map((call) => String(call[0])).join('\n');

    expect(output).not.toContain('External Bias: NEUTRAL');
    expect(output).not.toContain('External signals used: 0');
    expect(output).not.toContain('Ignored external signals: 0');
  });
});
