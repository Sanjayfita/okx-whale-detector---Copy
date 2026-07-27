import type { QuoteCurrency } from './orderbook';

export enum InstType {
  SPOT = 'SPOT',
  FUTURE = 'FUTURE',
  SWAP = 'SWAP',
  OPTION = 'OPTION',
}

export type SupportedInstType = 'SPOT' | 'SWAP';

export interface MarketInstrumentConfig {
  instId: string;
  instType: SupportedInstType;
  quoteCurrency: QuoteCurrency;

  /*
   * Order-book size is base-asset quantity for SPOT.
   * For SWAP, it is a contract count, so this value must be
   * the amount of base asset represented by one contract.
   */
  baseUnitsPerSize: number;
}

export interface Instrument {
  instId: string;
  instType: InstType;
  baseCcy: string;
  quoteCcy: string;
  settleCcy?: string;
  ctType: string;
  ctVal: number;
  ctValCcy: string;
  ctMult?: number;
  tickSz: string;
  lotSz: string;
  minSz: string;
}
