import type { Whale } from '../types/whale';

export interface WhaleRefillEvent {
  whale: Whale;

  refillCount: number;

  previousNotionalUSD: number;

  currentNotionalUSD: number;

  refillAmountUSD: number;

  timestamp: number;
}

interface WhaleRefillHistory {
  lastNotionalUSD: number;

  lowestNotionalUSD: number;

  refillCount: number;

  lastRefillAt: number;
}

export class WhaleRefillDetector {
  private readonly history =
    new Map<string, WhaleRefillHistory>();

  private readonly refillThresholdPercent =
    10;

  private readonly recoveryThresholdPercent =
    90;

  public detect(
    whale: Whale,
  ): WhaleRefillEvent | undefined {
    const key =
      this.getKey(whale);

    const existing =
      this.history.get(key);

    if (!existing) {
      this.history.set(
        key,
        {
          lastNotionalUSD:
            whale.notionalUSD,

          lowestNotionalUSD:
            whale.notionalUSD,

          refillCount: 0,

          lastRefillAt: 0,
        },
      );

      return undefined;
    }

    const previousNotional =
      existing.lastNotionalUSD;

    const lowestNotional =
      existing.lowestNotionalUSD;

    const dropPercent =
      (
        (
          previousNotional -
          whale.notionalUSD
        ) /
        previousNotional
      ) * 100;

    /*
     * The whale became significantly smaller.
     */

    if (
      dropPercent >=
      this.refillThresholdPercent
    ) {
      existing.lowestNotionalUSD =
        Math.min(
          existing.lowestNotionalUSD,
          whale.notionalUSD,
        );

      existing.lastNotionalUSD =
        whale.notionalUSD;

      return undefined;
    }

    /*
     * The whale recovered after
     * becoming significantly smaller.
     */

    const recoveryPercent =
      (
        whale.notionalUSD /
        lowestNotional
      ) * 100;

    if (
      lowestNotional <
      previousNotional &&
      recoveryPercent >=
      this.recoveryThresholdPercent
    ) {
      const refillAmountUSD =
        whale.notionalUSD -
        lowestNotional;

      existing.refillCount += 1;

      existing.lastRefillAt =
        Date.now();

      existing.lastNotionalUSD =
        whale.notionalUSD;

      existing.lowestNotionalUSD =
        whale.notionalUSD;

      return {
        whale,

        refillCount:
          existing.refillCount,

        previousNotionalUSD:
          lowestNotional,

        currentNotionalUSD:
          whale.notionalUSD,

        refillAmountUSD,

        timestamp:
          Date.now(),
      };
    }

    existing.lastNotionalUSD =
      whale.notionalUSD;

    return undefined;
  }

  public getRefillCount(
    whale: Whale,
  ): number {
    const history =
      this.history.get(
        this.getKey(whale),
      );

    return (
      history?.refillCount ??
      0
    );
  }

  public reset(): void {
    this.history.clear();
  }

  private getKey(
    whale: Whale,
  ): string {
    return (
      `${whale.side}:` +
      `${whale.price}`
    );
  }
}