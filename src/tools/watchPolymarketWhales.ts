import { ExternalSignalRelevanceEngine } from '../external/core/ExternalSignalRelevanceEngine';
import { ExternalSignalStore } from '../external/core/ExternalSignalStore';
import { PolymarketLiveAggregator } from '../external/providers/polymarket/PolymarketLiveAggregator';
import { PolymarketLiveSignalFactory } from '../external/providers/polymarket/PolymarketLiveSignalFactory';
import { PolymarketMarketWebSocketClient } from '../external/providers/polymarket/PolymarketMarketWebSocketClient';
import { PolymarketPublicClient } from '../external/providers/polymarket/PolymarketPublicClient';
import { PolymarketWhaleDetector } from '../external/providers/polymarket/PolymarketWhaleDetector';

interface WatchOptions {
  minimumSignalUsd: number;
  minimumLiquidityUsd: number;
  marketLimit: number;
  watchMarkets: number;
  windowSeconds: number;
  minimumDominance: number;
  signalCooldownSeconds: number;
  statusSeconds: number;
  showExecutions: boolean;
}

const parsePositiveNumber = (
  value: string | undefined,
  flag: string,
): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${flag} requires a positive number`);
  }
  return parsed;
};

const parseRatio = (value: string | undefined, flag: string): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    throw new Error(`${flag} requires a number from 0 to 1`);
  }
  return parsed;
};

const parseOptions = (args: readonly string[]): WatchOptions => {
  const options: WatchOptions = {
    minimumSignalUsd: 5_000,
    minimumLiquidityUsd: 5_000,
    marketLimit: 2_000,
    watchMarkets: 100,
    windowSeconds: 60,
    minimumDominance: 0.15,
    signalCooldownSeconds: 15,
    statusSeconds: 30,
    showExecutions: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    const value = args[index + 1];

    if (flag === '--min-trade') {
      options.minimumSignalUsd = parsePositiveNumber(value, flag);
      index += 1;
    } else if (flag === '--min-liquidity') {
      options.minimumLiquidityUsd = parsePositiveNumber(value, flag);
      index += 1;
    } else if (flag === '--market-limit') {
      options.marketLimit = parsePositiveNumber(value, flag);
      index += 1;
    } else if (flag === '--watch-markets') {
      options.watchMarkets = parsePositiveNumber(value, flag);
      index += 1;
    } else if (flag === '--window-seconds') {
      options.windowSeconds = parsePositiveNumber(value, flag);
      index += 1;
    } else if (flag === '--min-dominance') {
      options.minimumDominance = parseRatio(value, flag);
      index += 1;
    } else if (flag === '--signal-cooldown-seconds') {
      options.signalCooldownSeconds = parsePositiveNumber(value, flag);
      index += 1;
    } else if (flag === '--status-seconds') {
      options.statusSeconds = parsePositiveNumber(value, flag);
      index += 1;
    } else if (flag === '--show-executions') {
      options.showExecutions = true;
    } else {
      throw new Error(`Unknown Polymarket live option: ${flag}`);
    }
  }

  return options;
};

const resolutionTime = (endDate: string | undefined): number => {
  if (!endDate) return Number.POSITIVE_INFINITY;
  const parsed = Date.parse(endDate);
  return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
};

const formatUsd = (value: number): string =>
  value.toLocaleString('en-US', { maximumFractionDigits: 2 });

const main = async (): Promise<void> => {
  const options = parseOptions(process.argv.slice(2));
  const publicClient = new PolymarketPublicClient();
  const detector = new PolymarketWhaleDetector({
    minimumLiquidityUsd: options.minimumLiquidityUsd,
    minimumTradeNotionalUsd: 0,
  });
  const aggregator = new PolymarketLiveAggregator({
    windowMs: options.windowSeconds * 1_000,
    minimumNetNotionalUsd: options.minimumSignalUsd,
    minimumDominance: options.minimumDominance,
  });
  const signalFactory = new PolymarketLiveSignalFactory({
    minimumNetNotionalUsd: options.minimumSignalUsd,
  });
  const signalStore = new ExternalSignalStore();
  const relevanceEngine = new ExternalSignalRelevanceEngine();
  const lastSignalAtByMarket = new Map<string, number>();

  console.log('Discovering Polymarket markets...');
  const markets = await publicClient.getActiveMarkets(options.marketLimit);
  const discoveryTime = Date.now();
  const watchedMarkets = markets
    .filter((market) => detector.isRelevantMarket(market))
    .filter((market) => (market.tokenIds?.length ?? 0) > 0)
    .sort((left, right) => {
      const leftResolution = resolutionTime(left.endDate);
      const rightResolution = resolutionTime(right.endDate);
      const leftUpcoming = leftResolution >= discoveryTime;
      const rightUpcoming = rightResolution >= discoveryTime;

      if (leftUpcoming !== rightUpcoming) return leftUpcoming ? -1 : 1;
      if (leftResolution !== rightResolution) {
        return leftResolution - rightResolution;
      }
      return right.volume - left.volume;
    })
    .slice(0, options.watchMarkets);

  const marketByCondition = new Map(
    watchedMarkets.map((market) => [market.conditionId, market]),
  );
  const tokenContext = new Map<
    string,
    { market: (typeof watchedMarkets)[number]; outcome: string }
  >();

  for (const market of watchedMarkets) {
    const tokenIds = market.tokenIds ?? [];
    const outcomes = market.outcomes ?? [];

    tokenIds.forEach((tokenId, index) => {
      tokenContext.set(tokenId, {
        market,
        outcome: outcomes[index] ?? `Outcome ${index + 1}`,
      });
    });
  }

  if (tokenContext.size === 0) {
    throw new Error('No relevant Polymarket outcome token IDs were discovered');
  }

  console.log('\nPOLYMARKET LIVE WHALE WATCHER');
  console.log(`Markets discovered: ${markets.length}`);
  console.log(`Relevant markets watched: ${watchedMarkets.length}`);
  console.log(`Outcome tokens subscribed: ${tokenContext.size}`);
  console.log(
    `Minimum rolling net signal: $${options.minimumSignalUsd.toLocaleString('en-US')}`,
  );
  console.log(`Rolling window: ${options.windowSeconds}s`);
  console.log(
    `Minimum dominance: ${(options.minimumDominance * 100).toFixed(1)}%`,
  );
  console.log(`Signal cooldown: ${options.signalCooldownSeconds}s per market`);
  console.log(`Status interval: ${options.statusSeconds}s`);
  console.log(
    `Individual executions: ${options.showExecutions ? 'shown' : 'hidden'}`,
  );
  console.log('Waiting for real-time trades. Press Ctrl+C to stop.\n');

  let receivedExecutions = 0;
  let directionalExecutions = 0;
  let unknownTokenExecutions = 0;
  let unknownDirectionExecutions = 0;
  let emittedSignals = 0;
  let lastExecutionAt: number | undefined;

  const webSocketClient = new PolymarketMarketWebSocketClient(
    [...tokenContext.keys()],
    (liveTrade) => {
      receivedExecutions += 1;
      lastExecutionAt = Date.now();

      const context = tokenContext.get(liveTrade.tokenId);
      if (!context) {
        unknownTokenExecutions += 1;
        return;
      }

      const tokenIds = context.market.tokenIds ?? [];
      const interpretation = detector.interpretTrade(
        {
          proxyWallet: '',
          side: liveTrade.side,
          asset: liveTrade.tokenId,
          conditionId: context.market.conditionId,
          size: liveTrade.size,
          price: liveTrade.price,
          timestamp: liveTrade.timestamp,
          title: context.market.question,
          slug: context.market.slug,
          eventSlug: '',
          outcome: context.outcome,
          outcomeIndex: tokenIds.indexOf(liveTrade.tokenId),
          transactionHash:
            liveTrade.transactionHash ??
            `${liveTrade.tokenId}:${liveTrade.timestamp}:${liveTrade.price}:${liveTrade.size}:${liveTrade.side}`,
        },
        context.market,
      );

      if (
        interpretation.direction === 'UNKNOWN' ||
        interpretation.direction === 'NEUTRAL'
      ) {
        unknownDirectionExecutions += 1;
        if (options.showExecutions) {
          console.log(
            `UNKNOWN EXECUTION | ${context.outcome} | ${liveTrade.side} | ${context.market.question}`,
          );
        }
        return;
      }

      directionalExecutions += 1;

      if (options.showExecutions) {
        console.log(
          `EXECUTION | ${interpretation.direction} | $${formatUsd(interpretation.notionalUsd)} | ${context.market.question}`,
        );
      }

      const executionId =
        liveTrade.transactionHash ??
        `${liveTrade.tokenId}:${liveTrade.timestamp}:${liveTrade.price}:${liveTrade.size}:${liveTrade.side}`;
      const aggregation = aggregator.add(
        {
          id: executionId,
          marketConditionId: context.market.conditionId,
          occurredAt: interpretation.occurredAt,
          direction: interpretation.direction,
          notionalUsd: interpretation.notionalUsd,
        },
        Date.now(),
      );

      if (!aggregation.qualifies) return;

      const now = Date.now();
      const lastSignalAt =
        lastSignalAtByMarket.get(context.market.conditionId) ?? 0;
      if (now - lastSignalAt < options.signalCooldownSeconds * 1_000) {
        return;
      }
      lastSignalAtByMarket.set(context.market.conditionId, now);

      const signal = signalFactory.create(context.market, aggregation, now);
      const storedSignal = signalStore.add(signal, now).signal;
      const evaluationSymbol = storedSignal.asset
        ? `${storedSignal.asset}-USDT`
        : 'MACRO';
      const effective = relevanceEngine.evaluate(
        storedSignal,
        evaluationSymbol,
        now,
      );
      emittedSignals += 1;

      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`${aggregation.direction} | ${context.market.question}`);
      console.log(
        `Rolling net: $${formatUsd(Math.abs(aggregation.netDirectionalNotionalUsd))}`,
      );
      console.log(`Bullish: $${formatUsd(aggregation.bullishNotionalUsd)}`);
      console.log(`Bearish: $${formatUsd(aggregation.bearishNotionalUsd)}`);
      console.log(
        `Dominance: ${(aggregation.dominance * 100).toFixed(1)}% | Executions: ${aggregation.executionCount}`,
      );
      console.log(
        `EXTERNAL SIGNAL | ${storedSignal.provider}/${storedSignal.category} | Asset: ${storedSignal.asset ?? 'MACRO'}`,
      );
      console.log(
        `Confidence: ${storedSignal.confidence.toFixed(1)}% | Relevance: ${(effective.relevance * 100).toFixed(1)}% | Freshness: ${(effective.freshness * 100).toFixed(1)}%`,
      );
      console.log(
        `Correlation-ready confidence: ${effective.effectiveConfidence.toFixed(1)}%`,
      );
      console.log(`Stored external signals: ${signalStore.getSize(now)}`);
      console.log(`Window: last ${options.windowSeconds}s`);
    },
  );

  const statusTimer = setInterval(() => {
    const now = Date.now();
    const lastExecution = lastExecutionAt
      ? `${Math.max(0, Math.round((now - lastExecutionAt) / 1_000))}s ago`
      : 'none yet';
    console.log(
      `[LIVE STATUS] executions=${receivedExecutions} directional=${directionalExecutions} unknownToken=${unknownTokenExecutions} unknownDirection=${unknownDirectionExecutions} signals=${emittedSignals} stored=${signalStore.getSize(now)} lastExecution=${lastExecution}`,
    );

    const strongestMarkets = aggregator
      .getActive(now)
      .sort(
        (left, right) =>
          Math.abs(right.netDirectionalNotionalUsd) -
          Math.abs(left.netDirectionalNotionalUsd),
      )
      .slice(0, 3);

    for (const aggregation of strongestMarkets) {
      const market = marketByCondition.get(aggregation.marketConditionId);
      console.log(
        `  TOP FLOW | ${aggregation.direction} net=$${formatUsd(Math.abs(aggregation.netDirectionalNotionalUsd))} bull=$${formatUsd(aggregation.bullishNotionalUsd)} bear=$${formatUsd(aggregation.bearishNotionalUsd)} dominance=${(aggregation.dominance * 100).toFixed(1)}% executions=${aggregation.executionCount} | ${market?.question ?? aggregation.marketConditionId}`,
      );
    }
  }, options.statusSeconds * 1_000);

  const shutdown = (): void => {
    console.log('\nStopping Polymarket live watcher...');
    clearInterval(statusTimer);
    webSocketClient.close();
    aggregator.clear();
    signalStore.clear();
    process.exitCode = 0;
  };

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  webSocketClient.connect();
};

void main().catch((error: unknown) => {
  console.error('Polymarket live watcher failed:', error);
  process.exitCode = 1;
});
