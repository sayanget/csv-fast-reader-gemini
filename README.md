# Fast CSV reader (csv-reader 1.0.0 drop-in)

Gemini 4 Neon-built scanner + low-overhead driver (single-threaded GC, streamed per-case JSON) that returns **exactly** the same `{columns, rows, errors}` as make.fun's csv-reader 1.0.0, scored on CPU time.

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/sayanget/csv-fast-reader-gemini/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/sayanget/csv-fast-reader-gemini/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

Built for the [make.fun](https://make.fun) bounty **Read broken CSV files faster, 21 November 2026**.

## Run

```bash
node --experimental-strip-types main.ts
```

`MAKEFUN_INPUT_DIR` / `MAKEFUN_OUTPUT_DIR` stand in for `/input` and `/output` outside the sandbox.
