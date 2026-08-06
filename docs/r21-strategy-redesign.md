# Phase R Strategy-First Architecture (R21-R28)

## Decision

Whale activity is no longer a primary trade trigger. Independent strategies generate candidates first. Whale-derived information is evaluated afterward as supporting, neutral, contradicting, or potentially spoofed evidence.

The architecture is research-only. It cannot submit orders, use private OKX trading endpoints, authorize testnet execution, or dispatch an execution transport.

## Integrated pipeline

```text
Public market data
→ runtime strategy feature adapter
→ independent strategy registry
→ strategy candidates
→ event-level deduplication
→ market-regime gate
→ whale confirmation / contradiction analysis
→ cost and qualification gates
→ append-only shadow research datasets
→ persistent holding-horizon obligations
→ deterministic replay
→ purged walk-forward validation
→ fee, slippage, spread, liquidity, and volatility robustness
→ frozen paper-only evaluation
```

## R21 — Strategy-first foundation

R21 introduced:

- `StrategyCandidate` as the independent candidate contract,
- `StrategyRegistry` for deterministic strategy ordering,
- `TrendContinuationStrategy` as the first independent strategy family,
- `CandidateDeduplicator` for one candidate per independent event window,
- `WhaleConfirmationEngine` as a secondary confirmation and contradiction layer,
- `TradeQualificationEngine` with separate base and final qualification decisions.

Whale support cannot rescue a base strategy that fails its own confidence, regime, observed-movement, or estimated-net-edge requirements.

## R22 — Runtime feature adapter

`RuntimeStrategyFeatureAdapter` constructs `StrategyEvaluationContext` only from information available at the decision timestamp:

- confirmed-candle fast return,
- confirmed-candle slow return,
- realized volatility from confirmed closes,
- current best-bid / best-ask spread,
- bounded near-touch depth,
- public aggressive trade-flow imbalance,
- reference midpoint,
- observation timestamp.

It rejects stale or future order books, stale confirmed candles, excessive candle gaps, incomplete lookbacks, and non-finite values.

Whale direction, wall size, whale score, and whale behavior are deliberately excluded from this context.

`RuntimeWhaleFeatureAdapter` is separate. It transforms whale tracking into confirmation features without fabricating unsupported absorption or spoof labels.

## R23 — Shadow candidate recorder

The strategy pipeline is integrated into `MarketEngine` through optional `StrategyShadowRuntime`.

It is disabled by default. To enable paper-only shadow collection in Windows CMD:

```cmd
set STRATEGY_RESEARCH_ENABLED=true
npm.cmd run dev
```

Optional output directory:

```cmd
set STRATEGY_RESEARCH_DIRECTORY=data\strategy-research-session-1
```

The shadow path writes isolated research state:

- `strategy-candidates.ndjson`
- `strategy-qualifications.ndjson`
- `strategy-outcomes.ndjson`
- `whale-incremental-observations.ndjson`
- `pending-strategy-outcomes.json`

`PersistentStrategyOutcomeStore` atomically persists unresolved holding-horizon obligations. On restart, `StrategyShadowRuntime` restores both pending outcomes and candidate-event memory. Transient market resets do not erase those obligations or permit duplicate candidates inside the frozen event window.

These files do not replace or mutate the existing evidence pipeline. Recorder failures remain isolated from the detector, and graceful shutdown flushes all writers.

## R24 — Comparative whale research

`analyzeWhaleIncrementalValue` compares:

- `BASE_ONLY`,
- `WHALE_SUPPORTS`,
- `WHALE_NEUTRAL`,
- `WHALE_CONTRADICTS`.

For each group it reports:

- observation count,
- mean net return,
- win rate,
- deterministic block-bootstrap confidence interval,
- statistical-sufficiency flag.

Incremental differences are measured against the base population. Whale support remains informational unless each frozen group reaches its sample requirement and the benefit remains stable in unseen periods.

## R25 — Deterministic replay and walk-forward validation

`runDeterministicStrategyReplay`:

- sorts records by event-time availability,
- rejects duplicate event IDs,
- rejects features unavailable at decision time,
- rejects outcomes available before the holding horizon,
- uses deterministic replay time,
- resets and restores stateful candidate deduplication,
- emits a deterministic SHA-256 fingerprint.

