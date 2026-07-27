export interface PolymarketMarket {
  id: string;
  conditionId: string;
  question: string;
  slug: string;
  liquidity: number;
  volume: number;
  endDate?: string;
  category?: string;
}

export interface PolymarketTrade {
  proxyWallet: string;
  side: 'BUY' | 'SELL';
  asset: string;
  conditionId: string;
  size: number;
  price: number;
  timestamp: number;
  title: string;
  slug: string;
  eventSlug: string;
  outcome: string;
  outcomeIndex: number;
  transactionHash: string;
}

export interface PolymarketPublicClientConfig {
  gammaBaseUrl: string;
  dataBaseUrl: string;
  requestTimeoutMs: number;
}

const DEFAULT_CONFIG: PolymarketPublicClientConfig = {
  gammaBaseUrl: 'https://gamma-api.polymarket.com',
  dataBaseUrl: 'https://data-api.polymarket.com',
  requestTimeoutMs: 15_000,
};

const MARKET_PAGE_SIZE = 100;

const toFiniteNumber = (value: unknown): number => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const parseMarkets = (payload: readonly unknown[]): PolymarketMarket[] =>
  payload.flatMap((market) => {
    if (!market || typeof market !== 'object') {
      return [];
    }

    const value = market as Record<string, unknown>;
    const conditionId = String(value.conditionId ?? '');
    const question = String(value.question ?? '');

    if (!conditionId || !question) {
      return [];
    }

    return [
      {
        id: String(value.id ?? conditionId),
        conditionId,
        question,
        slug: String(value.slug ?? ''),
        liquidity: toFiniteNumber(value.liquidityNum ?? value.liquidity),
        volume: toFiniteNumber(value.volumeNum ?? value.volume),
        endDate:
          typeof value.endDate === 'string' ? value.endDate : undefined,
        category:
          typeof value.category === 'string' ? value.category : undefined,
      },
    ];
  });

export class PolymarketPublicClient {
  private readonly config: PolymarketPublicClientConfig;

  public constructor(config: Partial<PolymarketPublicClientConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  public async getActiveMarkets(limit = 500): Promise<PolymarketMarket[]> {
    if (!Number.isInteger(limit) || limit <= 0) {
      throw new Error('Polymarket market limit must be a positive integer');
    }

    const markets: PolymarketMarket[] = [];

    for (let offset = 0; offset < limit; offset += MARKET_PAGE_SIZE) {
      const pageLimit = Math.min(MARKET_PAGE_SIZE, limit - offset);
      const url = new URL('/markets', this.config.gammaBaseUrl);
      url.searchParams.set('active', 'true');
      url.searchParams.set('closed', 'false');
      url.searchParams.set('limit', String(pageLimit));
      url.searchParams.set('offset', String(offset));
      url.searchParams.set('order', 'liquidity');
      url.searchParams.set('ascending', 'false');

      const payload = await this.fetchJson<unknown[]>(url);
      markets.push(...parseMarkets(payload));

      if (payload.length < pageLimit) {
        break;
      }
    }

    return markets.slice(0, limit);
  }

  public async getRecentTrades(
    minimumCashAmount: number,
    limit = 1_000,
  ): Promise<PolymarketTrade[]> {
    const url = new URL('/trades', this.config.dataBaseUrl);
    url.searchParams.set('limit', String(limit));
    url.searchParams.set('offset', '0');
    url.searchParams.set('takerOnly', 'true');
    url.searchParams.set('filterType', 'CASH');
    url.searchParams.set('filterAmount', String(minimumCashAmount));

    const payload = await this.fetchJson<unknown[]>(url);
    return payload.flatMap((trade) => {
      if (!trade || typeof trade !== 'object') {
        return [];
      }

      const value = trade as Record<string, unknown>;
      const conditionId = String(value.conditionId ?? '');
      const transactionHash = String(value.transactionHash ?? '');
      const side = value.side;

      if (
        !conditionId ||
        !transactionHash ||
        (side !== 'BUY' && side !== 'SELL')
      ) {
        return [];
      }

      return [
        {
          proxyWallet: String(value.proxyWallet ?? ''),
          side,
          asset: String(value.asset ?? ''),
          conditionId,
          size: toFiniteNumber(value.size),
          price: toFiniteNumber(value.price),
          timestamp: toFiniteNumber(value.timestamp),
          title: String(value.title ?? ''),
          slug: String(value.slug ?? ''),
          eventSlug: String(value.eventSlug ?? ''),
          outcome: String(value.outcome ?? ''),
          outcomeIndex: toFiniteNumber(value.outcomeIndex),
          transactionHash,
        },
      ];
    });
  }

  private async fetchJson<T>(url: URL): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.config.requestTimeoutMs,
    );

    try {
      const response = await fetch(url, {
        headers: { accept: 'application/json' },
        signal: controller.signal,
      });

      if (!response.ok) {
        const responseBody = await response.text();
        const details = responseBody.trim()
          ? ` | ${responseBody.trim().slice(0, 500)}`
          : '';

        throw new Error(
          `Polymarket request failed: ${response.status} ${response.statusText} | ${url.toString()}${details}`,
        );
      }

      return (await response.json()) as T;
    } finally {
      clearTimeout(timeout);
    }
  }
}
