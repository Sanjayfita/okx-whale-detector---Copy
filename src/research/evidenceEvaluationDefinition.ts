import { appConfig } from '../config/appConfig';
import { WATCHLIST } from '../config/symbols';
import { createAlphaResearchConfig } from './alphaResearchConfig';
import { ALPHA_FEATURE_REGISTRY_VERSION } from './alphaFeatureRegistry';
import { createAlphaResearchConfigurationFingerprint } from './alphaResearchFingerprint';
import type { AlertOutcomeHorizonMinutes } from './alertOutcomeObservation';

export const EVIDENCE_EVENT_GENERATOR_POLICY =
  'OKX_WHALE_SIGNAL_ONLY_V1' as const;

export interface EvidenceEvaluationDefinition {
  readonly configuration: Readonly<Record<string, unknown>>;
  readonly instruments: readonly string[];
  readonly horizonsMinutes: readonly AlertOutcomeHorizonMinutes[];
  readonly minimumCollectionDays: number;
  readonly minimumQualifiedAlerts: number;
  readonly minimumInstruments: number;
}

export const createCurrentEvidenceEvaluationDefinition =
  (): EvidenceEvaluationDefinition => {
    const alphaResearchConfig = createAlphaResearchConfig();
    const instruments = Object.freeze([...new Set(WATCHLIST)].sort());
    const horizonsMinutes = Object.freeze([1, 5, 15, 30, 60] as const);
    const minimumCollectionDays = 30;
    const minimumQualifiedAlerts = 1_000;
    const minimumInstruments = Math.min(2, instruments.length);
    const configuration = Object.freeze({
      application: appConfig,
      watchlist: instruments,
      evidenceProtocol: Object.freeze({
        eventGeneratorPolicy: EVIDENCE_EVENT_GENERATOR_POLICY,
        externalSignalsMayQualifyEvents: false,
        publicOkxMarketDataOnly: true,
      }),
      alphaResearchConfig,
      alphaResearchConfigurationFingerprint:
        createAlphaResearchConfigurationFingerprint(alphaResearchConfig),
      alphaFeatureRegistryVersion: ALPHA_FEATURE_REGISTRY_VERSION,
      collection: Object.freeze({
        minimumCollectionDays,
        minimumQualifiedAlerts,
        minimumInstruments,
        horizonsMinutes,
      }),
    });
    return Object.freeze({
      configuration,
      instruments,
      horizonsMinutes,
      minimumCollectionDays,
      minimumQualifiedAlerts,
      minimumInstruments,
    });
  };
