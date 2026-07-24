import { OKXCandle } from
  '../clients/okx/OKXCandleWebSocketClient';

export class CandleHistory {
  private readonly candles: OKXCandle[] = [];

  constructor(
    private readonly maxSize: number = 100,
  ) {}

  public add(
    candle: OKXCandle,
  ): void {
    const lastCandle =
      this.candles[
        this.candles.length - 1
      ];

    /*
     * If this is an update to the
     * currently forming candle,
     * replace the previous version.
     */
    if (
      lastCandle &&
      lastCandle.timestamp ===
        candle.timestamp
    ) {
      this.candles[
        this.candles.length - 1
      ] = candle;

      return;
    }

    this.candles.push(
      candle,
    );

    /*
     * Keep only the latest
     * maxSize candles.
     */
    if (
      this.candles.length >
      this.maxSize
    ) {
      this.candles.shift();
    }
  }

  public getAll(): OKXCandle[] {
    return [
      ...this.candles,
    ];
  }

  public getLatest():
    | OKXCandle
    | undefined {
    return this.candles[
      this.candles.length - 1
    ];
  }

  public getSize(): number {
    return this.candles.length;
  }

  public isReady(
    minimumCandles: number,
  ): boolean {
    return (
      this.candles.length >=
      minimumCandles
    );
  }

  public clear(): void {
    this.candles.length = 0;
  }
}