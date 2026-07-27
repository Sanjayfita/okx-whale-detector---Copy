import { mkdirSync, createWriteStream, type WriteStream } from 'node:fs';
import path from 'node:path';

import type { OKXCandle } from '../clients/okx/OKXCandleWebSocketClient';
import type { OKXOrderBookUpdate } from '../clients/okx/OKXWebSocketClient';
import type { MarketInstrumentConfig } from '../types/instrument';

export type RecordingRecord =
  | {
      type: 'instrument';
      recordedAt: number;
      instrument: MarketInstrumentConfig;
    }
  | {
      type: 'orderBook';
      recordedAt: number;
      update: OKXOrderBookUpdate;
    }
  | {
      type: 'candle';
      recordedAt: number;
      candle: OKXCandle;
    };

export class MarketDataRecorder {
  private readonly stream: WriteStream;
  public readonly filePath: string;

  public constructor(
    directory: string,
    instruments: readonly MarketInstrumentConfig[],
    now = new Date(),
  ) {
    mkdirSync(directory, { recursive: true });

    const timestamp = now.toISOString().replace(/[:.]/g, '-');
    this.filePath = path.join(directory, `okx-session-${timestamp}.ndjson`);
    this.stream = createWriteStream(this.filePath, {
      flags: 'wx',
      encoding: 'utf8',
    });

    const recordedAt = now.getTime();
    for (const instrument of instruments) {
      this.writeRecord({ type: 'instrument', recordedAt, instrument });
    }
  }

  public recordOrderBook(update: OKXOrderBookUpdate): void {
    this.writeRecord({
      type: 'orderBook',
      recordedAt: Date.now(),
      update,
    });
  }

  public recordCandle(candle: OKXCandle): void {
    this.writeRecord({
      type: 'candle',
      recordedAt: Date.now(),
      candle,
    });
  }

  public close(): void {
    this.stream.end();
  }

  private writeRecord(record: RecordingRecord): void {
    this.stream.write(`${JSON.stringify(record)}\n`);
  }
}
