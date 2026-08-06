# Phase R Completion Report

Branch: `feature/r21-strategy-redesign`

Status: implementation complete; local pre-merge validation required before merge to `main`.

## Scope completed

### R21 — Strategy-first redesign

- Independent strategy candidates originate before whale analysis.
- Whale tracking is a secondary confirmation, contradiction, spoof-risk, and research feature layer.
- Whale support cannot rescue a base strategy that fails independent qualification.

### R22 — Runtime feature adapter

- Confirmed candle fast and slow returns.
- Realized volatility from confirmed closes.
- Best-bid / best-ask spread.
- Visible market depth notional.
- Public aggressive trade-flow imbalance.
- Reference midpoint and event timestamp.
- No whale-derived field is injected into `StrategyEvaluationContext`.

### R23 — Shadow recording

- Optional `StrategyShadowRuntime` integrated into the existing `MarketEngine` summary cadence.
- Disabled by default.
- Stateful event-level deduplication.
- Paper-only qualification recording.
- Holding-horizon outcome resolution from later public midpoint observations.
- Isolated append-only outputs:
  - `strategy-candidates.ndjson`
  - `strategy-qualifications.ndjson`
  - `strategy-outcomes.ndjson`
  - `whale-incremental-observations.ndjson`
- Existing evidence datasets and alert recorders remain independent.

### R24 — Comparative whale research

- Base-only population.
- Whale-supported subgroup.
- Whale-neutral subgroup.
- Whale-contradiction subgroup.
- Observation counts, mean net return, win rate, deterministic block-bootstrap intervals, and sufficiency flags.

### R25 — Replay and walk-forward validation

- Deterministic chronological replay.
- Event-availability checks.
- Holding-horizon outcome checks.
- Stateful pipeline reset before replay.
- Expanding training windows.
- Frozen validation and test windows.
- Purge and embargo controls.
- No parameter mutation during evaluation.

### R26 — Cost and robustness analysis

- Fee scenarios.
- Slippage scenarios.
- Spread multipliers.
- Liquidity-regime buckets.
- Volatility-regime buckets.
- Confidence intervals per scenario.
- Positive-lower-bound requirement under every frozen scenario.

### R27 — Frozen candidate evaluation

- Clean source-commit requirement.
- Immutable configuration fingerprint.
- Fixed thresholds and windows.
- Deterministic report fingerprint.
- Paper-only pass/fail gate.
- Whale incremental-value insufficiency remains a warning rather than permission to change the base strategy result.

### R28 — Audit and consolidation

- Existing generic strategy comparison utilities were retained because they summarize already-computed metrics, while the new validation layer operates on raw event-time outcome observations.
- The existing strategy simulator was replaced with the integrated R22-R28 simulation rather than duplicated.
- Stateful deduplication was centralized in `CandidateDeduplicator`.
- Base qualification was centralized in `TradeQualificationEngine`.
- Runtime strategy and whale feature adaptation were kept separate.
- Superseded historical branches were inspected but not merged.
- No active dependency or source file was deleted without a verified safe replacement.

## Added files

- `src/config/strategyResearchConfig.ts`
- `src/recording/StrategyResearchRecorder.ts`
- `src/regime/MarketRegimeClassifier.ts`
- `src/research/RuntimeStrategyFeatureAdapter.ts`
- `src/research/RuntimeWhaleFeatureAdapter.ts`
- `src/research/StrategyShadowRuntime.ts`
- `src/research/frozenStrategyEvaluation.ts`
- `src/research/strategyEvaluationDefinition.ts`
- `src/research/strategyReplay.ts`
- `src/research/strategyResearchTypes.ts`
- `src/research/strategyRobustnessAnalysis.ts`
- `src/research/walkForwardValidation.ts`
- `src/research/whaleIncrementalValueResearch.ts`
- `src/selection/CandidatePipeline.ts`
- `src/strategies/Strategy.ts`
- `src/strategies/StrategyRegistry.ts`
- `src/strategies/TrendContinuationStrategy.ts`
- `src/tools/initializeFrozenStrategyEvaluation.ts`
- `src/tools/runFrozenStrategyEvaluation.ts`
- `test/FrozenStrategyEvaluation.test.ts`
- `test/StrategyReplayValidation.test.ts`
- `test/StrategyRuntimeIntegration.test.ts`
- `test/TrendContinuationStrategy.test.ts`
- `test/WhaleConfirmationEngine.test.ts`
- `test/StrategyQualificationPipeline.test.ts`

