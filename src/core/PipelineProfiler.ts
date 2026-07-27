export interface PipelineStageStats {
  readonly stage: string;
  readonly samples: number;
  readonly totalMs: number;
  readonly averageMs: number;
  readonly maximumMs: number;
}

interface MutableStageStats {
  samples: number;
  totalMs: number;
  maximumMs: number;
}

export class PipelineProfiler {
  private readonly stages = new Map<string, MutableStageStats>();

  public measure<T>(stage: string, operation: () => T): T {
    const startedAt = performance.now();

    try {
      return operation();
    } finally {
      this.record(stage, performance.now() - startedAt);
    }
  }

  public record(stage: string, durationMs: number): void {
    if (!stage || !Number.isFinite(durationMs) || durationMs < 0) {
      return;
    }

    const current = this.stages.get(stage) ?? {
      samples: 0,
      totalMs: 0,
      maximumMs: 0,
    };

    current.samples += 1;
    current.totalMs += durationMs;
    current.maximumMs = Math.max(current.maximumMs, durationMs);
    this.stages.set(stage, current);
  }

  public getSnapshot(): readonly PipelineStageStats[] {
    return [...this.stages.entries()]
      .map(([stage, stats]) => ({
        stage,
        samples: stats.samples,
        totalMs: stats.totalMs,
        averageMs: stats.samples === 0 ? 0 : stats.totalMs / stats.samples,
        maximumMs: stats.maximumMs,
      }))
      .sort((left, right) => right.totalMs - left.totalMs);
  }

  public reset(): void {
    this.stages.clear();
  }
}
