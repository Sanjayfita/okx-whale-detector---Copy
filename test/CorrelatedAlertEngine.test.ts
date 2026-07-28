import { describe, expect, it } from 'vitest';

import {
  CorrelatedAlertEngine,
  type CorrelatedAlertEngineOptions,
} from '../src/alerts/CorrelatedAlertEngine';

import type { CorrelatedMarketSignal } from '../src/external/core/ExternalSignalCorrelationEngine';
import type { MarketEvaluation } from '../src/types/marketEvaluation';

const createEvaluation = (
  overrides: Partial<CorrelatedMarketSignal> = {},
): MarketEvaluation => {
  const correlatedSignal: CorrelatedMarketSignal = {
    symbol: 'BTC-USDT',
    bias: 'BULLISH',
    confidence: 70,
    okxBias: 'BULLISH',
    okxConfidence: 75,
    externalBias: 'BULLISH',
    externalConfidence: 60,
    agreement: 'AGREEMENT',
    bullishExternalScore: 60,
    bearishExternalScore: 0,
    neutralExternalSignals: 0,
    consideredSignals: 1,
    ignoredSignals: 0,
    contributions: [],
    reason: 'OKX and external intelligence agree.',
    timestamp: 1_700_000,
    ...overrides,
  };

  return {
    marketSignal: {
      bias: correlatedSignal.okxBias,
      confidence: correlatedSignal.okxConfidence,
      reason: 'OKX market context',
      bidPressure: 70,
      askPressure: 20,
      netPressure: 50,
      timestamp: correlatedSignal.timestamp,
    },
    correlatedSignal,
  };
};

const createHarness = (
  options: CorrelatedAlertEngineOptions = {},
): {
  engine: CorrelatedAlertEngine;
  advance: (milliseconds: number) => void;
} => {
  let now = 1_000_000;

  return {
    engine: new CorrelatedAlertEngine({
      clock: () => now,
      ...options,
    }),
    advance: (milliseconds) => {
      now += milliseconds;
    },
  };
};

