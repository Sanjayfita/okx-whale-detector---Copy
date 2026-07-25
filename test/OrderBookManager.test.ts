import {
  describe,
  expect,
  it,
} from 'vitest';

import { OrderBookManager } from
  '../src/core/OrderBookManager';

import type { OrderBookLevel } from
  '../src/types/orderbook';

const level = (
  price: string,
  size: string,
): OrderBookLevel => [
  price,
  size,
  '0',
  '1',
];

describe('OrderBookManager', () => {
  it('clears stale levels when a snapshot arrives', () => {
    const manager = new OrderBookManager();

    manager.applyUpdate(
      [level('100', '10')],
      [level('101', '10')],
      1,
      10,
      -1,
      'snapshot',
    );

    manager.applyUpdate(
      [level('102', '10')],
      [level('103', '10')],
      2,
      20,
      -1,
      'snapshot',
    );

    expect([
      ...manager.getOrderBook().bids.keys(),
    ]).toEqual([102]);

    expect([
      ...manager.getOrderBook().asks.keys(),
    ]).toEqual([103]);
  });

  it('rejects an update with a sequence gap', () => {
    const manager = new OrderBookManager();

    manager.applyUpdate(
      [level('100', '10')],
      [level('101', '10')],
      1,
      10,
      -1,
      'snapshot',
    );

    const result = manager.applyUpdate(
      [level('102', '10')],
      [],
      2,
      20,
      19,
      'update',
    );

    expect(result).toBe(false);
    expect(
      manager.getOrderBook().status,
    ).toBe('INVALID');
  });
});