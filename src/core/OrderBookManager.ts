import type {
  OrderBook,
  OrderBookLevel,
  OrderLevel,
} from '../types/orderbook';

export class OrderBookManager {
  private readonly orderBook: OrderBook = {
    bids: new Map(),
    asks: new Map(),
    lastSeqId: null,
    status: 'INITIALIZING',
    initialized: false,
    updatedAt: 0,
  };
  
  public applyUpdate(
  bids: OrderBookLevel[],
  asks: OrderBookLevel[],
  timestamp: number,
  seqId: number,
  prevSeqId: number,
  action: 'snapshot' | 'update',
): boolean {
  if (action === 'snapshot') {
    this.orderBook.bids.clear();
    this.orderBook.asks.clear();

    this.applyLevels(
      this.orderBook.bids,
      bids,
      timestamp,
    );

    this.applyLevels(
      this.orderBook.asks,
      asks,
      timestamp,
    );

    this.orderBook.lastSeqId = seqId;
    this.orderBook.updatedAt = timestamp;
    this.orderBook.initialized = true;
    this.orderBook.status = 'SYNCED';

    return true;
  }

  
  if (
    !this.orderBook.initialized ||
    this.orderBook.lastSeqId === null ||
    prevSeqId !== this.orderBook.lastSeqId
  ) {
    this.orderBook.status = 'INVALID';
    this.orderBook.initialized = false;

    return false;
  }

  this.applyLevels(
    this.orderBook.bids,
    bids,
    timestamp,
  );

  this.applyLevels(
    this.orderBook.asks,
    asks,
    timestamp,
  );

  this.orderBook.lastSeqId = seqId;
  this.orderBook.updatedAt = timestamp;
  this.orderBook.status = 'SYNCED';

  return true;
}

public reset(): void {
  this.orderBook.bids.clear();
  this.orderBook.asks.clear();
  this.orderBook.lastSeqId = null;
  this.orderBook.status =
    'INITIALIZING';
  this.orderBook.initialized =
    false;
  this.orderBook.updatedAt = 0;
}
  private applyLevels(
    side: Map<number, OrderLevel>,
    levels: OrderBookLevel[],
    timestamp: number,
  ): void {
    for (const level of levels) {
      const rawPrice = level[0];
      const rawSize = level[1];

      if (rawPrice === undefined || rawSize === undefined) {
        continue;
      }

      const price = Number(rawPrice);
      const size = Number(rawSize);

if (
  !Number.isFinite(price) ||
  price <= 0 ||
  !Number.isFinite(size) ||
  size < 0
) {
  continue;
}

      if (size === 0) {
        side.delete(price);
        continue;
      }

      side.set(price, {
        price,
        rawPrice,
        size,
        rawSize,
        notionalUSD: price * size,
        updatedAt: timestamp,
      });
    }
  }

  public getOrderBook(): OrderBook {
    return this.orderBook;
  }

 public getBestBid():
  OrderLevel | undefined {
  let best:
    OrderLevel | undefined;

  for (
    const level
    of this.orderBook.bids.values()
  ) {
    if (
      !best ||
      level.price > best.price
    ) {
      best = level;
    }
  }

  return best;
}

public getBestAsk():
  OrderLevel | undefined {
  let best:
    OrderLevel | undefined;

  for (
    const level
    of this.orderBook.asks.values()
  ) {
    if (
      !best ||
      level.price < best.price
    ) {
      best = level;
    }
  }

  return best;
}

public getMidPrice(): number | undefined {
  const bestBid =
    this.getBestBid();

  const bestAsk =
    this.getBestAsk();

  if (
    !bestBid ||
    !bestAsk
  ) {
    return undefined;
  }

  return (
    bestBid.price +
    bestAsk.price
  ) / 2;
}
}

