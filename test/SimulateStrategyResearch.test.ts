import { afterEach, describe, expect, it, vi } from 'vitest';

import { runStrategyResearchSimulation } from '../src/tools/simulateStrategyResearch';

describe('strategy research simulation', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('verifies the deterministic integrated R22-R28 research pipeline', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    expect(() => runStrategyResearchSimulation()).not.toThrow();

    const output = log.mock.calls.map((call) => call.join(' ')).join('\n');
    expect(output).toContain(
      'R22-R28 INTEGRATED STRATEGY SIMULATION PASSED',
    );
    expect(output).toContain('Replay events: 24');
    expect(output).toContain('Outcome observations: 24');
    expect(output).toContain('Walk-forward folds: 4');
    expect(output).toContain('Cost scenarios: 2');
    expect(output).toContain('Whale study sufficient: true');
    expect(output).toContain(
      'Paper-only research. Order execution remains disabled.',
    );
  });
});
