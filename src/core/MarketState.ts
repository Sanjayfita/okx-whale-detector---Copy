import { appConfig, type AppConfig } from '../config/appConfig';

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

export class MarketState {
  public readonly orderBookManager = new OrderBookManager();
  public readonly whaleTracker: WhaleTracker;
  public readonly whaleScoreEngine: WhaleScoreEngine;
  public readonly whaleEventDetector: WhaleEventDetector;
  public readonly wallDetector: WallDetector;
  public readonly marketAnalyzer: MarketAnalyzer;
  public readonly candleHistory: CandleHistory;
  public readonly whaleRefillDetector: WhaleRefillDetector;
  public readonly whaleBehaviorEngine: WhaleBehaviorEngine;
  public readonly behaviorTransitionTracker = new BehaviorTransitionTracker();

  public constructor(config: AppConfig = appConfig) {
    this.whaleTracker = new WhaleTracker(config.tracker);
    this.whaleScoreEngine = new WhaleScoreEngine(config.scoring);

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

    this.marketAnalyzer = new MarketAnalyzer(config.market);
    this.candleHistory = new CandleHistory(config.history.candleLimit);
    this.whaleRefillDetector = new WhaleRefillDetector(config.refill);
    this.whaleBehaviorEngine = new WhaleBehaviorEngine(config.behavior);
  }
}
