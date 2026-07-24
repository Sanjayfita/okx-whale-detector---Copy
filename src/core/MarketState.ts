import { OrderBookManager } from
  './OrderBookManager';

import { WhaleTracker } from
  './WhaleTracker';

import { WhaleEventDetector } from
  './WhaleEventDetector';

import { WallDetector } from
  './WallDetector';

import { MarketAnalyzer } from
  './MarketAnalyzer';

import { CandleHistory } from
  './CandleHistory';

import {
  WhaleRefillDetector,
} from './WhaleRefillDetector';

import {
  WhaleScoreEngine,
} from './WhaleScoreEngine';

import {
  WhaleBehaviorEngine,
} from './WhaleBehaviorEngine';

export class MarketState {
  public readonly orderBookManager =
    new OrderBookManager();

  public readonly whaleTracker =
    new WhaleTracker();

  public readonly whaleScoreEngine =
    new WhaleScoreEngine();

  public readonly whaleEventDetector =
    new WhaleEventDetector();

  public readonly wallDetector =
    new WallDetector();

  public readonly marketAnalyzer =
    new MarketAnalyzer();

  public readonly candleHistory =
    new CandleHistory(100);

  public readonly whaleRefillDetector =
    new WhaleRefillDetector();

 public readonly whaleBehaviorEngine =
  new WhaleBehaviorEngine();
  }