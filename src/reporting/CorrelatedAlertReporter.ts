import type { CorrelatedAlert } from '../types/correlatedAlert';

export class CorrelatedAlertReporter {
  public report(alert: CorrelatedAlert): void {
    console.log(
      `🚨 CORRELATED ALERT | ${alert.symbol} | ${alert.severity}\n` +
        `Event: ${alert.eventType}\n` +
        `Bias: ${alert.bias}\n` +
        `Relationship: ${alert.relationship}\n` +
        `Combined confidence: ${alert.combinedConfidence.toFixed(1)}%\n` +
        `OKX confidence: ${alert.okxConfidence.toFixed(1)}%\n` +
        `External confidence: ${alert.externalEffectiveConfidence.toFixed(1)}%\n` +
        `External signals used: ${alert.externalSignalsUsed}\n` +
        `Ignored external signals: ${alert.ignoredExternalSignals}\n` +
        `Reason: ${alert.reason}`,
    );
  }
}
