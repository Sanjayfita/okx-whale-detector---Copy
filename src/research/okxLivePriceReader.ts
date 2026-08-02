import type { LivePriceSnapshot } from './liveEvidenceCollector';

interface OKXTickerRow {
  instId?: unknown;
  last?: unknown;
  bidPx?: unknown;
  askPx?: unknown;
  ts?: unknown;
}

interface OKXTickerResponse {
  code?: unknown;
  msg?: unknown;
  data?: unknown;
}

export interface OKXLivePriceReaderOptions {
  baseUrl?: string;
  fetchFn?: typeof fetch;
  clock?: () => number;
}

const positiveNumber = (value: unknown): number | undefined => {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
};

const timestamp = (value: unknown): number | undefined => {
  const parsed = positiveNumber(value);
  return parsed !== undefined && Number.isSafeInteger(parsed) ? parsed : undefined;
};

export class OKXLivePriceReader {
  private readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;
  private readonly clock: () => number;

  public constructor(options: OKXLivePriceReaderOptions = {}) {
    this.baseUrl = (options.baseUrl ?? 'https://www.okx.com').replace(/\/$/, '');
    this.fetchFn = options.fetchFn ?? fetch;
    this.clock = options.clock ?? Date.now;
  }

  public readPrice = async (
    instrumentId: string,
    dueAt: number,
  ): Promise<LivePriceSnapshot> => {
    const normalizedInstrumentId = instrumentId.trim();
    if (normalizedInstrumentId.length === 0) {
      throw new Error('instrumentId must not be empty');
    }
    if (!Number.isSafeInteger(dueAt) || dueAt < 0) {
      throw new Error('dueAt must be a non-negative safe integer');
    }

    const url = new URL('/api/v5/market/ticker', this.baseUrl);
    url.searchParams.set('instId', normalizedInstrumentId);
    const response = await this.fetchFn(url, {
      method: 'GET',
      headers: { accept: 'application/json' },
    });
    if (!response.ok) {
      throw new Error(`OKX ticker request failed with HTTP ${response.status}`);
    }

    const payload = (await response.json()) as OKXTickerResponse;
    if (payload.code !== '0' || !Array.isArray(payload.data) || payload.data.length !== 1) {
      throw new Error(`OKX ticker response is invalid: ${String(payload.msg ?? payload.code)}`);
    }

    const row = payload.data[0] as OKXTickerRow;
    if (row.instId !== normalizedInstrumentId) {
      throw new Error('OKX ticker instrument does not match the request');
    }

    const bid = positiveNumber(row.bidPx);
    const ask = positiveNumber(row.askPx);
    const last = positiveNumber(row.last);
    const price =
      bid !== undefined && ask !== undefined && ask >= bid
        ? (bid + ask) / 2
        : last;
    if (price === undefined) {
      throw new Error('OKX ticker does not contain a usable positive price');
    }

    const serverTimestamp = timestamp(row.ts);
    const observedAt = Math.max(this.clock(), serverTimestamp ?? 0);
    if (observedAt < dueAt) {
      throw new Error('OKX ticker snapshot was captured before the requested due time');
    }

    return Object.freeze({
      instrumentId: normalizedInstrumentId,
      observedAt,
      price,
      maximumFavorableExcursionPercent: 0,
      maximumAdverseExcursionPercent: 0,
    });
  };
}
