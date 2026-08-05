import type { WhaleConfirmationAssessment } from '../confirmation/WhaleConfirmationEngine';
import type { StrategyCandidate } from '../strategies/StrategyCandidate';

export interface TradeQualificationPolicy {
  readonly estimatedRoundTripCostPercent: number;
  readonly minimumNetEdgePercent: number;
  readonly minimumBaseConfidence: number;
  readonly blockedRegimes: readonly string[];
}

export interface PaperTradeCandidate {
  readonly candidate: StrategyCandidate;
  readonly whaleAssessment: WhaleConfirmationAssessment;
  readonly estimatedNetEdgePercent: number;
  readonly adjustedConfidence: number;
  readonly qualified: boolean;
  readonly reasons: readonly string[];
  readonly paperOnly: true;
  readonly liveOrderExecutionAllowed: false;
  readonly orderExecutionAuthorized: false;
  readonly transportDispatchAllowed: false;
  readonly testnetExecutionAuthorized: false;
}

export class TradeQualificationEngine {
  public constructor(private readonly policy: TradeQualificationPolicy) {
    if (
      !Number.isFinite(policy.estimatedRoundTripCostPercent) ||
      policy.estimatedRoundTripCostPercent < 0 ||
      !Number.isFinite(policy.minimumNetEdgePercent) ||
      policy.minimumNetEdgePercent < 0 ||
      !Number.isFinite(policy.minimumBaseConfidence) ||
      policy.minimumBaseConfidence < 0 ||
      policy.minimumBaseConfidence > 100
    ) {
      throw new Error('Invalid trade qualification policy');
    }
  }

  public qualify(
    candidate: StrategyCandidate,
    whaleAssessment: WhaleConfirmationAssessment,
  ): PaperTradeCandidate {
    if (candidate.candidateId !== whaleAssessment.candidateId) {
      throw new Error('Whale assessment does not belong to the candidate');
    }

    const reasons: string[] = [];
    const estimatedNetEdgePercent =
      candidate.expectedMovePercent -
      this.policy.estimatedRoundTripCostPercent;
    const adjustedConfidence = Math.max(
      0,
      Math.min(100, candidate.baseConfidence + whaleAssessment.confidenceAdjustment),
    );

    if (estimatedNetEdgePercent < this.policy.minimumNetEdgePercent) {
      reasons.push('Expected movement does not exceed cost and safety margin');
    }
    if (candidate.baseConfidence < this.policy.minimumBaseConfidence) {
      reasons.push('Base strategy confidence is below the required threshold');
    }
    if (this.policy.blockedRegimes.includes(candidate.regime)) {
      reasons.push(`Market regime ${candidate.regime} is blocked`);
    }
    if (whaleAssessment.blocksCandidate) {
      reasons.push('Whale contradiction blocks the candidate');
    }

    const qualified = reasons.length === 0;
    if (qualified) {
      reasons.push(
        whaleAssessment.alignment === 'SUPPORTS'
          ? 'Base strategy passes independently and whale evidence provides support'
          : 'Base strategy passes independently without requiring whale support',
      );
    }

    return Object.freeze({
      candidate,
      whaleAssessment,
      estimatedNetEdgePercent,
      adjustedConfidence,
      qualified,
      reasons: Object.freeze(reasons),
      paperOnly: true,
      liveOrderExecutionAllowed: false,
      orderExecutionAuthorized: false,
      transportDispatchAllowed: false,
      testnetExecutionAuthorized: false,
    });
  }
}
