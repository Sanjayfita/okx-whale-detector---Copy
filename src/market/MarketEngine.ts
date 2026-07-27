import type { OKXOrderBookUpdate } from '../clients/okx/OKXWebSocketClient';

import type { MarketState } from '../core/MarketState';

import { SummaryThrottle } from '../core/SummaryThrottle';

import { MarketReporter } from '../reporting/MarketReporter';

export class MarketEngine {
  private readonly sequenceGapSymbols = new Set<string>();

  constructor(
    private readonly marketStates: Map<string, MarketState>,

    private readonly summaryThrottle: SummaryThrottle,

    private readonly reporter: MarketReporter = new MarketReporter(),
  ) {}

  public processOrderBookUpdate(update: OKXOrderBookUpdate): void {
    const state = this.marketStates.get(update.instId);

    if (!state) {
      return;
    }

    const wasApplied = state.orderBookManager.applyUpdate(
      update.bids,
      update.asks,
      update.timestamp,
      update.seqId,
      update.prevSeqId,
      update.action,
    );

    if (!wasApplied) {
      if (!this.sequenceGapSymbols.has(update.instId)) {
        this.sequenceGapSymbols.add(update.instId);

        this.reporter.reportSequenceGap(update.instId);
      }

      return;
    }

    if (update.action === 'snapshot') {
      this.sequenceGapSymbols.delete(update.instId);
    }

    const orderBook = state.orderBookManager.getOrderBook();

    if (!orderBook.initialized || orderBook.status !== 'SYNCED') {
      return;
    }

    const result = state.whaleTracker.scan(orderBook);

    const currentPrice = state.orderBookManager.getMidPrice();

    if (currentPrice === undefined) {
      return;
    }

    const scoredWhales = state.whaleScoreEngine.scoreMany(
      result.active,
      currentPrice,
    );

    state.whaleScoreEngine.prune(result.active);

    for (const whale of result.active) {
      const currentBehaviors = state.whaleBehaviorEngine.analyze(whale);

      const enteredBehaviors =
        state.behaviorTransitionTracker.getEnteredBehaviors(
          whale,
          currentBehaviors,
        );

      for (const behavior of enteredBehaviors) {
        this.reporter.reportBehavior(behavior);
      }
    }

    state.whaleBehaviorEngine.prune(result.active);

    state.behaviorTransitionTracker.prune(result.active);

    const walls = state.wallDetector.detect(orderBook);

    const whaleEvents = state.whaleEventDetector.detect(result.active);

    for (const event of whaleEvents) {
      if (event.type === 'REMOVED') {
        const spoof = state.whaleBehaviorEngine.analyzeRemoval(event.whale);

        if (spoof) {
          this.reporter.reportSpoof(update.instId, spoof);
        }
      }

      this.reporter.reportWhaleEvent(update.instId, event);
    }

    for (const whale of result.active) {
      const refill = state.whaleRefillDetector.detect(whale);

      if (!refill) {
        continue;
      }

      this.reporter.reportRefill(update.instId, refill);
    }

    state.whaleRefillDetector.prune(result.active);

    for (const moved of result.movedWhales) {
      this.reporter.reportMovedWhale(update.instId, moved);
    }

    if (!this.summaryThrottle.shouldDisplay(update.instId)) {
      return;
    }

    const bestBid = state.orderBookManager.getBestBid();

    const bestAsk = state.orderBookManager.getBestAsk();

    const marketSignal = state.marketAnalyzer.analyze(
      result.active,
      currentPrice,
    );

    this.reporter.reportSummary({
      symbol: update.instId,

      currentPrice,

      bestBidPrice: bestBid?.price,

      bestAskPrice: bestAsk?.price,

      activeWhales: result.active,

      walls,

      scoredWhales,

      marketSignal,
    });
  }

  public reset(): void {
    this.sequenceGapSymbols.clear();
    this.summaryThrottle.reset();
  }

  public resetSymbols(symbols: readonly string[]): void {
    for (const symbol of symbols) {
      this.sequenceGapSymbols.delete(symbol);
      this.summaryThrottle.reset(symbol);
    }
  }
}
