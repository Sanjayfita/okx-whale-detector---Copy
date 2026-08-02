import type { CorrelatedAlert } from '../types/correlatedAlert';
import type { CorrelatedAlertEvaluationContext } from '../types/correlatedAlertEvaluation';
import {
  createQualifiedAlertEvidenceRecord,
  type QualifiedAlertEvidenceRecord,
} from './qualifiedAlertEvidence';

export interface CorrelatedAlertEvidenceIdentity {
  evaluationId: string;
  sourceCommit: string;
  configurationFingerprint: string;
}

export interface CorrelatedAlertEvidenceBridgeInput {
  alert: CorrelatedAlert;
  evaluationContext: CorrelatedAlertEvaluationContext;
  recordedAt: number;
}

export class CorrelatedAlertEvidenceBridge {
  public constructor(private readonly identity: CorrelatedAlertEvidenceIdentity) {
    if (
      identity.evaluationId.trim().length === 0 ||
      identity.sourceCommit.trim().length === 0 ||
      identity.configurationFingerprint.trim().length === 0
    ) {
      throw new Error('Evidence identity fields must not be empty');
    }
  }

  public createEvidence(
    input: CorrelatedAlertEvidenceBridgeInput,
  ): QualifiedAlertEvidenceRecord {
    const { alert, evaluationContext } = input;

    if (evaluationContext.instId !== alert.symbol) {
      throw new Error('Alert symbol does not match its evaluation context');
    }
    if (alert.bias !== 'BULLISH' && alert.bias !== 'BEARISH') {
      throw new Error('Only directional correlated alerts qualify for evidence');
    }

    return createQualifiedAlertEvidenceRecord({
      evaluationId: this.identity.evaluationId,
      alertId: alert.id,
      instrumentId: alert.symbol,
      detectedAt: alert.createdAt,
      recordedAt: input.recordedAt,
      direction: alert.bias,
      signalType: `${alert.eventType}:${alert.relationship}:${alert.severity}`,
      confidence: alert.combinedConfidence,
      referencePrice: evaluationContext.referenceMidpoint,
      bestBid: evaluationContext.referenceBestBid,
      bestAsk: evaluationContext.referenceBestAsk,
      spreadPercent: evaluationContext.referenceSpreadPercent,
      sourceCommit: this.identity.sourceCommit,
      configurationFingerprint: this.identity.configurationFingerprint,
    });
  }
}
