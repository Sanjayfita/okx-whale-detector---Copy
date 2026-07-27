import { afterEach, describe, expect, it, vi } from 'vitest';

import { PolymarketPublicClient } from '../src/external/providers/polymarket/PolymarketPublicClient';

const createMarket = (index: number) => ({
  id: `market-${index}`,
  conditionId: `condition-${index}`,
  question: `Will Bitcoin rise ${index}?`,
  slug: `will-bitcoin-rise-${index}`,
  liquidity: '50000',
  volume: '100000',
});

describe('PolymarketPublicClient', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses supported Gamma API parameters for active markets', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify([createMarket(1)]), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const client = new PolymarketPublicClient();
    const markets = await client.getActiveMarkets(100);

    const requestedUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(requestedUrl.pathname).toBe('/markets');
    expect(requestedUrl.searchParams.get('active')).toBe('true');
    expect(requestedUrl.searchParams.get('closed')).toBe('false');
    expect(requestedUrl.searchParams.get('limit')).toBe('100');
    expect(requestedUrl.searchParams.get('offset')).toBe('0');
    expect(requestedUrl.searchParams.get('order')).toBe('liquidity');
    expect(requestedUrl.searchParams.get('ascending')).toBe('false');
    expect(markets).toHaveLength(1);
    expect(markets[0]?.liquidity).toBe(50_000);
  });

  it('paginates active markets beyond the API page limit', async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) =>
      createMarket(index),
    );
    const secondPage = Array.from({ length: 50 }, (_, index) =>
      createMarket(index + 100),
    );
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify(firstPage), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(secondPage), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );

    const client = new PolymarketPublicClient();
    const markets = await client.getActiveMarkets(150);

    expect(markets).toHaveLength(150);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const firstUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    const secondUrl = new URL(String(fetchMock.mock.calls[1]?.[0]));
    expect(firstUrl.searchParams.get('limit')).toBe('100');
    expect(firstUrl.searchParams.get('offset')).toBe('0');
    expect(secondUrl.searchParams.get('limit')).toBe('50');
    expect(secondUrl.searchParams.get('offset')).toBe('100');
  });

  it('rejects invalid market limits', async () => {
    const client = new PolymarketPublicClient();

    await expect(client.getActiveMarkets(0)).rejects.toThrow(
      'positive integer',
    );
  });

  it('includes the rejected URL and response body in request errors', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{"error":"invalid order parameter"}', {
        status: 422,
        statusText: 'Unprocessable Entity',
      }),
    );

    const client = new PolymarketPublicClient();

    await expect(client.getActiveMarkets(10)).rejects.toThrow(
      /order=liquidity.*invalid order parameter/,
    );
  });
});
