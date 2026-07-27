export interface PerformanceConfig {
  slowUpdateThresholdMs: number;
  warningCooldownMs: number;
  maximumSamplesPerSymbol: number;
}

export const performanceConfig: PerformanceConfig = {
  slowUpdateThresholdMs: 25,
  warningCooldownMs: 30_000,
  maximumSamplesPerSymbol: 100,
};

export const validatePerformanceConfig = (
  config: PerformanceConfig,
): void => {
  const errors: string[] = [];

  if (
    !Number.isFinite(config.slowUpdateThresholdMs) ||
    config.slowUpdateThresholdMs <= 0
  ) {
    errors.push('slowUpdateThresholdMs must be greater than 0');
  }

  if (!Number.isFinite(config.warningCooldownMs) || config.warningCooldownMs < 0) {
    errors.push('warningCooldownMs must be greater than or equal to 0');
  }

  if (
    !Number.isInteger(config.maximumSamplesPerSymbol) ||
    config.maximumSamplesPerSymbol <= 0
  ) {
    errors.push('maximumSamplesPerSymbol must be a positive integer');
  }

  if (errors.length > 0) {
    throw new Error(`Invalid performance configuration:\n- ${errors.join('\n- ')}`);
  }
};