describe('CorrelatedAlertEngine', () => {
  it('does not alert when no external signals were considered', () => {
    const { engine } = createHarness();

    expect(
      engine.evaluate(createEvaluation({ consideredSignals: 0 })),
    ).toBeUndefined();
  });

  it('does not alert for an OKX_ONLY evaluation', () => {
    const { engine } = createHarness();

    expect(
      engine.evaluate(
        createEvaluation({
          agreement: 'OKX_ONLY',
          externalBias: 'NEUTRAL',
          externalConfidence: 0,
        }),
      ),
    ).toBeUndefined();
  });

  it('emits an agreement alert above the configured threshold', () => {
    const { engine } = createHarness();

    const alert = engine.evaluate(createEvaluation({ confidence: 70 }));

    expect(alert).toMatchObject({
      symbol: 'BTC-USDT',
      severity: 'STRONG',
      eventType: 'AGREEMENT',
      bias: 'BULLISH',
      relationship: 'AGREEMENT',
      combinedConfidence: 70,
      okxConfidence: 75,
      externalEffectiveConfidence: 60,
      externalSignalsUsed: 1,
      ignoredExternalSignals: 0,
      createdAt: 1_000_000,
    });
  });

  it('emits a clear contradiction warning above the threshold', () => {
    const { engine } = createHarness();

    const alert = engine.evaluate(
      createEvaluation({
        confidence: 68,
        agreement: 'CONTRADICTION',
        externalBias: 'BEARISH',
        reason: 'Sources disagree.',
      }),
    );

    expect(alert).toMatchObject({
      severity: 'STRONG',
      eventType: 'CONTRADICTION',
      relationship: 'CONTRADICTION',
    });
    expect(alert?.reason).toContain('Contradiction warning:');
  });

  it('does not alert below the minimum combined confidence', () => {
    const { engine } = createHarness();

    expect(
      engine.evaluate(createEvaluation({ confidence: 54.99 })),
    ).toBeUndefined();
  });

  it('suppresses a duplicate evaluation during cooldown', () => {
    const { engine, advance } = createHarness();
    const evaluation = createEvaluation();

    expect(engine.evaluate(evaluation)).toBeDefined();

    advance(59_999);

    expect(engine.evaluate(evaluation)).toBeUndefined();
  });

  it('allows a direction change during cooldown', () => {
    const { engine, advance } = createHarness();

    expect(engine.evaluate(createEvaluation())).toBeDefined();

    advance(1_000);

    const alert = engine.evaluate(
      createEvaluation({
        bias: 'BEARISH',
        okxBias: 'BEARISH',
        externalBias: 'BEARISH',
      }),
    );

    expect(alert?.eventType).toBe('DIRECTION_CHANGED');
    expect(alert?.bias).toBe('BEARISH');
  });

  it('allows a relationship change to contradiction during cooldown', () => {
    const { engine, advance } = createHarness();

    expect(engine.evaluate(createEvaluation())).toBeDefined();

    advance(1_000);

    const alert = engine.evaluate(
      createEvaluation({
        agreement: 'CONTRADICTION',
        externalBias: 'BEARISH',
        reason: 'External evidence conflicts with OKX.',
      }),
    );

    expect(alert?.eventType).toBe('CONTRADICTION');
    expect(alert?.relationship).toBe('CONTRADICTION');
  });

  it('allows a severity increase during cooldown', () => {
    const { engine, advance } = createHarness();

    expect(engine.evaluate(createEvaluation({ confidence: 64 }))).toMatchObject(
      {
        severity: 'WATCH',
      },
    );

    advance(1_000);

    expect(engine.evaluate(createEvaluation({ confidence: 65 }))).toMatchObject(
      {
        severity: 'STRONG',
        eventType: 'CONFIDENCE_INCREASED',
      },
    );
  });

  it('allows a configured confidence increase during cooldown', () => {
    const { engine, advance } = createHarness();

    expect(engine.evaluate(createEvaluation({ confidence: 66 }))).toBeDefined();

    advance(1_000);

    expect(engine.evaluate(createEvaluation({ confidence: 76 }))).toMatchObject(
      {
        severity: 'STRONG',
        eventType: 'CONFIDENCE_INCREASED',
        combinedConfidence: 76,
      },
    );
  });

  it('suppresses small confidence changes during cooldown', () => {
    const { engine, advance } = createHarness();

    expect(engine.evaluate(createEvaluation({ confidence: 66 }))).toBeDefined();

    advance(1_000);

    expect(
      engine.evaluate(createEvaluation({ confidence: 75.99 })),
    ).toBeUndefined();
  });

  it('allows a repeated alert after cooldown expires', () => {
    const { engine, advance } = createHarness();
    const evaluation = createEvaluation();

    expect(engine.evaluate(evaluation)).toBeDefined();

    advance(60_000);

    expect(engine.evaluate(evaluation)).toMatchObject({
      eventType: 'AGREEMENT',
      combinedConfidence: 70,
    });
  });

  it('resetSymbol removes only the requested symbol state', () => {
    const { engine } = createHarness();
    const btc = createEvaluation({ symbol: 'BTC-USDT' });
    const eth = createEvaluation({ symbol: 'ETH-USDT' });

    expect(engine.evaluate(btc)).toBeDefined();
    expect(engine.evaluate(eth)).toBeDefined();

    engine.resetSymbol('BTC-USDT');

    expect(engine.evaluate(btc)).toBeDefined();
    expect(engine.evaluate(eth)).toBeUndefined();
  });

  it('clear removes all retained symbol state', () => {
    const { engine } = createHarness();
    const btc = createEvaluation({ symbol: 'BTC-USDT' });
    const eth = createEvaluation({ symbol: 'ETH-USDT' });

    expect(engine.evaluate(btc)).toBeDefined();
    expect(engine.evaluate(eth)).toBeDefined();

    engine.clear();

    expect(engine.evaluate(btc)).toBeDefined();
    expect(engine.evaluate(eth)).toBeDefined();
  });

  it('produces no alerts when disabled', () => {
    const { engine } = createHarness({ enabled: false });

    expect(engine.evaluate(createEvaluation())).toBeUndefined();
  });

  it('maintains independent SPOT and SWAP symbol state', () => {
    const { engine } = createHarness();
    const spot = createEvaluation({ symbol: 'BTC-USDT' });
    const swap = createEvaluation({ symbol: 'BTC-USDT-SWAP' });

    expect(engine.evaluate(spot)).toBeDefined();
    expect(engine.evaluate(swap)).toBeDefined();
    expect(engine.evaluate(spot)).toBeUndefined();
    expect(engine.evaluate(swap)).toBeUndefined();
  });

  it('uses the existing correlated result without recalculating it', () => {
    const { engine } = createHarness();
    const evaluation = createEvaluation({
      bias: 'BEARISH',
      confidence: 73,
      okxBias: 'BULLISH',
      okxConfidence: 91,
      externalBias: 'BEARISH',
      externalConfidence: 57,
      agreement: 'CONTRADICTION',
    });

    evaluation.marketSignal.bias = 'NEUTRAL';
    evaluation.marketSignal.confidence = 0;

    expect(engine.evaluate(evaluation)).toMatchObject({
      bias: 'BEARISH',
      combinedConfidence: 73,
      okxConfidence: 91,
      externalEffectiveConfidence: 57,
      relationship: 'CONTRADICTION',
    });
  });

  it.each([
    [40, 'INFO'],
    [55, 'WATCH'],
    [65, 'STRONG'],
    [80, 'CRITICAL'],
  ] as const)('classifies %s confidence as %s', (confidence, severity) => {
    const { engine } = createHarness({ minimumCombinedConfidence: 40 });

    expect(engine.evaluate(createEvaluation({ confidence }))).toMatchObject({
      severity,
    });
  });

  it('uses NEW_SIGNAL for a qualifying external-only evaluation', () => {
    const { engine } = createHarness();

    expect(
      engine.evaluate(
        createEvaluation({
          agreement: 'EXTERNAL_ONLY',
          okxBias: 'NEUTRAL',
          okxConfidence: 0,
          externalBias: 'BULLISH',
        }),
      ),
    ).toMatchObject({
      eventType: 'NEW_SIGNAL',
      relationship: 'EXTERNAL_ONLY',
    });
  });
});
