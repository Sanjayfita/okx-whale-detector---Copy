import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import {
  WhaleTracker,
} from '../src/core/WhaleTracker';

import type {
  OrderBook,
  OrderLevel,
} from '../src/types/orderbook';

const createLevel = (
  price: number,
  size: number,
): OrderLevel => ({
  price,

  rawPrice:
    String(price),

  size,

  rawSize:
    String(size),

  notionalQuote:
    price * size,

  quoteCurrency:
    'USDT',

  updatedAt:
    Date.now(),
});

const createBook = (
  bids:
    OrderLevel[] = [],

  asks:
    OrderLevel[] = [],
): OrderBook => ({
  bids:
    new Map(
      bids.map(
        level => [
          level.price,
          level,
        ],
      ),
    ),

  asks:
    new Map(
      asks.map(
        level => [
          level.price,
          level,
        ],
      ),
    ),

  lastSeqId:
    1,

  status:
    'SYNCED',

  initialized:
    true,

  updatedAt:
    Date.now(),
});

describe(
  'WhaleTracker stable wall identity',
  () => {
    beforeEach(() => {
      vi.useFakeTimers();

      vi.setSystemTime(
        new Date(
          '2026-07-26T00:00:00Z',
        ),
      );
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it(
      'keeps wallId and firstSeenAt when a wall moves slightly',
      () => {
        const tracker =
          new WhaleTracker();

        const first =
          tracker.scan(
            createBook([
              createLevel(
                100,
                10_000,
              ),
            ]),
          );

        const original =
          first.active[0];

        expect(
          original,
        ).toBeDefined();

        if (!original) {
          throw new Error(
            'Expected original whale',
          );
        }

        vi.advanceTimersByTime(
          30_000,
        );

        const second =
          tracker.scan(
            createBook([
              createLevel(
                100.01,
                10_000,
              ),
            ]),
          );

        const moved =
          second.active[0];

        expect(
          moved,
        ).toBeDefined();

        if (!moved) {
          throw new Error(
            'Expected moved whale',
          );
        }

        expect(
          moved.wallId,
        ).toBe(
          original.wallId,
        );

        expect(
          moved.firstSeenAt,
        ).toBe(
          original.firstSeenAt,
        );

        expect(
          moved.ageSeconds,
        ).toBe(30);

        expect(
          second.movedWhales,
        ).toHaveLength(1);

        expect(
          second.movedWhales[0]
            ?.wallId,
        ).toBe(
          original.wallId,
        );

        expect(
          second.newWhales,
        ).toHaveLength(0);

        expect(
          second.removedWhales,
        ).toHaveLength(0);
      },
    );

    it(
      'does not reuse one new wall for two old walls',
      () => {
        const tracker =
          new WhaleTracker();

        tracker.scan(
          createBook([
            createLevel(
              100,
              10_000,
            ),

            createLevel(
              100.02,
              10_000,
            ),
          ]),
        );

        const result =
          tracker.scan(
            createBook([
              createLevel(
                100.01,
                10_000,
              ),
            ]),
          );

        expect(
          result.movedWhales,
        ).toHaveLength(1);
      },
    );
  },
);