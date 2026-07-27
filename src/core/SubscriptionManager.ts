import {
  OKXWebSocketClient,
  type OKXOrderBookUpdate,
} from '../clients/okx/OKXWebSocketClient';
import {
  OKXCandleWebSocketClient,
  type OKXCandle,
} from '../clients/okx/OKXCandleWebSocketClient';
import type {
  MarketInstrumentConfig,
  SupportedInstType,
} from '../types/instrument';

interface OrderBookClient {
  onReconnect(callback: () => void): void;
  onOrderBook(callback: (update: OKXOrderBookUpdate) => void): void;
  subscribeToOrderBook(instId: string, instType: SupportedInstType): void;
  close(): void;
}

interface CandleClient {
  onCandle(callback: (candle: OKXCandle) => void): void;
  subscribeToCandle(instId: string): void;
  close(): void;
}

export interface SubscriptionShard {
  readonly index: number;
  readonly symbols: readonly string[];
}

export interface SubscriptionManagerOptions {
  maximumSymbolsPerConnection: number;
  createOrderBookClient?: () => OrderBookClient;
  createCandleClient?: () => CandleClient;
  onOrderBook: (update: OKXOrderBookUpdate) => void;
  onCandle: (candle: OKXCandle) => void;
  onShardReconnect: (symbols: readonly string[]) => void;
}

interface ActiveShard extends SubscriptionShard {
  readonly orderBookClient: OrderBookClient;
  readonly candleClient: CandleClient;
}

const chunk = <T>(values: readonly T[], size: number): T[][] => {
  const chunks: T[][] = [];

  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }

  return chunks;
};

export class SubscriptionManager {
  private readonly activeShards: ActiveShard[] = [];
  private started = false;

  public constructor(private readonly options: SubscriptionManagerOptions) {
    if (
      !Number.isInteger(options.maximumSymbolsPerConnection) ||
      options.maximumSymbolsPerConnection <= 0
    ) {
      throw new Error('maximumSymbolsPerConnection must be a positive integer');
    }
  }

  public start(instruments: readonly MarketInstrumentConfig[]): void {
    if (this.started) {
      throw new Error('SubscriptionManager has already been started');
    }

    const seenSymbols = new Set<string>();

    for (const instrument of instruments) {
      if (seenSymbols.has(instrument.instId)) {
        throw new Error(
          `Duplicate subscription instrument: ${instrument.instId}`,
        );
      }

      seenSymbols.add(instrument.instId);
    }

    this.started = true;

    const instrumentGroups = chunk(
      instruments,
      this.options.maximumSymbolsPerConnection,
    );

    for (const [index, group] of instrumentGroups.entries()) {
      const orderBookClient =
        this.options.createOrderBookClient?.() ?? new OKXWebSocketClient();
      const candleClient =
        this.options.createCandleClient?.() ?? new OKXCandleWebSocketClient();
      const symbols = group.map((instrument) => instrument.instId);

      orderBookClient.onOrderBook(this.options.onOrderBook);
      candleClient.onCandle(this.options.onCandle);
      orderBookClient.onReconnect(() => {
        this.options.onShardReconnect(symbols);
      });

      for (const instrument of group) {
        orderBookClient.subscribeToOrderBook(
          instrument.instId,
          instrument.instType,
        );
        candleClient.subscribeToCandle(instrument.instId);
      }

      this.activeShards.push({
        index,
        symbols,
        orderBookClient,
        candleClient,
      });
    }
  }

  public getShards(): readonly SubscriptionShard[] {
    return this.activeShards.map(({ index, symbols }) => ({ index, symbols }));
  }

  public close(): void {
    for (const shard of this.activeShards) {
      shard.orderBookClient.close();
      shard.candleClient.close();
    }

    this.activeShards.length = 0;
  }
}
