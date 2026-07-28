import type { CorrelatedMarketSignal } from '../external/core/ExternalSignalCorrelationEngine';
import type { MarketBias } from './signal';

export type CorrelatedAlertSeverity = 'INFO' | 'WATCH' | 'STRONG' | 'CRITICAL';

export type CorrelatedAlertEventType =
  | 'NEW_SIGNAL'
  | 'CONFIDENCE_INCREASED'
  | 'DIRECTION_CHANGED'
  | 'AGREEMENT'
  | 'CONTRADICTION';

export interface CorrelatedAlert {
  id: string;
  symbol: string;
  severity: CorrelatedAlertSeverity;
  eventType: CorrelatedAlertEventType;
  bias: MarketBias;
  relationship: CorrelatedMarketSignal['agreement'];
  combinedConfidence: number;
  okxConfidence: number;
  externalEffectiveConfidence: number;
  externalSignalsUsed: number;
  ignoredExternalSignals: number;
  reason: string;
  createdAt: number;
}
