import { describe, expect, it } from 'vitest';

import { createChronologicalDatasetSplit } from '../src/research/chronologicalDatasetSplit';
import type { QualifiedAlertOutcomeBundle } from '../src/research/qualifiedAlertOutcomeBundle';

const bundle = (
  alertId: string,
  detectedAt: number,
  evaluationId = 'evaluation-q6',
): QualifiedAlertOutcomeBundle =>
  ({
    schemaVersion: 1,
    evidence: {
      schemaVersion: 1,
      evaluationId,
      alertId,
      instrumentId: 'BTC-USDT',
      detectedAt,
      recordedAt: detectedAt,
      direction: 'BULLISH',
      signalType: 'WHALE_ALERT',
      confidence: 80,
      referencePrice: 100,
      bestBid: 99,
      bestAsk: 101,
      spreadPercent: 2,
      sourceCommit: 'abc123',
      configurationFingerprint: 'config-1',
      qualified: true,
      liveOrderExecutionAllowed: false,
    },
    observations: [],
    completeHorizons: [1, 5, 15, 30, 60],
    complete: true,
    liveOrderExecutionAllowed: false,
  }) as QualifiedAlertOutcomeBundle;

describe('createChronologicalDatasetSplit', () => {
  it('sorts bundles chronologically and creates 60/20/20 partitions', () => {
    const result = createChronologicalDatasetSplit({
      bundles: [
        bundle('alert-5', 5_000),
        bundle('alert-1', 1_000),
        bundle('alert-4', 4_000),
        bundle('alert-2', 2_000),
        bundle('alert-3', 3_000),
      ],
    });

    expect(result.training.map((item) => item.evidence.alertId)).toEqual([
      'alert-1',
      'alert-2',
      'alert-3',
    ]);
    expect(result.validation.map((item) => item.evidence.alertId)).toEqual([
      'alert-4',
    ]);
    expect(result.testing.map((item) => item.evidence.alertId)).toEqual([
      'alert-5',
    ]);
    expect(result.chronological).toBe(true);
    expect(result.complete).toBe(true);
    expect(result.liveOrderExecutionAllowed).toBe(false);
  });

  it('supports custom percentages that total 100', () => {
    const result = createChronologicalDatasetSplit({
      bundles: Array.from({ length: 10 }, (_, index) =>
        bundle(`alert-${index}`, index),
      ),
      trainingPercent: 50,
      validationPercent: 30,
      testingPercent: 20,
    });

    expect(result.training).toHaveLength(5);
    expect(result.validation).toHaveLength(3);
    expect(result.testing).toHaveLength(2);
  });

  it('rejects percentages that do not total 100', () => {
    expect(() =>
      createChronologicalDatasetSplit({
        bundles: Array.from({ length: 5 }, (_, index) =>
          bundle(`alert-${index}`, index),
        ),
        trainingPercent: 50,
        validationPercent: 20,
        testingPercent: 20,
      }),
    ).toThrow('Dataset split percentages must total exactly 100');
  });

  it('rejects mixed evaluations and duplicate timestamps', () => {
    expect(() =>
      createChronologicalDatasetSplit({
        bundles: [
          bundle('a', 1),
          bundle('b', 2),
          bundle('c', 3),
          bundle('d', 4),
          bundle('e', 5, 'another-evaluation'),
        ],
      }),
    ).toThrow('All bundles must belong to the same evaluation');

    expect(() =>
      createChronologicalDatasetSplit({
        bundles: [
          bundle('a', 1),
          bundle('b', 2),
          bundle('c', 3),
          bundle('d', 4),
          bundle('e', 4),
        ],
      }),
    ).toThrow('Bundle detection timestamps must be unique');
  });
});
