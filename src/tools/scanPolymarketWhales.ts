import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { ExternalSignalStore } from '../external/core/ExternalSignalStore';
import { PolymarketPublicClient } from '../external/providers/polymarket/PolymarketPublicClient';
import { PolymarketWhaleDetector } from '../external/providers/polymarket/PolymarketWhaleDetector';

interface ScanOptions {
  minimumTradeUsd: number;
  minimumLiquidityUsd: number;
  marketLimit: number;
  tradeLimit: number;
  reportPath?: string;
}

const parsePositiveNumber = (value: string | undefined, flag: string): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${flag} requires a positive number`);
  }
  return parsed;
};

const parseOptions = (args: readonly string[]): ScanOptions => {
  const options: ScanOptions = {
    minimumTradeUsd: 10_000,
    minimumLiquidityUsd: 25_000,
    marketLimit: 500,
    tradeLimit: 1_000,
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
    } else if (flag === '--trade-limit') {
      options.tradeLimit = parsePositiveNumber(value, flag);
      index += 1;
    } else if (flag === '--report') {
      options.reportPath = value?.startsWith('--')
        ? 'data/reports/polymarket-whale-scan.json'
        : value ?? 'data/reports/polymarket-whale-scan.json';
      if (value && !value.startsWith('--')) index += 1;
    } else {
      throw new Error(`Unknown Polymarket scan option: ${flag}`);
    }
  }

  return options;
};

const main = async (): Promise<void> => {
  const options = parseOptions(process.argv.slice(2));
  const client = new PolymarketPublicClient();
  const detector = new PolymarketWhaleDetector({
    minimumLiquidityUsd: options.minimumLiquidityUsd,
    minimumTradeNotionalUsd: options.minimumTradeUsd,
  });
  const store = new ExternalSignalStore();

  const markets = await client.getActiveMarkets(options.marketLimit);
  const relevantMarkets = markets.filter((market) =>
    detector.isRelevantMarket(market),
  );
  const marketsByCondition = new Map(
    relevantMarkets.map((market) => [market.conditionId, market]),
  );
  const trades = await client.getRecentTradesForMarkets(
    options.minimumTradeUsd,
    relevantMarkets.map((market) => market.conditionId),
    options.tradeLimit,
  );

  let matchedTrades = 0;
  for (const trade of trades) {
    const market = marketsByCondition.get(trade.conditionId);
    if (!market) continue;
    matchedTrades += 1;
    const signal = detector.detect(trade, market);
    if (signal) store.add(signal);
  }

  const signals = store.getAll();

  console.log('\nPOLYMARKET WHALE SCAN');
  console.log(`Active markets fetched: ${markets.length}`);
  console.log(`Relevant liquid markets: ${relevantMarkets.length}`);
  console.log(`Relevant-market trades fetched: ${trades.length}`);
  console.log(`Trades matched to discovered markets: ${matchedTrades}`);
  console.log(`Whale signals detected: ${signals.length}`);

  for (const signal of signals.slice(0, 20)) {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`${signal.direction} | ${signal.asset ?? 'MACRO'}`);
    console.log(
      `Notional: $${(signal.notionalUsd ?? 0).toLocaleString('en-US', {
        maximumFractionDigits: 2,
      })}`,
    );
    console.log(`Confidence: ${signal.confidence.toFixed(1)}%`);
    console.log(signal.description);
  }

  if (options.reportPath) {
    const report = {
      generatedAt: new Date().toISOString(),
      options,
      activeMarketsFetched: markets.length,
      relevantMarkets: relevantMarkets.length,
      relevantMarketTradesFetched: trades.length,
      matchedTrades,
      whaleSignals: signals,
    };
    mkdirSync(path.dirname(options.reportPath), { recursive: true });
    writeFileSync(
      options.reportPath,
      `${JSON.stringify(report, null, 2)}\n`,
      'utf8',
    );
    console.log(`\nReport: ${options.reportPath}`);
  }
};

void main().catch((error: unknown) => {
  console.error('Polymarket scan failed:', error);
  process.exitCode = 1;
});
