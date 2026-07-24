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
  ): void {
    this.applyLevels(this.orderBook.bids, bids, timestamp);
    this.applyLevels(this.orderBook.asks, asks, timestamp);

    this.orderBook.lastSeqId = seqId;
    this.orderBook.updatedAt = timestamp;
    this.orderBook.initialized = true;
    this.orderBook.status = 'SYNCED';
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

  public getBestBid(): OrderLevel | undefined {
    return [...this.orderBook.bids.values()]
      .sort((a, b) => b.price - a.price)[0];
  }

  public getBestAsk(): OrderLevel | undefined {
    return [...this.orderBook.asks.values()]
      .sort((a, b) => a.price - b.price)[0];
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

