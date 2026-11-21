// csv-reader 1.0.0 optimized driver: streams cases from /input/cases.json through solve.js run() one at a time,
// writing byte-identical JSON to /output/answers.json with minimal GC and JIT overhead.

import { closeSync, ftruncateSync, openSync, readFileSync, writeSync } from 'node:fs';
import { setFlagsFromString } from 'node:v8';

// Single-threaded GC (avoids parallel scavenger thread CPU blowup in a 1-CPU container),
// no incremental marking (as in house baseline), and Maglev-only (avoids ~60-100ms TurboFan single-shot compile cost).
setFlagsFromString('--no-incremental-marking --single-threaded-gc --no-turbofan');

const { run } = (await import('./solve.js')) as { run: (input: unknown) => unknown };

// Prime V8 feedback vectors for solve.js cold branches before processing real cases (no state cached).
run({ text: 'a,b\r\n\r\n"""c""d",e\n"f\ng"x,h\r,i\nj\r\n"k', header: true });
run({ text: 'a,b\n1,2\n3', header: false });

const INPUT_DIR = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const OUTPUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const rawBuf = readFileSync(INPUT_DIR + '/cases.json');
const fd = openSync(OUTPUT_DIR + '/answers.json', 'w');

let fastOk = false;
// Fast streaming split on minified JSON array `[{"id":"...`, decoding & parsing one case at a time.
// In valid JSON, unescaped `"` cannot appear inside string literals, so `},{"id":"` only matches object boundaries.
if (
  rawBuf.length >= 16 &&
  rawBuf[0] === 91 &&
  rawBuf[1] === 123 &&
  rawBuf[2] === 34 &&
  rawBuf[3] === 105 &&
  rawBuf[4] === 100 &&
  rawBuf[5] === 34 &&
  rawBuf[6] === 58 &&
  rawBuf[7] === 34
) {
  let tail = rawBuf.length - 1;
  while (tail > 8 && (rawBuf[tail] === 32 || rawBuf[tail] === 10 || rawBuf[tail] === 13 || rawBuf[tail] === 9)) {
    tail--;
  }
  if (rawBuf[tail] === 93) {
    const SEP = Buffer.from('},{"id":"');
    try {
      writeSync(fd, '[');
      let start = 1;
      let first = true;
      while (true) {
        const idx = rawBuf.indexOf(SEP, start);
        let end: number;
        if (idx < 0) {
          end = tail - 1;
          while (end > start && rawBuf[end] !== 125) end--;
        } else {
          end = idx;
        }
        const c = JSON.parse(rawBuf.toString('utf8', start, end + 1)) as { input?: unknown } | null;
        if (c === null || typeof c !== 'object' || !('input' in c)) {
          throw new Error('fallback');
        }
        if (!first) writeSync(fd, ',');
        first = false;
        writeSync(fd, JSON.stringify(run(c.input)));
        if (idx < 0) break;
        start = idx + 2;
      }
      writeSync(fd, ']');
      fastOk = true;
    } catch {
      ftruncateSync(fd, 0);
    }
  }
}

if (!fastOk) {
  const cases = JSON.parse(rawBuf.toString('utf8')) as { id: string; input: unknown }[];
  let pos = 0;
  pos += writeSync(fd, '[', pos);
  for (let i = 0; i < cases.length; i++) {
    if (i > 0) pos += writeSync(fd, ',', pos);
    const inp = cases[i].input;
    (cases as unknown[])[i] = null;
    pos += writeSync(fd, JSON.stringify(run(inp)), pos);
  }
  writeSync(fd, ']', pos);
}

closeSync(fd);
