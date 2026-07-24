import type { Whale } from '../types/whale';

export type WhaleBehaviorType =
  | 'SPOOF'
  | 'PERSISTENT'
  | 'REFILLING'
  | 'ACCUMULATION'
  | 'DISTRIBUTION'
  | 'ABSORPTION';

export interface WhaleBehavior {
  type: WhaleBehaviorType;

  whale: Whale;

  confidence: number;

  reason: string;

  detectedAt: number;
}

interface WhaleBehaviorHistory {
  firstSeenAt: number;

  lastSeenAt: number;

  highestNotionalUSD: number;

  lowestNotionalUSD: number;

  previousNotionalUSD: number;

  increaseCount: number;

  decreaseCount: number;

  refillCount: number;

  lastPrice: number;
}

export class WhaleBehaviorEngine {
  private readonly history =
    new Map<string, WhaleBehaviorHistory>();

  private readonly SPOOF_MAX_AGE_SECONDS =
    3;

  private readonly PERSISTENT_MIN_AGE_SECONDS =
    30;

  private readonly REFILL_MIN_COUNT =
    2;

  public analyze(
    whale: Whale,
    currentPrice: number,
  ): WhaleBehavior[] {
    const now =
      Date.now();

    const key =
      this.getKey(
        whale,
      );

    let history =
      this.history.get(
        key,
      );

    if (
      !history
    ) {
      history = {
        firstSeenAt:
          whale.firstSeenAt ??
          now,

        lastSeenAt:
          now,

        highestNotionalUSD:
          whale.notionalUSD,

        lowestNotionalUSD:
          whale.notionalUSD,

        previousNotionalUSD:
          whale.notionalUSD,

        increaseCount:
          0,

        decreaseCount:
          0,

        refillCount:
          0,

        lastPrice:
          whale.price,
      };

      this.history.set(
        key,
        history,
      );
    }

    const behaviors:
      WhaleBehavior[] = [];

    const ageSeconds =
      whale.ageSeconds ??
      Math.floor(
        (
          now -
          history.firstSeenAt
        ) /
        1000,
      );

    const previousNotional =
      history.previousNotionalUSD;

    /*
     * Track size changes
     */

    if (
      whale.notionalUSD >
      previousNotional
    ) {
      history.increaseCount++;
    }

    if (
      whale.notionalUSD <
      previousNotional
    ) {
      history.decreaseCount++;
    }

    /*
     * REFILL DETECTION
     *
     * Wall decreases and
     * later grows again.
     */

    if (
      history.decreaseCount >= 1 &&
      history.increaseCount >= 2
    ) {
      history.refillCount++;
    }

    /*
     * SPOOF DETECTION
     *
     * Very young wall that
     * disappears is handled
     * by analyzeRemoval().
     */

    /*
     * PERSISTENT WALL
     */

    if (
      ageSeconds >=
      this.PERSISTENT_MIN_AGE_SECONDS
    ) {
      behaviors.push({
        type:
          'PERSISTENT',

        whale,

        confidence:
          Math.min(
            100,
            50 +
            ageSeconds,
          ),

        reason:
          `Whale has remained active for ${ageSeconds}s`,

        detectedAt:
          now,
      });
    }

    /*
     * REFILLING
     */

    if (
      history.refillCount >=
      this.REFILL_MIN_COUNT
    ) {
      behaviors.push({
        type:
          'REFILLING',

        whale,

        confidence:
          Math.min(
            100,
            60 +
            history.refillCount *
            10,
          ),

        reason:
          `Whale repeatedly replenished liquidity (${history.refillCount} refill cycles)`,

        detectedAt:
          now,
      });
    }

    /*
     * ACCUMULATION
     */

    if (
      whale.side ===
      'BID' &&
      history.increaseCount >= 3 &&
      whale.notionalUSD >
      history.lowestNotionalUSD *
      1.2
    ) {
      behaviors.push({
        type:
          'ACCUMULATION',

        whale,

        confidence:
          Math.min(
            100,
            60 +
            history.increaseCount *
            5,
          ),

        reason:
          'Bid liquidity is repeatedly increasing',

        detectedAt:
          now,
      });
    }

    /*
     * DISTRIBUTION
     */

    if (
      whale.side ===
      'ASK' &&
      history.increaseCount >= 3 &&
      whale.notionalUSD >
      history.lowestNotionalUSD *
      1.2
    ) {
      behaviors.push({
        type:
          'DISTRIBUTION',

        whale,

        confidence:
          Math.min(
            100,
            60 +
            history.increaseCount *
            5,
          ),

        reason:
          'Ask liquidity is repeatedly increasing',

        detectedAt:
          now,
      });
    }

    /*
     * ABSORPTION
     */

    const distancePercent =
      Math.abs(
        (
          whale.price -
          currentPrice
        ) /
        currentPrice,
      ) *
      100;

    if (
      distancePercent <=
      0.25 &&
      ageSeconds >=
      10
    ) {
      behaviors.push({
        type:
          'ABSORPTION',

        whale,

        confidence:
          Math.min(
            100,
            60 +
            ageSeconds,
          ),

        reason:
          'Large liquidity remains close to market price',

        detectedAt:
          now,
      });
    }

    /*
     * Update history
     */

    history.lastSeenAt =
      now;

    history.highestNotionalUSD =
      Math.max(
        history.highestNotionalUSD,
        whale.notionalUSD,
      );

    history.lowestNotionalUSD =
      Math.min(
        history.lowestNotionalUSD,
        whale.notionalUSD,
      );

    history.previousNotionalUSD =
      whale.notionalUSD;

    history.lastPrice =
      whale.price;

    return behaviors;
  }

  public analyzeRemoval(
    whale: Whale,
  ): WhaleBehavior | undefined {
    const now =
      Date.now();

    const ageSeconds =
      whale.ageSeconds ??
      0;

    if (
      ageSeconds <=
      this.SPOOF_MAX_AGE_SECONDS
    ) {
      return {
        type:
          'SPOOF',

        whale,

        confidence:
          85,

        reason:
          `Large whale disappeared after only ${ageSeconds}s`,

        detectedAt:
          now,
      };
    }

    return undefined;
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