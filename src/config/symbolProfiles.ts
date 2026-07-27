import { appConfig, type AppConfig } from './appConfig';
import { validateAppConfig } from './validateAppConfig';

type SymbolConfigSection = Exclude<keyof AppConfig, 'reporting'>;

export type AppConfigOverride = {
  [Section in SymbolConfigSection]?: Partial<AppConfig[Section]>;
};

export interface SymbolProfile {
  symbol: string;
  config?: AppConfigOverride;
}

/*
 * Symbols inherit appConfig by default.
 * Add only the values that genuinely need to differ for a market.
 * Shared connection-wide reporting settings remain global.
 */
export const SYMBOL_PROFILES: readonly SymbolProfile[] = [
  { symbol: 'BTC-USDT' },
  { symbol: 'ETH-USDT' },
  { symbol: 'SOL-USDT' },
  { symbol: 'XRP-USDT' },
  { symbol: 'DOGE-USDT' },
];

const mergeConfig = (
  baseConfig: AppConfig,
  override: AppConfigOverride = {},
): AppConfig => ({
  whale: { ...baseConfig.whale, ...override.whale },
  tracker: { ...baseConfig.tracker, ...override.tracker },
  events: { ...baseConfig.events, ...override.events },
  behavior: { ...baseConfig.behavior, ...override.behavior },
  refill: { ...baseConfig.refill, ...override.refill },
  scoring: { ...baseConfig.scoring, ...override.scoring },
  market: { ...baseConfig.market, ...override.market },
  reporting: { ...baseConfig.reporting },
  history: { ...baseConfig.history, ...override.history },
});

export const resolveSymbolConfig = (
  symbol: string,
  profiles: readonly SymbolProfile[] = SYMBOL_PROFILES,
  baseConfig: AppConfig = appConfig,
): AppConfig => {
  const profile = profiles.find((candidate) => candidate.symbol === symbol);
  const resolvedConfig = mergeConfig(baseConfig, profile?.config);

  validateAppConfig(resolvedConfig);

  return resolvedConfig;
};
