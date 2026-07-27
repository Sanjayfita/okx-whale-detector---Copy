import type { Whale } from '../types/whale';

export type WhaleBehaviorType =
  | 'SPOOF'
  | 'PERSISTENT'
  | 'REFILLING'
  | 'ACCUMULATION'
  | 'DISTRIBUTION';

export interface WhaleBehavior {
  type: WhaleBehaviorType;
  whale: Whale;
  confidence: number;
  reason: string;
  detectedAt: number;
}

export interface WhaleBehaviorConfig {
  spoofMaxAgeSeconds: number;
  persistentMinAgeSeconds: number;
  repeatedIncreaseCount: number;
  growthMultiplier: number;
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

const DEFAULT_CONFIG: WhaleBehaviorConfig = {
  spoofMaxAgeSeconds: 3,
  persistentMinAgeSeconds: 30,
  repeatedIncreaseCount: 3,
  growthMultiplier: 1.2,
};

export class WhaleBehaviorEngine {
  private readonly history = new Map<string, WhaleBehaviorHistory>();
  private readonly config: WhaleBehaviorConfig;

  public constructor(config: Partial<WhaleBehaviorConfig> = {}) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    };
  }

  public prune(activeWhales: Whale[]): void {
    const activeKeys = new Set(activeWhales.map((whale) => this.getKey(whale)));

    for (const key of this.history.keys()) {
      if (!activeKeys.has(key)) {
        this.history.delete(key);
      }
    }
  }

  public analyze(whale: Whale): WhaleBehavior[] {
    const now = Date.now();
    const key = this.getKey(whale);
    let history = this.history.get(key);

    if (!history) {
      history = {
        firstSeenAt: whale.firstSeenAt ?? now,
        lastSeenAt: now,
        highestNotionalQuote: whale.notionalQuote,
        lowestNotionalQuote: whale.notionalQuote,
        previousNotionalQuote: whale.notionalQuote,
        increaseCount: 0,
        decreaseCount: 0,
        lastPrice: whale.price,
      };

      this.history.set(key, history);
    }

    const behaviors: WhaleBehavior[] = [];
    const ageSeconds =
      whale.ageSeconds ?? Math.floor((now - history.firstSeenAt) / 1000);
    const previousNotional = history.previousNotionalQuote;

    if (whale.notionalQuote > previousNotional) {
      history.increaseCount++;
    }

    if (whale.notionalQuote < previousNotional) {
      history.decreaseCount++;
    }

    if (ageSeconds >= this.config.persistentMinAgeSeconds) {
      behaviors.push({
        type: 'PERSISTENT',
        whale,
        confidence: Math.min(100, 50 + ageSeconds),
        reason: `Whale has remained active for ${ageSeconds}s`,
        detectedAt: now,
      });
    }

    const hasRepeatedGrowth =
      history.increaseCount >= this.config.repeatedIncreaseCount &&
      whale.notionalQuote >
        history.lowestNotionalQuote * this.config.growthMultiplier;

    if (whale.side === 'BID' && hasRepeatedGrowth) {
      behaviors.push({
        type: 'ACCUMULATION',
        whale,
        confidence: Math.min(100, 60 + history.increaseCount * 5),
        reason: 'Bid liquidity is repeatedly increasing',
        detectedAt: now,
      });
    }

    if (whale.side === 'ASK' && hasRepeatedGrowth) {
      behaviors.push({
        type: 'DISTRIBUTION',
        whale,
        confidence: Math.min(100, 60 + history.increaseCount * 5),
        reason: 'Ask liquidity is repeatedly increasing',
        detectedAt: now,
      });
    }

    history.lastSeenAt = now;
    history.highestNotionalQuote = Math.max(
      history.highestNotionalQuote,
      whale.notionalQuote,
    );
    history.lowestNotionalQuote = Math.min(
      history.lowestNotionalQuote,
      whale.notionalQuote,
    );
    history.previousNotionalQuote = whale.notionalQuote;
    history.lastPrice = whale.price;

    return behaviors;
  }

  public analyzeRemoval(whale: Whale): WhaleBehavior | undefined {
    const now = Date.now();
    const ageSeconds = whale.ageSeconds ?? 0;

    if (ageSeconds <= this.config.spoofMaxAgeSeconds) {
      return {
        type: 'SPOOF',
        whale,
        confidence: 85,
        reason: `Large whale disappeared after only ${ageSeconds}s`,
        detectedAt: now,
      };
    }

    return undefined;
  }

  public reset(): void {
    this.history.clear();
  }

  private getKey(whale: Whale): string {
    return whale.wallId;
  }
}
