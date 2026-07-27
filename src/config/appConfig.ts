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
  reporting: {
    summaryIntervalMs: 5_000,
  },
  history: {
    candleLimit: 100,
  },
};
