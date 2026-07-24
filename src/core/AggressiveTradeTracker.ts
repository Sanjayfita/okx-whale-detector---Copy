export type AggressiveTradeSide = 'BUY' | 'SELL';

export interface AggressiveTrade {
  side: AggressiveTradeSide;
  price: number;
  size: number;
  notionalUSD: number;
  timestamp: number;
}

export interface TradeFlowSnapshot {
  buyVolume: number;
  sellVolume: number;
  buyNotionalUSD: number;
  sellNotionalUSD: number;
  tradeCount: number;
}

export class AggressiveTradeTracker {
  private buyVolume = 0;
  private sellVolume = 0;

  private buyNotionalUSD = 0;
  private sellNotionalUSD = 0;

  private tradeCount = 0;

  public recordTrade(trade: AggressiveTrade): void {
    this.tradeCount++;

    if (trade.side === 'BUY') {
      this.buyVolume += trade.size;
      this.buyNotionalUSD += trade.notionalUSD;
    } else {
      this.sellVolume += trade.size;
      this.sellNotionalUSD += trade.notionalUSD;
    }
  }

  public getSnapshot(): TradeFlowSnapshot {
    return {
      buyVolume: this.buyVolume,
      sellVolume: this.sellVolume,
      buyNotionalUSD: this.buyNotionalUSD,
      sellNotionalUSD: this.sellNotionalUSD,
      tradeCount: this.tradeCount,
    };
  }

  public reset(): void {
    this.buyVolume = 0;
    this.sellVolume = 0;
    this.buyNotionalUSD = 0;
    this.sellNotionalUSD = 0;
    this.tradeCount = 0;
  }
}