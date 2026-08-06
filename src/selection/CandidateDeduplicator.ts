import type { StrategyCandidate } from '../strategies/StrategyCandidate';

export interface CandidateDeduplicationResult {
  readonly accepted: readonly StrategyCandidate[];
  readonly rejectedCandidateIds: readonly string[];
}

interface AcceptedEvent {
  readonly generatedAt: number;
  readonly candidateId: string;
}

const score = (candidate: StrategyCandidate): number =>
  candidate.baseConfidence + candidate.expectedMovePercent * 100;

const eventKey = (candidate: StrategyCandidate): string =>
  `${candidate.instrumentId}:${candidate.direction}`;

export class CandidateDeduplicator {
  private readonly lastAcceptedByEvent = new Map<string, AcceptedEvent>();

  public constructor(private readonly eventWindowMs: number = 15 * 60_000) {
    if (!Number.isSafeInteger(eventWindowMs) || eventWindowMs <= 0) {
      throw new Error('eventWindowMs must be a positive safe integer');
    }
  }

  public deduplicate(
    candidates: readonly StrategyCandidate[],
  ): CandidateDeduplicationResult {
    const bestByEvent = new Map<string, StrategyCandidate>();
    const rejectedCandidateIds: string[] = [];

    for (const candidate of [...candidates].sort(
      (left, right) =>
        left.generatedAt - right.generatedAt ||
        left.candidateId.localeCompare(right.candidateId),
    )) {
      const key = eventKey(candidate);
      const existing = bestByEvent.get(key);
      if (existing === undefined) {
        bestByEvent.set(key, candidate);
        continue;
      }

      const candidateScore = score(candidate);
      const existingScore = score(existing);
      if (
        candidateScore > existingScore ||
        (candidateScore === existingScore &&
          candidate.candidateId.localeCompare(existing.candidateId) < 0)
      ) {
        bestByEvent.set(key, candidate);
        rejectedCandidateIds.push(existing.candidateId);
      } else {
        rejectedCandidateIds.push(candidate.candidateId);
      }
    }

    const accepted: StrategyCandidate[] = [];
    for (const candidate of [...bestByEvent.values()].sort(
      (left, right) =>
        left.generatedAt - right.generatedAt ||
        left.candidateId.localeCompare(right.candidateId),
    )) {
      const key = eventKey(candidate);
      const previous = this.lastAcceptedByEvent.get(key);
      if (
        previous !== undefined &&
        candidate.generatedAt >= previous.generatedAt &&
        candidate.generatedAt - previous.generatedAt < this.eventWindowMs
      ) {
        rejectedCandidateIds.push(candidate.candidateId);
        continue;
      }
      if (
        previous !== undefined &&
        candidate.generatedAt < previous.generatedAt
      ) {
        throw new Error('Candidates must not move backwards in event time');
      }
      accepted.push(candidate);
      this.lastAcceptedByEvent.set(
        key,
        Object.freeze({
          generatedAt: candidate.generatedAt,
          candidateId: candidate.candidateId,
        }),
      );
    }

    return Object.freeze({
      accepted: Object.freeze(accepted),
      rejectedCandidateIds: Object.freeze(
        [...new Set(rejectedCandidateIds)].sort(),
      ),
    });
  }

  public reset(): void {
    this.lastAcceptedByEvent.clear();
  }

  public resetInstruments(instrumentIds: readonly string[]): void {
    const prefixes = instrumentIds.map((instrumentId) => `${instrumentId}:`);
    for (const key of this.lastAcceptedByEvent.keys()) {
      if (prefixes.some((prefix) => key.startsWith(prefix))) {
        this.lastAcceptedByEvent.delete(key);
      }
    }
  }
}
