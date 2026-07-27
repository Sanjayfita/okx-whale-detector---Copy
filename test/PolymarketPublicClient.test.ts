import { afterEach, describe, expect, it, vi } from 'vitest';

import { PolymarketPublicClient } from '../src/external/providers/polymarket/PolymarketPublicClient';

describe('PolymarketPublicClient', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses supported Gamma API parameters for active markets', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            id: 'market-1',
            conditionId: 'condition-1',
            question: 'Will Bitcoin rise?',
            slug: 'will-bitcoin-rise',
            liquidity: '50000',
            volume: '100000',
          },
        ]),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
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
