import type {
  OKXCandle,
} from '../clients/okx/OKXCandleWebSocketClient';

import type {
  MarketState,
} from './MarketState';

export type CandleLogger = (
  message: string,
) => void;

export class CandleUpdateHandler {
  private readonly candleCounters =
    new Map<string, number>();

  constructor(
    private readonly marketStates:
      Map<string, MarketState>,

    private readonly logger:
      CandleLogger =
        console.log,
  ) {}

  public handle(
    candle: OKXCandle,
  ): void {
    const state =
      this.marketStates.get(
        candle.instId,
      );

    if (!state) {
      return;
    }

    /*
     * Every candle update reaches
     * CandleHistory, even when it is
     * not printed.
     */
    state.candleHistory.add(
      candle,
    );

    const count =
      (
        this.candleCounters.get(
          candle.instId,
        ) ??
        0
      ) + 1;

    this.candleCounters.set(
      candle.instId,
      count,
    );

    /*
     * Print only every tenth update
     * for this specific symbol.
     */
    if (count % 10 !== 0) {
      return;
    }

    this.logger(
      `🕯️ ${candle.instId} 1m | ` +
      `O: ${candle.open} | ` +
      `H: ${candle.high} | ` +
      `L: ${candle.low} | ` +
      `C: ${candle.close} | ` +
      `Closed: ${candle.confirm} | ` +
      `History: ` +
      `${state.candleHistory.getSize()}`,
    );
  }

  public reset(
    symbol?: string,
  ): void {
    if (symbol !== undefined) {
      this.candleCounters.delete(
        symbol,
      );

      return;
    }

    this.candleCounters.clear();
  }
}