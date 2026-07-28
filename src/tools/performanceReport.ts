import type { OKXOrderBookUpdate } from '../clients/okx/OKXWebSocketClient';
import { appConfig } from '../config/appConfig';
import { performanceConfig } from '../config/performanceConfig';
import { MarketState } from '../core/MarketState';
import { PipelineProfiler } from '../core/PipelineProfiler';
import { ProcessingMonitor } from '../core/ProcessingMonitor';
import { SummaryThrottle } from '../core/SummaryThrottle';
import { MarketEngine } from '../market/MarketEngine';
import { MarketReporter } from '../reporting/MarketReporter';
import type { MarketInstrumentConfig } from '../types/instrument';
import type { OrderBookLevel } from '../types/orderbook';

interface ScenarioResult {
  name: string;
  updates: number;
  elapsedMs: number;
  throughput: number;
  profile: PipelineProfiler;
  emittedCharacters: number;
}

const SYMBOLS = ['PERF-A-USDT', 'PERF-B-USDT', 'PERF-C-USDT'] as const;
const DEPTH = 100;

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

const level = (price: number, size: number): OrderBookLevel => [
  String(price),
  String(size),
  '0',
  '1',
];

const instrument = (instId: string): MarketInstrumentConfig => ({
  instId,
  instType: 'SPOT',
  quoteCurrency: 'USDT',
  baseUnitsPerSize: 1,
});

const snapshot = (symbol: string, basePrice: number): OKXOrderBookUpdate => ({
  instId: symbol,
  action: 'snapshot',
  bids: Array.from({ length: DEPTH }, (_, index) =>
    level(basePrice - index * 0.01, index % 10 === 0 ? 6_000 : 100),
  ),
  asks: Array.from({ length: DEPTH }, (_, index) =>
    level(basePrice + 0.01 + index * 0.01, index % 10 === 0 ? 6_000 : 100),
  ),
  timestamp: 1,
  seqId: 1,
  prevSeqId: -1,
});

const yieldToEventLoop = (): Promise<void> =>
  new Promise((resolve) => setImmediate(resolve));

const runScenario = async (
  name: string,
  updates: number,
  options: {
    instrumentationEnabled: boolean;
    summaryEnabled: boolean;
    consoleEnabled: boolean;
    burstSize: number;
  },
): Promise<ScenarioResult> => {
  const states = new Map(
    SYMBOLS.map((symbol) => [
      symbol,
      new MarketState(appConfig, instrument(symbol)),
    ]),
  );
  const profiler = new PipelineProfiler({
    enabled: options.instrumentationEnabled,
    maximumSamplesPerStage: performanceConfig.maximumSamplesPerStage,
    maximumStages: performanceConfig.maximumProfiledStages,
  });
  let emittedCharacters = 0;
  const logger = options.consoleEnabled
    ? console.log
    : (message: string): void => {
        emittedCharacters += message.length;
      };
  const reporter = options.summaryEnabled
    ? new MarketReporter(logger)
    : new SilentMarketReporter();
  const engine = new MarketEngine(
    states,
    new SummaryThrottle(options.summaryEnabled ? 0 : Number.MAX_SAFE_INTEGER),
    reporter,
    new ProcessingMonitor(
      {
        ...performanceConfig,
        slowUpdateThresholdMs: Number.MAX_SAFE_INTEGER,
      },
      () => undefined,
    ),
    profiler,
  );
  const sequenceBySymbol = new Map<string, number>();

  for (const [index, symbol] of SYMBOLS.entries()) {
    engine.processOrderBookUpdate(snapshot(symbol, 100 + index * 10));
    sequenceBySymbol.set(symbol, 1);
  }

  const startedAt = performance.now();

  for (let index = 0; index < updates; index += 1) {
    const symbol = SYMBOLS[index % SYMBOLS.length] ?? SYMBOLS[0];
    const symbolIndex = SYMBOLS.indexOf(symbol);
    const basePrice = 100 + symbolIndex * 10;
    const previousSequence = sequenceBySymbol.get(symbol) ?? 1;
    const sequence = previousSequence + 1;
    const depthIndex = index % DEPTH;

    engine.processOrderBookUpdate({
      instId: symbol,
      action: 'update',
      bids: [level(basePrice - depthIndex * 0.01, 5_000 + (index % 500))],
      asks: [
        level(basePrice + 0.01 + depthIndex * 0.01, 5_000 + (index % 700)),
      ],
      timestamp: sequence,
      seqId: sequence,
      prevSeqId: previousSequence,
    });
    sequenceBySymbol.set(symbol, sequence);

    if ((index + 1) % options.burstSize === 0) {
      await yieldToEventLoop();
    }
  }

  const elapsedMs = performance.now() - startedAt;

  return {
    name,
    updates,
    elapsedMs,
    throughput: updates / Math.max(elapsedMs / 1_000, 0.001),
    profile: profiler,
    emittedCharacters,
  };
};

