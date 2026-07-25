import type { Whale } from '../types/whale';

export interface WhaleRefillEvent {
  whale: Whale;
  refillCount: number;
  previousNotionalUSD: number;
  currentNotionalUSD: number;
  refillAmountUSD: number;
  timestamp: number;
}

interface WhaleRefillHistory {
  baselineNotionalUSD: number;
  lastNotionalUSD: number;
  lowestNotionalUSD: number;
  refillCount: number;
  inDrawdown: boolean;
}

export interface WhaleRefillConfig {
  dropThresholdPercent: number;
  recoveryThresholdPercent: number;
}

const DEFAULT_CONFIG: WhaleRefillConfig = {
  dropThresholdPercent: 10,
  recoveryThresholdPercent: 90,
};

export class WhaleRefillDetector {
  private readonly history =
    new Map<string, WhaleRefillHistory>();

  private readonly config:
    WhaleRefillConfig;

  public constructor(
    config: Partial<WhaleRefillConfig> = {},
  ) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    };
  }

  public detect(
    whale: Whale,
  ): WhaleRefillEvent | undefined {
    const key = this.getKey(whale);
    const current = whale.notionalUSD;
    const existing = this.history.get(key);

    if (!existing) {
      this.history.set(key, {
        baselineNotionalUSD: current,
        lastNotionalUSD: current,
        lowestNotionalUSD: current,
        refillCount: 0,
        inDrawdown: false,
      });

      return undefined;
    }

    if (!existing.inDrawdown) {
      existing.baselineNotionalUSD =
        Math.max(
          existing.baselineNotionalUSD,
          current,
        );

      const dropPercent =
        (
          (
            existing.baselineNotionalUSD -
            current
          ) /
          existing.baselineNotionalUSD
        ) * 100;

      if (
        dropPercent >=
        this.config.dropThresholdPercent
      ) {
        existing.inDrawdown = true;
        existing.lowestNotionalUSD = current;
      }

      existing.lastNotionalUSD = current;
      return undefined;
    }

    existing.lowestNotionalUSD =
      Math.min(
        existing.lowestNotionalUSD,
        current,
      );

    const recoveryTarget =
      existing.baselineNotionalUSD *
      (
        this.config.recoveryThresholdPercent /
        100
      );

    const isRecovering =
      current >
      existing.lastNotionalUSD;

    if (
      !isRecovering ||
      current < recoveryTarget
    ) {
      existing.lastNotionalUSD = current;
      return undefined;
    }

    const refillAmountUSD =
      current -
      existing.lowestNotionalUSD;

    existing.refillCount += 1;
    existing.baselineNotionalUSD = current;
    existing.lastNotionalUSD = current;
    existing.lowestNotionalUSD = current;
    existing.inDrawdown = false;

    return {
      whale,
      refillCount: existing.refillCount,
      previousNotionalUSD:
        current - refillAmountUSD,
      currentNotionalUSD: current,
      refillAmountUSD,
      timestamp: Date.now(),
    };
  }

  public getRefillCount(
    whale: Whale,
  ): number {
    return (
      this.history.get(
        this.getKey(whale),
      )?.refillCount ??
      0
    );
  }

  public prune(
    activeWhales: Whale[],
  ): void {
    const activeKeys =
      new Set(
        activeWhales.map(
          whale =>
            this.getKey(whale),
        ),
      );

    for (const key of this.history.keys()) {
      if (!activeKeys.has(key)) {
        this.history.delete(key);
      }
    }
  }

  public reset(): void {
    this.history.clear();
  }

  private getKey(
    whale: Whale,
  ): string {
    return `${whale.side}:${whale.price}`;
  }
}