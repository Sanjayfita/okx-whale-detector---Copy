import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import {
  SummaryThrottle,
} from '../src/core/SummaryThrottle';

describe(
  'SummaryThrottle',
  () => {
    beforeEach(() => {
      vi.useFakeTimers();

      vi.setSystemTime(
        new Date(
          '2026-07-25T12:00:00Z',
        ),
      );
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it(
      'allows BTC and ETH once during the same five-second window',
      () => {
        const throttle =
          new SummaryThrottle(
            5_000,
          );

        expect(
          throttle.shouldDisplay(
            'BTC-USDT',
          ),
        ).toBe(true);

        expect(
          throttle.shouldDisplay(
            'ETH-USDT',
          ),
        ).toBe(true);

        expect(
          throttle.shouldDisplay(
            'BTC-USDT',
          ),
        ).toBe(false);

        expect(
          throttle.shouldDisplay(
            'ETH-USDT',
          ),
        ).toBe(false);
      },
    );

    it(
      'allows each symbol again after five seconds',
      () => {
        const throttle =
          new SummaryThrottle(
            5_000,
          );

        expect(
          throttle.shouldDisplay(
            'BTC-USDT',
          ),
        ).toBe(true);

        expect(
          throttle.shouldDisplay(
            'ETH-USDT',
          ),
        ).toBe(true);

        vi.advanceTimersByTime(
          4_999,
        );

        expect(
          throttle.shouldDisplay(
            'BTC-USDT',
          ),
        ).toBe(false);

        expect(
          throttle.shouldDisplay(
            'ETH-USDT',
          ),
        ).toBe(false);

        vi.advanceTimersByTime(
          1,
        );

        expect(
          throttle.shouldDisplay(
            'BTC-USDT',
          ),
        ).toBe(true);

        expect(
          throttle.shouldDisplay(
            'ETH-USDT',
          ),
        ).toBe(true);
      },
    );

    it(
      'tracks BTC and ETH independently',
      () => {
        const throttle =
          new SummaryThrottle(
            5_000,
          );

        expect(
          throttle.shouldDisplay(
            'BTC-USDT',
          ),
        ).toBe(true);

        vi.advanceTimersByTime(
          2_000,
        );

        expect(
          throttle.shouldDisplay(
            'BTC-USDT',
          ),
        ).toBe(false);

        expect(
          throttle.shouldDisplay(
            'ETH-USDT',
          ),
        ).toBe(true);

        vi.advanceTimersByTime(
          3_000,
        );

        expect(
          throttle.shouldDisplay(
            'BTC-USDT',
          ),
        ).toBe(true);

        expect(
          throttle.shouldDisplay(
            'ETH-USDT',
          ),
        ).toBe(false);
      },
    );

    it(
      'allows a symbol again after resetting it',
      () => {
        const throttle =
          new SummaryThrottle(
            5_000,
          );

        expect(
          throttle.shouldDisplay(
            'BTC-USDT',
          ),
        ).toBe(true);

        expect(
          throttle.shouldDisplay(
            'BTC-USDT',
          ),
        ).toBe(false);

        throttle.reset(
          'BTC-USDT',
        );

        expect(
          throttle.shouldDisplay(
            'BTC-USDT',
          ),
        ).toBe(true);
      },
    );

    it(
      'allows all symbols again after a full reset',
      () => {
        const throttle =
          new SummaryThrottle(
            5_000,
          );

        throttle.shouldDisplay(
          'BTC-USDT',
        );

        throttle.shouldDisplay(
          'ETH-USDT',
        );

        throttle.reset();

        expect(
          throttle.shouldDisplay(
            'BTC-USDT',
          ),
        ).toBe(true);

        expect(
          throttle.shouldDisplay(
            'ETH-USDT',
          ),
        ).toBe(true);
      },
    );
  },
);