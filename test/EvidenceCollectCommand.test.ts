import { describe, expect, it, vi } from 'vitest';

import { runEvidenceCollectCommand } from '../src/tools/collectEvidence';
import type { EvidenceCollectBootstrap } from '../src/research/evidenceCollectBootstrap';
import type { createEvidenceCollectRuntimeBundle } from '../src/research/evidenceCollectRuntimeFactory';
import type { OKXLivePriceReader } from '../src/research/okxLivePriceReader';

const bootstrap: EvidenceCollectBootstrap = {
  evaluationDirectory: 'data/evaluations/eval-test',
  liveOrderExecutionAllowed: false,
  manifest: {
    schemaVersion: 1,
    evaluationId: 'eval-test',
    sourceCommit: 'abc123',
    configurationFingerprint: 'fingerprint',
    configuration: {},
    instruments: ['BTC-USDT'],
    horizonsMinutes: [1, 5, 15, 30, 60],
    minimumCollectionDays: 30,
    minimumQualifiedAlerts: 1_000,
    createdAt: 1,
    configurationChangesAllowed: false,
    liveOrderExecutionAllowed: false,
    orderExecutionAuthorized: false,
    dryRunOnly: true,
    transportDispatchAllowed: false,
    testnetExecutionAuthorized: false,
  },
};

describe('runEvidenceCollectCommand', () => {
  it('starts research evidence collection and shuts down both runtimes once', async () => {
    const runtimeStart = vi.fn(async () => undefined);
    const runtimeStop = vi.fn(async () => undefined);
    const appShutdown = vi.fn(async () => undefined);
    const polymarketStart = vi.fn(async () => undefined);
    const signalHandlers = new Map<NodeJS.Signals, () => void>();

    const createRuntimeBundle = vi.fn(() => ({
      runtime: {
        start: runtimeStart,
        stop: runtimeStop,
        onPersistedLiveAlert: vi.fn(),
      },
      liveOrderExecutionAllowed: false,
    })) as unknown as typeof createEvidenceCollectRuntimeBundle;

    const handle = await runEvidenceCollectCommand('eval-test', {
      loadBootstrap: vi.fn(async () => bootstrap),
      createPriceReader: () =>
        ({ readPrice: vi.fn() }) as unknown as OKXLivePriceReader,
      createRuntimeBundle,
      createAppRuntime: vi.fn(async () => ({
        polymarketRuntime: { start: polymarketStart },
        shutdown: appShutdown,
      })),
      registerSignal: (signal, handler) => {
        signalHandlers.set(signal, handler);
      },
      log: vi.fn(),
      error: vi.fn(),
    });

    expect(runtimeStart).toHaveBeenCalledOnce();
    expect(polymarketStart).toHaveBeenCalledOnce();
    expect(handle.evaluationId).toBe('eval-test');
    expect(handle.liveOrderExecutionAllowed).toBe(false);
    expect(signalHandlers.has('SIGINT')).toBe(true);
    expect(signalHandlers.has('SIGTERM')).toBe(true);

    await handle.stop('SIGTERM');
    await handle.stop('SIGTERM');

    expect(runtimeStop).toHaveBeenCalledOnce();
    expect(appShutdown).toHaveBeenCalledOnce();
    expect(appShutdown).toHaveBeenCalledWith('SIGTERM');
  });

  it('stops the evidence runtime when application startup fails', async () => {
    const runtimeStop = vi.fn(async () => undefined);
    const createRuntimeBundle = vi.fn(() => ({
      runtime: {
        start: vi.fn(async () => undefined),
        stop: runtimeStop,
        onPersistedLiveAlert: vi.fn(),
      },
      liveOrderExecutionAllowed: false,
    })) as unknown as typeof createEvidenceCollectRuntimeBundle;

    await expect(
      runEvidenceCollectCommand('eval-test', {
        loadBootstrap: vi.fn(async () => bootstrap),
        createPriceReader: () =>
          ({ readPrice: vi.fn() }) as unknown as OKXLivePriceReader,
        createRuntimeBundle,
        createAppRuntime: vi.fn(async () => {
          throw new Error('startup failed');
        }),
        registerSignal: vi.fn(),
        log: vi.fn(),
        error: vi.fn(),
      }),
    ).rejects.toThrow('startup failed');

    expect(runtimeStop).toHaveBeenCalledOnce();
  });
});