`createWalkForwardValidationReport` uses expanding training windows and fixed validation and testing windows. Purge and embargo controls remove label overlap around decision boundaries. No parameter optimization is performed during evaluation.

Existing generic candidate-comparison utilities remain because they consume already summarized metrics. The Phase R walk-forward layer operates on raw event-time outcomes and has a distinct responsibility.

## R26 — Cost and robustness analysis

`analyzeStrategyRobustness` applies frozen scenarios containing:

- fee assumptions,
- slippage assumptions,
- spread multipliers,
- tight / normal / wide spread buckets,
- low / medium / high liquidity buckets,
- low / medium / high volatility buckets,
- deterministic block-bootstrap intervals.

The frozen definition includes `BASE`, `CONSERVATIVE`, and `STRESS` scenarios. A candidate is not robust unless the lower confidence bound remains positive under every required scenario.

## R27 — Frozen candidate evaluation

A frozen strategy evaluation stores:

- source commit,
- immutable configuration and fingerprint,
- strategy IDs,
- candidate event window,
- feature freshness and near-touch depth policies,
- whale feature policy,
- regime and strategy thresholds,
- qualification policy,
- walk-forward windows,
- robustness scenarios and regime thresholds,
- sample requirements.

The evaluator canonicalizes observation order and rejects duplicate candidates, unsupported strategy IDs, invalid safety state, non-finite market fields, and outcomes before their required horizon.

Initialize only from a clean committed worktree:

```cmd
npm.cmd run strategy:evaluation:init -- strategy-eval-YYYY-MM-DD-v1
```

Generate the frozen report:

```cmd
npm.cmd run strategy:evaluation:run -- strategy-eval-YYYY-MM-DD-v1
```

The runner refuses a dirty worktree or source commit different from the frozen manifest. It never tunes parameters and never authorizes execution.

## R28 — Audit and consolidation decisions

- The historical whale-alert path remains for compatibility and baseline research, but it cannot originate strategy candidates.
- Runtime strategy features and whale confirmation features use separate adapters.
- Existing evidence files remain untouched.
- Event deduplication is centralized in `CandidateDeduplicator`.
- Base cost, confidence, and regime qualification is centralized in `TradeQualificationEngine`.
- Weak observed movement is rejected rather than raised to a configured expected-move floor.
- The existing strategy simulation was consolidated into one integrated R22-R28 simulation.
- Historical branches were inspected. Superseded or fully-behind implementations were not copied into the active architecture.
- No tested production file or dependency was removed without a verified safe replacement.

## Frozen research thresholds

The current definition is intentionally conservative and must not change after evaluation initialization:

- strategy: `TREND_CONTINUATION_V1`,
- candidate event window: 60 minutes,
- holding horizon: 60 minutes,
- minimum observed slow-trend magnitude: 0.35%,
- estimated round-trip cost gate: 0.20%,
- minimum remaining edge: 0.10%,
- minimum frozen outcomes: 1,000,
- minimum whale observations per group: 100,
- maximum order-book age: 5 seconds,
- maximum confirmed-candle age: 2 minutes,
- near-touch depth: 20 levels per side.

These values are hypotheses, not claims of profitability. Any later change requires a new strategy version and a new frozen evaluation.

## Promotion gate

A candidate may advance only to another paper-only evaluation when:

- the minimum independent outcome count is met,
- every frozen validation fold is positive after costs,
- every frozen test fold is positive after costs,
- the bootstrap lower bound is positive under every cost scenario,
- spread, liquidity, and volatility robustness remain acceptable,
- data integrity is clean,
- deterministic replay fingerprints match,
- whale incremental value is treated only as a secondary result.

No Phase R result authorizes testnet or live trading.

## Validation

```cmd
npm.cmd ci
npm.cmd run strategy:validate
npm.cmd run check
npm.cmd run build --silent
git diff --check
git status
```

The integrated simulation must end with:

```text
R22-R28 INTEGRATED STRATEGY SIMULATION PASSED
Paper-only research. Order execution remains disabled.
```

A synthetic pass validates architecture, determinism, and safety behavior. It does not demonstrate market profitability.

## Permanent execution locks

```text
paperOnly: true
liveOrderExecutionAllowed: false
orderExecutionAuthorized: false
transportDispatchAllowed: false
testnetExecutionAuthorized: false
```
