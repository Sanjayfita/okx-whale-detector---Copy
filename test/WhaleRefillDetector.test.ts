import {
  describe,
  expect,
  it,
} from 'vitest';

import { WhaleRefillDetector } from
  '../src/core/WhaleRefillDetector';

import type { Whale } from
  '../src/types/whale';

const whale = (
  notionalUSD: number,
): Whale => ({
  side: 'BID',
  price: 100,
  size: notionalUSD / 100,
  notionalUSD,
  detectedAt: 0,
});

describe('WhaleRefillDetector', () => {
  it('does not report a refill before 90% baseline recovery', () => {
    const detector =
      new WhaleRefillDetector();

    detector.detect(whale(1_000_000));
    detector.detect(whale(800_000));

    expect(
      detector.detect(whale(820_000)),
    ).toBeUndefined();
  });

  it('reports one refill after a qualifying recovery', () => {
    const detector =
      new WhaleRefillDetector();

    detector.detect(whale(1_000_000));
    detector.detect(whale(800_000));

    const event =
      detector.detect(
        whale(920_000),
      );

    expect(event?.refillAmountUSD)
      .toBe(120_000);

    expect(event?.refillCount)
      .toBe(1);

    expect(
      detector.detect(
        whale(920_000),
      ),
    ).toBeUndefined();
  });
});