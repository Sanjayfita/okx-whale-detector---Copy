import type { ExternalWhaleSignal } from '../../types/ExternalWhaleSignal';
import type {
  PolymarketMarket,
  PolymarketTrade,
} from './PolymarketPublicClient';

export interface PolymarketWhaleDetectorConfig {
  minimumLiquidityUsd: number;
  minimumTradeNotionalUsd: number;
  maximumTradeAgeMs: number;
}

const DEFAULT_CONFIG: PolymarketWhaleDetectorConfig = {
  minimumLiquidityUsd: 25_000,
  minimumTradeNotionalUsd: 10_000,
  maximumTradeAgeMs: 60 * 60 * 1_000,
};

const CRYPTO_KEYWORDS = [
  'bitcoin',
  'btc',
  'ethereum',
  'eth',
  'crypto',
  'solana',
  'sol',
  'xrp',
  'dogecoin',
  'doge',
  'stablecoin',
  'usdt',
  'usdc',
];

const MACRO_KEYWORDS = [
  'federal reserve',
  'fed rate',
  'interest rate',
  'rate cut',
  'inflation',
  'cpi',
  'recession',
  'sec',
  'etf',
];

const inferAsset = (text: string): string | undefined => {
  const normalized = text.toLowerCase();
  if (normalized.includes('bitcoin') || normalized.includes('btc')) return 'BTC';
  if (normalized.includes('ethereum') || normalized.includes('eth')) return 'ETH';
  if (normalized.includes('solana') || normalized.includes(' sol')) return 'SOL';
  if (normalized.includes('xrp')) return 'XRP';
  if (normalized.includes('dogecoin') || normalized.includes('doge')) return 'DOGE';
  if (normalized.includes('usdt')) return 'USDT';
  if (normalized.includes('usdc')) return 'USDC';
  return undefined;
};

export class PolymarketWhaleDetector {
  private readonly config: PolymarketWhaleDetectorConfig;

  public constructor(config: Partial<PolymarketWhaleDetectorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  public isRelevantMarket(market: PolymarketMarket): boolean {
    if (market.liquidity < this.config.minimumLiquidityUsd) {
      return false;
    }

    const text = `${market.question} ${market.category ?? ''}`.toLowerCase();
    return [...CRYPTO_KEYWORDS, ...MACRO_KEYWORDS].some((keyword) =>
      text.includes(keyword),
    );
  }

  public detect(
    trade: PolymarketTrade,
    market: PolymarketMarket,
    now = Date.now(),
  ): ExternalWhaleSignal | undefined {
    const notionalUsd = trade.size * trade.price;
    const occurredAt = trade.timestamp * 1_000;
    const ageMs = Math.max(0, now - occurredAt);

    if (
      !this.isRelevantMarket(market) ||
      notionalUsd < this.config.minimumTradeNotionalUsd ||
      ageMs > this.config.maximumTradeAgeMs
    ) {
      return undefined;
    }

    const outcomeIsNo = trade.outcome.trim().toLowerCase() === 'no';
    const supportsOutcome = trade.side === 'BUY';
    const bullish = outcomeIsNo ? !supportsOutcome : supportsOutcome;
    const direction = bullish ? 'BULLISH' : 'BEARISH';
    const tradeScale = Math.min(
      1,
      notionalUsd / Math.max(this.config.minimumTradeNotionalUsd * 5, 1),
    );
    const liquidityImpact = Math.min(
      1,
      notionalUsd / Math.max(market.liquidity, 1),
    );
    const confidence = Math.min(75, 35 + tradeScale * 25 + liquidityImpact * 15);
    const asset = inferAsset(`${market.question} ${market.category ?? ''}`);

    return {
      id: `polymarket:${trade.transactionHash}:${trade.asset}`,
      underlyingEventId: `polymarket:${trade.transactionHash}:${trade.asset}`,
      provider: 'POLYMARKET',
      category: 'PREDICTION_TRADE',
      direction,
      occurredAt,
      receivedAt: now,
      confidence,
      asset,
      notionalUsd,
      transactionHash: trade.transactionHash,
      description:
        `${trade.side} ${trade.outcome} on “${market.question}” ` +
        `for approximately $${notionalUsd.toFixed(2)}.`,
      evidence: [
        {
          provider: 'POLYMARKET',
          providerEventId: `${trade.transactionHash}:${trade.asset}`,
          receivedAt: now,
        },
      ],
      metadata: {
        marketConditionId: market.conditionId,
        marketSlug: market.slug,
        wallet: trade.proxyWallet,
        outcome: trade.outcome,
        side: trade.side,
        price: trade.price,
        size: trade.size,
        liquidityUsd: market.liquidity,
      },
    };
  }
}
