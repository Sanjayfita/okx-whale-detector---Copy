import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';

import { appConfig } from '../config/appConfig';
import { resolveSymbolConfig } from '../config/symbolProfiles';
import { MarketState } from '../core/MarketState';
import { SummaryThrottle } from '../core/SummaryThrottle';
import { MarketEngine } from '../market/MarketEngine';
import { parseRecordingRecord } from '../recording/recordingValidation';
import type { MarketInstrumentConfig } from '../types/instrument';

const replay = async (): Promise<void> => {
  const filePath = process.argv[2];

  if (!filePath) {
    throw new Error('Usage: npm run replay -- <recording.ndjson>');
  }

  const instruments = new Map<string, MarketInstrumentConfig>();
  const marketStates = new Map<string, MarketState>();
  const engine = new MarketEngine(
    marketStates,
    new SummaryThrottle(appConfig.reporting.summaryIntervalMs),
  );

  let updateCount = 0;
  const startedAt = performance.now();
  const input = createInterface({
    input: createReadStream(filePath, { encoding: 'utf8' }),
    crlfDelay: Number.POSITIVE_INFINITY,
  });

  for await (const line of input) {
    if (line.trim().length === 0) {
      continue;
    }

    const record = parseRecordingRecord(line);

    if (record.type === 'instrument') {
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

    if (!instruments.has(record.update.instId)) {
      throw new Error(
        `Recording is missing instrument metadata for ${record.update.instId}`,
      );
    }

    engine.processOrderBookUpdate(record.update);
    updateCount += 1;
  }

  const elapsedMs = performance.now() - startedAt;
  console.log('\nREPLAY COMPLETE');
  console.log(`File: ${filePath}`);
  console.log(`Markets: ${marketStates.size}`);
  console.log(`Order-book updates: ${updateCount.toLocaleString('en-US')}`);
  console.log(`Elapsed: ${elapsedMs.toFixed(2)}ms`);
  console.log(
    `Replay throughput: ${(updateCount / Math.max(elapsedMs / 1_000, 0.001)).toFixed(2)} updates/s`,
  );
};

void replay().catch((error: unknown) => {
  console.error('Replay failed:', error);
  process.exitCode = 1;
});
