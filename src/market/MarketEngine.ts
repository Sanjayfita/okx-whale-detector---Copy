import type { OKXOrderBookUpdate } from '../clients/okx/OKXWebSocketClient';
import { performanceConfig } from '../config/performanceConfig';
import type { MarketState } from '../core/MarketState';
import { PipelineProfiler } from '../core/PipelineProfiler';
import { ProcessingMonitor } from '../core/ProcessingMonitor';
import { SummaryThrottle } from '../core/SummaryThrottle';
import { MarketReporter } from '../reporting/MarketReporter';

export class MarketEngine {
  private readonly sequenceGapSymbols = new Set<string>();

  constructor(
    private readonly marketStates: Map<string, MarketState>,
    private readonly summaryThrottle: SummaryThrottle,
    private readonly reporter: MarketReporter = new MarketReporter(),
    private readonly processingMonitor: ProcessingMonitor = new ProcessingMonitor(
      performanceConfig,
    ),
    private readonly pipelineProfiler: PipelineProfiler = new PipelineProfiler(),
  ) {}

  public processOrderBookUpdate(update: OKXOrderBookUpdate): void {
    const startedAt = performance.now();

    try {
      const state = this.marketStates.get(update.instId);

      if (!state) {
        return;
      }

      const wasApplied = this.pipelineProfiler.measure(
        'orderBook.applyUpdate',
        () =>
          state.orderBookManager.applyUpdate(
            update.bids,
            update.asks,
            update.timestamp,
            update.seqId,
            update.prevSeqId,
            update.action,
          ),
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

      const result = this.pipelineProfiler.measure('whaleTracker.scan', () =>
        state.whaleTracker.scan(orderBook),
      );
      const currentPrice = state.orderBookManager.getMidPrice();

      if (currentPrice === undefined) {
        return;
      }

      const scoredWhales = this.pipelineProfiler.measure(
        'whaleScore.scoreAndPrune',
        () => {
          const scored = state.whaleScoreEngine.scoreMany(
            result.active,
            currentPrice,
          );
          state.whaleScoreEngine.prune(result.active);
          return scored;
        },
      );

      this.pipelineProfiler.measure('behavior.analyzeAndPrune', () => {
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
      });

      const walls = this.pipelineProfiler.measure('wallDetector.detect', () =>
        state.wallDetector.detect(orderBook),
      );

      this.pipelineProfiler.measure('whaleEvents.detectAndReport', () => {
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
      });

      this.pipelineProfiler.measure('refill.detectAndPrune', () => {
        for (const whale of result.active) {
          const refill = state.whaleRefillDetector.detect(whale);

          if (refill) {
            this.reporter.reportRefill(update.instId, refill);
          }
        }

        state.whaleRefillDetector.prune(result.active);
      });

      for (const moved of result.movedWhales) {
        this.reporter.reportMovedWhale(update.instId, moved);
      }

      if (!this.summaryThrottle.shouldDisplay(update.instId)) {
        return;
      }

      this.pipelineProfiler.measure('summary.analyzeAndReport', () => {
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
      });
    } finally {
      this.processingMonitor.record(
        update.instId,
        performance.now() - startedAt,
      );
    }
  }

  public getPipelineProfile() {
    return this.pipelineProfiler.getSnapshot();
  }

  public reset(): void {
    this.sequenceGapSymbols.clear();
    this.summaryThrottle.reset();
    this.processingMonitor.reset();
    this.pipelineProfiler.reset();
  }

  public resetSymbols(symbols: readonly string[]): void {
    for (const symbol of symbols) {
      this.sequenceGapSymbols.delete(symbol);
      this.summaryThrottle.reset(symbol);
    }

    this.processingMonitor.resetSymbols(symbols);
  }
}
