import { describe, expect, it, vi } from 'vitest';
import type { CorrelatedAlert } from '../src/types/correlatedAlert';
import type { CorrelatedAlertRecordContext } from '../src/types/correlatedAlertEvaluation';
import { EvidenceCollectionRuntime } from '../src/research/evidenceCollectionRuntime';

const alert: CorrelatedAlert = {
  id: 'correlated-alert:session-1:1',
  sourceSessionId: 'session-1',
  alertSequence: 1,
  symbol: 'BTC-USDT',
  severity: 'STRONG',
  eventType: 'AGREEMENT',
  bias: 'BULLISH',
  relationship: 'AGREEMENT',
  combinedConfidence: 82,
  alertImportance: 75,
  okxConfidence: 80,
  externalEffectiveConfidence: 85,
  externalSignalsUsed: 1,
  ignoredExternalSignals: 0,
  reason: 'test alert',
  createdAt: 1_000,
};

const context: CorrelatedAlertRecordContext = {
  provenance: 'LIVE',
  evaluationContext: {
    instId: 'BTC-USDT',
    instType: 'SPOT',
    okxBias: 'BULLISH',
    externalBias: 'BULLISH',
    sourceSignalTimestamp: 900,
    sourceMarketTimestamp: 1_000,
    referenceTimestamp: 1_000,
    referenceMidpoint: 60_000,
    referenceBestBid: 59_999,
    referenceBestAsk: 60_001,
    referenceSpread: 2,
    referenceSpreadPercent: (2 / 60_000) * 100,
    sourceSignalIds: ['external-1'],
  },
};

describe('EvidenceCollectionRuntime', () => {
  it('initializes, serializes a live alert, and processes due observations', async () => {
    const evidence = { alertId: alert.id };
    const bridge = {
      createEvidence: vi.fn(() => evidence),
    };
    const collector = {
      initialize: vi.fn(async () => undefined),
      recordQualifiedAlert: vi.fn(async () => undefined),
      processDueObservations: vi.fn(async () => 2),
    };
    const setIntervalFn = vi.fn(() => 123 as unknown as NodeJS.Timeout);
    const clearIntervalFn = vi.fn();
    const runtime = new EvidenceCollectionRuntime({
      bridge: bridge as never,
      collector: collector as never,
      clock: () => 1_001,
      setIntervalFn,
      clearIntervalFn,
    });

    await runtime.start();
    runtime.onPersistedLiveAlert(alert, context);
    const completed = await runtime.processNow();
    await runtime.stop();

    expect(collector.initialize).toHaveBeenCalledOnce();
    expect(bridge.createEvidence).toHaveBeenCalledWith({
      alert,
      evaluationContext: context.evaluationContext,
      recordedAt: 1_001,
    });
    expect(collector.recordQualifiedAlert).toHaveBeenCalledWith(evidence);
    expect(completed).toBe(2);
    expect(clearIntervalFn).toHaveBeenCalledOnce();
  });

  it('reports alerts received before startup without recording them', () => {
    const onError = vi.fn();
    const collector = {
      initialize: vi.fn(async () => undefined),
      recordQualifiedAlert: vi.fn(async () => undefined),
      processDueObservations: vi.fn(async () => 0),
    };
    const runtime = new EvidenceCollectionRuntime({
      bridge: { createEvidence: vi.fn() } as never,
      collector: collector as never,
      onError,
    });

    runtime.onPersistedLiveAlert(alert, context);

    expect(onError).toHaveBeenCalledOnce();
    expect(collector.recordQualifiedAlert).not.toHaveBeenCalled();
  });

  it('rejects invalid polling intervals', () => {
    expect(
      () =>
        new EvidenceCollectionRuntime({
          bridge: {} as never,
          collector: {} as never,
          intervalMs: 0,
        }),
    ).toThrow('intervalMs must be a positive safe integer');
  });
});