const printScenario = (result: ScenarioResult): void => {
  console.log(
    `${result.name}: ${result.throughput.toFixed(2)} updates/s ` +
      `(${result.elapsedMs.toFixed(2)}ms, bufferedChars=${result.emittedCharacters})`,
  );

  for (const stage of result.profile.getRecentSnapshot().slice(0, 10)) {
    console.log(
      `  ${stage.stage.padEnd(42)} n=${stage.count.toString().padStart(3)} ` +
        `avg=${stage.averageMs.toFixed(4)}ms p50=${stage.p50Ms.toFixed(4)}ms ` +
        `p95=${stage.p95Ms.toFixed(4)}ms p99=${stage.p99Ms.toFixed(4)}ms ` +
        `max=${stage.maximumMs.toFixed(4)}ms`,
    );
  }
};

const combineScenarios = (
  name: string,
  results: readonly ScenarioResult[],
): ScenarioResult => {
  const updates = results.reduce((total, result) => total + result.updates, 0);
  const elapsedMs = results.reduce(
    (total, result) => total + result.elapsedMs,
    0,
  );
  const latest = results[results.length - 1];

  if (!latest) {
    throw new Error('At least one scenario result is required');
  }

  return {
    name,
    updates,
    elapsedMs,
    throughput: updates / Math.max(elapsedMs / 1_000, 0.001),
    profile: latest.profile,
    emittedCharacters: results.reduce(
      (total, result) => total + result.emittedCharacters,
      0,
    ),
  };
};

export const runPerformanceReport = async (
  args: readonly string[] = process.argv.slice(2),
): Promise<void> => {
  const updates = Number(
    args.find((argument) => /^\d+$/.test(argument)) ?? 3_000,
  );
  const consoleEnabled = args.includes('--console');

  if (!Number.isInteger(updates) || updates <= 0) {
    throw new Error(
      'Performance report update count must be a positive integer',
    );
  }

  const coreOptions = {
    summaryEnabled: false,
    consoleEnabled: false,
    burstSize: 100,
  };
  const warmupUpdates = Math.min(updates, 300);

  await runScenario('warmup/no-attribution', warmupUpdates, {
    ...coreOptions,
    instrumentationEnabled: false,
  });
  await runScenario('warmup/attribution', warmupUpdates, {
    ...coreOptions,
    instrumentationEnabled: true,
  });
  const baselineFirst = await runScenario('baseline/first', updates, {
    ...coreOptions,
    instrumentationEnabled: false,
  });
  const attributedFirst = await runScenario('attributed/first', updates, {
    ...coreOptions,
    instrumentationEnabled: true,
  });
  const attributedSecond = await runScenario('attributed/second', updates, {
    ...coreOptions,
    instrumentationEnabled: true,
  });
  const baselineSecond = await runScenario('baseline/second', updates, {
    ...coreOptions,
    instrumentationEnabled: false,
  });
  const baseline = combineScenarios('core/no-attribution', [
    baselineFirst,
    baselineSecond,
  ]);
  const attributed = combineScenarios('core/attribution', [
    attributedFirst,
    attributedSecond,
  ]);
  const summaryUpdates = Math.min(updates, 300);
  const summaries = await runScenario(
    'summary/buffered-console',
    summaryUpdates,
    {
      instrumentationEnabled: true,
      summaryEnabled: true,
      consoleEnabled: false,
      burstSize: 100,
    },
  );
  const terminalSummaries = consoleEnabled
    ? await runScenario(
        'summary/terminal-console',
        Math.min(summaryUpdates, 30),
        {
          instrumentationEnabled: true,
          summaryEnabled: true,
          consoleEnabled: true,
          burstSize: 100,
        },
      )
    : undefined;
  const overheadPercent =
    ((baseline.throughput - attributed.throughput) /
      Math.max(baseline.throughput, 0.001)) *
    100;

  console.log('\nLIVE PERFORMANCE ATTRIBUTION REPORT');
  console.log(
    `Symbols=${SYMBOLS.length} updates=${updates} burst=100 with controlled yields`,
  );
  printScenario(baseline);
  printScenario(attributed);
  printScenario(summaries);
  if (terminalSummaries) {
    printScenario(terminalSummaries);
  }
  console.log(
    `Attribution throughput impact: ${overheadPercent.toFixed(2)}% ` +
      '(positive means lower throughput with attribution)',
  );
  console.log(
    'Timings are observed elapsed time and may include GC or OS scheduling; they do not prove CPU ownership.',
  );
};

if (require.main === module) {
  void runPerformanceReport().catch((error: unknown) => {
    console.error(
      'Performance report failed:',
      error instanceof Error ? error.message : String(error),
    );
    process.exitCode = 1;
  });
}
