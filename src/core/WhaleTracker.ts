import type {
  OrderBook,
  OrderLevel,
} from '../types/orderbook';

import type {
  Whale,
  WhaleSide,
  WhaleChange,
} from '../types/whale';

export interface WhaleScanResult {
  active: Whale[];

  trackedWalls: number;

  newWalls: number;

  persistentWalls: number;

  strongWalls: number;

  totalBidNotionalQuote: number;

  totalAskNotionalQuote: number;

  strongestBid?: Whale;

  strongestAsk?: Whale;

  newWhales: Whale[];

  removedWhales: Whale[];

  movedWhales: WhaleChange[];
}

interface TrackedWall {
  whale: Whale;

  firstSeenAt: number;

  lastSeenAt: number;

  initialNotionalQuote: number;

  maxNotionalQuote: number;

  updateCount: number;

  lastPrice: number;
}

export class WhaleTracker {
  private readonly trackedWalls =
    new Map<string, TrackedWall>();

  private readonly MIN_WHALE_NOTIONAL_QUOTE =
    500_000;

  private readonly PERSISTENT_WALL_AGE_SECONDS =
    30;

  private readonly STRONG_WALL_AGE_SECONDS =
    60;

  public scan(
    orderBook: OrderBook,
  ): WhaleScanResult {
    const now =
      Date.now();

    const currentWhales: Whale[] =
      [];

    const newWhales: Whale[] =
      [];

    const removedWhales: Whale[] =
      [];

    const movedWhales: WhaleChange[] =
      [];
      
    const currentKeys =
      new Set<string>();

    let totalBidNotionalQuote =
      0;

    let totalAskNotionalQuote =
      0;

    const processSide = (
      side: WhaleSide,

      levels: Map<number, OrderLevel>,
    ): void => {
      for (
        const level
        of levels.values()
      ) {
        if (
          level.notionalQuote <
          this.MIN_WHALE_NOTIONAL_QUOTE
        ) {
          continue;
        }

        const key =
          this.createWallKey(
            side,
            level.price,
          );

        currentKeys.add(
          key,
        );

        const existing =
          this.trackedWalls.get(
            key,
          );

        /*
         * NEW WALL
         */

        if (
          !existing
        ) {
          const whale: Whale = {
            side,

            price:
              level.price,

            size:
              level.size,

            notionalQuote:
              level.notionalQuote,

            detectedAt:
              level.updatedAt,

            firstSeenAt:
              now,

            lastSeenAt:
              now,

            ageSeconds:
              0,

            updateCount:
              1,

            maxNotionalQuote:
              level.notionalQuote,

            strength:
              this.calculateStrength(
                level.notionalQuote,

                0,
              ),
          };

          this.trackedWalls.set(
            key,
            {
              whale,

              firstSeenAt:
                now,

              lastSeenAt:
                now,

              initialNotionalQuote:
                level.notionalQuote,

              maxNotionalQuote:
                level.notionalQuote,

              updateCount:
                1,

              lastPrice:
                level.price,
            },
          );

          currentWhales.push(
            whale,
          );

          newWhales.push(
            whale,
          );

          if (
            side === 'BID'
          ) {
            totalBidNotionalQuote +=
              level.notionalQuote;
          } else {
            totalAskNotionalQuote +=
              level.notionalQuote;
          }

          continue;
        }

        /*
         * EXISTING WALL
         */

        existing.lastSeenAt =
          now;

        existing.updateCount++;

        existing.maxNotionalQuote =
          Math.max(
            existing.maxNotionalQuote,

            level.notionalQuote,
          );

        existing.lastPrice =
          level.price;

        const ageSeconds =
          Math.floor(
            (
              now -
              existing.firstSeenAt
            ) /
            1000,
          );

        const strength =
          this.calculateStrength(
            level.notionalQuote,

            ageSeconds,
          );

        const whale: Whale = {
          side,

          price:
            level.price,

          size:
            level.size,

          notionalQuote:
            level.notionalQuote,

          detectedAt:
            level.updatedAt,

          firstSeenAt:
            existing.firstSeenAt,

          lastSeenAt:
            existing.lastSeenAt,

          ageSeconds,

          updateCount:
            existing.updateCount,

          maxNotionalQuote:
            existing.maxNotionalQuote,

          strength,
        };

        existing.whale =
          whale;

        currentWhales.push(
          whale,
        );

        if (
          side === 'BID'
        ) {
          totalBidNotionalQuote +=
            level.notionalQuote;
        } else {
          totalAskNotionalQuote +=
            level.notionalQuote;
        }
      }
    };

    processSide(
      'BID',

      orderBook.bids,
    );

    processSide(
      'ASK',

      orderBook.asks,
    );

    /*
     * FIND REMOVED WALLS
     */

    const disappearedWalls: Whale[] =
      [];

    for (
      const [
        key,
        trackedWall,
      ]
      of this.trackedWalls
    ) {
      if (
        currentKeys.has(
          key,
        )
      ) {
        continue;
      }

      disappearedWalls.push(
        trackedWall.whale,
      );

      this.trackedWalls.delete(
        key,
      );
    }

    /*
     * DETECT MOVED WALLS
     *
     * A wall is considered MOVED when:
     *
     * 1. The old wall disappeared
     * 2. A new wall appeared
     * 3. Same side
     * 4. Price is close enough
     * 5. Size is approximately similar
     */

    const movedRemovedWhales =
      new Set<Whale>();

    const movedNewWhales =
      new Set<Whale>();

    for (
      const removed
      of disappearedWalls
    ) {
      const moved =
        newWhales.find(
          newWhale => {
            if (
              newWhale.side !==
              removed.side
            ) {
              return false;
            }

            const priceDifference =
              Math.abs(
                newWhale.price -
                removed.price,
              );

            const sizeRatio =
              newWhale.size /
              removed.size;

            return (
              priceDifference <=
              this.getMovementPriceTolerance(
                removed.price,
              ) &&

              sizeRatio >=
              0.8 &&

              sizeRatio <=
              1.2
            );
          },
        );

      if (
        !moved
      ) {
        continue;
      }

      movedRemovedWhales.add(
        removed,
      );

      movedNewWhales.add(
        moved,
      );

      movedWhales.push({
        type:
          'MOVED',

        side:
          removed.side,

        price:
          moved.price,

        previousPrice:
          removed.price,

        previousSize:
          removed.size,

        currentSize:
          moved.size,

        sizeDifference:
          moved.size -
          removed.size,

        previousNotionalQuote:
          removed.notionalQuote,

        currentNotionalQuote:
          moved.notionalQuote,

        timestamp:
          now,
      });
    }

    /*
     * FINAL NEW WALLS
     *
     * MOVED walls should not also
     * be counted as NEW walls.
     */

    const finalNewWhales =
      newWhales.filter(
        whale =>
          !movedNewWhales.has(
            whale,
          ),
      );

    /*
     * FINAL REMOVED WALLS
     *
     * MOVED walls should not also
     * be counted as REMOVED walls.
     */

    for (
      const removed
      of disappearedWalls
    ) {
      if (
        movedRemovedWhales.has(
          removed,
        )
      ) {
        continue;
      }

      removedWhales.push(
        removed,
      );
    }

    /*
     * PERSISTENCE
     */

    let persistentWalls =
      0;

    let strongWalls =
      0;

    for (
      const trackedWall
      of this.trackedWalls.values()
    ) {
      const ageSeconds =
        Math.floor(
          (
            now -
            trackedWall.firstSeenAt
          ) /
          1000,
        );

      if (
        ageSeconds >=
        this.PERSISTENT_WALL_AGE_SECONDS
      ) {
        persistentWalls++;
      }

      if (
        ageSeconds >=
        this.STRONG_WALL_AGE_SECONDS
      ) {
        strongWalls++;
      }
    }

    const strongestBid =
      this.findStrongest(
        currentWhales,

        'BID',
      );

    const strongestAsk =
      this.findStrongest(
        currentWhales,

        'ASK',
      );

    return {
      active:
        currentWhales,

      trackedWalls:
        this.trackedWalls.size,

      newWalls:
        finalNewWhales.length,

      persistentWalls,

      strongWalls,

      totalBidNotionalQuote,

      totalAskNotionalQuote,

      strongestBid,

      strongestAsk,

      newWhales:
        finalNewWhales,

      removedWhales,

      movedWhales,
    };
  }

