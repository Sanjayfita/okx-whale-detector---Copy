import type { CorrelatedMarketSignal } from '../external/core/ExternalSignalCorrelationEngine';
import type {
  CorrelatedAlert,
  CorrelatedAlertEventType,
  CorrelatedAlertSeverity,
} from '../types/correlatedAlert';
import type { MarketEvaluation } from '../types/marketEvaluation';

export interface CorrelatedAlertEngineOptions {
  enabled?: boolean;
  minimumCombinedConfidence?: number;
  cooldownMs?: number;
  confidenceChangeThreshold?: number;
  clock?: () => number;
}

interface CorrelatedAlertState {
  bias: CorrelatedMarketSignal['bias'];
  relationship: CorrelatedMarketSignal['agreement'];
  severity: CorrelatedAlertSeverity;
  combinedConfidence: number;
  emittedAt: number;
}

const DEFAULT_OPTIONS = {
  enabled: true,
  minimumCombinedConfidence: 55,
  cooldownMs: 60_000,
  confidenceChangeThreshold: 10,
} as const;

const SEVERITY_RANK: Readonly<Record<CorrelatedAlertSeverity, number>> = {
  INFO: 0,
  WATCH: 1,
  STRONG: 2,
  CRITICAL: 3,
};

export class CorrelatedAlertEngine {
  private readonly enabled: boolean;
  private readonly minimumCombinedConfidence: number;
  private readonly cooldownMs: number;
  private readonly confidenceChangeThreshold: number;
  private readonly clock: () => number;
  private readonly states = new Map<string, CorrelatedAlertState>();
  private nextAlertId = 1;

  public constructor(options: CorrelatedAlertEngineOptions = {}) {
    this.enabled = options.enabled ?? DEFAULT_OPTIONS.enabled;
    this.minimumCombinedConfidence =
      options.minimumCombinedConfidence ??
      DEFAULT_OPTIONS.minimumCombinedConfidence;
    this.cooldownMs = options.cooldownMs ?? DEFAULT_OPTIONS.cooldownMs;
    this.confidenceChangeThreshold =
      options.confidenceChangeThreshold ??
      DEFAULT_OPTIONS.confidenceChangeThreshold;
    this.clock = options.clock ?? Date.now;

    this.validateOptions();
  }

  public evaluate(evaluation: MarketEvaluation): CorrelatedAlert | undefined {
    const correlatedSignal = evaluation.correlatedSignal;

    if (
      !this.enabled ||
      !correlatedSignal ||
      correlatedSignal.consideredSignals === 0 ||
      correlatedSignal.agreement === 'OKX_ONLY' ||
      correlatedSignal.confidence < this.minimumCombinedConfidence
    ) {
      return undefined;
    }

    const severity = this.getSeverity(correlatedSignal.confidence);
    const previous = this.states.get(correlatedSignal.symbol);
    const createdAt = this.clock();

    if (
      previous &&
      createdAt - previous.emittedAt < this.cooldownMs &&
      !this.canBypassCooldown(correlatedSignal, severity, previous)
    ) {
      return undefined;
    }

    const eventType = this.getEventType(correlatedSignal, previous);
    const alert: CorrelatedAlert = {
      id: `correlated-alert:${correlatedSignal.symbol}:${createdAt}:${this.nextAlertId}`,
      symbol: correlatedSignal.symbol,
      severity,
      eventType,
      bias: correlatedSignal.bias,
      relationship: correlatedSignal.agreement,
      combinedConfidence: correlatedSignal.confidence,
      okxConfidence: correlatedSignal.okxConfidence,
      externalEffectiveConfidence: correlatedSignal.externalConfidence,
      externalSignalsUsed: correlatedSignal.consideredSignals,
      ignoredExternalSignals: correlatedSignal.ignoredSignals,
      reason: this.getReason(correlatedSignal),
      createdAt,
    };

    this.nextAlertId += 1;
    this.states.set(correlatedSignal.symbol, {
      bias: correlatedSignal.bias,
      relationship: correlatedSignal.agreement,
      severity,
      combinedConfidence: correlatedSignal.confidence,
      emittedAt: createdAt,
    });

    return alert;
  }

  public resetSymbol(symbol: string): void {
    this.states.delete(symbol);
  }

  public clear(): void {
    this.states.clear();
  }

  private canBypassCooldown(
    signal: CorrelatedMarketSignal,
    severity: CorrelatedAlertSeverity,
    previous: CorrelatedAlertState,
  ): boolean {
    return (
      signal.bias !== previous.bias ||
      (signal.agreement === 'CONTRADICTION' &&
        previous.relationship !== 'CONTRADICTION') ||
      SEVERITY_RANK[severity] > SEVERITY_RANK[previous.severity] ||
      Math.abs(signal.confidence - previous.combinedConfidence) >=
        this.confidenceChangeThreshold
    );
  }

  private getEventType(
    signal: CorrelatedMarketSignal,
    previous: CorrelatedAlertState | undefined,
  ): CorrelatedAlertEventType {
    if (
      previous &&
      signal.agreement === 'CONTRADICTION' &&
      previous.relationship !== 'CONTRADICTION'
    ) {
      return 'CONTRADICTION';
    }

    if (previous && signal.bias !== previous.bias) {
      return 'DIRECTION_CHANGED';
    }

    if (previous && signal.confidence > previous.combinedConfidence) {
      return 'CONFIDENCE_INCREASED';
    }

    if (signal.agreement === 'AGREEMENT') {
      return 'AGREEMENT';
    }

    if (signal.agreement === 'CONTRADICTION') {
      return 'CONTRADICTION';
    }

    return 'NEW_SIGNAL';
  }

  private getSeverity(confidence: number): CorrelatedAlertSeverity {
    if (confidence >= 80) {
      return 'CRITICAL';
    }

    if (confidence >= 65) {
      return 'STRONG';
    }

    if (confidence >= 55) {
      return 'WATCH';
    }

    return 'INFO';
  }

  private getReason(signal: CorrelatedMarketSignal): string {
    if (
      signal.agreement === 'CONTRADICTION' &&
      !/\b(?:warning|contradict|conflict)\b/i.test(signal.reason)
    ) {
      return `Contradiction warning: ${signal.reason}`;
    }

    return signal.reason;
  }

  private validateOptions(): void {
    if (typeof this.enabled !== 'boolean') {
      throw new Error('enabled must be a boolean');
    }

    if (
      !Number.isFinite(this.minimumCombinedConfidence) ||
      this.minimumCombinedConfidence < 0 ||
      this.minimumCombinedConfidence > 100
    ) {
      throw new Error('minimumCombinedConfidence must be between 0 and 100');
    }

    if (!Number.isFinite(this.cooldownMs) || this.cooldownMs < 0) {
      throw new Error('cooldownMs must be a non-negative finite number');
    }

    if (
      !Number.isFinite(this.confidenceChangeThreshold) ||
      this.confidenceChangeThreshold <= 0 ||
      this.confidenceChangeThreshold > 100
    ) {
      throw new Error(
        'confidenceChangeThreshold must be greater than 0 and at most 100',
      );
    }
  }
}
