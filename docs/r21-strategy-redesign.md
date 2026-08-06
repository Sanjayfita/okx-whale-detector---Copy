# Phase R Strategy-First Architecture (R21-R28)

## Decision

Whale activity is no longer a primary trade trigger. Independent strategies must first produce candidates. Whale-derived information is evaluated only after candidate generation as supporting, neutral, contradicting, or potentially spoofed evidence.

The architecture remains research-only. It cannot submit orders, use private OKX trading endpoints, authorize testnet execution, or dispatch an execution transport.

## Integrated pipeline

```text
Public market data
→ runtime strategy feature adapter
→ independent strategy registry
→ strategy candidates
→ event-level deduplication
→ market-regime gate
→ whale confirmation / contradiction analysis
→ cost and risk qualification
→ append-only shadow research datasets
→ deterministic replay
→ purged walk-forward validation
→ cost and regime robustness analysis
→ frozen paper-only evaluation
```

## R21 — Strategy-first foundation

R21 introduced:

- `StrategyCandidate` as the independent candidate contract.
- `StrategyRegistry` for deterministic strategy ordering.
- `TrendContinuationStrategy` as the first independent strategy family.
- `CandidateDeduplicator` to prevent repeated same-event candidates.
- `WhaleConfirmationEngine` as a secondary confirmation and contradiction layer.
- `TradeQualificationEngine` with separate base-strategy and final qualification decisions.

Whale support cannot rescue a base strategy that fails its own confidence, regime, or estimated net-edge requirements.

## R22 — Runtime feature adapter

`RuntimeStrategyFeatureAdapter` constructs `StrategyEvaluationContext` from data available at the decision timestamp:

- confirmed candle fast return,
- confirmed candle slow return,
- realized volatility from confirmed candle closes,
- current best-bid / best-ask spread,
- visible order-book depth notional,
- public aggressive trade-flow imbalance,
- reference midpoint,
- observation timestamp.

Whale direction, wall size, whale score, and whale behavior are deliberately excluded from this context.

`RuntimeWhaleFeatureAdapter` is a separate adapter that transforms whale tracking into confirmation features. Unknown absorption and spoof labels are not fabricated. Unsupported absorption remains neutral until a validated runtime source is available.

## R23 — Shadow candidate recorder

The strategy pipeline is integrated into `MarketEngine` through an optional `StrategyShadowRuntime`.

It is disabled by default. To enable paper-only shadow collection in Windows CMD:

```cmd
set STRATEGY_RESEARCH_ENABLED=true
npm.cmd run dev
```

Optional output location:

```cmd
set STRATEGY_RESEARCH_DIRECTORY=data\strategy-research-session-1
```

The shadow path writes separate append-only datasets:

- `strategy-candidates.ndjson`
- `strategy-qualifications.ndjson`
- `whale-incremental-observations.ndjson`

These files do not replace or mutate the existing evidence pipeline. Recorder failures are isolated so the existing detector continues running. Graceful shutdown flushes and closes the strategy writers.

## R24 — Comparative whale research

`analyzeWhaleIncrementalValue` compares:

- `BASE_ONLY`: every independently viable base candidate,
- `WHALE_SUPPORTS`,
- `WHALE_NEUTRAL`,
- `WHALE_CONTRADICTS`.

For each group it reports:

- observation count,
- mean net return,
- win rate,
- deterministic block-bootstrap confidence interval,
- statistical-sufficiency flag.

It also reports incremental differences from the base population. Whale support remains informational unless every frozen group meets the required sample size and unseen-period evidence shows a stable incremental benefit.

## R25 — Deterministic replay and walk-forward validation

`runDeterministicStrategyReplay`:

- sorts records by event-time availability,
- rejects duplicate event IDs,
- rejects decision features that were unavailable at decision time,
- rejects outcomes that appear before the candidate holding horizon,
- uses the existing deterministic `ReplayClock`,
- resets stateful candidate deduplication before replay,
- emits a deterministic SHA-256 fingerprint.

`createWalkForwardValidationReport` uses fixed expanding training windows with frozen validation and testing windows. Purge and embargo controls remove observations whose labels overlap a later decision boundary. No parameter mutation or optimization is performed during validation.

