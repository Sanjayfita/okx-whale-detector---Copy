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

  it('maps a large BUY YES trade on a positive question to bullish', () => {
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

  it('maps BUY NO on a positive question to bearish direction', () => {
    const detector = new PolymarketWhaleDetector();
    const signal = detector.detect(
      { ...trade, outcome: 'NO' },
      market,
      1_000_000,
    );

    expect(signal?.direction).toBe('BEARISH');
  });

  it('reverses direction for negatively worded questions', () => {
    const detector = new PolymarketWhaleDetector();
    const negativeMarket = {
      ...market,
      question: 'Will Bitcoin crash below $50,000 this year?',
    };

    expect(detector.detect(trade, negativeMarket, 1_000_000)?.direction).toBe(
      'BEARISH',
    );
    expect(
      detector.detect(
        { ...trade, outcome: 'NO' },
        negativeMarket,
        1_000_000,
      )?.direction,
    ).toBe('BULLISH');
  });

  it('maps direct UP and DOWN outcomes without question polarity', () => {
    const detector = new PolymarketWhaleDetector();
    const directionalMarket = {
      ...market,
      question: 'Bitcoin Up or Down - July 27?',
    };

    expect(
      detector.interpretTrade(
        { ...trade, outcome: 'Up', side: 'BUY' },
        directionalMarket,
      ).direction,
    ).toBe('BULLISH');
    expect(
      detector.interpretTrade(
        { ...trade, outcome: 'Down', side: 'BUY' },
        directionalMarket,
      ).direction,
    ).toBe('BEARISH');
    expect(
      detector.interpretTrade(
        { ...trade, outcome: 'Up', side: 'SELL' },
        directionalMarket,
      ).direction,
    ).toBe('BEARISH');
    expect(
      detector.interpretTrade(
        { ...trade, outcome: 'Down', side: 'SELL' },
        directionalMarket,
      ).direction,
    ).toBe('BULLISH');
  });

  it('keeps ambiguous YES or NO wording directionally unknown', () => {
    const detector = new PolymarketWhaleDetector();
    const ambiguousMarket = {
      ...market,
      question: 'What will happen to Bitcoin this month?',
    };

    expect(detector.detect(trade, ambiguousMarket, 1_000_000)?.direction).toBe(
      'UNKNOWN',
    );
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
