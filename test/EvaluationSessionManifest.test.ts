import { describe, expect, it } from 'vitest';

import {
  createConfigurationFingerprint,
  createEvaluationSessionManifest,
} from '../src/research/evaluationSessionManifest';

describe('createEvaluationSessionManifest', () => {
  it('creates an immutable research-only evaluation manifest', () => {
    const manifest = createEvaluationSessionManifest({
      evaluationId: 'eval-2026-08-02-v1',
      sourceCommit: 'abc123',
      configuration: { threshold: 100, nested: { enabled: true } },
      instruments: ['XRP-USDT', 'BTC-USDT', 'BTC-USDT'],
      createdAt: 1_785_635_100_000,
    });

    expect(manifest.instruments).toEqual(['BTC-USDT', 'XRP-USDT']);
    expect(manifest.horizonsMinutes).toEqual([1, 5, 15, 30, 60]);
    expect(manifest.minimumCollectionDays).toBe(30);
    expect(manifest.minimumQualifiedAlerts).toBe(1_000);
    expect(manifest.configurationChangesAllowed).toBe(false);
    expect(manifest.liveOrderExecutionAllowed).toBe(false);
    expect(manifest.orderExecutionAuthorized).toBe(false);
    expect(manifest.dryRunOnly).toBe(true);
    expect(manifest.transportDispatchAllowed).toBe(false);
    expect(manifest.testnetExecutionAuthorized).toBe(false);
    expect(Object.isFrozen(manifest)).toBe(true);
    expect(Object.isFrozen(manifest.instruments)).toBe(true);
  });

  it('generates the same fingerprint regardless of object key order', () => {
    expect(createConfigurationFingerprint({ b: 2, a: 1 })).toBe(
      createConfigurationFingerprint({ a: 1, b: 2 }),
    );
  });

  it('rejects invalid evaluation inputs', () => {
    expect(() =>
      createEvaluationSessionManifest({
        evaluationId: '',
        sourceCommit: 'abc123',
        configuration: {},
        instruments: ['BTC-USDT'],
        createdAt: 1,
      }),
    ).toThrow('evaluationId must not be empty');

    expect(() =>
      createEvaluationSessionManifest({
        evaluationId: 'eval',
        sourceCommit: 'abc123',
        configuration: {},
        instruments: [],
        createdAt: 1,
      }),
    ).toThrow('At least one instrument is required');

    expect(() =>
      createEvaluationSessionManifest({
        evaluationId: 'eval',
        sourceCommit: 'abc123',
        configuration: {},
        instruments: ['BTC-USDT'],
        horizonsMinutes: [1, 1],
        createdAt: 1,
      }),
    ).toThrow('horizonsMinutes must not contain duplicates');
  });
});
