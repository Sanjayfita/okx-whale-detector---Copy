import { appConfig, type AppConfig } from './appConfig';
import { validateAppConfig } from './validateAppConfig';
import type { MarketInstrumentConfig } from '../types/instrument';

type SymbolConfigSection = Exclude<keyof AppConfig, 'reporting'>;

export type AppConfigOverride = {
  [Section in SymbolConfigSection]?: Partial<AppConfig[Section]>;
};

export interface SymbolProfile {
  symbol: string;
  instrument?: Omit<MarketInstrumentConfig, 'instId'>;
  config?: AppConfigOverride;
}

const DEFAULT_SPOT_INSTRUMENT: Omit<MarketInstrumentConfig, 'instId'> = {
  instType: 'SPOT',
  quoteCurrency: 'USDT',
  baseUnitsPerSize: 1,
};

/*
 * Symbols inherit appConfig by default.
 * Add only the values that genuinely need to differ for a market.
 * Shared connection-wide reporting settings remain global.
 *
 * For SWAP instruments, baseUnitsPerSize is the base-asset amount
 * represented by one contract. It is used to convert order-book
 * contract counts into quote-currency notional.
 */
export const SYMBOL_PROFILES: readonly SymbolProfile[] = [
  { symbol: 'BTC-USDT' },
  { symbol: 'ETH-USDT' },
  { symbol: 'SOL-USDT' },
  { symbol: 'XRP-USDT' },
  { symbol: 'DOGE-USDT' },
  {
    symbol: 'XAU-USDT-SWAP',
    instrument: {
      instType: 'SWAP',
      quoteCurrency: 'USDT',
      baseUnitsPerSize: 0.001,
    },
  },
  {
    symbol: 'XAG-USDT-SWAP',
    instrument: {
      instType: 'SWAP',
      quoteCurrency: 'USDT',
      baseUnitsPerSize: 0.01,
    },
  },
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

export const resolveMarketInstrument = (
  symbol: string,
  profiles: readonly SymbolProfile[] = SYMBOL_PROFILES,
): MarketInstrumentConfig => {
  const profile = profiles.find((candidate) => candidate.symbol === symbol);
  const instrument = profile?.instrument ?? DEFAULT_SPOT_INSTRUMENT;

  if (
    !Number.isFinite(instrument.baseUnitsPerSize) ||
    instrument.baseUnitsPerSize <= 0
  ) {
    throw new Error(
      `Invalid instrument configuration for ${symbol}: ` +
        'baseUnitsPerSize must be greater than 0',
    );
  }

  return {
    instId: symbol,
    ...instrument,
  };
};
