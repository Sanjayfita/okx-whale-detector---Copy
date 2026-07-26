import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import {
  MarketReporter,
} from '../src/reporting/MarketReporter';

import type {
  Whale,
  WhaleChange,
} from '../src/types/whale';

const createWhale = (
  overrides:
    Partial<Whale> = {},
): Whale => ({
  wallId:
    'wall-1',

  side:
    'BID',

  price:
    100,

  size:
    10_000,

  notionalQuote:
    1_000_000,

  quoteCurrency:
    'USDT',

  detectedAt:
    1_000,

  firstSeenAt:
    1_000,

  lastSeenAt:
    1_000,

  ageSeconds:
    30,

  updateCount:
    1,

  maxNotionalQuote:
    1_000_000,

  strength:
    1,

  ...overrides,
});

describe(
  'MarketReporter',
  () => {
    const logSpy =
      vi.spyOn(
        console,
        'log',
      ).mockImplementation(
        () => undefined,
      );

    const errorSpy =
      vi.spyOn(
        console,
        'error',
      ).mockImplementation(
        () => undefined,
      );

    beforeEach(() => {
      logSpy.mockClear();
      errorSpy.mockClear();
    });

    it(
      'reports a sequence gap',
      () => {
        const reporter =
          new MarketReporter();

        reporter.reportSequenceGap(
          'BTC-USDT',
        );

        expect(
          errorSpy,
        ).toHaveBeenCalledWith(
          expect.stringContaining(
            'Order-book sequence gap for BTC-USDT',
          ),
        );
      },
    );

    it(
      'formats a behavior transition',
      () => {
        const reporter =
          new MarketReporter();

        const whale =
          createWhale();

        reporter.reportBehavior({
          type:
            'PERSISTENT',

          whale,

          confidence:
            80,

          reason:
            'Whale has remained active for 30s',

          detectedAt:
            1_000,
        });

        expect(
          logSpy,
        ).toHaveBeenCalledWith(
          expect.stringContaining(
            '🧠 PERSISTENT | BID',
          ),
        );
      },
    );

    it(
      'formats quote values using en-US separators',
      () => {
        const reporter =
          new MarketReporter();

        reporter.reportWhaleEvent({
          type:
            'NEW',

          whale:
            createWhale({
              notionalQuote:
                1_234_567,
            }),
        });

        expect(
          logSpy,
        ).toHaveBeenCalledWith(
          expect.stringContaining(
            '1,234,567 USDT',
          ),
        );
      },
    );

    it(
      'reports moved whale prices',
      () => {
        const reporter =
          new MarketReporter();

        const moved:
          WhaleChange = {
            wallId:
              'wall-1',

            type:
              'MOVED',

            side:
              'BID',

            price:
              100.01,

            previousPrice:
              100,

            previousSize:
              10_000,

            currentSize:
              10_000,

            sizeDifference:
              0,

            previousNotionalQuote:
              1_000_000,

            currentNotionalQuote:
              1_000_100,

            timestamp:
              1_000,
          };

        reporter.reportMovedWhale(
          moved,
        );

        expect(
          logSpy,
        ).toHaveBeenCalledWith(
          expect.stringContaining(
            'Price: 100 → 100.01',
          ),
        );
      },
    );

    it(
      'reports a complete neutral market summary',
      () => {
        const reporter =
          new MarketReporter();

        reporter.reportSummary({
          symbol:
            'BTC-USDT',

          currentPrice:
            100.5,

          bestBidPrice:
            100,

          bestAskPrice:
            101,

          activeWhales:
            [],

          walls:
            [],

          scoredWhales:
            [],

          marketSignal: {
            bias:
              'NEUTRAL',

            confidence:
              0,

            reason:
              'No active whale walls',

            bidPressure:
              0,

            askPressure:
              0,
          },
        });

        const output =
          logSpy.mock.calls
            .map(
              call =>
                String(
                  call[0],
                ),
            )
            .join(
              '\n',
            );

        expect(
          output,
        ).toContain(
          '📡 BTC-USDT',
        );

        expect(
          output,
        ).toContain(
          '⚪ NEUTRAL',
        );

        expect(
          output,
        ).toContain(
          'No active whale walls',
        );
      },
    );
  },
);