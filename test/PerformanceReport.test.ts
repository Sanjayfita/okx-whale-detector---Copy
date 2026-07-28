import { describe, expect, it, vi } from 'vitest';

import { runPerformanceReport } from '../src/tools/performanceReport';

describe('performance report', () => {
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
    expect(report).toContain('do not prove CPU ownership');
  });
});
