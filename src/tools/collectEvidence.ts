import { appConfig } from '../config/appConfig';
import { EvidenceAwareCorrelatedAlertRecorder } from '../research/evidenceAwareCorrelatedAlertRecorder';
import { loadEvidenceCollectBootstrap } from '../research/evidenceCollectBootstrap';
import { createEvidenceCollectRuntimeBundle } from '../research/evidenceCollectRuntimeFactory';
import { OKXLivePriceReader } from '../research/okxLivePriceReader';
import type { AppShutdownReason } from '../runtime/AppShutdownCoordinator';

interface AppRuntimeLike {
  polymarketRuntime: { start: () => Promise<void> | void };
  shutdown: (signal: AppShutdownReason) => Promise<void>;
}

export interface EvidenceCollectCommandDependencies {
  createAppRuntime: (dependencies: {
    correlatedAlertRecorder: EvidenceAwareCorrelatedAlertRecorder;
  }) => Promise<AppRuntimeLike>;
  loadBootstrap?: typeof loadEvidenceCollectBootstrap;
  createPriceReader?: () => OKXLivePriceReader;
  createRuntimeBundle?: typeof createEvidenceCollectRuntimeBundle;
  registerSignal?: (
    signal: NodeJS.Signals,
    handler: () => void,
  ) => void;
  log?: (message: string) => void;
  error?: (message: string, error?: unknown) => void;
}

export interface EvidenceCollectCommandHandle {
  evaluationId: string;
  stop: (signal?: AppShutdownReason) => Promise<void>;
  liveOrderExecutionAllowed: false;
}

export const runEvidenceCollectCommand = async (
  evaluationId: string,
  dependencies: EvidenceCollectCommandDependencies,
): Promise<EvidenceCollectCommandHandle> => {
  const loadBootstrap = dependencies.loadBootstrap ?? loadEvidenceCollectBootstrap;
  const createPriceReader =
    dependencies.createPriceReader ?? (() => new OKXLivePriceReader());
  const createRuntimeBundle =
    dependencies.createRuntimeBundle ?? createEvidenceCollectRuntimeBundle;
  const registerSignal =
    dependencies.registerSignal ??
    ((signal, handler) => {
      process.once(signal, handler);
    });
  const log = dependencies.log ?? console.log;
  const error = dependencies.error ?? console.error;

  const bootstrap = await loadBootstrap(evaluationId);
  const priceReader = createPriceReader();
  const bundle = createRuntimeBundle({
    bootstrap,
    readPrice: priceReader.readPrice,
    onError: (runtimeError) => {
      error('Evidence collection runtime error:', runtimeError);
    },
  });

  await bundle.runtime.start();

  const correlatedAlertRecorder = new EvidenceAwareCorrelatedAlertRecorder({
    enabled: appConfig.correlatedAlertRecording.enabled,
    outputPath: appConfig.correlatedAlertRecording.outputPath,
    flushAfterEachAlert: appConfig.correlatedAlertRecording.flushAfterEachAlert,
    onPersistedLiveAlert: bundle.runtime.onPersistedLiveAlert,
  });

  let appRuntime: AppRuntimeLike;
  try {
    appRuntime = await dependencies.createAppRuntime({ correlatedAlertRecorder });
  } catch (startupError) {
    await bundle.runtime.stop();
    correlatedAlertRecorder.close();
    throw startupError;
  }

  void Promise.resolve(appRuntime.polymarketRuntime.start()).catch(
    (polymarketError: unknown) => {
      error('Polymarket live ingestion failed:', polymarketError);
    },
  );

  let stopped = false;
  const stop = async (
    signal: AppShutdownReason = 'SIGINT',
  ): Promise<void> => {
    if (stopped) return;
    stopped = true;
    await bundle.runtime.stop();
    await appRuntime.shutdown(signal);
  };

  registerSignal('SIGINT', () => {
    void stop('SIGINT').catch((shutdownError: unknown) => {
      error('Evidence collection shutdown failed:', shutdownError);
      process.exitCode = 1;
    });
  });
  registerSignal('SIGTERM', () => {
    void stop('SIGTERM').catch((shutdownError: unknown) => {
      error('Evidence collection shutdown failed:', shutdownError);
      process.exitCode = 1;
    });
  });

  log('LIVE EVIDENCE COLLECTION COORDINATOR STARTED');
  log(`Evaluation ID: ${bootstrap.manifest.evaluationId}`);
  log(`Directory: ${bootstrap.evaluationDirectory}`);
  log('Public market data only. Live order execution remains disabled.');

  return Object.freeze({
    evaluationId: bootstrap.manifest.evaluationId,
    stop,
    liveOrderExecutionAllowed: false,
  });
};

const main = async (): Promise<void> => {
  const evaluationId = process.argv[2] ?? 'eval-2026-08-02-v1';
  process.env.OKX_SKIP_AUTO_START = '1';
  const { createAppRuntime } = await import('../index');
  await runEvidenceCollectCommand(evaluationId, { createAppRuntime });
};

if (require.main === module) {
  void main().catch((error: unknown) => {
    console.error(
      `Evidence collection failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    process.exitCode = 1;
  });
}
