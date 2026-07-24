export enum InstType {
  SPOT = 'SPOT',
  FUTURE = 'FUTURE',
  SWAP = 'SWAP',
  OPTION = 'OPTION',
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