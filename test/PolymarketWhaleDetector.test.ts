import { describe, expect, it } from 'vitest';

import type {
  PolymarketMarket,
  PolymarketTrade,
} from '../src/external/providers/polymarket/PolymarketPublicClient';
import { PolymarketWhaleDetector } from '../src/external/providers/polymarket/PolymarketWhaleDetector';

const market: PolymarketMarket = {
  id: '1',
  conditionId: '0xmarket',
  question: 'Will Bitcoin exceed $100,000 this year?',
  slug: 'bitcoin-100k',
  liquidity: 100_000,
  volume: 1_000_000,
};

const trade: PolymarketTrade = {
  proxyWallet: '0xwallet',
  side: 'BUY',
  asset: 'yes-token',
  conditionId: market.conditionId,
  size: 40_000,
  price: 0.5,
  timestamp: 1_000,
  title: market.question,
  slug: market.slug,
  eventSlug: 'bitcoin-event',
  outcome: 'YES',
  outcomeIndex: 0,
  transactionHash: '0xtx',
};

describe('PolymarketWhaleDetector', () => {
  it('accepts liquid crypto markets', () => {
    const detector = new PolymarketWhaleDetector();
    expect(detector.isRelevantMarket(market)).toBe(true);
  });

  it('maps a large BUY YES trade to a bullish external signal', () => {
    const detector = new PolymarketWhaleDetector();
    const signal = detector.detect(trade, market, 1_000_000);

    expect(signal).toMatchObject({
      provider: 'POLYMARKET',
      category: 'PREDICTION_TRADE',
      direction: 'BULLISH',
      asset: 'BTC',
      notionalUsd: 20_000,
    });
  });

  it('maps a BUY NO trade to bearish direction', () => {
    const detector = new PolymarketWhaleDetector();
    const signal = detector.detect(
      { ...trade, outcome: 'NO' },
      market,
      1_000_000,
    );

    expect(signal?.direction).toBe('BEARISH');
  });

  it('rejects small, stale, or illiquid activity', () => {
    const detector = new PolymarketWhaleDetector({ maximumTradeAgeMs: 1_000 });

    expect(
      detector.detect({ ...trade, size: 100 }, market, 1_000_000),
    ).toBeUndefined();
    expect(
      detector.detect(trade, market, 2_100_001),
    ).toBeUndefined();
    expect(
      detector.detect(trade, { ...market, liquidity: 100 }, 1_000_000),
    ).toBeUndefined();
  });
});
