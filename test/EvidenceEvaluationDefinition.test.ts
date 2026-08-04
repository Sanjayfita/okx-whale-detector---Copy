import { describe, expect, it } from 'vitest';

import {
  createCurrentEvidenceEvaluationDefinition,
  EVIDENCE_EVENT_GENERATOR_POLICY,
  EVIDENCE_INDEPENDENCE_POLICY,
} from '../src/research/evidenceEvaluationDefinition';

describe('evidence evaluation definition', () => {
  it('freezes an OKX-only whale-signal event protocol', () => {
    const definition = createCurrentEvidenceEvaluationDefinition();

    expect(definition.configuration.evidenceProtocol).toEqual({
      eventGeneratorPolicy: EVIDENCE_EVENT_GENERATOR_POLICY,
      externalSignalsMayQualifyEvents: false,
      publicOkxMarketDataOnly: true,
      independencePolicy: EVIDENCE_INDEPENDENCE_POLICY,
      independenceWindowMinutes: 60,
      minimumQualifiedAlertsInterpretation: 'INDEPENDENT_EPISODES',
    });
    expect(definition.horizonsMinutes).toEqual([1, 5, 15, 30, 60]);
    expect(definition.minimumQualifiedAlerts).toBe(1_000);
    expect(definition.minimumCollectionDays).toBe(30);
    expect(definition.minimumInstruments).toBeGreaterThanOrEqual(2);
  });
});
