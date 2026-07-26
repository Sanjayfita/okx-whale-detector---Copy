import type {
  Whale,
} from '../types/whale';

import type {
  WhaleBehavior,
  WhaleBehaviorType,
} from './WhaleBehaviorEngine';

export class BehaviorTransitionTracker {
  private readonly activeBehaviors =
    new Map<
      string,
      Set<WhaleBehaviorType>
    >();

  public getEnteredBehaviors(
    whale: Whale,
    currentBehaviors:
      WhaleBehavior[],
  ): WhaleBehavior[] {
    const whaleKey =
      this.getWhaleKey(
        whale,
      );

    const previousTypes =
      this.activeBehaviors.get(
        whaleKey,
      ) ??
      new Set<
        WhaleBehaviorType
      >();

    const currentTypes =
      new Set(
        currentBehaviors.map(
          behavior =>
            behavior.type,
        ),
      );

    const enteredBehaviors =
      currentBehaviors.filter(
        behavior =>
          !previousTypes.has(
            behavior.type,
          ),
      );

    if (currentTypes.size > 0) {
      this.activeBehaviors.set(
        whaleKey,
        currentTypes,
      );
    } else {
      this.activeBehaviors.delete(
        whaleKey,
      );
    }

    return enteredBehaviors;
  }

  public prune(
    activeWhales: Whale[],
  ): void {
    const activeKeys =
      new Set(
        activeWhales.map(
          whale =>
            this.getWhaleKey(
              whale,
            ),
        ),
      );

    for (
      const key
      of this.activeBehaviors.keys()
    ) {
      if (
        !activeKeys.has(
          key,
        )
      ) {
        this.activeBehaviors.delete(
          key,
        );
      }
    }
  }

  public reset(): void {
    this.activeBehaviors.clear();
  }

  private getWhaleKey(
    whale: Whale,
  ): string {
    return (
      `${whale.side}:` +
      `${whale.price}`
    );
  }
}