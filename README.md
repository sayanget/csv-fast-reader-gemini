# Fast CSV reader (csv-reader 1.0.0 drop-in)

Pure-JavaScript streaming JSON-to-JSON transducer (no WebAssembly): reads cases.json through small reused windows and writes answers.json bytes directly, byte-identical to make.fun's csv-reader 1.0.0 answers. Built with Antigravity CLI (Gemini 4 Neon, Claude Opus 5.5).

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/sayanget/csv-fast-reader-gemini/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/sayanget/csv-fast-reader-gemini/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

Built for the [make.fun](https://make.fun) bounty **Read broken CSV files faster, 21 November 2026**.

## Run

```bash
node main.ts
```

`MAKEFUN_INPUT_DIR` / `MAKEFUN_OUTPUT_DIR` stand in for `/input` and `/output` outside the sandbox.
