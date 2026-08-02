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
  loadBootstrap?: typeof loadEvidenceCollectBootstrap;
  createPriceReader?: () => OKXLivePriceReader;
  createRuntimeBundle?: typeof createEvidenceCollectRuntimeBundle;
  createAppRuntime?: (dependencies: {
    correlatedAlertRecorder: EvidenceAwareCorrelatedAlertRecorder;
  }) => Promise<AppRuntimeLike>;
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

const loadDefaultAppRuntime = async (dependencies: {
  correlatedAlertRecorder: EvidenceAwareCorrelatedAlertRecorder;
}): Promise<AppRuntimeLike> => {
  process.env.OKX_SKIP_AUTO_START = '1';
  const module = await import('../index');
  return module.createAppRuntime(dependencies);
};

export const runEvidenceCollectCommand = async (
  evaluationId: string,
  dependencies: EvidenceCollectCommandDependencies = {},
): Promise<EvidenceCollectCommandHandle> => {
  const loadBootstrap = dependencies.loadBootstrap ?? loadEvidenceCollectBootstrap;
  const createPriceReader =
    dependencies.createPriceReader ?? (() => new OKXLivePriceReader());
  const createRuntimeBundle =
    dependencies.createRuntimeBundle ?? createEvidenceCollectRuntimeBundle;
  const createAppRuntime = dependencies.createAppRuntime ?? loadDefaultAppRuntime;
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
    appRuntime = await createAppRuntime({ correlatedAlertRecorder });
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

  log('LIVE EVIDENCE COLLECTION STARTED');
  log(`Evaluation ID: ${bootstrap.manifest.evaluationId}`);
  log(`Directory: ${bootstrap.evaluationDirectory}`);
  log('Public market data only. Live order execution remains disabled.');

  return Object.freeze({
    evaluationId: bootstrap.manifest.evaluationId,
    stop,
    liveOrderExecutionAllowed: false,
  });
};

const runFromCli = async (): Promise<void> => {
  const evaluationId = process.argv[2]?.trim();
  if (!evaluationId) {
    throw new Error('Usage: collectEvidence <evaluationId>');
  }
  await runEvidenceCollectCommand(evaluationId);
};

if (require.main === module) {
  void runFromCli().catch((error: unknown) => {
    console.error('Evidence collection failed:', error);
    process.exitCode = 1;
  });
}
