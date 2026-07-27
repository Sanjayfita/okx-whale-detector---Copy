import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { appConfig } from '../src/config/appConfig';
import { WhaleTracker } from '../src/core/WhaleTracker';

import type { OrderBook, OrderLevel } from '../src/types/orderbook';

const createLevel = (price: number, size: number): OrderLevel => ({
  price,
  rawPrice: String(price),
  size,
  rawSize: String(size),
  notionalQuote: price * size,
  quoteCurrency: 'USDT',
  updatedAt: Date.now(),
});

const createBook = (
  bids: OrderLevel[] = [],
  asks: OrderLevel[] = [],
): OrderBook => ({
  bids: new Map(bids.map((level) => [level.price, level])),
  asks: new Map(asks.map((level) => [level.price, level])),
  lastSeqId: 1,
  status: 'SYNCED',
  initialized: true,
  updatedAt: Date.now(),
});

describe('WhaleTracker stable wall identity', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-26T00:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('changes whale detection when a smaller threshold is injected', () => {
    const productionTracker = new WhaleTracker(appConfig.tracker);
    const testTracker = new WhaleTracker({
      ...appConfig.tracker,
      minimumNotionalQuote: 1_000,
    });
    const orderBook = createBook([createLevel(100, 100)]);

    expect(productionTracker.scan(orderBook).active).toHaveLength(0);
    expect(testTracker.scan(orderBook).active).toHaveLength(1);
  });

  it('keeps wallId and firstSeenAt when a wall moves slightly', () => {
    const tracker = new WhaleTracker();
    const first = tracker.scan(createBook([createLevel(100, 10_000)]));
    const original = first.active[0];

    expect(original).toBeDefined();
    if (!original) {
      throw new Error('Expected original whale');
    }

    vi.advanceTimersByTime(30_000);
    const second = tracker.scan(createBook([createLevel(100.01, 10_000)]));
    const moved = second.active[0];

    expect(moved).toBeDefined();
    if (!moved) {
      throw new Error('Expected moved whale');
    }

    expect(moved.wallId).toBe(original.wallId);
    expect(moved.firstSeenAt).toBe(original.firstSeenAt);
    expect(moved.ageSeconds).toBe(30);
    expect(second.movedWhales).toHaveLength(1);
    expect(second.movedWhales[0]?.wallId).toBe(original.wallId);
    expect(second.newWhales).toHaveLength(0);
    expect(second.removedWhales).toHaveLength(0);
  });

  it('does not reuse one new wall for two old walls', () => {
    const tracker = new WhaleTracker();

    tracker.scan(
      createBook([createLevel(100, 10_000), createLevel(100.02, 10_000)]),
    );

    const result = tracker.scan(createBook([createLevel(100.01, 10_000)]));
    expect(result.movedWhales).toHaveLength(1);
  });

  it('reports the strongest whale on each side without changing identity', () => {
    const tracker = new WhaleTracker();
    const result = tracker.scan(
      createBook(
        [createLevel(100, 6_000), createLevel(99, 20_000)],
        [createLevel(101, 7_000), createLevel(102, 30_000)],
      ),
    );

    expect(result.strongestBid?.price).toBe(99);
    expect(result.strongestAsk?.price).toBe(102);
    expect(result.strongestBid?.wallId).toBe(
      result.active.find((whale) => whale.price === 99)?.wallId,
    );
    expect(result.strongestAsk?.wallId).toBe(
      result.active.find((whale) => whale.price === 102)?.wallId,
    );
  });

  it('counts persistent and strong active walls after repeated scans', () => {
    const tracker = new WhaleTracker();
    const book = createBook(
      [createLevel(100, 10_000)],
      [createLevel(101, 10_000)],
    );

    tracker.scan(book);
    vi.advanceTimersByTime(60_000);
    const result = tracker.scan(book);

    expect(result.persistentWalls).toBe(2);
    expect(result.strongWalls).toBe(2);
    expect(result.trackedWalls).toBe(2);
  });
});
