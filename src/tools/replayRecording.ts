import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';

import { appConfig } from '../config/appConfig';
import { resolveSymbolConfig } from '../config/symbolProfiles';
import { CandleUpdateHandler } from '../core/CandleUpdateHandler';
import { MarketState } from '../core/MarketState';
import { SummaryThrottle } from '../core/SummaryThrottle';
import { MarketEngine } from '../market/MarketEngine';
import {
  calculateAnchoredReplayDelayMs,
  parseReplayOptions,
  type ReplaySpeed,
} from '../recording/replayOptions';
import { parseRecordingRecord } from '../recording/recordingValidation';
import type { MarketInstrumentConfig } from '../types/instrument';

const wait = async (milliseconds: number): Promise<void> => {
  if (milliseconds <= 0) {
    return;
  }

  await new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
};

const formatSpeed = (speed: ReplaySpeed): string =>
  typeof speed === 'number' ? `${speed}x` : speed;

const replay = async (): Promise<void> => {
  const options = parseReplayOptions(process.argv.slice(2));
  const instruments = new Map<string, MarketInstrumentConfig>();
  const marketStates = new Map<string, MarketState>();
  const engine = new MarketEngine(
    marketStates,
    new SummaryThrottle(appConfig.reporting.summaryIntervalMs),
  );
  const candleHandler = new CandleUpdateHandler(marketStates);

  let orderBookCount = 0;
  let candleCount = 0;
  let firstReplayRecordAt: number | undefined;
  let playbackStartedAt: number | undefined;
  const startedAt = performance.now();
  const input = createInterface({
    input: createReadStream(options.filePath, { encoding: 'utf8' }),
    crlfDelay: Number.POSITIVE_INFINITY,
  });

  for await (const line of input) {
    if (line.trim().length === 0) {
      continue;
    }

    const record = parseRecordingRecord(line);

    if (record.type === 'instrument') {
      if (options.symbol && record.instrument.instId !== options.symbol) {
        continue;
      }

      instruments.set(record.instrument.instId, record.instrument);
      marketStates.set(
        record.instrument.instId,
        new MarketState(
          resolveSymbolConfig(record.instrument.instId),
          record.instrument,
        ),
      );
      continue;
    }

    const symbol =
      record.type === 'orderBook' ? record.update.instId : record.candle.instId;

    if (options.symbol && symbol !== options.symbol) {
      continue;
    }

    if (!instruments.has(symbol)) {
      throw new Error(`Recording is missing instrument metadata for ${symbol}`);
    }

    firstReplayRecordAt ??= record.recordedAt;
    playbackStartedAt ??= performance.now();

    const delayMs = calculateAnchoredReplayDelayMs(
      firstReplayRecordAt,
      record.recordedAt,
      performance.now() - playbackStartedAt,
      options.speed,
    );
    await wait(delayMs);

    if (record.type === 'orderBook') {
      engine.processOrderBookUpdate(record.update);
      orderBookCount += 1;
    } else {
      candleHandler.handle(record.candle);
      candleCount += 1;
    }
  }

  if (options.symbol && !instruments.has(options.symbol)) {
    throw new Error(`Recording does not contain instrument ${options.symbol}`);
  }

  const elapsedMs = performance.now() - startedAt;
  const totalUpdates = orderBookCount + candleCount;

  console.log('\nREPLAY COMPLETE');
  console.log(`File: ${options.filePath}`);
  console.log(`Markets: ${marketStates.size}`);
  console.log(`Symbol filter: ${options.symbol ?? 'all'}`);
  console.log(`Speed: ${formatSpeed(options.speed)}`);
  console.log(`Order-book updates: ${orderBookCount.toLocaleString('en-US')}`);
  console.log(`Candle updates: ${candleCount.toLocaleString('en-US')}`);
  console.log(`Elapsed: ${elapsedMs.toFixed(2)}ms`);
  console.log(
    `Replay throughput: ${(totalUpdates / Math.max(elapsedMs / 1_000, 0.001)).toFixed(2)} updates/s`,
  );
};

void replay().catch((error: unknown) => {
  console.error('Replay failed:', error);
  process.exitCode = 1;
});