## Modified files

- `package.json`
- `src/index.ts`
- `src/market/MarketEngine.ts`
- `src/runtime/AppShutdownCoordinator.ts`
- `src/selection/CandidateDeduplicator.ts`
- `src/selection/TradeQualificationEngine.ts`
- `src/tools/simulateStrategyResearch.ts`
- `docs/r21-strategy-redesign.md`

## Removed files

None. Repository and branch inspection did not establish that an active tested source file or production dependency could be deleted without risking supported behavior. Obsolete historical branches were excluded rather than copied into the active architecture.

## Operational workflow

### Validate the implementation

```cmd
npm.cmd ci
npm.cmd run strategy:validate
npm.cmd run check
npm.cmd run build --silent
git diff --check
git status
```

### Initialize a frozen paper evaluation

```cmd
npm.cmd run strategy:evaluation:init -- strategy-eval-YYYY-MM-DD-v1
```

### Collect directly into the frozen evaluation directory

```cmd
set STRATEGY_RESEARCH_ENABLED=true
set STRATEGY_RESEARCH_DIRECTORY=data\strategy-evaluations\strategy-eval-YYYY-MM-DD-v1
npm.cmd run dev
```

The 60-minute outcome resolver records a candidate at the first later public midpoint observation at or after the frozen holding horizon.

### Generate the frozen report

```cmd
npm.cmd run strategy:evaluation:run -- strategy-eval-YYYY-MM-DD-v1
```

## Performance considerations

- Strategy evaluation runs on the existing throttled summary cadence rather than every order-book message.
- Candidate deduplication limits repeated same-event research work.
- Append-only writers are opened lazily.
- Shadow recorder failures are isolated from the existing detector.
- Flush-after-each-record favors research integrity over maximum write throughput and can be disabled only before a non-frozen exploratory run.
- Block-bootstrap iterations are deterministic and should be run offline rather than inside the live market-data loop.

## Validation status

Source changes and tests have been committed to the feature branch. The integrated simulation, focused test command, full test suite, lint, typecheck, and build must still be executed in the local repository before merge. No GitHub workflow result was available for the latest branch commit at the time of this report.

A passing synthetic simulation validates architecture and determinism only. It is not evidence that the market strategy is profitable.

## Remaining risks

- The initial trend thresholds are hypotheses and may fail empirical testing.
- Public trade-flow imbalance is short-lived and sensitive to the configured lookback.
- Visible depth can change quickly and displayed liquidity can be cancelled.
- Absorption remains neutral in the runtime whale adapter until a validated feature source is connected.
- In-memory pending outcomes are lost if the process exits before the holding horizon; long collection sessions should be stopped only after allowing pending observations to mature, or pending-state persistence should be added before unattended production research.
- Fee and slippage scenarios are frozen assumptions, not guaranteed realized costs.
- The package audit warning previously observed locally requires a fresh `npm audit` review; no automatic dependency rewrite was performed.

## Recommended future work

1. Persist and resume pending strategy outcomes across process restarts.
2. Add a second independent strategy family only after the trend strategy has a complete frozen result.
3. Calibrate cost scenarios from measured spread and slippage distributions.
4. Add MFE and MAE path outcomes for qualified candidates.
5. Compare base, whale-supported, neutral, and contradicted groups only after each frozen group reaches its sample requirement.
6. Keep leverage, compounding, testnet execution, and live execution disabled.

## Permanent safety state

```text
paperOnly: true
liveOrderExecutionAllowed: false
orderExecutionAuthorized: false
transportDispatchAllowed: false
testnetExecutionAuthorized: false
```
