import { PolymarketMarketWebSocketClient } from '../external/providers/polymarket/PolymarketMarketWebSocketClient';
import { PolymarketPublicClient } from '../external/providers/polymarket/PolymarketPublicClient';
import { PolymarketWhaleDetector } from '../external/providers/polymarket/PolymarketWhaleDetector';

interface WatchOptions {
  minimumTradeUsd: number;
  minimumLiquidityUsd: number;
  marketLimit: number;
  watchMarkets: number;
}

const parsePositiveNumber = (value: string | undefined, flag: string): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${flag} requires a positive number`);
  }
  return parsed;
};

const parseOptions = (args: readonly string[]): WatchOptions => {
  const options: WatchOptions = {
    minimumTradeUsd: 5_000,
    minimumLiquidityUsd: 5_000,
    marketLimit: 2_000,
    watchMarkets: 100,
  };

  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    const value = args[index + 1];

    if (flag === '--min-trade') {
      options.minimumTradeUsd = parsePositiveNumber(value, flag);
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
    } else {
      throw new Error(`Unknown Polymarket live option: ${flag}`);
    }
  }

  return options;
};

const main = async (): Promise<void> => {
  const options = parseOptions(process.argv.slice(2));
  const publicClient = new PolymarketPublicClient();
  const detector = new PolymarketWhaleDetector({
    minimumLiquidityUsd: options.minimumLiquidityUsd,
    minimumTradeNotionalUsd: options.minimumTradeUsd,
  });

  console.log('Discovering Polymarket markets...');
  const markets = await publicClient.getActiveMarkets(options.marketLimit);
  const watchedMarkets = markets
    .filter((market) => detector.isRelevantMarket(market))
    .filter((market) => (market.tokenIds?.length ?? 0) > 0)
    .slice(0, options.watchMarkets);

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
    `Minimum live trade: $${options.minimumTradeUsd.toLocaleString('en-US')}`,
  );
  console.log('Waiting for real-time trades. Press Ctrl+C to stop.\n');

  const webSocketClient = new PolymarketMarketWebSocketClient(
    [...tokenContext.keys()],
    (liveTrade) => {
      const context = tokenContext.get(liveTrade.tokenId);
      if (!context) return;

      const notionalUsd = liveTrade.size * liveTrade.price;
      if (notionalUsd < options.minimumTradeUsd) return;

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
            `${liveTrade.tokenId}:${liveTrade.timestamp}:${liveTrade.price}`,
        },
        context.market,
      );

      const time = new Date(liveTrade.timestamp).toLocaleTimeString('en-US');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(
        `${interpretation.direction} | ${context.outcome} | ${liveTrade.side}`,
      );
      console.log(`Time: ${time}`);
      console.log(
        `Notional: $${notionalUsd.toLocaleString('en-US', { maximumFractionDigits: 2 })}`,
      );
      console.log(
        `Price: ${liveTrade.price.toFixed(4)} | Shares: ${liveTrade.size.toLocaleString('en-US', { maximumFractionDigits: 4 })}`,
      );
      console.log(context.market.question);
    },
  );

  const shutdown = (): void => {
    console.log('\nStopping Polymarket live watcher...');
    webSocketClient.close();
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
