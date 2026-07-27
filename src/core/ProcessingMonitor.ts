import type { PerformanceConfig } from '../config/performanceConfig';

export interface ProcessingStats {
  sampleCount: number;
  averageMs: number;
  maximumMs: number;
  latestMs: number;
}

export type PerformanceLogger = (message: string) => void;

export class ProcessingMonitor {
  private readonly samplesBySymbol = new Map<string, number[]>();
  private readonly lastWarningAt = new Map<string, number>();

  public constructor(
    private readonly config: PerformanceConfig,
    private readonly logger: PerformanceLogger = console.warn,
  ) {}

  public record(
    symbol: string,
    durationMs: number,
    now: number = Date.now(),
  ): void {
    if (!Number.isFinite(durationMs) || durationMs < 0) {
      return;
    }

    const samples = this.samplesBySymbol.get(symbol) ?? [];
    samples.push(durationMs);

    if (samples.length > this.config.maximumSamplesPerSymbol) {
      samples.splice(0, samples.length - this.config.maximumSamplesPerSymbol);
    }

    this.samplesBySymbol.set(symbol, samples);

    if (durationMs < this.config.slowUpdateThresholdMs) {
      return;
    }

    const lastWarning = this.lastWarningAt.get(symbol);

    if (
      lastWarning !== undefined &&
      now - lastWarning < this.config.warningCooldownMs
    ) {
      return;
    }

    this.lastWarningAt.set(symbol, now);
    this.logger(
      `⚠️ Slow market update for ${symbol}: ${durationMs.toFixed(2)}ms ` +
        `(threshold ${this.config.slowUpdateThresholdMs}ms)`,
    );
  }

  public getStats(symbol: string): ProcessingStats | undefined {
    const samples = this.samplesBySymbol.get(symbol);

    if (!samples || samples.length === 0) {
      return undefined;
    }

    const total = samples.reduce((sum, sample) => sum + sample, 0);

    return {
      sampleCount: samples.length,
      averageMs: total / samples.length,
      maximumMs: Math.max(...samples),
      latestMs: samples[samples.length - 1] ?? 0,
    };
  }

  public reset(symbol?: string): void {
    if (symbol !== undefined) {
      this.samplesBySymbol.delete(symbol);
      this.lastWarningAt.delete(symbol);
      return;
    }

    this.samplesBySymbol.clear();
    this.lastWarningAt.clear();
  }

  public resetSymbols(symbols: readonly string[]): void {
    for (const symbol of symbols) {
      this.reset(symbol);
    }
  }
}
