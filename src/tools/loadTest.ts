import type { OKXOrderBookUpdate } from '../clients/okx/OKXWebSocketClient';
import { appConfig } from '../config/appConfig';
import { MarketState } from '../core/MarketState';
import { PipelineProfiler } from '../core/PipelineProfiler';
import { ProcessingMonitor } from '../core/ProcessingMonitor';
import { SummaryThrottle } from '../core/SummaryThrottle';
import { MarketEngine } from '../market/MarketEngine';
import { MarketReporter } from '../reporting/MarketReporter';

class SilentMarketReporter extends MarketReporter {
  public override reportSequenceGap(): void {}
  public override reportBehavior(): void {}
  public override reportSpoof(): void {}
  public override reportWhaleEvent(): void {}
  public override reportRefill(): void {}
  public override reportMovedWhale(): void {}
  public override reportWhaleScore(): void {}
  public override reportSummary(): void {}
}

const updates = Number(process.argv[2] ?? 10_000);

if (!Number.isInteger(updates) || updates <= 0) {
  throw new Error('Load-test update count must be a positive integer');
}

const symbol = 'LOAD-USDT';
const marketStates = new Map([
  [
    symbol,
    new MarketState(appConfig, {
      instId: symbol,
      instType: 'SPOT',
      quoteCurrency: 'USDT',
      baseUnitsPerSize: 1,
    }),
  ],
]);
const profiler = new PipelineProfiler();
const engine = new MarketEngine(
  marketStates,
  new SummaryThrottle(Number.MAX_SAFE_INTEGER),
  new SilentMarketReporter(),
  new ProcessingMonitor({
    slowUpdateThresholdMs: Number.MAX_SAFE_INTEGER,
    warningCooldownMs: 0,
    maximumSamplesPerSymbol: 100,
  }),
  profiler,
);

const snapshot: OKXOrderBookUpdate = {
  instId: symbol,
  action: 'snapshot',
  bids: Array.from({ length: 100 }, (_, index) => [
    String(100 - index * 0.01),
    String(index % 10 === 0 ? 6_000 : 100),
    '0',
    '1',
  ]),
  asks: Array.from({ length: 100 }, (_, index) => [
    String(100.01 + index * 0.01),
    String(index % 10 === 0 ? 6_000 : 100),
    '0',
    '1',
  ]),
  timestamp: 1,
  seqId: 1,
  prevSeqId: -1,
};

engine.processOrderBookUpdate(snapshot);
const startedAt = performance.now();

for (let index = 0; index < updates; index += 1) {
  const seqId = index + 2;
  const priceOffset = (index % 20) * 0.01;
  engine.processOrderBookUpdate({
    instId: symbol,
    action: 'update',
    bids: [[String(99.9 - priceOffset), String(5_000 + (index % 500)), '0', '1']],
    asks: [[String(100.1 + priceOffset), String(5_000 + (index % 700)), '0', '1']],
    timestamp: seqId,
    seqId,
    prevSeqId: seqId - 1,
  });
}

const elapsedMs = performance.now() - startedAt;
const profile = profiler.getSnapshot();

console.log('\nDETERMINISTIC LOAD TEST');
console.log(`Updates: ${updates.toLocaleString('en-US')}`);
console.log(`Elapsed: ${elapsedMs.toFixed(2)}ms`);
console.log(`Throughput: ${(updates / (elapsedMs / 1_000)).toFixed(2)} updates/s`);
console.log('\nPIPELINE PROFILE');

for (const stage of profile) {
  console.log(
    `${stage.stage.padEnd(30)} total=${stage.totalMs.toFixed(2)}ms ` +
      `avg=${stage.averageMs.toFixed(4)}ms max=${stage.maximumMs.toFixed(2)}ms ` +
      `samples=${stage.samples}`,
  );
}

const slowest = profile[0];

if (slowest) {
  console.log(`\nSlowest stage by total time: ${slowest.stage}`);
}
