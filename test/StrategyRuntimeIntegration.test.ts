import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { WhaleConfirmationEngine } from '../src/confirmation/WhaleConfirmationEngine';
import { appConfig } from '../src/config/appConfig';
import { MarketState } from '../src/core/MarketState';
import { MarketRegimeClassifier } from '../src/regime/MarketRegimeClassifier';
import { StrategyResearchRecorder } from '../src/recording/StrategyResearchRecorder';
import { RuntimeStrategyFeatureAdapter } from '../src/research/RuntimeStrategyFeatureAdapter';
import { CandidateDeduplicator } from '../src/selection/CandidateDeduplicator';
import { CandidatePipeline } from '../src/selection/CandidatePipeline';
import { TradeQualificationEngine } from '../src/selection/TradeQualificationEngine';
import { StrategyRegistry } from '../src/strategies/StrategyRegistry';
import { createStrategyCandidate } from '../src/strategies/StrategyCandidate';
import { TrendContinuationStrategy } from '../src/strategies/TrendContinuationStrategy';

let temporaryDirectory: string | undefined;
let originalDirectory: string | undefined;

afterEach(() => {
  if (originalDirectory !== undefined) process.chdir(originalDirectory);
  if (temporaryDirectory !== undefined) {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
  temporaryDirectory = undefined;
  originalDirectory = undefined;
});

const context = Object.freeze({
  instrumentId: 'BTC-USDT-SWAP',
  observedAt: 2_000_000,
  referencePrice: 100.5,
  fastReturnPercent: 0.15,
  slowReturnPercent: 0.3,
  orderFlowImbalance: 0.5,
  realizedVolatilityPercent: 0.5,
  spreadPercent: 0.02,
  depthNotionalQuote: 2_000_000,
});

const createPipeline = (): CandidatePipeline => {
  const registry = new StrategyRegistry();
  registry.register(
    new TrendContinuationStrategy(
      new MarketRegimeClassifier({
        minimumTrendStrength: 0.1,
        volatileThresholdPercent: 2,
        maximumSpreadPercent: 0.08,
        minimumDepthNotionalQuote: 100_000,
      }),
      {
        minimumFastReturnPercent: 0.05,
        minimumSlowReturnPercent: 0.1,
        minimumOrderFlowImbalance: 0.2,
        minimumExpectedMovePercent: 0.35,
        holdingHorizonMinutes: 60,
        baseConfidence: 65,
      },
    ),
  );
  return new CandidatePipeline(
    registry,
    new CandidateDeduplicator(60 * 60_000),
    new WhaleConfirmationEngine(),
    new TradeQualificationEngine({
      estimatedRoundTripCostPercent: 0.2,
      minimumNetEdgePercent: 0.1,
      minimumBaseConfidence: 60,
      blockedRegimes: ['RANGING', 'VOLATILE', 'ILLIQUID', 'UNKNOWN'],
    }),
  );
};

describe('RuntimeStrategyFeatureAdapter', () => {
  it('builds strategy features from candles, order book, and public trades without whale bias', () => {
    const observedAt = 2_000_000;
    const state = new MarketState(
      appConfig,
      {
        instId: 'BTC-USDT-SWAP',
        instType: 'SWAP',
        quoteCurrency: 'USDT',
        baseUnitsPerSize: 1,
      },
      () => observedAt,
    );
    const firstTimestamp = observedAt - 21 * 60_000;
    for (let index = 0; index < 21; index += 1) {
      const close = 100 + index * 0.2;
      expect(
        state.candleHistory.add({
          instId: 'BTC-USDT-SWAP',
          timestamp: firstTimestamp + index * 60_000,
          open: close - 0.1,
          high: close + 0.2,
          low: close - 0.2,
          close,
          volume: 1,
          volumeCurrency: 1,
          volumeCurrencyQuote: 1_000,
          confirm: true,
        }),
      ).toBe(true);
    }
    expect(
      state.orderBookManager.applyUpdate(
        [['100', '10_000', '0', '1']],
        [['101', '10_000', '0', '1']],
        observedAt,
        1,
        -1,
        'snapshot',
      ),
    ).toBe(true);
    state.tradeFlowTracker.record({
      instId: 'BTC-USDT-SWAP',
      tradeId: 'buy',
      side: 'BUY',
      price: 100.5,
      size: 100,
      timestamp: observedAt,
    });
    state.tradeFlowTracker.record({
      instId: 'BTC-USDT-SWAP',
      tradeId: 'sell',
      side: 'SELL',
      price: 100.5,
      size: 25,
      timestamp: observedAt,
    });

    const result = new RuntimeStrategyFeatureAdapter({
      candleIntervalMs: 60_000,
      fastLookbackCandles: 5,
      slowLookbackCandles: 15,
      volatilityLookbackCandles: 20,
      minimumTradeNotionalQuote: 0,
    }).createContext(state, observedAt);

    expect(result).toMatchObject({
      instrumentId: 'BTC-USDT-SWAP',
      observedAt,
      referencePrice: 100.5,
    });
    expect(result?.fastReturnPercent).toBeGreaterThan(0);
    expect(result?.slowReturnPercent).toBeGreaterThan(0);
    expect(result?.orderFlowImbalance).toBeCloseTo(0.6);
    expect(result?.spreadPercent).toBeGreaterThan(0);
    expect(result?.depthNotionalQuote).toBeGreaterThan(1_000_000);
    expect(Object.keys(result ?? {})).not.toContain('whaleBias');
  });
});

describe('CandidateDeduplicator', () => {
  it('deduplicates across repeated runtime evaluations and supports symbol reset', () => {
    const deduplicator = new CandidateDeduplicator(60_000);
    const first = createStrategyCandidate({
      candidateId: 'first',
      strategyId: 'strategy',
      instrumentId: 'BTC-USDT-SWAP',
      direction: 'BULLISH',
      generatedAt: 1_000,
      referencePrice: 100,
      expectedMovePercent: 0.5,
      holdingHorizonMinutes: 60,
      baseConfidence: 70,
      regime: 'TRENDING',
      rationale: ['test'],
    });
    const repeated = createStrategyCandidate({
      ...first,
      candidateId: 'repeated',
      generatedAt: 20_000,
    });

    expect(deduplicator.deduplicate([first]).accepted).toHaveLength(1);
    expect(deduplicator.deduplicate([repeated])).toMatchObject({
      accepted: [],
      rejectedCandidateIds: ['repeated'],
    });
    deduplicator.resetInstruments(['BTC-USDT-SWAP']);
    expect(deduplicator.deduplicate([repeated]).accepted).toHaveLength(1);
  });
});

describe('StrategyResearchRecorder', () => {
  it('writes isolated paper-only candidate, qualification, and whale datasets', () => {
    temporaryDirectory = mkdtempSync(join(tmpdir(), 'strategy-research-'));
    originalDirectory = process.cwd();
    process.chdir(temporaryDirectory);
    const pipeline = createPipeline();
    const result = pipeline.evaluate({
      strategyContext: context,
      whaleFeaturesByInstrument: new Map(),
    });
    const recorder = new StrategyResearchRecorder({
      outputDirectory: 'research',
      clock: () => context.observedAt,
    });
    recorder.recordEvaluation({
      sourceSessionId: 'session',
      strategyContext: context,
      result,
    });
    recorder.close();

    const candidate = JSON.parse(
      readFileSync('research/strategy-candidates.ndjson', 'utf8').trim(),
    ) as { paperOnly: boolean; liveOrderExecutionAllowed: boolean };
    const qualification = JSON.parse(
      readFileSync('research/strategy-qualifications.ndjson', 'utf8').trim(),
    ) as {
      paperOnly: boolean;
      orderExecutionAuthorized: boolean;
    };
    const whale = JSON.parse(
      readFileSync(
        'research/whale-incremental-observations.ndjson',
        'utf8',
      ).trim(),
    ) as { group: string; finalQualified: boolean };

    expect(candidate).toMatchObject({
      paperOnly: true,
      liveOrderExecutionAllowed: false,
    });
    expect(qualification).toMatchObject({
      paperOnly: true,
      orderExecutionAuthorized: false,
    });
    expect(whale).toMatchObject({
      group: 'WHALE_NEUTRAL',
      finalQualified: true,
    });
  });
});
