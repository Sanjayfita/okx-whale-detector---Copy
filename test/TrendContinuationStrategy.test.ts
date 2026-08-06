import { describe, expect, it } from 'vitest';

import { MarketRegimeClassifier } from '../src/regime/MarketRegimeClassifier';
import { analyzeWhaleIncrementalValue } from '../src/research/whaleIncrementalValueResearch';
import { TrendContinuationStrategy } from '../src/strategies/TrendContinuationStrategy';

const classifier = new MarketRegimeClassifier({
  minimumTrendStrength: 0.1,
  volatileThresholdPercent: 2,
  maximumSpreadPercent: 0.08,
  minimumDepthNotionalQuote: 100_000,
});

const strategy = new TrendContinuationStrategy(classifier, {
  minimumFastReturnPercent: 0.05,
  minimumSlowReturnPercent: 0.1,
  minimumOrderFlowImbalance: 0.2,
  minimumExpectedMovePercent: 0.3,
  holdingHorizonMinutes: 60,
  baseConfidence: 65,
});

describe('TrendContinuationStrategy', () => {
  it('creates an independent bullish candidate only in a liquid trending regime', () => {
    const candidate = strategy.evaluate({
      instrumentId: 'BTC-USDT-SWAP',
      observedAt: 1_000,
      referencePrice: 60_000,
      fastReturnPercent: 0.08,
      slowReturnPercent: 0.15,
      orderFlowImbalance: 0.35,
      realizedVolatilityPercent: 0.8,
      spreadPercent: 0.02,
      depthNotionalQuote: 1_000_000,
    });

    expect(candidate?.direction).toBe('BULLISH');
    expect(candidate?.strategyId).toBe('TREND_CONTINUATION_V1');
    expect(candidate?.expectedMovePercent).toBe(0.3);
    expect(candidate?.liveOrderExecutionAllowed).toBe(false);
  });

  it('rejects an otherwise aligned setup when liquidity is insufficient', () => {
    const candidate = strategy.evaluate({
      instrumentId: 'BTC-USDT-SWAP',
      observedAt: 2_000,
      referencePrice: 60_000,
      fastReturnPercent: 0.08,
      slowReturnPercent: 0.15,
      orderFlowImbalance: 0.35,
      realizedVolatilityPercent: 0.8,
      spreadPercent: 0.2,
      depthNotionalQuote: 10_000,
    });

    expect(candidate).toBeUndefined();
  });
});

describe('whale incremental-value research', () => {
  it('reports differences and intervals without claiming inference from small groups', () => {
    const report = analyzeWhaleIncrementalValue(
      [
        {
          observationId: 'support',
          observedAt: 1,
          whaleGroup: 'WHALE_SUPPORTS',
          netReturnPercent: 0.2,
        },
        {
          observationId: 'neutral',
          observedAt: 2,
          whaleGroup: 'WHALE_NEUTRAL',
          netReturnPercent: 0.1,
        },
        {
          observationId: 'contradict',
          observedAt: 3,
          whaleGroup: 'WHALE_CONTRADICTS',
          netReturnPercent: -0.1,
        },
      ],
      {
        minimumObservationsPerGroup: 100,
        bootstrapIterations: 100,
        bootstrapBlockSize: 1,
      },
    );

    expect(report.supportIncrementPercent).toBeCloseTo(0.1333333333);
    expect(report.contradictionIncrementPercent).toBeCloseTo(-0.1666666667);
    expect(report.groups).toHaveLength(4);
    expect(report.sufficientForInference).toBe(false);
    expect(report.liveOrderExecutionAllowed).toBe(false);
  });
});
