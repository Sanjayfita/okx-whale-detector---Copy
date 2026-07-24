import type { Whale } from '../types/whale';

export type WhaleStrength =
  | 'WEAK'
  | 'MODERATE'
  | 'STRONG'
  | 'VERY_STRONG';

export interface WhaleScore {
  whale: Whale;

  totalScore: number;

  strength: WhaleStrength;

  components: {
    sizeScore: number;
    distanceScore: number;
    persistenceScore: number;
    stabilityScore: number;
  };

  explanation: string[];
}

export interface WhaleScoreEngineConfig {
  maxScore: number;

  maxSizeScore: number;
  maxDistanceScore: number;
  maxPersistenceScore: number;
  maxStabilityScore: number;

  persistenceWindowMs: number;
}

interface WhaleHistory {
  firstSeen: number;
  lastSeen: number;

  highestNotional: number;
  lowestNotional: number;

  lastPrice: number;
}

export class WhaleScoreEngine {
  private readonly config: WhaleScoreEngineConfig;

  private readonly history =
    new Map<string, WhaleHistory>();

  constructor(
    config: WhaleScoreEngineConfig = {
      maxScore: 100,

      maxSizeScore: 30,
      maxDistanceScore: 25,
      maxPersistenceScore: 25,
      maxStabilityScore: 20,

      persistenceWindowMs: 120_000,
    },
  ) {
    this.config = config;
  }

  public score(
    whale: Whale,
    currentPrice: number,
  ): WhaleScore {
    const now =
      Date.now();

    const key =
      this.getKey(whale);

    let history =
      this.history.get(key);

    if (!history) {
      history = {
        firstSeen: now,
        lastSeen: now,

        highestNotional:
          whale.notionalUSD,

        lowestNotional:
          whale.notionalUSD,

        lastPrice:
          whale.price,
      };

      this.history.set(
        key,
        history,
      );
    }

    history.lastSeen =
      now;

    history.highestNotional =
      Math.max(
        history.highestNotional,
        whale.notionalUSD,
      );

    history.lowestNotional =
      Math.min(
        history.lowestNotional,
        whale.notionalUSD,
      );

    /*
     * 1. SIZE SCORE
     */

    const sizeScore =
      this.calculateSizeScore(
        whale.notionalUSD,
      );

    /*
     * 2. DISTANCE SCORE
     */

    const distanceScore =
      this.calculateDistanceScore(
        whale.price,
        currentPrice,
      );

    /*
     * 3. PERSISTENCE SCORE
     */

    const ageMs =
      now -
      history.firstSeen;

    const persistenceScore =
      Math.min(
        ageMs /
        this.config.persistenceWindowMs,

        1,
      ) *
      this.config.maxPersistenceScore;

    /*
     * 4. STABILITY SCORE
     */

    const stabilityScore =
      this.calculateStabilityScore(
        whale,
        history,
      );

    const rawScore =
      sizeScore +
      distanceScore +
      persistenceScore +
      stabilityScore;

    const totalScore =
      Math.min(
        Math.round(
          rawScore,
        ),

        this.config.maxScore,
      );

    const strength =
      this.getStrength(
        totalScore,
      );

    const explanation =
      this.buildExplanation(
        totalScore,
        sizeScore,
        distanceScore,
        persistenceScore,
        stabilityScore,
      );

    history.lastPrice =
      whale.price;

    return {
      whale,

      totalScore,

      strength,

      components: {
        sizeScore:
          Math.round(
            sizeScore,
          ),

        distanceScore:
          Math.round(
            distanceScore,
          ),

        persistenceScore:
          Math.round(
            persistenceScore,
          ),

        stabilityScore:
          Math.round(
            stabilityScore,
          ),
      },

      explanation,
    };
  }

  public scoreMany(
    whales: Whale[],
    currentPrice: number,
  ): WhaleScore[] {
    return whales.map(
      whale =>
        this.score(
          whale,
          currentPrice,
        ),
    );
  }

  private calculateSizeScore(
    notionalUSD: number,
  ): number {
    /*
     * $500k = small whale
     * $1M   = strong whale
     * $5M+  = maximum score
     */

    const score =
      Math.log10(
        Math.max(
          notionalUSD,
          500_000,
        ) /
        500_000,
      ) * 30;

    return Math.min(
      score,
      this.config.maxSizeScore,
    );
  }

  private calculateDistanceScore(
    whalePrice: number,
    currentPrice: number,
  ): number {
    const distancePercent =
      Math.abs(
        (
          whalePrice -
          currentPrice
        ) /
        currentPrice,
      ) *
      100;

    /*
     * 0.00% away = 25 points
     * 0.25% away = ~20 points
     * 1.00% away = ~12 points
     * 5.00% away = ~4 points
     */

    const score =
      this.config.maxDistanceScore /
      (
        1 +
        distancePercent
      );

    return Math.min(
      score,
      this.config.maxDistanceScore,
    );
  }

  private calculateStabilityScore(
    whale: Whale,
    history: WhaleHistory,
  ): number {
    if (
      history.highestNotional ===
      0
    ) {
      return 0;
    }

    const range =
      history.highestNotional -
      history.lowestNotional;

    const volatility =
      range /
      history.highestNotional;

    /*
     * Stable whale = high score
     * Constantly changing whale = lower score
     */

    const stability =
      1 -
      Math.min(
        volatility,
        1,
      );

    return (
      stability *
      this.config.maxStabilityScore
    );
  }

  private getStrength(
    score: number,
  ): WhaleStrength {
    if (
      score >= 80
    ) {
      return 'VERY_STRONG';
    }

    if (
      score >= 60
    ) {
      return 'STRONG';
    }

    if (
      score >= 35
    ) {
      return 'MODERATE';
    }

    return 'WEAK';
  }

  private buildExplanation(
    totalScore: number,
    sizeScore: number,
    distanceScore: number,
    persistenceScore: number,
    stabilityScore: number,
  ): string[] {
    const explanation: string[] = [];

    if (
      sizeScore >= 20
    ) {
      explanation.push(
        'Large order size',
      );
    }

    if (
      distanceScore >= 20
    ) {
      explanation.push(
        'Close to market price',
      );
    }

    if (
      persistenceScore >= 15
    ) {
      explanation.push(
        'Persistent order book presence',
      );
    }

    if (
      stabilityScore >= 15
    ) {
      explanation.push(
        'Stable liquidity',
      );
    }

    if (
      totalScore < 35
    ) {
      explanation.push(
        'Low-confidence whale',
      );
    }

    return explanation;
  }

  private getKey(
    whale: Whale,
  ): string {
    return (
      `${whale.side}:` +
      `${whale.price}`
    );
  }

  public reset(): void {
    this.history.clear();
  }
}