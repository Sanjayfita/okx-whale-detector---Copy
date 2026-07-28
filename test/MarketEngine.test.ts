import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MarketEngine } from '../src/market/MarketEngine';

import { MarketState } from '../src/core/MarketState';

import { SummaryThrottle } from '../src/core/SummaryThrottle';

import { CorrelatedAlertEngine } from '../src/alerts/CorrelatedAlertEngine';
import { ExternalSignalCorrelationService } from '../src/external/core/ExternalSignalCorrelationService';
import { CorrelatedAlertReporter } from '../src/reporting/CorrelatedAlertReporter';
import { MarketReporter } from '../src/reporting/MarketReporter';
import { CorrelatedAlertRecorder } from '../src/recording/CorrelatedAlertRecorder';

import type { OKXOrderBookUpdate } from '../src/clients/okx/OKXWebSocketClient';
import type { MarketEvaluation } from '../src/types/marketEvaluation';

const createSnapshot = (
  overrides: Partial<OKXOrderBookUpdate> = {},
): OKXOrderBookUpdate => ({
  instId: 'BTC-USDT',

  action: 'snapshot',

  bids: [['100', '2', '0', '1']],

  asks: [['101', '3', '0', '1']],

  timestamp: 1_000,

  seqId: 10,

  prevSeqId: -1,

  ...overrides,
});

const createUpdate = (
  overrides: Partial<OKXOrderBookUpdate> = {},
): OKXOrderBookUpdate => ({
  instId: 'BTC-USDT',

  action: 'update',

  bids: [['100', '3', '0', '1']],

  asks: [],

  timestamp: 2_000,

  seqId: 11,

  prevSeqId: 10,

  ...overrides,
});

const createCorrelatedEvaluation = (): MarketEvaluation => ({
  marketSignal: {
    bias: 'BULLISH',
    confidence: 75,
    reason: 'Strong OKX pressure',
    bidPressure: 80,
    askPressure: 20,
    netPressure: 60,
    timestamp: Date.now(),
  },
  correlatedSignal: {
    symbol: 'BTC-USDT',
    bias: 'BULLISH',
    confidence: 70,
    okxBias: 'BULLISH',
    okxConfidence: 75,
    externalBias: 'BULLISH',
    externalConfidence: 60,
    agreement: 'AGREEMENT',
    bullishExternalScore: 60,
    bearishExternalScore: 0,
    neutralExternalSignals: 0,
    consideredSignals: 1,
    ignoredSignals: 0,
    contributions: [],
    reason: 'OKX and external intelligence agree.',
    timestamp: Date.now(),
  },
});