  private createWallKey(
    side: WhaleSide,

    price: number,
  ): string {
    return (
      `${side}:${price}`
    );
  }

  private calculateStrength(
    notionalQuote: number,

    ageSeconds: number,
  ): number {
    let score =
      0;

    if (
      notionalQuote >=
      10_000_000
    ) {
      score +=
        50;
    } else if (
      notionalQuote >=
      5_000_000
    ) {
      score +=
        40;
    } else if (
      notionalQuote >=
      1_000_000
    ) {
      score +=
        25;
    } else {
      score +=
        10;
    }

    if (
      ageSeconds >=
      120
    ) {
      score +=
        50;
    } else if (
      ageSeconds >=
      60
    ) {
      score +=
        35;
    } else if (
      ageSeconds >=
      30
    ) {
      score +=
        20;
    } else if (
      ageSeconds >=
      10
    ) {
      score +=
        10;
    }

    return Math.min(
      score,

      100,
    );
  }

  private findStrongest(
    whales: Whale[],

    side: WhaleSide,
  ): Whale | undefined {
    return whales
      .filter(
        whale =>
          whale.side ===
          side,
      )
      .sort(
        (
          a,

          b,
        ) =>
          (
            b.strength ??
            0
          ) -
          (
            a.strength ??
            0
          ),
      )[0];
  }

  private getMovementPriceTolerance(
    price: number,
  ): number {
    if (
      price >=
      50_000
    ) {
      return 100;
    }

    if (
      price >=
      1_000
    ) {
      return 10;
    }

    if (
      price >=
      10
    ) {
      return 0.5;
    }

    return 0.01;
  }

  public getTrackedWalls(): Whale[] {
    return [
      ...this.trackedWalls.values(),
    ].map(
      trackedWall =>
        trackedWall.whale,
    );
  }

  public reset(): void {
    this.trackedWalls.clear();
  }
}