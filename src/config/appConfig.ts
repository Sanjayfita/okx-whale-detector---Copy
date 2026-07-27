export interface AppConfig {
  whale: {
    minimumNotionalQuote: number;
    persistentAfterMs: number;
    strongAfterMs: number;
    movementPriceTolerancePercent: number;
  };
  events: {
    removalGraceMs: number;
    minimumChangePercent: number;
    minimumChangeNotional: number;
  };
  behavior: {
    spoofMaxAgeSeconds: number;
    persistentMinAgeSeconds: number;
    repeatedIncreaseCount: number;
    growthMultiplier: number;
  };
  refill: {
    dropThresholdPercent: number;
    recoveryThresholdPercent: number;
  };
  scoring: {
    maxScore: number;
    maxSizeScore: number;
    maxDistanceScore: number;
    maxPersistenceScore: number;
    maxStabilityScore: number;
    persistenceWindowMs: number;
    minimumScoredNotionalQuote: number;
    veryStrongThreshold: number;
    strongThreshold: number;
    moderateThreshold: number;
  };
  market: {
    neutralBandPercent: number;
  };
  reporting: {
    summaryIntervalMs: number;
  };
  history: {
    candleLimit: number;
  };
}

export const appConfig: AppConfig = {
  whale: {
    minimumNotionalQuote: 500_000,
    persistentAfterMs: 30_000,
    strongAfterMs: 120_000,
    movementPriceTolerancePercent: 0.1,
  },
  events: {
    removalGraceMs: 2_000,
    minimumChangePercent: 10,
    minimumChangeNotional: 100_000,
  },
  behavior: {
    spoofMaxAgeSeconds: 3,
    persistentMinAgeSeconds: 30,
    repeatedIncreaseCount: 3,
    growthMultiplier: 1.2,
  },
  refill: {
    dropThresholdPercent: 10,
    recoveryThresholdPercent: 90,
  },
  scoring: {
    maxScore: 100,
    maxSizeScore: 30,
    maxDistanceScore: 25,
    maxPersistenceScore: 25,
    maxStabilityScore: 20,
    persistenceWindowMs: 120_000,
    minimumScoredNotionalQuote: 500_000,
    veryStrongThreshold: 80,
    strongThreshold: 60,
    moderateThreshold: 35,
  },
  market: {
    neutralBandPercent: 10,
  },
  reporting: {
    summaryIntervalMs: 5_000,
  },
  history: {
    candleLimit: 100,
  },
};