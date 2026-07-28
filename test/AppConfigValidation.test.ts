import { describe, expect, it } from 'vitest';

import { appConfig, type AppConfig } from '../src/config/appConfig';
import { validateAppConfig } from '../src/config/validateAppConfig';
import { MarketState } from '../src/core/MarketState';

const cloneConfig = (): AppConfig =>
  JSON.parse(JSON.stringify(appConfig)) as AppConfig;

describe('application configuration validation', () => {
  it('accepts the production defaults', () => {
    expect(() => validateAppConfig(appConfig)).not.toThrow();
  });

  it('rejects non-positive runtime intervals', () => {
    const config = cloneConfig();

    config.reporting.summaryIntervalMs = 0;
    config.history.candleLimit = -1;

    expect(() => validateAppConfig(config)).toThrowError(
      expect.objectContaining({
        message: expect.stringContaining(
          'reporting.summaryIntervalMs must be a finite number greater than 0',
        ),
      }),
    );

    expect(() => validateAppConfig(config)).toThrowError(
      expect.objectContaining({
        message: expect.stringContaining(
          'history.candleLimit must be a finite number greater than 0',
        ),
      }),
    );
  });

  it('rejects invalid correlated alert configuration', () => {
    const config = cloneConfig();

    config.correlatedAlerts.enabled = 'yes' as never;
    config.correlatedAlerts.minimumCombinedConfidence = 101;
    config.correlatedAlerts.cooldownSeconds = 0;
    config.correlatedAlerts.confidenceChangeThreshold = 0;

    expect(() => validateAppConfig(config)).toThrowError(
      expect.objectContaining({
        message: expect.stringMatching(
          /correlatedAlerts\.enabled[\s\S]*correlatedAlerts\.minimumCombinedConfidence[\s\S]*correlatedAlerts\.cooldownSeconds[\s\S]*correlatedAlerts\.confidenceChangeThreshold/,
        ),
      }),
    );
  });

  it('rejects strong ages below persistent ages', () => {
    const config = cloneConfig();

    config.whale.strongAfterMs = config.whale.persistentAfterMs - 1;
    config.tracker.strongAfterSeconds =
      config.tracker.persistentAfterSeconds - 1;

    expect(() => validateAppConfig(config)).toThrowError(
      expect.objectContaining({
        message: expect.stringContaining(
          'whale.strongAfterMs must be greater than or equal to whale.persistentAfterMs',
        ),
      }),
    );

    expect(() => validateAppConfig(config)).toThrowError(
      expect.objectContaining({
        message: expect.stringContaining(
          'tracker.strongAfterSeconds must be greater than or equal to tracker.persistentAfterSeconds',
        ),
      }),
    );
  });

  it('rejects an inverted movement-size ratio range', () => {
    const config = cloneConfig();

    config.tracker.minimumMovementSizeRatio = 1.3;
    config.tracker.maximumMovementSizeRatio = 1.2;

    expect(() => validateAppConfig(config)).toThrowError(
      expect.objectContaining({
        message: expect.stringContaining(
          'tracker.minimumMovementSizeRatio must be less than or equal to tracker.maximumMovementSizeRatio',
        ),
      }),
    );
  });

  it('rejects invalid percentages', () => {
    const config = cloneConfig();

    config.refill.recoveryThresholdPercent = 101;
    config.market.neutralBandPercent = 0;

    expect(() => validateAppConfig(config)).toThrowError(
      expect.objectContaining({
        message: expect.stringContaining(
          'refill.recoveryThresholdPercent must be a finite percentage greater than 0 and at most 100',
        ),
      }),
    );

    expect(() => validateAppConfig(config)).toThrowError(
      expect.objectContaining({
        message: expect.stringContaining(
          'market.neutralBandPercent must be a finite percentage greater than 0 and at most 100',
        ),
      }),
    );
  });

  it('rejects score components whose maximum exceeds the total score', () => {
    const config = cloneConfig();

    config.scoring.maxStabilityScore = 25;

    expect(() => validateAppConfig(config)).toThrowError(
      expect.objectContaining({
        message: expect.stringContaining(
          'scoring component maximums must not exceed scoring.maxScore',
        ),
      }),
    );
  });

  it('reports multiple configuration errors together', () => {
    const config = cloneConfig();

    config.events.minimumChangeNotional = 0;
    config.behavior.repeatedIncreaseCount = 2.5;
    config.history.candleLimit = 0;

    expect(() => validateAppConfig(config)).toThrowError(
      expect.objectContaining({
        message: expect.stringMatching(
          /events\.minimumChangeNotional[\s\S]*behavior\.repeatedIncreaseCount must be an integer[\s\S]*history\.candleLimit/,
        ),
      }),
    );
  });

  it('prevents MarketState from using invalid injected configuration', () => {
    const config = cloneConfig();

    config.tracker.minimumNotionalQuote = 0;

    expect(() => new MarketState(config)).toThrowError(
      expect.objectContaining({
        message: expect.stringContaining(
          'tracker.minimumNotionalQuote must be a finite number greater than 0',
        ),
      }),
    );
  });
});
