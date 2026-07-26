import type { Whale } from '../types/whale';

export type WhaleBehaviorType =
  | 'SPOOF'
  | 'PERSISTENT'
  | 'ACCUMULATION'
  | 'DISTRIBUTION';

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

  highestNotionalQuote: number;

  lowestNotionalQuote: number;

  previousNotionalQuote: number;

  increaseCount: number;

  decreaseCount: number;

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

public prune(
  activeWhales: Whale[],
): void {
  const activeKeys =
    new Set(
      activeWhales.map(
        whale =>
          this.getKey(whale),
      ),
    );

  for (const key of this.history.keys()) {
    if (!activeKeys.has(key)) {
      this.history.delete(key);
    }
  }
}

 public analyze(
  whale: Whale,
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

        highestNotionalQuote:
          whale.notionalQuote,

        lowestNotionalQuote:
          whale.notionalQuote,

        previousNotionalQuote:
          whale.notionalQuote,

        increaseCount:
          0,

        decreaseCount:
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
      history.previousNotionalQuote;

    /*
     * Track size changes
     */

    if (
      whale.notionalQuote >
      previousNotional
    ) {
      history.increaseCount++;
    }

    if (
      whale.notionalQuote <
      previousNotional
    ) {
      history.decreaseCount++;
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

    

    /*
     * ACCUMULATION
     */

    if (
      whale.side ===
      'BID' &&
      history.increaseCount >= 3 &&
      whale.notionalQuote >
      history.lowestNotionalQuote *
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
      whale.notionalQuote >
      history.lowestNotionalQuote *
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
     * Update history
     */

    history.lastSeenAt =
      now;

    history.highestNotionalQuote =
      Math.max(
        history.highestNotionalQuote,
        whale.notionalQuote,
      );

    history.lowestNotionalQuote =
      Math.min(
        history.lowestNotionalQuote,
        whale.notionalQuote,
      );

    history.previousNotionalQuote =
      whale.notionalQuote;

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