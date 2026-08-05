# R21 Strategy-First Architecture

## Decision

Whale activity is no longer a primary trade trigger. Independent strategies must first produce candidates. Whale-derived information is then evaluated as supporting, contradicting, neutral, or potentially spoofed evidence.

## Pipeline

```text
Market data
→ independent strategy candidates
→ event-level deduplication
→ regime evaluation
→ whale confirmation / contradiction analysis
→ cost and risk qualification
→ paper-only candidate
```

## Scientific objective

Measure incremental value instead of assuming whale activity creates alpha:

1. Base strategy without whale features.
2. Base strategy plus whale confirmation.
3. Base strategy when whale evidence contradicts it.
4. Base strategy with uncertain or likely-spoof whale activity.

Compare all groups with chronological out-of-sample evaluation and realistic costs. Whale features must be retained only when they improve unseen-period net expectancy and confidence-bound stability.

## Design rules

- Whale support cannot rescue a base strategy that fails its own confidence or net-edge requirements.
- Confirmed contradiction may block a candidate.
- Likely-spoof displayed liquidity cannot become positive directional confirmation.
- Same-instrument, same-direction candidates inside one event window are merged; only the strongest remains.
- Every output remains paper-only with all execution and transport permissions disabled.
- Candidate selection must account for fees, slippage, and a positive safety margin before qualification.

## Research basis

The implementation follows these evidence-backed principles:

- Order-flow effects are horizon- and regime-dependent, so the system must not treat one order-book signal as universal alpha.
- Displayed liquidity can be manipulative or non-informative; persistence, posting distance, executions, and price response must be studied together.
- Strict chronological and walk-forward out-of-sample validation is required to limit overfitting and selection bias.
- Exchange public order-book and trade feeds are data inputs only; they do not imply execution authorization.

## Current scope

R21 introduces the strategy candidate contract, event deduplication, whale confirmation engine, and paper-only cost/risk qualification engine. Integration into the live `MarketEngine` must occur only after focused tests pass and independent strategy generators are defined.
