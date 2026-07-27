# OKX Whale Detector

A TypeScript research tool that watches selected OKX spot order books and reports large visible liquidity.

## Important limitation

The detector produces heuristic research signals. A wall can be cancelled, moved, spoofed, or filled. Output is not a guarantee of future price direction and must not be treated as a probability of profit.

## Requirements

- Node.js 24
- npm

## Install

```bash
npm ci
```

## Verify

```bash
npm run check
```

## Development

```bash
npm run dev
```

## Production build

```bash
npm run build
npm start
```

## Watched symbols

Edit `src/config/symbols.ts`.

## Project structure

- `src/clients/okx`: OKX WebSocket boundary
- `src/core`: order-book and detector logic
- `src/market`: per-symbol orchestration
- `src/types`: shared TypeScript types
- `test`: automated regression tests

## Data-integrity rules

- Detector output is allowed only after a full snapshot.
- Every incremental update must pass sequence-continuity checks.
- On a gap or reconnect, local market state is reset and a new snapshot is required.

## Security

This project currently uses public market data and does not require an OKX API key. Do not add withdrawal-capable credentials.
