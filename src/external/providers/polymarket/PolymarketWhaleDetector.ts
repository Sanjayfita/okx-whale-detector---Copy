import type {
  ExternalSignalDirection,
  ExternalWhaleSignal,
} from '../../types/ExternalWhaleSignal';
import type {
  PolymarketMarket,
  PolymarketTrade,
} from './PolymarketPublicClient';

export interface PolymarketWhaleDetectorConfig {
  minimumLiquidityUsd: number;
  minimumTradeNotionalUsd: number;
  maximumTradeAgeMs: number;
}

export type PolymarketQuestionPolarity = 'POSITIVE' | 'NEGATIVE' | 'UNKNOWN';

export interface InterpretedPolymarketTrade {
  direction: ExternalSignalDirection;
  polarity: PolymarketQuestionPolarity;
  supportsYes: boolean;
  notionalUsd: number;
  occurredAt: number;
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

const NEGATIVE_PATTERNS = [
  /\bcrash(?:es|ed|ing)?\b/,
  /\bfall(?:s|en|ing)?\s+below\b/,
  /\bdrop(?:s|ped|ping)?\s+below\b/,
  /\bdecline(?:s|d)?\s+below\b/,
  /\b(?:be|trade|close|finish|settle)\s+below\b/,
  /\bbelow\s+\$?[\d,.]+/,
  /\bunder\s+\$?[\d,.]+/,
  /\brecession\b/,
  /\bdefault\b/,
  /\bban(?:ned|s)?\b/,
];

const POSITIVE_PATTERNS = [
  /\b(?:be|trade|close|finish|settle)\s+above\b/,
  /\babove\s+\$?[\d,.]+/,
  /\bexceed(?:s|ed)?\b/,
  /\breach(?:es|ed)?\b/,
  /\bhit(?:s)?\s+\$?[\d,.]+/,
  /\brise(?:s|n)?\s+(?:above|to)\b/,
  /\bapprove(?:s|d)?\b/,
  /\brate cut\b/,
];

export const inferPolymarketAsset = (text: string): string | undefined => {
  const normalized = text.toLowerCase();
  if (normalized.includes('bitcoin') || normalized.includes('btc'))
    return 'BTC';
  if (normalized.includes('ethereum') || normalized.includes('eth'))
    return 'ETH';
  if (normalized.includes('solana') || normalized.includes(' sol'))
    return 'SOL';
  if (normalized.includes('xrp')) return 'XRP';
  if (normalized.includes('dogecoin') || normalized.includes('doge'))
    return 'DOGE';
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

  public inferQuestionPolarity(question: string): PolymarketQuestionPolarity {
    const normalized = question.toLowerCase();
    const negativeMatches = NEGATIVE_PATTERNS.filter((pattern) =>
      pattern.test(normalized),
    ).length;
    const positiveMatches = POSITIVE_PATTERNS.filter((pattern) =>
      pattern.test(normalized),
    ).length;

    if (negativeMatches > positiveMatches) return 'NEGATIVE';
    if (positiveMatches > negativeMatches) return 'POSITIVE';
    return 'UNKNOWN';
  }

  public interpretTrade(
    trade: PolymarketTrade,
    market: PolymarketMarket,
  ): InterpretedPolymarketTrade {
    const outcomeIsNo = trade.outcome.trim().toLowerCase() === 'no';
    const supportsOutcome = trade.side === 'BUY';
    const supportsYes = outcomeIsNo ? !supportsOutcome : supportsOutcome;
    const polarity = this.inferQuestionPolarity(market.question);

    let direction: ExternalSignalDirection = 'UNKNOWN';
    if (polarity === 'POSITIVE') {
      direction = supportsYes ? 'BULLISH' : 'BEARISH';
    } else if (polarity === 'NEGATIVE') {
      direction = supportsYes ? 'BEARISH' : 'BULLISH';
    }

    return {
      direction,
      polarity,
      supportsYes,
      notionalUsd: trade.size * trade.price,
      occurredAt: trade.timestamp * 1_000,
    };
  }

  public detect(
    trade: PolymarketTrade,
    market: PolymarketMarket,
    now = Date.now(),
  ): ExternalWhaleSignal | undefined {
    const interpretation = this.interpretTrade(trade, market);
    const ageMs = Math.max(0, now - interpretation.occurredAt);

    if (
      !this.isRelevantMarket(market) ||
      interpretation.notionalUsd < this.config.minimumTradeNotionalUsd ||
      ageMs > this.config.maximumTradeAgeMs
    ) {
      return undefined;
    }

    const tradeScale = Math.min(
      1,
      interpretation.notionalUsd /
        Math.max(this.config.minimumTradeNotionalUsd * 5, 1),
    );
    const liquidityImpact = Math.min(
      1,
      interpretation.notionalUsd / Math.max(market.liquidity, 1),
    );
    const confidence = Math.min(
      75,
      35 + tradeScale * 25 + liquidityImpact * 15,
    );
    const asset = inferPolymarketAsset(
      `${market.question} ${market.category ?? ''}`,
    );

    return {
      id: `polymarket:${trade.transactionHash}:${trade.asset}`,
      underlyingEventId: `polymarket:${trade.transactionHash}:${trade.asset}`,
      provider: 'POLYMARKET',
      category: 'PREDICTION_TRADE',
      direction: interpretation.direction,
      occurredAt: interpretation.occurredAt,
      receivedAt: now,
      confidence,
      asset,
      notionalUsd: interpretation.notionalUsd,
      transactionHash: trade.transactionHash,
      description:
        `${trade.side} ${trade.outcome} on “${market.question}” ` +
        `for approximately $${interpretation.notionalUsd.toFixed(2)} ` +
        `(${interpretation.polarity.toLowerCase()} question).`,
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
        questionPolarity: interpretation.polarity,
        supportsYes: interpretation.supportsYes,
      },
    };
  }
}
