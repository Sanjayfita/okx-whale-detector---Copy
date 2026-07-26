import type {
  OrderBook,
  OrderLevel,
} from '../types/orderbook';

import {
  WallStatus,
  WallSide,
  type Wall,
} from '../types/wall';

export interface WallDetectorConfig {
  minNotionalQuote: number;
  persistentAfterMs: number;
  strongAfterMs: number;
  priceTolerancePercent: number;
  removalGracePeriodMs: number;
}

export class WallDetector {
  private readonly walls =
    new Map<string, Wall>();

  private readonly config:
    WallDetectorConfig;

  constructor(
  config: WallDetectorConfig = {
    minNotionalQuote: 500_000,
    persistentAfterMs: 30_000,
    strongAfterMs: 120_000,
    priceTolerancePercent: 0.1,
    removalGracePeriodMs: 2_000,
  },
) {
    this.config = config;
  }

  public detect(
    orderBook: OrderBook,
  ): Wall[] {
    const matchedWallKeys =
      new Set<string>();

    this.processSide(
      WallSide.BUY,
      orderBook.bids,
      matchedWallKeys,
    );

    this.processSide(
      WallSide.SELL,
      orderBook.asks,
      matchedWallKeys,
    );

    this.removeMissingWalls(
      matchedWallKeys,
    );

    return [
      ...this.walls.values(),
    ];
  }

  private processSide(
    side: WallSide,
    levels: Map<number, OrderLevel>,
    matchedWallKeys: Set<string>,
  ): void {
    for (
      const level of levels.values()
    ) {
      if (
        level.notionalQuote <
        this.config.minNotionalQuote
      ) {
        continue;
      }

      const existingWall =
  this.findNearbyWall(
    side,
    level.price,
    matchedWallKeys,
  );

      if (existingWall) {
        matchedWallKeys.add(
          existingWall.wallId,
        );

        this.updateWall(
          existingWall,
          level,
        );

        continue;
      }

      const now =
        Date.now();

      const wallId =
        this.createWallId(
          side,
          level.price,
        );

      const wall: Wall = {
        wallId,
        side,
        initialPrice: level.price,
        currentPrice: level.price,
        initialNotional:
          level.notionalQuote,
        currentNotional:
          level.notionalQuote,
        highestNotional:
          level.notionalQuote,
        lowestNotional:
          level.notionalQuote,
        firstSeen: now,
        lastSeen: now,
        ageMs: 0,
        priceMovementPercent: 0,
        notionalChangePercent: 0,
        status: WallStatus.NEW,
      };

      this.walls.set(
        wallId,
        wall,
      );

      matchedWallKeys.add(
        wallId,
      );
    }
  }

  private findNearbyWall(
  side: WallSide,
  price: number,
  matchedWallKeys: Set<string>,
): Wall | undefined {
  let closestWall:
    Wall | undefined;

  let closestDistance =
    Number.POSITIVE_INFINITY;

  for (const wall of this.walls.values()) {
    if (
      wall.side !== side ||
      matchedWallKeys.has(
        wall.wallId,
      )
    ) {
      continue;
    }

    const distancePercent =
      Math.abs(
        (
          (
            price -
            wall.currentPrice
          ) /
          wall.currentPrice
        ) * 100,
      );

    if (
      distancePercent <=
        this.config.priceTolerancePercent &&
      distancePercent <
        closestDistance
    ) {
      closestWall = wall;
      closestDistance =
        distancePercent;
    }
  }

  return closestWall;
}

  private updateWall(
    wall: Wall,
    level: OrderLevel,
  ): void {
    const now =
      Date.now();

    wall.currentPrice =
      level.price;

    wall.currentNotional =
      level.notionalQuote;

    wall.lastSeen =
      now;

    wall.ageMs =
      now -
      wall.firstSeen;

    wall.highestNotional =
      Math.max(
        wall.highestNotional,
        level.notionalQuote,
      );

    wall.lowestNotional =
      Math.min(
        wall.lowestNotional,
        level.notionalQuote,
      );

    wall.priceMovementPercent =
      Math.abs(
        (
          (
            wall.currentPrice -
            wall.initialPrice
          ) /
          wall.initialPrice
        ) * 100,
      );

    wall.notionalChangePercent =
      (
        (
          wall.currentNotional -
          wall.initialNotional
        ) /
        wall.initialNotional
      ) * 100;

    if (
      wall.ageMs >=
      this.config.strongAfterMs
    ) {
      wall.status =
        WallStatus.STRONG;
    } else if (
      wall.ageMs >=
      this.config.persistentAfterMs
    ) {
      wall.status =
        WallStatus.PERSISTENT;
    } else {
      wall.status =
        WallStatus.ACTIVE;
    }
  }

  private removeMissingWalls(
  matchedWallKeys: Set<string>,
): void {
  const now =
    Date.now();

  for (
    const [
      key,
      wall,
    ]
    of this.walls
  ) {
    if (
      matchedWallKeys.has(key)
    ) {
      continue;
    }

    const timeSinceLastSeen =
      now -
      wall.lastSeen;

    if (
      timeSinceLastSeen >=
      this.config.removalGracePeriodMs
    ) {
      this.walls.delete(key);
    }
  }
}

  private createWallId(
    side: WallSide,
    price: number,
  ): string {
    return `${side}:${price}`;
  }
}