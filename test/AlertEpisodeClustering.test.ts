import { describe, expect, it } from 'vitest';

import { clusterAlertEpisodes } from '../src/research/alertEpisodeClustering';

describe('clusterAlertEpisodes', () => {
  it('clusters overlapping alerts by instrument and direction', () => {
    const episodes = clusterAlertEpisodes({
      episodeWindowMs: 60_000,
      observations: [
        {
          alertId: 'alert:2',
          instrumentId: 'BTC-USDT',
          direction: 'BULLISH',
          detectedAt: 40_000,
        },
        {
          alertId: 'alert:1',
          instrumentId: 'BTC-USDT',
          direction: 'BULLISH',
          detectedAt: 0,
        },
        {
          alertId: 'alert:3',
          instrumentId: 'BTC-USDT',
          direction: 'BEARISH',
          detectedAt: 50_000,
        },
        {
          alertId: 'alert:4',
          instrumentId: 'ETH-USDT',
          direction: 'BULLISH',
          detectedAt: 50_000,
        },
        {
          alertId: 'alert:5',
          instrumentId: 'BTC-USDT',
          direction: 'BULLISH',
          detectedAt: 120_001,
        },
      ],
    });

    expect(episodes).toHaveLength(4);
    expect(episodes[0]).toMatchObject({
      instrumentId: 'BTC-USDT',
      direction: 'BULLISH',
      startedAt: 0,
      endedAt: 100_000,
      alertIds: ['alert:1', 'alert:2'],
      alertCount: 2,
    });
    expect(episodes.map((episode) => episode.alertCount)).toEqual([2, 1, 1, 1]);
  });

  it('uses chained overlap to keep one persistent state in one episode', () => {
    const episodes = clusterAlertEpisodes({
      episodeWindowMs: 60_000,
      observations: [
        {
          alertId: 'alert:1',
          instrumentId: 'BTC-USDT',
          direction: 'BULLISH',
          detectedAt: 0,
        },
        {
          alertId: 'alert:2',
          instrumentId: 'BTC-USDT',
          direction: 'BULLISH',
          detectedAt: 50_000,
        },
        {
          alertId: 'alert:3',
          instrumentId: 'BTC-USDT',
          direction: 'BULLISH',
          detectedAt: 100_000,
        },
      ],
    });

    expect(episodes).toHaveLength(1);
    expect(episodes[0]?.endedAt).toBe(160_000);
    expect(episodes[0]?.alertCount).toBe(3);
  });

  it('rejects duplicate alert identities and invalid windows', () => {
    const duplicate = [
      {
        alertId: 'alert:1',
        instrumentId: 'BTC-USDT',
        direction: 'BULLISH' as const,
        detectedAt: 0,
      },
      {
        alertId: 'alert:1',
        instrumentId: 'BTC-USDT',
        direction: 'BULLISH' as const,
        detectedAt: 1,
      },
    ];

    expect(() =>
      clusterAlertEpisodes({ observations: duplicate, episodeWindowMs: 60_000 }),
    ).toThrow('Duplicate alertId');
    expect(() =>
      clusterAlertEpisodes({ observations: [], episodeWindowMs: 0 }),
    ).toThrow('episodeWindowMs must be a positive safe integer');
  });
});
