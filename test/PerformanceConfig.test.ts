import { describe, expect, it } from 'vitest';

import {
  performanceConfig,
  validatePerformanceConfig,
  type PerformanceConfig,
} from '../src/config/performanceConfig';

describe('performance configuration', () => {
  it('accepts the default configuration', () => {
    expect(() => validatePerformanceConfig(performanceConfig)).not.toThrow();
  });

  it.each([
    ['slowUpdateThresholdMs', 0],
    ['warningCooldownMs', -1],
    ['maximumSamplesPerSymbol', 0],
    ['maximumSamplesPerSymbol', 1.5],
  ] as const)('rejects invalid %s', (field, value) => {
    const config: PerformanceConfig = {
      ...performanceConfig,
      [field]: value,
    };

    expect(() => validatePerformanceConfig(config)).toThrow(field);
  });
});
