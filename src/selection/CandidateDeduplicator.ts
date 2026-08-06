import type { StrategyCandidate } from '../strategies/StrategyCandidate';

export interface CandidateDeduplicationResult {
  readonly accepted: readonly StrategyCandidate[];
  readonly rejectedCandidateIds: readonly string[];
}

export class CandidateDeduplicator {
  public constructor(private readonly eventWindowMs: number = 15 * 60_000) {
    if (!Number.isSafeInteger(eventWindowMs) || eventWindowMs <= 0) {
      throw new Error('eventWindowMs must be a positive safe integer');
    }
  }

  public deduplicate(
    candidates: readonly StrategyCandidate[],
  ): CandidateDeduplicationResult {
    const ordered = [...candidates].sort(
      (left, right) =>
        left.generatedAt - right.generatedAt ||
        right.baseConfidence - left.baseConfidence ||
        right.expectedMovePercent - left.expectedMovePercent ||
        left.candidateId.localeCompare(right.candidateId),
    );
    const accepted: StrategyCandidate[] = [];
    const rejectedCandidateIds: string[] = [];

    for (const candidate of ordered) {
      const conflictIndex = accepted.findIndex(
        (existing) =>
          existing.instrumentId === candidate.instrumentId &&
          existing.direction === candidate.direction &&
          Math.abs(existing.generatedAt - candidate.generatedAt) <
            this.eventWindowMs,
      );

      if (conflictIndex < 0) {
        accepted.push(candidate);
        continue;
      }

      const existing = accepted[conflictIndex];
      if (existing === undefined) {
        accepted.push(candidate);
        continue;
      }

      const candidateScore =
        candidate.baseConfidence + candidate.expectedMovePercent * 100;
      const existingScore =
        existing.baseConfidence + existing.expectedMovePercent * 100;

      if (
        candidateScore > existingScore ||
        (candidateScore === existingScore &&
          candidate.candidateId.localeCompare(existing.candidateId) < 0)
      ) {
        accepted[conflictIndex] = candidate;
        rejectedCandidateIds.push(existing.candidateId);
      } else {
        rejectedCandidateIds.push(candidate.candidateId);
      }
    }

    return Object.freeze({
      accepted: Object.freeze(
        [...accepted].sort(
          (left, right) =>
            left.generatedAt - right.generatedAt ||
            left.candidateId.localeCompare(right.candidateId),
        ),
      ),
      rejectedCandidateIds: Object.freeze(rejectedCandidateIds.sort()),
    });
  }
}