describe('MarketEngine', () => {
  let marketStates: Map<string, MarketState>;

  let state: MarketState;

  let engine: MarketEngine;

  beforeEach(() => {
    vi.useFakeTimers();

    vi.setSystemTime(new Date('2026-07-26T00:00:00Z'));

    vi.spyOn(console, 'log').mockImplementation(() => undefined);

    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    state = new MarketState();

    marketStates = new Map([['BTC-USDT', state]]);

    engine = new MarketEngine(marketStates, new SummaryThrottle(5_000));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('logs PERSISTENT only once across repeated updates', () => {
    const whale = {
      side: 'ASK' as const,
      wallId: 'wall-1',
      price: 101,

      size: 10_000,

      notionalQuote: 1_010_000,

      quoteCurrency: 'USDT' as const,

      detectedAt: Date.now(),

      firstSeenAt: Date.now() - 30_000,

      lastSeenAt: Date.now(),

      ageSeconds: 30,

      updateCount: 5,

      maxNotionalQuote: 1_010_000,

      strength: 1,
    };

    /*
     * Keep the exact same whale identity
     * across both order-book updates.
     */
    vi.spyOn(state.whaleTracker, 'scan').mockReturnValue({
      active: [whale],

      trackedWalls: 1,

      newWalls: 0,

      persistentWalls: 1,

      strongWalls: 0,

      totalBidNotionalQuote: 0,

      totalAskNotionalQuote: whale.notionalQuote,

      strongestBid: undefined,

      strongestAsk: whale,

      newWhales: [],

      removedWhales: [],

      movedWhales: [],
    });

    vi.spyOn(state.whaleBehaviorEngine, 'analyze').mockImplementation(
      (analyzedWhale) => [
        {
          type: 'PERSISTENT',

          whale: analyzedWhale,

          confidence: 80,

          reason: 'Whale has remained active for 30s',

          detectedAt: Date.now(),
        },
      ],
    );

    engine.processOrderBookUpdate(createSnapshot());

    engine.processOrderBookUpdate(createUpdate());

    const persistentLogs = vi
      .mocked(console.log)
      .mock.calls.filter((call) =>
        String(call[0]).startsWith('🧠 PERSISTENT |'),
      );

    expect(persistentLogs).toHaveLength(1);
  });

  it('ignores updates for an unknown symbol', () => {
    expect(() => {
      engine.processOrderBookUpdate(
        createSnapshot({
          instId: 'UNKNOWN-USDT',
        }),
      );
    }).not.toThrow();

    expect(state.orderBookManager.getOrderBook().initialized).toBe(false);
  });

  it('applies a valid snapshot to the correct market state', () => {
    engine.processOrderBookUpdate(createSnapshot());

    const orderBook = state.orderBookManager.getOrderBook();

    expect(orderBook.initialized).toBe(true);

    expect(orderBook.status).toBe('SYNCED');

    expect(orderBook.lastSeqId).toBe(10);

    expect(state.orderBookManager.getBestBid()?.price).toBe(100);

    expect(state.orderBookManager.getBestAsk()?.price).toBe(101);
  });

  it('applies a sequence-continuous update after a snapshot', () => {
    engine.processOrderBookUpdate(createSnapshot());

    engine.processOrderBookUpdate(createUpdate());

    const orderBook = state.orderBookManager.getOrderBook();

    expect(orderBook.status).toBe('SYNCED');

    expect(orderBook.lastSeqId).toBe(11);

    expect(state.orderBookManager.getBestBid()?.size).toBe(3);
  });

  it('rejects a sequence gap and logs it only once', () => {
    engine.processOrderBookUpdate(createSnapshot());

    engine.processOrderBookUpdate(
      createUpdate({
        seqId: 12,

        prevSeqId: 999,
      }),
    );

    engine.processOrderBookUpdate(
      createUpdate({
        seqId: 13,

        prevSeqId: 999,
      }),
    );

    expect(console.error).toHaveBeenCalledTimes(1);

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('Order-book sequence gap for BTC-USDT'),
    );

    expect(state.orderBookManager.getOrderBook().status).not.toBe('SYNCED');
  });

  it('accepts a fresh snapshot after a sequence gap', () => {
    engine.processOrderBookUpdate(createSnapshot());

    engine.processOrderBookUpdate(
      createUpdate({
        seqId: 12,

        prevSeqId: 999,
      }),
    );

    engine.processOrderBookUpdate(
      createSnapshot({
        timestamp: 3_000,

        seqId: 20,

        bids: [['200', '4', '0', '1']],

        asks: [['201', '5', '0', '1']],
      }),
    );

    const orderBook = state.orderBookManager.getOrderBook();

    expect(orderBook.status).toBe('SYNCED');

    expect(orderBook.lastSeqId).toBe(20);

    expect(state.orderBookManager.getBestBid()?.price).toBe(200);

    expect(state.orderBookManager.getBestAsk()?.price).toBe(201);
  });

  it('clears internal gap and throttle state when reset', () => {
    engine.processOrderBookUpdate(createSnapshot());

    engine.processOrderBookUpdate(
      createUpdate({
        seqId: 12,

        prevSeqId: 999,
      }),
    );

    expect(console.error).toHaveBeenCalledTimes(1);

    engine.reset();

    /*
     * Replace the invalid market
     * state just as index.ts does
     * after reconnect.
     */
    const replacementState = new MarketState();

    marketStates.set('BTC-USDT', replacementState);

    engine.processOrderBookUpdate(
      createSnapshot({
        seqId: 30,
      }),
    );

    expect(replacementState.orderBookManager.getOrderBook().status).toBe(
      'SYNCED',
    );
  });

  it('correlates once and passes the same evaluation to reporting and alerts', () => {
    const evaluation = createCorrelatedEvaluation();
    const correlationService = new ExternalSignalCorrelationService();
    const correlateSpy = vi
      .spyOn(correlationService, 'correlateMarketSignal')
      .mockReturnValue(evaluation);
    const alertEngine = new CorrelatedAlertEngine({
      clock: () => Date.now(),
    });
    const evaluateSpy = vi.spyOn(alertEngine, 'evaluate');
    const alertReporter = new CorrelatedAlertReporter();
    const alertReportSpy = vi.spyOn(alertReporter, 'report');
    const alertRecorder = new CorrelatedAlertRecorder({
      outputPath: 'data/alerts/test-market-engine.jsonl',
      writerFactory: () => ({
        append: vi.fn(),
        close: vi.fn(),
      }),
    });
    const alertRecordSpy = vi.spyOn(alertRecorder, 'record');
    const marketReporter = new MarketReporter();
    const summarySpy = vi.spyOn(marketReporter, 'reportSummary');
    const integratedEngine = new MarketEngine(
      marketStates,
      new SummaryThrottle(5_000),
      marketReporter,
      undefined,
      undefined,
      correlationService,
      alertEngine,
      alertReporter,
      alertRecorder,
    );

    integratedEngine.processOrderBookUpdate(createSnapshot());

    expect(correlateSpy).toHaveBeenCalledTimes(1);
    expect(evaluateSpy).toHaveBeenCalledTimes(1);
    expect(evaluateSpy).toHaveBeenCalledWith(evaluation);
    expect(summarySpy).toHaveBeenCalledWith(
      expect.objectContaining({ evaluation }),
    );
    expect(alertReportSpy).toHaveBeenCalledTimes(1);
    expect(alertReportSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        symbol: 'BTC-USDT',
        relationship: 'AGREEMENT',
      }),
    );
    expect(alertRecordSpy).toHaveBeenCalledTimes(1);
    expect(alertRecordSpy.mock.calls[0]?.[0]).toBe(
      alertReportSpy.mock.calls[0]?.[0],
    );
  });

  it('does not record when the alert engine emits no alert', () => {
    const evaluation = createCorrelatedEvaluation();
    const correlationService = new ExternalSignalCorrelationService();
    vi.spyOn(correlationService, 'correlateMarketSignal').mockReturnValue(
      evaluation,
    );
    const alertRecorder = new CorrelatedAlertRecorder({
      outputPath: 'data/alerts/test-no-alert.jsonl',
      writerFactory: () => ({
        append: vi.fn(),
        close: vi.fn(),
      }),
    });
    const alertRecordSpy = vi.spyOn(alertRecorder, 'record');
    const integratedEngine = new MarketEngine(
      marketStates,
      new SummaryThrottle(5_000),
      undefined,
      undefined,
      undefined,
      correlationService,
      new CorrelatedAlertEngine({ enabled: false }),
      undefined,
      alertRecorder,
    );

    integratedEngine.processOrderBookUpdate(createSnapshot());

    expect(alertRecordSpy).not.toHaveBeenCalled();
  });

  it('continues processing when correlated alert recording fails', () => {
    const evaluation = createCorrelatedEvaluation();
    const correlationService = new ExternalSignalCorrelationService();
    vi.spyOn(correlationService, 'correlateMarketSignal').mockReturnValue(
      evaluation,
    );
    const warn = vi.fn();
    const alertRecorder = new CorrelatedAlertRecorder({
      outputPath: 'data/alerts/test-write-failure.jsonl',
      warn,
      writerFactory: () => ({
        append: () => {
          throw new Error('disk unavailable');
        },
        close: vi.fn(),
      }),
    });
    const integratedEngine = new MarketEngine(
      marketStates,
      new SummaryThrottle(5_000),
      undefined,
      undefined,
      undefined,
      correlationService,
      new CorrelatedAlertEngine(),
      undefined,
      alertRecorder,
    );

    expect(() =>
      integratedEngine.processOrderBookUpdate(createSnapshot()),
    ).not.toThrow();
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
