import type { appConfig } from '../config/appConfig';

import { OrderBookManager } from './OrderBookManager';
import { WhaleTracker } from './WhaleTracker';
import { WhaleEventDetector } from './WhaleEventDetector';
import { WallDetector } from './WallDetector';
import { MarketAnalyzer } from './MarketAnalyzer';
import { CandleHistory } from './CandleHistory';
import { WhaleRefillDetector } from './WhaleRefillDetector';
import { WhaleScoreEngine } from './WhaleScoreEngine';
import { WhaleBehaviorEngine } from './WhaleBehaviorEngine';
import { BehaviorTransitionTracker } from './BehaviorTransitionTracker';

export type MarketStateConfig = typeof appConfig;

export class MarketState {
  public readonly orderBookManager = new OrderBookManager();
  public readonly whaleTracker = new WhaleTracker();
  public readonly whaleScoreEngine = new WhaleScoreEngine();
  public readonly whaleEventDetector: WhaleEventDetector;
  public readonly wallDetector: WallDetector;
  public readonly marketAnalyzer = new MarketAnalyzer();
  public readonly candleHistory: CandleHistory;
  public readonly whaleRefillDetector = new WhaleRefillDetector();
  public readonly whaleBehaviorEngine = new WhaleBehaviorEngine();
  public readonly behaviorTransitionTracker = new BehaviorTransitionTracker();

  public constructor(config: MarketStateConfig) {
    this.whaleEventDetector = new WhaleEventDetector({
      removalGraceMs: config.events.removalGraceMs,
      minimumChangePercent: config.events.minimumChangePercent,
      minimumChangeNotional: config.events.minimumChangeNotional,
    });

    this.wallDetector = new WallDetector({
      minNotionalQuote: config.whale.minimumNotionalQuote,
      persistentAfterMs: config.whale.persistentAfterMs,
      strongAfterMs: config.whale.strongAfterMs,
      priceTolerancePercent: config.whale.movementPriceTolerancePercent,
      removalGracePeriodMs: config.events.removalGraceMs,
    });

    this.candleHistory = new CandleHistory(config.history.candleLimit);
  }
}
