export type WhaleSide =
  | 'BID'
  | 'ASK';

export interface Whale {
  side: WhaleSide;

  price: number;

  size: number;

  notionalUSD: number;

  detectedAt: number;

  firstSeenAt?: number;

  lastSeenAt?: number;

  ageSeconds?: number;

  updateCount?: number;

  maxNotionalUSD?: number;

  strength?: number;
}

export interface WhaleThresholds {
  minNotionalUSD: number;
}

export type WhaleChangeType =
  | 'NEW'
  | 'INCREASED'
  | 'REDUCED'
  | 'REFILLED'
  | 'MOVED'
  | 'REMOVED';

export interface WhaleChange {
  type: WhaleChangeType;

  side: WhaleSide;

  price: number;

  previousPrice?: number;

  previousSize: number;

  currentSize: number;

  sizeDifference: number;

  previousNotionalUSD: number;

  currentNotionalUSD: number;

  timestamp: number;
}