import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import {
  WallDetector,
} from '../src/core/WallDetector';

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
    price.toString(),
  size,
  rawSize:
    size.toString(),
  notionalUSD:
    price * size,
  updatedAt:
    Date.now(),
});

const createOrderBook = (
  bids: OrderLevel[],
  asks: OrderLevel[] = [],
): OrderBook => ({
  bids: new Map(
    bids.map(
      level => [
        level.price,
        level,
      ],
    ),
  ),

  asks: new Map(
    asks.map(
      level => [
        level.price,
        level,
      ],
    ),
  ),

  lastSeqId: 1,
  status: 'SYNCED',
  initialized: true,
  updatedAt: Date.now(),
});

const createDetector = (): WallDetector =>
  new WallDetector({
    minNotionalUSD: 500_000,
    persistentAfterMs: 30_000,
    strongAfterMs: 120_000,

    /*
     * Prices within 0.1% may be
     * considered the same moving wall.
     */
    priceTolerancePercent: 0.1,

    removalGracePeriodMs: 2_000,
  });

describe(
  'WallDetector one-to-one matching',
  () => {
    beforeEach(() => {
      vi.useFakeTimers();

      vi.setSystemTime(
        new Date(
          '2026-07-25T12:00:00Z',
        ),
      );
    });

    it(
      'creates two walls for two nearby qualifying bid levels',
      () => {
        const detector =
          createDetector();

        /*
         * Both levels exceed $500,000.
         *
         * Their prices are also only
         * 0.05% apart, which is inside
         * the detector's 0.1% tolerance.
         */
        const orderBook =
          createOrderBook([
            createLevel(
              100,
              6_000,
            ),

            createLevel(
              100.05,
              6_000,
            ),
          ]);

        const walls =
          detector.detect(
            orderBook,
          );

        expect(
          walls,
        ).toHaveLength(2);

        expect(
          walls.map(
            wall =>
              wall.currentPrice,
          ),
        ).toEqual([
          100,
          100.05,
        ]);

        expect(
          new Set(
            walls.map(
              wall =>
                wall.wallId,
            ),
          ).size,
        ).toBe(2);
      },
    );

    it(
      'keeps one wall when an old wall moves slightly',
      () => {
        const detector =
          createDetector();

        const firstOrderBook =
          createOrderBook([
            createLevel(
              100,
              6_000,
            ),
          ]);

        const firstResult =
          detector.detect(
            firstOrderBook,
          );

        expect(
          firstResult,
        ).toHaveLength(1);

        const originalWall =
          firstResult[0];

        expect(
          originalWall,
        ).toBeDefined();

        if (!originalWall) {
          throw new Error(
            'Expected the original wall',
          );
        }

        const originalWallId =
          originalWall.wallId;

        const originalFirstSeen =
          originalWall.firstSeen;

        /*
         * Move time forward to prove
         * firstSeen remains unchanged.
         */
        vi.advanceTimersByTime(
          30_000,
        );

        /*
         * Move the price from 100.00
         * to 100.05.
         *
         * This is a 0.05% movement,
         * inside the 0.1% tolerance.
         */
        const movedOrderBook =
          createOrderBook([
            createLevel(
              100.05,
              6_100,
            ),
          ]);

        const secondResult =
          detector.detect(
            movedOrderBook,
          );

        expect(
          secondResult,
        ).toHaveLength(1);

        const movedWall =
          secondResult[0];

        expect(
          movedWall,
        ).toBeDefined();

        if (!movedWall) {
          throw new Error(
            'Expected the moved wall',
          );
        }

        expect(
          movedWall.wallId,
        ).toBe(
          originalWallId,
        );

        expect(
          movedWall.firstSeen,
        ).toBe(
          originalFirstSeen,
        );

        expect(
          movedWall.initialPrice,
        ).toBe(100);

        expect(
          movedWall.currentPrice,
        ).toBe(100.05);

        expect(
          movedWall.ageMs,
        ).toBe(30_000);
      },
    );
  },
);