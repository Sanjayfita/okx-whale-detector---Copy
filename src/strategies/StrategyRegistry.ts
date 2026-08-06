import type { Strategy, StrategyEvaluationContext } from './Strategy';
import type { StrategyCandidate } from './StrategyCandidate';

export class StrategyRegistry {
  private readonly strategies = new Map<string, Strategy>();

  public register(strategy: Strategy): void {
    if (this.strategies.has(strategy.strategyId)) {
      throw new Error(`Strategy ${strategy.strategyId} is already registered`);
    }
    this.strategies.set(strategy.strategyId, strategy);
  }

  public evaluate(context: StrategyEvaluationContext): readonly StrategyCandidate[] {
    return Object.freeze(
      [...this.strategies.values()]
        .sort((left, right) => left.strategyId.localeCompare(right.strategyId))
        .map((strategy) => strategy.evaluate(context))
        .filter(
          (candidate): candidate is StrategyCandidate => candidate !== undefined,
        ),
    );
  }

  public getStrategyIds(): readonly string[] {
    return Object.freeze([...this.strategies.keys()].sort());
  }
}
