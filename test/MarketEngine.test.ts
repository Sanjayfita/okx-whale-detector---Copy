import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MarketEngine } from '../src/market/MarketEngine';

import { MarketState } from '../src/core/MarketState';

import { SummaryThrottle } from '../src/core/SummaryThrottle';

import type { OKXOrderBookUpdate } from '../src/clients/okx/OKXWebSocketClient';

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
});