The existing `strategyWalkForwardEvaluation.ts` remains a generic comparison utility for already summarized candidate metrics. The new `walkForwardValidation.ts` validates raw strategy-outcome observations with purge and embargo rules; the modules serve different layers and are not parallel implementations of the same responsibility.

## R26 — Cost and robustness analysis

`analyzeStrategyRobustness` applies frozen scenarios containing:

- fee assumptions,
- slippage assumptions,
- spread multipliers,
- low / medium / high liquidity buckets,
- low / medium / high volatility buckets,
- block-bootstrap confidence intervals.

The current frozen definition includes `BASE`, `CONSERVATIVE`, and `STRESS` cost scenarios. A strategy is not robust unless the lower confidence bound remains positive under every required scenario.

## R27 — Frozen candidate evaluation

A frozen strategy evaluation stores:

- source commit,
- immutable configuration,
- configuration fingerprint,
- strategy IDs,
- event window,
- feature and whale policies,
- regime and strategy thresholds,
- qualification policy,
- walk-forward windows,
- robustness scenarios,
- sample requirements.

Initialize only from a clean committed worktree:

```cmd
npm.cmd run strategy:evaluation:init -- strategy-eval-YYYY-MM-DD-v1
```

After independently generated outcome observations have been written to the evaluation directory:

```cmd
npm.cmd run strategy:evaluation:run -- strategy-eval-YYYY-MM-DD-v1
```

The runner refuses a dirty worktree or a source commit different from the frozen manifest. It never tunes parameters and never authorizes execution.

## R28 — Final audit decisions

The final Phase R audit made these consolidation decisions:

- The historical whale-alert path is retained for compatibility and baseline research, but it is not used to originate strategy candidates.
- Runtime strategy features and whale confirmation features are separate adapters.
- Existing evidence files remain untouched; the new shadow datasets are isolated.
- Stateful event deduplication is centralized in `CandidateDeduplicator` rather than repeated in recorders or strategies.
- Base qualification is centralized in `TradeQualificationEngine`; whale logic cannot duplicate cost or regime gates.
- The prior generic strategy simulation was consolidated into the integrated R22-R28 simulation instead of adding a second simulator.
- Historical feature branches were inspected. Superseded or fully-behind branches were not merged. Useful dependency-aware statistical concepts were represented through the repository's existing block-bootstrap, chronological split, and new frozen robustness layers rather than copied as competing modules.
- No active source file or production dependency was removed without a verified safe replacement. Historical research utilities with tests were retained because they still provide distinct public functionality.

## Validation commands

Focused integrated validation:

```cmd
npm.cmd run strategy:validate
```

Full repository validation:

```cmd
npm.cmd run check
npm.cmd run build --silent
git diff --check
git status
```

The integrated deterministic simulation must end with:

```text
R22-R28 INTEGRATED STRATEGY SIMULATION PASSED
Paper-only research. Order execution remains disabled.
```

A simulation pass validates architecture, determinism, and safety behavior. It does not demonstrate market profitability.

## Frozen research thresholds

The current candidate definition is intentionally conservative and must not be changed after an evaluation starts:

- primary strategy: `TREND_CONTINUATION_V1`,
- candidate event window: 60 minutes,
- holding horizon: 60 minutes,
- minimum predicted move: 0.35%,
- base estimated round-trip cost: 0.20%,
- minimum remaining edge: 0.10%,
- minimum frozen outcomes: 1,000,
- minimum whale observations per comparison group: 100.

These values are research hypotheses, not claims of profitability. A later strategy version must receive a new ID and a new frozen evaluation rather than rewriting an existing manifest.

## Promotion gate

A candidate may advance only to another paper-only evaluation when:

- minimum independent outcome count is met,
- every frozen validation fold is positive after costs,
- every frozen test fold is positive after costs,
- the bootstrap lower bound is positive under every required cost scenario,
- data integrity remains clean,
- deterministic replay fingerprints match,
- whale incremental value is treated only as a secondary result.

No result from Phase R authorizes testnet or live trading.

## Permanent execution locks

All new outputs preserve:

```text
paperOnly: true
liveOrderExecutionAllowed: false
orderExecutionAuthorized: false
transportDispatchAllowed: false
testnetExecutionAuthorized: false
```
