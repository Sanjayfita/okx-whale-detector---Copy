import { describe, expect, it, vi } from 'vitest';

import {
  runFormattingBenchmark,
  runPerformanceReport,
} from '../src/tools/performanceReport';

describe('performance report', () => {
  it('benchmarks bounded summary formatting samples by scored-whale count', () => {
    const results = runFormattingBenchmark();

    expect(results.map((result) => result.scoredWhales)).toEqual([
      0, 10, 100, 200,
    ]);
    expect(results.every((result) => result.samples === 100)).toBe(true);
    expect(results.every((result) => result.medianMs >= 0)).toBe(true);
    expect(results.every((result) => result.p95Ms >= result.medianMs)).toBe(
      true,
    );
  });

  it('runs a deterministic multi-symbol burst and prints percentiles', async () => {
    const output: string[] = [];
    const logger = vi
      .spyOn(console, 'log')
      .mockImplementation((message: unknown) => {
        output.push(String(message));
      });

    await runPerformanceReport(['9']);

    logger.mockRestore();

    const report = output.join('\n');

    expect(report).toContain('LIVE PERFORMANCE ATTRIBUTION REPORT');
    expect(report).toContain('Symbols=3 updates=9 burst=100');
    expect(report).toContain('core/no-attribution');
    expect(report).toContain('core/attribution');
    expect(report).toContain('summary/buffered-console');
    expect(report).toMatch(/p50=.*p95=.*p99=/);
    expect(report).toContain('Attribution throughput impact:');
    expect(report).toContain('SUMMARY FORMATTING BENCHMARK');
    expect(report).toContain('scoredWhales=  0 n=100');
    expect(report).toContain('scoredWhales=200 n=100');
    expect(report).toContain('do not prove CPU ownership');
  });
});
