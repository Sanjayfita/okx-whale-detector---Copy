import type { OrderBookLevel } from '../types/orderbook';

export interface WhaleOrder {
  side: 'BID' | 'ASK';
  price: number;
  size: number;
  notionalUSD: number;
}

export class WhaleDetector {
  private readonly minimumNotionalUSD: number;

  constructor(minimumNotionalUSD: number) {
    this.minimumNotionalUSD = minimumNotionalUSD;
  }

  public detect(
    bids: OrderBookLevel[],
    asks: OrderBookLevel[],
  ): WhaleOrder[] {
    const whales: WhaleOrder[] = [];

    for (const bid of bids) {
      const price = Number(bid[0]);
      const size = Number(bid[1]);
      const notionalUSD = price * size;

      if (notionalUSD >= this.minimumNotionalUSD) {
        whales.push({
          side: 'BID',
          price,
          size,
          notionalUSD,
        });
      }
    }

    for (const ask of asks) {
      const price = Number(ask[0]);
      const size = Number(ask[1]);
      const notionalUSD = price * size;

      if (notionalUSD >= this.minimumNotionalUSD) {
        whales.push({
          side: 'ASK',
          price,
          size,
          notionalUSD,
        });
      }
    }

    return whales;
  }
}