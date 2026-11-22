'use strict';
// csv-reader 1.0.0 drop-in. run(input) answers one case; transduceFile/main stream cases.json -> answers.json.

// Scalar scratch registers for passing cursor state to/from cold helpers within a single synchronous run() call.
// Always overwritten before use and sColumns is cleared before run() returns.
let sPos = 0;
let sLine = 0;
let sLF = 0;
let sCR = 0;
let sComma = 0;
let sEnded = 0;
let sExtra = 0;
let sLineEnd = 0;
let sAfterLine = 0;
let sRowCount = 0;
let sColumns = null;

function readUnquotedSlow(text, len, prefix, errors, recordLine, recordRow) {
  let pos = sPos;
  let line = sLine;
  let nextLF = sLF;
  let nextCR = sCR;
  let nextComma = sComma;

  let val = prefix;
  let hasVal = prefix.length > 0;
  let added = 0;
  let endedComma = 0;

  while (pos < len) {
    if (nextComma < pos) {
      nextComma = text.indexOf(',', pos);
      if (nextComma < 0) nextComma = len;
    }
    if (nextLF < pos) {
      nextLF = text.indexOf('\n', pos);
      if (nextLF < 0) nextLF = len;
    }
    if (nextCR < pos) {
      nextCR = text.indexOf('\r', pos);
      if (nextCR < 0) nextCR = len;
    }
    let stop = nextComma < nextLF ? nextComma : nextLF;
    if (nextCR < stop) stop = nextCR;

    if (stop > pos) {
      const seg = text.slice(pos, stop);
      val = hasVal ? val + seg : seg;
      hasVal = true;
      added += stop - pos;
      pos = stop;
    }
    if (pos >= len) break;
    if (pos === nextComma) {
      pos += 1;
      endedComma = 1;
      break;
    }
    if (pos === nextLF) {
      pos += 1;
      line += 1;
      break;
    }
    if (pos + 1 < len && text.charCodeAt(pos + 1) === 10) {
      pos += 2;
      line += 1;
      break;
    }
    errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
    pos += 1;
  }

  sPos = pos;
  sLine = line;
  sLF = nextLF;
  sCR = nextCR;
  sComma = nextComma;
  sEnded = endedComma;
  sExtra = added;
  return val;
}

function readQuotedComplex(text, len, firstQ, errors, recordLine, recordRow) {
  const open = sPos;
  const openLine = sLine;
  let line = openLine;
  let nextLF = sLF;
  let nextCR = sCR;
  let nextComma = sComma;

  let chunkStart = open + 1;
  let q = firstQ;
  let val = '';
  let hasVal = false;
  let closed = false;
  let pos = open;

  if (nextLF < chunkStart) {
    nextLF = text.indexOf('\n', chunkStart);
    if (nextLF < 0) nextLF = len;
  }
  if (nextCR < chunkStart) {
    nextCR = text.indexOf('\r', chunkStart);
    if (nextCR < 0) nextCR = len;
  }

  while (q !== -1) {
    while (nextCR < q) {
      while (nextLF < nextCR) {
        line += 1;
        nextLF = text.indexOf('\n', nextLF + 1);
        if (nextLF < 0) nextLF = len;
      }
      const seg = text.slice(chunkStart, nextCR);
      val = hasVal ? val + seg + '\n' : seg + '\n';
      hasVal = true;
      line += 1;
      if (nextCR + 1 < len && text.charCodeAt(nextCR + 1) === 10) {
        chunkStart = nextCR + 2;
        nextLF = text.indexOf('\n', chunkStart);
        if (nextLF < 0) nextLF = len;
      } else {
        chunkStart = nextCR + 1;
      }
      nextCR = text.indexOf('\r', chunkStart);
      if (nextCR < 0) nextCR = len;
    }
    while (nextLF < q) {
      line += 1;
      nextLF = text.indexOf('\n', nextLF + 1);
      if (nextLF < 0) nextLF = len;
    }
    if (q + 1 < len && text.charCodeAt(q + 1) === 34) {
      const seg = text.slice(chunkStart, q + 1);
      val = hasVal ? val + seg : seg;
      hasVal = true;
      chunkStart = q + 2;
      q = text.indexOf('"', chunkStart);
      continue;
    }
    if (hasVal) {
      if (q > chunkStart) val += text.slice(chunkStart, q);
    } else {
      val = text.slice(chunkStart, q);
    }
    pos = q + 1;
    closed = true;
    break;
  }

  if (!closed) {
    pos = open + 1;
    line = openLine;
    nextLF = text.indexOf('\n', pos);
    if (nextLF < 0) nextLF = len;
    nextCR = text.indexOf('\r', pos);
    if (nextCR < 0) nextCR = len;
    nextComma = text.indexOf(',', pos);
    if (nextComma < 0) nextComma = len;
    errors.push({ code: 'unterminated_quote', line: recordLine, row: recordRow });
    sPos = pos;
    sLine = line;
    sLF = nextLF;
    sCR = nextCR;
    sComma = nextComma;
    return readUnquotedSlow(text, len, '"', errors, recordLine, recordRow);
  }

  if (pos >= len) {
    sPos = pos;
    sLine = line;
    sLF = nextLF;
    sCR = nextCR;
    sComma = nextComma;
    sEnded = 0;
    return val;
  }

  const after = text.charCodeAt(pos);
  if (after === 44) {
    sPos = pos + 1;
    sLine = line;
    sLF = nextLF;
    sCR = nextCR;
    sComma = nextComma;
    sEnded = 1;
    return val;
  }
  if (after === 10) {
    sPos = pos + 1;
    sLine = line + 1;
    sLF = nextLF;
    sCR = nextCR;
    sComma = nextComma;
    sEnded = 0;
    return val;
  }
  if (after === 13 && pos + 1 < len && text.charCodeAt(pos + 1) === 10) {
    sPos = pos + 2;
    sLine = line + 1;
    sLF = nextLF;
    sCR = nextCR;
    sComma = nextComma;
    sEnded = 0;
    return val;
  }

  sPos = pos;
  sLine = line;
  sLF = nextLF;
  sCR = nextCR;
  sComma = nextComma;
  const full = readUnquotedSlow(text, len, val, errors, recordLine, recordRow);
  if (sExtra > 0) {
    errors.push({ code: 'quote_junk', line: recordLine, row: recordRow });
  }
  return full;
}

function readSlowRecordRest(text, len, buf, col, errors, recordLine, recordRow) {
  let firstQuoted = 0;
  while (true) {
    const pos = sPos;
    if (pos < len && text.charCodeAt(pos) === 34) {
      if (col === 0) firstQuoted = 1;
      const q = text.indexOf('"', pos + 1);
      buf[col++] = readQuotedComplex(text, len, q, errors, recordLine, recordRow);
      if (sEnded === 0) break;
    } else {
      buf[col++] = readUnquotedSlow(text, len, '', errors, recordLine, recordRow);
      if (sEnded === 0) break;
    }
  }
  sExtra = firstQuoted;
  return col;
}

function readQuotedFallback(text, len, lastComma, buf, col, q, errors, recordLine, recordRow) {
  buf[col++] = readQuotedComplex(text, len, q, errors, recordLine, recordRow);
  if (sEnded === 0) return col;
  const pos = sPos;
  if (pos > sLineEnd || q === -1) {
    let nextLF = sLF;
    let nextCR = sCR;
    if (nextLF < pos) {
      nextLF = text.indexOf('\n', pos);
      if (nextLF < 0) nextLF = len;
    }
    if (nextCR < pos) {
      nextCR = text.indexOf('\r', pos);
      if (nextCR < 0) nextCR = len;
    }
    sLF = nextLF;
    sCR = nextCR;
    if (nextCR >= nextLF && nextLF < lastComma) {
      sLineEnd = nextLF;
      sAfterLine = nextLF + 1;
    } else if (nextCR === nextLF - 1 && nextLF < len && nextCR < lastComma) {
      sLineEnd = nextCR;
      sAfterLine = nextLF + 1;
    } else {
      col = readSlowRecordRest(text, len, buf, col, errors, recordLine, recordRow);
      sEnded = 0;
    }
  }
  return col;
}

function skipEmptyLines(text, len, pos, line) {
  while (pos < len) {
    const c = text.charCodeAt(pos);
    if (c === 10) {
      pos += 1;
      line += 1;
    } else if (c === 13 && pos + 1 < len && text.charCodeAt(pos + 1) === 10) {
      pos += 2;
      line += 1;
    } else {
      break;
    }
  }
  sLine = line;
  return pos;
}

function emitSpecialRow(rows, errors, buf, col, width, header, recordLine, rowCount) {
  if (width < 0) {
    width = col;
    if (header) {
      sColumns = buf.slice(0, col);
      sRowCount = rowCount;
      return width;
    }
    rows.push(buf.slice(0, col));
    sRowCount = rowCount + 1;
    return width;
  }
  if (col < width) {
    errors.push({ code: 'short_row', line: recordLine, row: rowCount, fields: col });
    for (let i = col; i < width; i++) buf[i] = '';
    rows.push(buf.slice(0, width));
  } else {
    errors.push({ code: 'long_row', line: recordLine, row: rowCount, extra: buf.slice(width, col) });
    rows.push(buf.slice(0, width));
  }
  sRowCount = rowCount + 1;
  return width;
}

function runPlainLF(text, len, header, pos) {
  const errors = [null];
  errors.length = 0;
  const rows = [''];
  rows.length = 0;
  let width = -1;
  let rowCount = 0;
  let line = 1;
  sColumns = null;

  let nextLF = text.indexOf('\n', pos);
  if (nextLF < 0) nextLF = len;
  let nextComma = text.indexOf(',', pos);
  if (nextComma < 0) nextComma = len;

  const buf = [
    '','','','','','','','','','','','','','','','',
    '','','','','','','','','','','','','','','','',
    '','','','','','','','','','','','','','','','',
    '','','','','','','','','','','','','','','',''
  ];
  buf[0] = '';

  while (pos < len) {
    while (pos < len && text.charCodeAt(pos) === 10) {
      pos += 1;
      line += 1;
    }
    if (pos >= len) break;

    if (nextLF < pos) {
      nextLF = text.indexOf('\n', pos);
      if (nextLF < 0) nextLF = len;
    }

    const recordLine = line;
    let col = 0;
    if (nextComma < pos) {
      nextComma = text.indexOf(',', pos);
      if (nextComma < 0) nextComma = len;
    }
    if (nextComma < nextLF) {
      buf[0] = text.slice(pos, nextComma);
      col = 1;
      pos = nextComma + 1;
      while (true) {
        nextComma = text.indexOf(',', pos);
        if (nextComma >= 0 && nextComma < nextLF) {
          buf[col++] = text.slice(pos, nextComma);
          pos = nextComma + 1;
        } else {
          if (nextComma < 0) nextComma = len;
          buf[col++] = text.slice(pos, nextLF);
          break;
        }
      }
    } else {
      buf[0] = text.slice(pos, nextLF);
      col = 1;
    }
    pos = nextLF < len ? nextLF + 1 : len;
    line += 1;

    if (col === width) {
      rows.push(buf.slice(0, width));
      rowCount += 1;
    } else {
      width = emitSpecialRow(rows, errors, buf, col, width, header, recordLine, rowCount);
      rowCount = sRowCount;
    }
  }

  const columns = sColumns;
  sColumns = null;
  return { columns: header ? (columns ?? []) : null, rows, errors };
}

function parseMain(text, len, header, pos, nextCR, rows, errors, buf) {
  let width = -1;
  let rowCount = 0;
  let line = 1;
  const lastComma = text.lastIndexOf(',');
  let nextLF = text.indexOf('\n', pos);
  if (nextLF < 0) nextLF = len;
  let nextComma = text.indexOf(',', pos);
  if (nextComma < 0) nextComma = len;

  while (pos < len) {
    let c0 = text.charCodeAt(pos);
    if (c0 <= 13) {
      pos = skipEmptyLines(text, len, pos, line);
      line = sLine;
      if (pos >= len) break;
      c0 = text.charCodeAt(pos);
    }

    if (nextLF < pos) {
      nextLF = text.indexOf('\n', pos);
      if (nextLF < 0) nextLF = len;
    }
    if (nextCR < pos) {
      nextCR = text.indexOf('\r', pos);
      if (nextCR < 0) nextCR = len;
    }

    const recordLine = line;
    const recordRow = width < 0 && header ? null : rowCount;

    let afterLine = nextLF + 1;
    let lineEnd = -1;
    if (nextCR >= nextLF) {
      lineEnd = nextLF;
    } else if (nextCR === nextLF - 1 && nextLF < len) {
      lineEnd = nextCR;
    }
    const fastLine = lineEnd >= 0 && lineEnd < lastComma;

    let col = 0;

    if (fastLine) {
      let rowDone = false;

      if (c0 !== 34) {
        if (nextComma < pos) nextComma = text.indexOf(',', pos);
        if (nextComma < lineEnd) {
          buf[0] = text.slice(pos, nextComma);
          col = 1;
          pos = nextComma + 1;
        } else {
          buf[0] = text.slice(pos, lineEnd);
          col = 1;
          pos = afterLine;
          line += 1;
          rowDone = true;
        }
      }

      fieldLoop: while (!rowDone) {
        while (text.charCodeAt(pos) !== 34) {
          nextComma = text.indexOf(',', pos);
          if (nextComma < lineEnd) {
            buf[col++] = text.slice(pos, nextComma);
            pos = nextComma + 1;
          } else {
            buf[col++] = text.slice(pos, lineEnd);
            pos = afterLine;
            line += 1;
            break fieldLoop;
          }
        }

        const q = text.indexOf('"', pos + 1);
        if (q >= 0 && q < lineEnd) {
          const q1 = q + 1;
          if (q1 < lineEnd) {
            const after = text.charCodeAt(q1);
            if (after === 44) {
              buf[col++] = text.slice(pos + 1, q);
              pos = q + 2;
              continue;
            }
            if (after === 34) {
              let val = q === pos + 1 ? '"' : text.slice(pos + 1, q1);
              let cs = q + 2;
              let q2 = text.indexOf('"', cs);
              let handled = 0;
              while (q2 >= 0 && q2 < lineEnd) {
                const nq = q2 + 1;
                if (nq < lineEnd) {
                  const a2 = text.charCodeAt(nq);
                  if (a2 === 44) {
                    if (q2 > cs) val += text.slice(cs, q2);
                    buf[col++] = val;
                    pos = q2 + 2;
                    handled = 1;
                    break;
                  }
                  if (a2 === 34) {
                    val += text.slice(cs, nq);
                    cs = q2 + 2;
                    q2 = text.indexOf('"', cs);
                    continue;
                  }
                  break;
                }
                if (q2 > cs) val += text.slice(cs, q2);
                buf[col++] = val;
                pos = afterLine;
                line += 1;
                handled = 2;
                break;
              }
              if (handled === 1) continue;
              if (handled === 2) break;
            }
          } else {
            buf[col++] = text.slice(pos + 1, q);
            pos = afterLine;
            line += 1;
            break;
          }
        }

        sPos = pos;
        sLine = line;
        sLF = nextLF;
        sCR = nextCR;
        sComma = nextComma;
        sLineEnd = lineEnd;
        sAfterLine = afterLine;
        col = readQuotedFallback(text, len, lastComma, buf, col, q, errors, recordLine, recordRow);
        pos = sPos;
        line = sLine;
        nextLF = sLF;
        nextCR = sCR;
        nextComma = sComma;
        if (sEnded === 0) break;
        lineEnd = sLineEnd;
        afterLine = sAfterLine;
      }
    } else {
      sPos = pos;
      sLine = line;
      sLF = nextLF;
      sCR = nextCR;
      sComma = nextComma;
      col = readSlowRecordRest(text, len, buf, 0, errors, recordLine, recordRow);
      pos = sPos;
      line = sLine;
      nextLF = sLF;
      nextCR = sCR;
      nextComma = sComma;
      if (col === 1 && buf[0] === '' && sExtra === 0) continue;
    }

    if (col === width) {
      rows.push(buf.slice(0, width));
      rowCount += 1;
    } else {
      width = emitSpecialRow(rows, errors, buf, col, width, header, recordLine, rowCount);
      rowCount = sRowCount;
    }
  }
}

function run(input) {
  const text = typeof input.text === 'string' ? input.text : String(input.text);
  const header = input.header === true;
  const len = text.length;

  const pos = len > 0 && text.charCodeAt(0) === 0xFEFF ? 1 : 0;
  if (pos >= len) {
    return { columns: header ? [] : null, rows: [], errors: [] };
  }

  let nextCR = text.indexOf('\r', pos);
  if (nextCR < 0) {
    if (text.indexOf('"', pos) < 0) {
      return runPlainLF(text, len, header, pos);
    }
    nextCR = len;
  }

  const errors = [null];
  errors.length = 0;
  const rows = [''];
  rows.length = 0;
  sColumns = null;
  const buf = [
    '','','','','','','','','','','','','','','','',
    '','','','','','','','','','','','','','','','',
    '','','','','','','','','','','','','','','','',
    '','','','','','','','','','','','','','','',''
  ];
  buf[0] = '';

  parseMain(text, len, header, pos, nextCR, rows, errors, buf);

  const columns = sColumns;
  sColumns = null;
  return { columns: header ? (columns ?? []) : null, rows, errors };
}

// ---------------------------------------------------------------------------------------------------------------------
// Streaming JSON-to-JSON transducer: cases.json -> answers.json without materialising either file.
// Input is read through ONE reused window (default 256 KB, carried-over tail), output goes through ONE reused buffer
// flushed with positional writeSync. Each case is answered alone: a pre-scan finds where its "text" string ends and
// reads "header", then the CSV bytes (still JSON-escaped) are rewritten straight into the answer's JSON. A case the
// byte path cannot prove it handles exactly is re-read whole and answered with run() + JSON.stringify.

const fs = require('fs');

// LUT (unquoted): 0=normal, 1=comma, 2=backslash, 3=invalid(<32 or '"')
const LUT = new Uint8Array(256);
for (let i = 0; i < 32; i++) LUT[i] = 3;
LUT[34] = 3;
LUT[44] = 1;
LUT[92] = 2;

// QLUT (quoted): 0=normal (incl ','), 1=backslash, 2=invalid(<32 or '"')
const QLUT = new Uint8Array(256);
for (let i = 0; i < 32; i++) QLUT[i] = 2;
QLUT[34] = 2;
QLUT[92] = 1;

// QESC (byte after '\'): 0=other, 1='"', 2='n', 3='r'
const QESC = new Uint8Array(256);
QESC[34] = 1;
QESC[110] = 2;
QESC[114] = 3;

const DEF_IN_WIN = 2560 * 1024;
const DEF_OUT_WIN = 512 * 1024;
const ERR_INIT = 64 * 1024;
const hdrBuf = Buffer.allocUnsafe(16);

// Output window
let outBuf = null;
let out8 = null;
let outDV = null;
let gOp = 0;
let outFd = -1;
let fileOffset = 0;
let flushAt = 0;
let needTrunc = false;

// Per-case error list (emitted after the rows)
let errBuf = null;
let err8 = null;
let errPos = 0;

// Input window
let inFd = -1;
let inBuf = null;
let in8 = null;
let inDV = null;
let winAbs = 0;
let validLen = 0;
let fileSize = 0;
let scanBuf = null;
let scan8 = null;

// Set by cold helpers whenever a decision depended on the end of the available bytes.
let gTouched = 0;

// Pre-scan results for the current case
let gTextEndAbs = -1;
let gHeader = false;
let gCaseEndAbs = -1;

function growOut(minCap) {
  let cap = outBuf.length;
  while (cap < minCap) cap *= 2;
  const next = Buffer.allocUnsafe(cap);
  outBuf.copy(next, 0, 0, gOp);
  outBuf = next;
  out8 = new Uint8Array(outBuf.buffer, outBuf.byteOffset, outBuf.byteLength);
  outDV = new DataView(outBuf.buffer, outBuf.byteOffset, outBuf.byteLength);
}

function writeAll(buf, len) {
  let w = 0;
  while (w < len) w += fs.writeSync(outFd, buf, w, len - w, fileOffset + w);
  fileOffset += len;
}

function flushOut() {
  if (gOp > 0) {
    writeAll(outBuf, gOp);
    gOp = 0;
  }
}

function rollbackOut(absPos) {
  if (absPos >= fileOffset) {
    gOp = absPos - fileOffset;
  } else {
    fileOffset = absPos;
    gOp = 0;
    needTrunc = true;
  }
}

function growErr(minCap) {
  let cap = errBuf.length;
  while (cap < minCap) cap *= 2;
  const next = Buffer.allocUnsafe(cap);
  errBuf.copy(next, 0, 0, errPos);
  errBuf = next;
  err8 = new Uint8Array(errBuf.buffer, errBuf.byteOffset, errBuf.byteLength);
}

// Grow-only ASCII write (safe inside a row that may be rolled back).
function writeStrOut(s) {
  const n = s.length;
  if (gOp + n > out8.length) growOut(gOp + n);
  const o8 = out8;
  let op = gOp;
  for (let i = 0; i < n; i++) o8[op++] = s.charCodeAt(i);
  gOp = op;
}

// Row-boundary ASCII write: may flush.
function putStr(s) {
  if (gOp + s.length > out8.length) flushOut();
  writeStrOut(s);
}

const DIGITS = new Uint8Array(16);
function emitErrRaw(prefix, line, row, suffix, extraVal, extraStart, extraEnd) {
  const extraLen = extraEnd > extraStart ? extraEnd - extraStart : 0;
  const need = 112 + extraLen;
  if (errPos + need > err8.length) growErr(errPos + need);
  const e8 = err8;
  let ep = errPos;
  if (ep > 0) e8[ep++] = 44;
  for (let i = 0; i < prefix.length; i++) e8[ep++] = prefix.charCodeAt(i);
  {
    let k = 0, n = line;
    do { const q = (n / 10) | 0; DIGITS[k++] = 48 + (n - q * 10); n = q; } while (n > 0);
    while (k > 0) e8[ep++] = DIGITS[--k];
  }
  e8[ep++] = 44; e8[ep++] = 34; e8[ep++] = 114; e8[ep++] = 111; e8[ep++] = 119; e8[ep++] = 34; e8[ep++] = 58;
  if (row < 0) {
    e8[ep++] = 110; e8[ep++] = 117; e8[ep++] = 108; e8[ep++] = 108;
  } else {
    let k = 0, n = row;
    do { const q = (n / 10) | 0; DIGITS[k++] = 48 + (n - q * 10); n = q; } while (n > 0);
    while (k > 0) e8[ep++] = DIGITS[--k];
  }
  if (suffix.length > 0) {
    for (let i = 0; i < suffix.length; i++) e8[ep++] = suffix.charCodeAt(i);
    if (extraVal >= 0) {
      let k = 0, n = extraVal;
      do { const q = (n / 10) | 0; DIGITS[k++] = 48 + (n - q * 10); n = q; } while (n > 0);
      while (k > 0) e8[ep++] = DIGITS[--k];
    } else {
      if (extraLen > 0) {
        outBuf.copy(errBuf, ep, extraStart, extraEnd);
        ep += extraLen;
      }
      e8[ep++] = 93;
    }
  }
  e8[ep++] = 125;
  errPos = ep;
}

function isCanonicalU00(b8, p, end) {
  if (p + 4 > end) { gTouched = 1; return false; }
  if (b8[p] !== 48 || b8[p + 1] !== 48) return false;
  const h2 = b8[p + 2];
  const h3 = b8[p + 3];
  if (h2 === 48) return (h3 >= 48 && h3 <= 55) || h3 === 98 || h3 === 101 || h3 === 102;
  if (h2 === 49) return (h3 >= 48 && h3 <= 57) || (h3 >= 97 && h3 <= 102);
  return false;
}

// Fast-row scanner over whole rows in [p, lim):
//   returns 0 if it stopped cleanly at `lim` (rewound to the start of the unfinished row),
//   returns 1 if it met a row needing parseOneColdRow (rewound to that row's start),
//   returns 2 if it finished a short_row or long_row at EOL (NOT rewound; caller calls finishOddWidth).
// Caller guarantees width > 0, rowCount >= 1, output headroom >= (lim - p) * 4 + 256, and >= 8 readable bytes past lim
// strictly before textEnd. ZERO helper calls inside scanFastRows to avoid call-site deopts and keep TurboFan tiny.
const FAST_STATE = new Int32Array(7); // [p, op, line, rowCount, col, cutPos, rowStartLine]

function finishOddWidth(cutPos, col, width, rowStartLine, rowCount) {
  let op = gOp;
  if (col < width) {
    const pad = width - col;
    if (op + pad * 3 + 16 > out8.length) growOut(op + pad * 3 + 64);
    const o8 = out8;
    const oDV = outDV;
    o8[op++] = 34;
    emitErrRaw('{"code":"short_row","line":', rowStartLine, rowCount, ',"fields":', col, 0, 0);
    for (let k = 0; k < pad; k++) {
      oDV.setInt32(op, 0x0022222c, true);
      op += 3;
    }
    o8[op++] = 93;
    gOp = op;
    return;
  }
  if (op + 4 > out8.length) growOut(op + 64);
  out8[op++] = 34;
  emitErrRaw('{"code":"long_row","line":', rowStartLine, rowCount, ',"extra":[', -1, cutPos + 1, op);
  out8[cutPos] = 93;
  gOp = cutPos + 1;
}

function scanFastRows(b8, iDV, oDV, p, lim, op, line, rowCount, width) {
  let status = 0;
  let endCol = 0;
  let endCut = -1;
  let endRowLine = line;

  rowLoop: while (p < lim) {
    const b0 = b8[p];
    let fieldQuoted = 0;
    if (b0 === 92) {
      if (b8[p + 1] !== 34) {
        status = 1;
        break;
      }
      fieldQuoted = 1;
    } else if (((b0 < 32) | (b0 === 34))) {
      status = 1;
      break;
    }

    const rowInStart = p;
    const rowStart = op;
    const rowStartLine = line;

    oDV.setInt32(op, 0x00225b2c, true); // ,["
    op += 3;
    let col = 0;
    let cutPos = -1;
    let eolAdv = 0;

    fieldLoop: while (true) {
      if (fieldQuoted) {
        p += 2;
        let closed = 0;
        while (p < lim) {
          let w = 0, m = 0;
          while (p < lim) {
            w = iDV.getInt32(p, true);
            oDV.setInt32(op, w, true);
            const u = w ^ 0x02020202;
            const t = w ^ 0x5c5c5c5c;
            m = ((u - 0x21212121) | (t - 0x01010101)) & ~w & -0x7f7f7f80;
            if (m) break;
            op += 4; p += 4;
          }
          if (!m) break;
          const z = m >>> 7;
          const s = 31 - Math.clz32(z & -z);
          const k = s >>> 3;
          op += k;
          p += k;
          if (((w >>> s) & 255) !== 92) {
            p = rowInStart; op = rowStart; line = rowStartLine; status = 1; break rowLoop;
          }
          const ew = iDV.getInt32(p, true);
          const eb = (ew >>> 8) & 255;
          const isQ = (eb === 34) | 0;
          const isDoubled = (ew === 0x225c225c) | 0;
          const isNL = ((eb === 110) | (eb === 114)) | 0;
          const isCRLF = (ew === 0x6e5c725c) | 0;
          if (isQ & (isDoubled ^ 1)) {
            p += 2;
            closed = 1;
            break;
          }
          if (isDoubled | isNL) {
            oDV.setUint16(op, isDoubled ? 0x225c : 0x6e5c, true);
            op += 2;
            line += isNL;
            p += 2 + ((isDoubled | isCRLF) << 1);
            continue;
          }
          p = rowInStart; op = rowStart; line = rowStartLine; status = 1; break rowLoop;
        }
        if (!closed) {
          p = rowInStart; op = rowStart; line = rowStartLine;
          break rowLoop;
        }
        const aw = iDV.getInt32(p, true);
        const isCRLF = (aw === 0x6e5c725c) | 0;
        const isLF = ((aw & 0xffff) === 0x6e5c) | 0;
        const qAdv = 2 + (isCRLF << 1);
        if ((aw & 255) === 44) {
          p++;
          const np1 = op + 1;
          if (++col === width) cutPos = np1;
          oDV.setInt32(op, 0x00222c22, true); // ","
          op += 3;
          fieldQuoted = (b8[p] === 92 && b8[p + 1] === 34) ? 1 : 0;
          continue;
        }
        if (isCRLF | isLF) {
          eolAdv = qAdv;
          break fieldLoop;
        }
        p = rowInStart; op = rowStart; line = rowStartLine; status = 1; break rowLoop;
      }

      while (p < lim) {
        let w = 0, m = 0;
        while (p < lim) {
          w = iDV.getInt32(p, true);
          oDV.setInt32(op, w, true);
          const u = w ^ 0x02020202;
          const t1 = w ^ 0x2c2c2c2c;
          const t2 = w ^ 0x5c5c5c5c;
          m = ((u - 0x21212121) | (t1 - 0x01010101) | (t2 - 0x01010101)) & ~w & -0x7f7f7f80;
          if (m) break;
          op += 4; p += 4;
        }
        if (!m) break;
        const z = m >>> 7;
        const s = 31 - Math.clz32(z & -z);
        const k = s >>> 3;
        op += k;
        p += k;
        const c = (w >>> s) & 255;
        if (c === 44) {
          p++;
          const np1 = op + 1;
          if (++col === width) cutPos = np1;
          oDV.setInt32(op, 0x00222c22, true); // ","
          op += 3;
          if (b8[p] === 92 && b8[p + 1] === 34) { fieldQuoted = 1; break; }
        } else if (c === 92) {
          const ew = iDV.getInt32(p, true);
          const isCRLF = (ew === 0x6e5c725c) | 0;
          const isLF = ((ew & 0xffff) === 0x6e5c) | 0;
          if (isCRLF | isLF) {
            eolAdv = 2 + (isCRLF << 1);
            break fieldLoop;
          }
          p = rowInStart; op = rowStart; line = rowStartLine; status = 1; break rowLoop;
        } else {
          p = rowInStart; op = rowStart; line = rowStartLine; status = 1; break rowLoop;
        }
      }
      if (!fieldQuoted) {
        p = rowInStart; op = rowStart; line = rowStartLine;
        break rowLoop;
      }
    }

    p += eolAdv;
    line++;
    if (++col === width) {
      oDV.setUint16(op, 0x5d22, true); // "]
      op += 2;
      rowCount++;
      continue rowLoop;
    }
    endCol = col; endCut = cutPos; endRowLine = rowStartLine;
    status = 2;
    break rowLoop;
  }

  FAST_STATE[0] = p;
  FAST_STATE[1] = op;
  FAST_STATE[2] = line;
  FAST_STATE[3] = rowCount;
  FAST_STATE[4] = endCol;
  FAST_STATE[5] = endCut;
  FAST_STATE[6] = endRowLine;
  return status;
}

// Cold exact single-field / single-row helpers. `end` is the end of the text when it is in the window, else the end
// of the available bytes; in the latter case every decision that met `end` sets gTouched and the row is retried with
// more bytes.
let cP = 0;
let cLine = 0;
let cEnded = 0;

function readUnquotedCold(b8, p, end, line, recordLine, recordRow) {
  const lut = LUT;
  let o8 = out8;
  let op = gOp;
  while (p < end) {
    if (op + 64 >= o8.length) { gOp = op; growOut(o8.length * 2); o8 = out8; }
    let lim = p + (o8.length - op - 32);
    if (lim > end) lim = end;
    while (p < lim) {
      const b = b8[p++];
      switch (lut[b]) {
        case 0:
          o8[op++] = b;
          break;
        case 1:
          gOp = op; cP = p; cLine = line; cEnded = 1;
          return true;
        case 2: {
          if (p >= end) { gTouched = 1; return false; }
          const b1 = b8[p++];
          const e = QESC[b1];
          if (e >= 2) {
            if (e === 3) {
              if (p + 1 >= end) gTouched = 1;
              if (p + 1 < end && b8[p] === 92 && b8[p + 1] === 110) {
                p += 2;
              } else {
                emitErrRaw('{"code":"stray_cr","line":', recordLine, recordRow, '', -1, 0, 0);
                break;
              }
            }
            gOp = op; cP = p; cLine = line + 1; cEnded = 0;
            return true;
          }
          if (b1 === 34 || b1 === 92 || b1 === 98 || b1 === 102 || b1 === 116) {
            o8[op++] = 92; o8[op++] = b1;
          } else if (b1 === 117) {
            if (!isCanonicalU00(b8, p, end)) return false;
            o8[op++] = 92; o8[op++] = 117;
            o8[op++] = b8[p++]; o8[op++] = b8[p++];
            o8[op++] = b8[p++]; o8[op++] = b8[p++];
          } else {
            return false;
          }
          break;
        }
        case 3:
          return false;
      }
    }
  }
  gTouched = 1;
  gOp = op; cP = p; cLine = line; cEnded = 0;
  return true;
}

function readQuotedCold(b8, p, end, line, recordLine, recordRow) {
  const qlut = QLUT;
  const openPos = p;
  const openLine = line;
  const fieldOutStart = gOp;
  p += 2;
  let closed = false;
  let o8 = out8;
  let op = gOp;

  while (p < end) {
    if (op + 64 >= o8.length) { gOp = op; growOut(o8.length * 2); o8 = out8; }
    let lim = p + (o8.length - op - 32);
    if (lim > end) lim = end;
    qcLoop: while (p < lim) {
      const b = b8[p++];
      switch (qlut[b]) {
        case 0:
          o8[op++] = b;
          break;
        case 1: {
          if (p >= end) { gTouched = 1; return false; }
          const b1 = b8[p++];
          const e = QESC[b1];
          if (e === 1) {
            if (p + 1 >= end) gTouched = 1;
            if (p + 1 < end && b8[p] === 92 && b8[p + 1] === 34) {
              o8[op++] = 92; o8[op++] = 34; p += 2;
            } else { closed = true; break qcLoop; }
          } else if (e >= 2) {
            o8[op++] = 92; o8[op++] = 110; line++;
            if (e === 3) {
              if (p + 1 >= end) gTouched = 1;
              if (p + 1 < end && b8[p] === 92 && b8[p + 1] === 110) p += 2;
            }
          } else if (b1 === 92 || b1 === 98 || b1 === 102 || b1 === 116) {
            o8[op++] = 92; o8[op++] = b1;
          } else if (b1 === 117) {
            if (!isCanonicalU00(b8, p, end)) return false;
            o8[op++] = 92; o8[op++] = 117;
            o8[op++] = b8[p++]; o8[op++] = b8[p++];
            o8[op++] = b8[p++]; o8[op++] = b8[p++];
          } else {
            return false;
          }
          break;
        }
        case 2:
          return false;
      }
    }
    if (closed) break;
  }

  gOp = op;
  if (!closed) {
    // Reached the end: the quote never closes (or, in a partial window, more bytes are needed).
    gTouched = 1;
    p = openPos + 2;
    line = openLine;
    gOp = fieldOutStart;
    emitErrRaw('{"code":"unterminated_quote","line":', recordLine, recordRow, '', -1, 0, 0);
    if (gOp + 4 > out8.length) growOut(gOp + 64);
    out8[gOp++] = 92;
    out8[gOp++] = 34;
    return readUnquotedCold(b8, p, end, line, recordLine, recordRow);
  }

  if (p >= end) { gTouched = 1; cP = p; cLine = line; cEnded = 0; return true; }
  const nb = b8[p];
  if (nb === 44) { cP = p + 1; cLine = line; cEnded = 1; return true; }
  if (nb === 92) {
    if (p + 1 >= end) { gTouched = 1; return false; }
    const b1 = b8[p + 1];
    if (b1 === 110) { cP = p + 2; cLine = line + 1; cEnded = 0; return true; }
    if (b1 === 114) {
      if (p + 3 >= end) gTouched = 1;
      if (p + 3 < end && b8[p + 2] === 92 && b8[p + 3] === 110) {
        cP = p + 4; cLine = line + 1; cEnded = 0; return true;
      }
    }
  }
  const junkStart = gOp;
  if (!readUnquotedCold(b8, p, end, line, recordLine, recordRow)) return false;
  if (gOp > junkStart) emitErrRaw('{"code":"quote_junk","line":', recordLine, recordRow, '', -1, 0, 0);
  return true;
}

const ROW_STATE = new Int32Array(4);

function parseOneColdRow(b8, p, textEnd, line, width, rowCount, header) {
  while (true) {
    if (p >= textEnd) { gTouched = 1; break; }
    if (b8[p] !== 92) break;
    if (p + 1 >= textEnd) { gTouched = 1; return false; }
    const b1 = b8[p + 1];
    if (b1 === 110) { p += 2; line++; }
    else if (b1 === 114) {
      if (p + 3 >= textEnd) gTouched = 1;
      if (p + 3 < textEnd && b8[p + 2] === 92 && b8[p + 3] === 110) { p += 4; line++; }
      else break;
    }
    else break;
  }
  if (p >= textEnd) {
    ROW_STATE[0] = p; ROW_STATE[1] = line; ROW_STATE[2] = width; ROW_STATE[3] = rowCount;
    return true;
  }

  if (gOp + 16 > out8.length) growOut(gOp + 64);
  const recordLine = line;
  const recordRow = header && width < 0 ? -1 : rowCount;
  const rowStart = gOp;
  if (width >= 0 || !header) {
    if (rowCount > 0) out8[gOp++] = 44;
    out8[gOp++] = 91;
  }
  out8[gOp++] = 34;
  const field0OutStart = gOp;
  let firstQuoted = 0;
  let col = 0;
  let cutPos = -1;

  while (true) {
    if (p + 1 >= textEnd) gTouched = 1;
    if (p + 1 < textEnd && b8[p] === 92 && b8[p + 1] === 34) {
      if (col === 0) firstQuoted = 1;
      if (!readQuotedCold(b8, p, textEnd, line, recordLine, recordRow)) return false;
    } else {
      if (!readUnquotedCold(b8, p, textEnd, line, recordLine, recordRow)) return false;
    }
    p = cP;
    line = cLine;
    if (gOp + 16 > out8.length) growOut(gOp + 64);
    out8[gOp++] = 34;
    col++;
    if (cEnded === 0) break;
    if (col === width) cutPos = gOp;
    out8[gOp++] = 44;
    out8[gOp++] = 34;
  }

  if (col === 1 && firstQuoted === 0 && gOp === field0OutStart + 1) {
    gOp = rowStart;
    ROW_STATE[0] = p; ROW_STATE[1] = line; ROW_STATE[2] = width; ROW_STATE[3] = rowCount;
    return true;
  }

  if (width < 0) {
    width = col;
    if (header) {
      writeStrOut('],"rows":[');
    } else {
      if (gOp + 4 > out8.length) growOut(gOp + 64);
      out8[gOp++] = 93;
      rowCount = 1;
    }
  } else if (col === width) {
    if (gOp + 4 > out8.length) growOut(gOp + 64);
    out8[gOp++] = 93;
    rowCount++;
  } else if (col < width) {
    emitErrRaw('{"code":"short_row","line":', recordLine, recordRow, ',"fields":', col, 0, 0);
    const pad = width - col;
    if (gOp + pad * 3 + 4 > out8.length) growOut(gOp + pad * 3 + 64);
    for (let k = 0; k < pad; k++) {
      out8[gOp++] = 44;
      out8[gOp++] = 34;
      out8[gOp++] = 34;
    }
    out8[gOp++] = 93;
    rowCount++;
  } else {
    emitErrRaw('{"code":"long_row","line":', recordLine, recordRow, ',"extra":[', -1, cutPos + 1, gOp);
    gOp = cutPos;
    if (gOp + 4 > out8.length) growOut(gOp + 64);
    out8[gOp++] = 93;
    rowCount++;
  }

  ROW_STATE[0] = p; ROW_STATE[1] = line; ROW_STATE[2] = width; ROW_STATE[3] = rowCount;
  return true;
}

// ---- input window -------------------------------------------------------------------------------------------------

function readAt(buf, off, len, pos) {
  let total = 0;
  while (total < len) {
    const n = fs.readSync(inFd, buf, off + total, len - total, pos + total);
    if (n <= 0) break;
    total += n;
  }
  return total;
}

function fillWin() {
  const room = inBuf.length - validLen;
  if (room <= 0) return 0;
  const n = readAt(inBuf, validLen, room, winAbs + validLen);
  validLen += n;
  return n;
}

// Drop [0, p), keep the unfinished tail, read more. Grows the window only when a single row fills all of it.
// Returns false when no new byte could be read.
function refill(p) {
  if (p <= 0) {
    if (validLen >= inBuf.length) {
      const next = Buffer.allocUnsafe(inBuf.length * 2);
      inBuf.copy(next, 0, 0, validLen);
      inBuf = next;
      in8 = new Uint8Array(next.buffer, next.byteOffset, next.byteLength);
      inDV = new DataView(next.buffer, next.byteOffset, next.byteLength);
    }
  } else {
    if (validLen > p) inBuf.copy(inBuf, 0, p, validLen);
    winAbs += p;
    validLen = validLen > p ? validLen - p : 0;
  }
  return fillWin() > 0;
}

function seekWin(abs) {
  winAbs = abs;
  validLen = 0;
  fillWin();
}

function skipWs(buf, p, len) {
  while (p < len) {
    const b = buf[p];
    if (b === 32 || b === 10 || b === 13 || b === 9) p++;
    else break;
  }
  return p;
}

// Skip whitespace across windows; returns the local position of the next byte or -1 at end of file.
function skipWsW(p) {
  while (true) {
    p = skipWs(in8, p, validLen);
    if (p < validLen) return p;
    if (!refill(p)) return -1;
    p = 0;
  }
}

function skipJsonValue(buf, p, len) {
  p = skipWs(buf, p, len);
  if (p >= len) return -1;
  const first = buf[p];
  if (first === 34) {
    p++;
    while (p < len) {
      const b = buf[p++];
      if (b === 34) return p;
      if (b === 92) { if (p >= len) return -1; p++; }
    }
    return -1;
  }
  if (first === 123 || first === 91) {
    let depth = 1;
    p++;
    while (p < len && depth > 0) {
      const b = buf[p++];
      if (b === 34) {
        let closed = false;
        while (p < len) {
          const sb = buf[p++];
          if (sb === 34) { closed = true; break; }
          if (sb === 92) { if (p >= len) return -1; p++; }
        }
        if (!closed) return -1;
      } else if (b === 123 || b === 91) depth++;
      else if (b === 125 || b === 93) depth--;
    }
    return depth === 0 ? p : -1;
  }
  return -1;
}

function matchInputText(b8, q, len) {
  return (
    q + 18 <= len &&
    b8[q] === 44 && b8[q + 1] === 34 && b8[q + 2] === 105 && b8[q + 3] === 110 &&
    b8[q + 4] === 112 && b8[q + 5] === 117 && b8[q + 6] === 116 && b8[q + 7] === 34 &&
    b8[q + 8] === 58 && b8[q + 9] === 123 && b8[q + 10] === 34 && b8[q + 11] === 116 &&
    b8[q + 12] === 101 && b8[q + 13] === 120 && b8[q + 14] === 116 && b8[q + 15] === 34 &&
    b8[q + 16] === 58 && b8[q + 17] === 34
  );
}

function findPat(buf, b8, from, end) {
  let pos = from + 10;
  while (pos < end) {
    const j = buf.indexOf(58, pos);
    if (j < 0 || j >= end) return -1;
    if (b8[j - 1] === 34 && b8[j - 2] === 114 && b8[j - 3] === 101 && b8[j - 4] === 100 &&
        b8[j - 5] === 97 && b8[j - 6] === 101 && b8[j - 7] === 104 && b8[j - 8] === 34 &&
        b8[j - 9] === 44 && b8[j - 10] === 34) {
      return j - 10;
    }
    pos = j + 1;
  }
  return -1;
}

// Find where the "text" string that starts at local textStart ends (first `","header":` after it; inside a JSON string
// every '"' is escaped, so that byte run cannot occur in the text), then read the header value. Reads ahead in the
// file through a separate small buffer; the input window is left untouched.
function prescan(textStart) {
  let absTE = -1;
  const idx = findPat(inBuf, in8, textStart, validLen);
  if (idx >= 0) {
    absTE = winAbs + idx;
  } else {
    if (scanBuf === null) {
      scanBuf = Buffer.allocUnsafe(inBuf.length);
      scan8 = new Uint8Array(scanBuf.buffer, scanBuf.byteOffset, scanBuf.byteLength);
    }
    let pos = winAbs + (validLen - 10 > textStart ? validLen - 10 : textStart);
    while (true) {
      const n = readAt(scanBuf, 0, scanBuf.length, pos);
      if (n < 11) return false;
      const j = findPat(scanBuf, scan8, 0, n);
      if (j >= 0) { absTE = pos + j; break; }
      if (n < scanBuf.length) return false;
      pos += n - 10;
    }
  }
  let h8 = in8;
  let hp = absTE + 11 - winAbs;
  let hl = validLen;
  if (absTE + 18 > winAbs + validLen) {
    hl = readAt(hdrBuf, 0, 7, absTE + 11);
    h8 = hdrBuf;
    hp = 0;
  }
  if (hp + 6 <= hl && h8[hp] === 116 && h8[hp + 1] === 114 && h8[hp + 2] === 117 && h8[hp + 3] === 101 &&
      h8[hp + 4] === 125 && h8[hp + 5] === 125) {
    gHeader = true;
    gCaseEndAbs = absTE + 17;
  } else if (hp + 7 <= hl && h8[hp] === 102 && h8[hp + 1] === 97 && h8[hp + 2] === 108 && h8[hp + 3] === 115 &&
      h8[hp + 4] === 101 && h8[hp + 5] === 125 && h8[hp + 6] === 125) {
    gHeader = false;
    gCaseEndAbs = absTE + 18;
  } else {
    return false;
  }
  gTextEndAbs = absTE;
  return true;
}

// Transduce the CSV text of the current case, starting at local p. Returns the local position just past the case
// object, or -1 when the case must be answered by the fallback.
function transduceCaseStream(p) {
  const header = gHeader;
  const absTE = gTextEndAbs;
  let line = 1;
  let width = -1;
  let rowCount = 0;
  errPos = 0;

  let te = absTE - winAbs;
  let inWin = absTE + 18 <= winAbs + validLen;

  if (p + 2 < validLen && in8[p] === 0xef && in8[p + 1] === 0xbb && in8[p + 2] === 0xbf && p + 3 <= te) p += 3;

  putStr(header ? '{"columns":[' : '{"columns":null,"rows":[');

  while (true) {
    if (inWin) {
      if (p >= te) break;
    } else if (validLen - p < (inBuf.length >> 2)) {
      if (!refill(p)) return -1;
      p = 0; te = absTE - winAbs; inWin = absTE + 18 <= winAbs + validLen;
      continue;
    }
    if (gOp >= flushAt) flushOut();

    if (width > 0 && rowCount > 0) {
      let safeIn = (out8.length - gOp - 256) >> 2;
      if (safeIn > 16) {
        const cap = gFastCalls < 16 ? 1024 : 262144;
        if (safeIn > cap) safeIn = cap;
        const availEnd = te < validLen ? te : validLen;
        let lim = availEnd - 8;
        let winLimited = true;
        if (lim > p + safeIn) { lim = p + safeIn; winLimited = false; }

        if (lim > p) {
          const prevP = p;
          const status = scanFastRows(in8, inDV, outDV, p, lim, gOp, line, rowCount, width);
          gFastCalls++;
          p = FAST_STATE[0];
          gOp = FAST_STATE[1];
          line = FAST_STATE[2];
          rowCount = FAST_STATE[3];
          if (status === 2) {
            finishOddWidth(FAST_STATE[5], FAST_STATE[4], width, FAST_STATE[6], rowCount);
            rowCount++;
            continue;
          }
          if (status === 1 && in8[p] === 92 && p + 3 < availEnd) {
            const b1 = in8[p + 1];
            if (b1 === 110) { p += 2; line++; continue; }
            if (b1 === 114 && in8[p + 2] === 92 && in8[p + 3] === 110) { p += 4; line++; continue; }
          }
          if (status === 0) {
            if (p > prevP) continue;
            if (winLimited && !inWin) {
              if (!refill(p)) return -1;
              p = 0; te = absTE - winAbs; inWin = absTE + 18 <= winAbs + validLen;
              continue;
            }
          }
        }
      }
    }

    if (!inWin && validLen - p < (inBuf.length >> 1)) {
      if (!refill(p)) return -1;
      p = 0; te = absTE - winAbs; inWin = absTE + 18 <= winAbs + validLen;
      continue;
    }
    gTouched = 0;
    const saveOp = gOp;
    const saveErr = errPos;
    const ok = parseOneColdRow(in8, p, inWin ? te : validLen, line, width, rowCount, header);
    if (!inWin && gTouched) {
      gOp = saveOp;
      errPos = saveErr;
      if (!refill(p)) return -1;
      p = 0; te = absTE - winAbs; inWin = absTE + 18 <= winAbs + validLen;
      continue;
    }
    if (!ok) return -1;
    p = ROW_STATE[0];
    line = ROW_STATE[1];
    width = ROW_STATE[2];
    rowCount = ROW_STATE[3];
  }

  if (width < 0 && header) putStr('],"rows":[');
  putStr('],"errors":[');
  if (errPos > 0) {
    if (gOp + errPos > out8.length) {
      flushOut();
      if (errPos > out8.length) writeAll(errBuf, errPos);
      else { errBuf.copy(outBuf, 0, 0, errPos); gOp = errPos; }
    } else {
      errBuf.copy(outBuf, gOp, 0, errPos);
      gOp += errPos;
    }
  }
  putStr(']}');
  return gCaseEndAbs - winAbs;
}

function fastCase(p) {
  gCaseEndAbs = -1;
  const b8 = in8;
  const len = validLen;
  if (!(p + 7 < len && b8[p] === 123 && b8[p + 1] === 34 && b8[p + 2] === 105 && b8[p + 3] === 100 &&
        b8[p + 4] === 34 && b8[p + 5] === 58 && b8[p + 6] === 34)) return -1;
  let q = p + 7;
  let closed = false;
  while (q < len) {
    const b = b8[q++];
    if (b === 34) { closed = true; break; }
    if (b === 92) { if (q >= len) return -1; q++; }
    else if (b < 32) return -1;
  }
  if (!closed || !matchInputText(b8, q, len)) return -1;
  const textStart = q + 18;
  if (!prescan(textStart)) return -1;
  return transduceCaseStream(textStart);
}

// Re-read one case whole from the file and answer it with run(); returns the absolute end of the case or -1.
let gFallbacks = 0;
let gFastCalls = 0;
function fallbackCase(startAbs) {
  gFallbacks++;
  let cap = 65536;
  let buf = Buffer.allocUnsafe(cap);
  let len = readAt(buf, 0, cap, startAbs);
  let end;
  while (true) {
    end = skipJsonValue(buf, 0, len);
    if (end >= 0) break;
    if (len < cap) return -1;
    const next = Buffer.allocUnsafe(cap * 2);
    buf.copy(next, 0, 0, len);
    len += readAt(next, len, cap * 2 - len, startAbs + len);
    buf = next;
    cap *= 2;
  }
  let obj;
  try { obj = JSON.parse(buf.toString('utf8', 0, end)); } catch { return -1; }
  if (obj === null || typeof obj !== 'object' || !('input' in obj)) return -1;
  const s = JSON.stringify(run(obj.input));
  flushOut();
  fileOffset += fs.writeSync(outFd, s, fileOffset, 'utf8');
  return startAbs + end;
}

function putByte(b) {
  if (gOp >= out8.length) flushOut();
  out8[gOp++] = b;
}

function streamAll() {
  let p = skipWsW(0);
  if (p < 0 || in8[p] !== 91) return false;
  putByte(91);
  p = skipWsW(p + 1);
  if (p < 0) return false;
  if (in8[p] !== 93) {
    let first = true;
    while (true) {
      if (!first) putByte(44);
      first = false;
      if (p > 0 && winAbs + validLen < fileSize && (validLen - p < 4096 || (inBuf.length >= 1048576 && p > (inBuf.length >> 2)))) {
        refill(p); p = 0;
      }
      const caseStartAbs = winAbs + p;
      const outStartAbs = fileOffset + gOp;
      let np = fastCase(p);
      if (np < 0) {
        rollbackOut(outStartAbs);
        const endAbs = fallbackCase(caseStartAbs);
        if (endAbs < 0) return false;
        seekWin(endAbs);
        np = 0;
      }
      p = skipWsW(np);
      if (p < 0) return false;
      if (in8[p] === 44) {
        p = skipWsW(p + 1);
        if (p < 0) return false;
        continue;
      }
      if (in8[p] === 93) break;
      return false;
    }
  }
  // past the closing ']': only whitespace may follow
  p = skipWs(in8, p + 1, validLen);
  while (p >= validLen) {
    if (!refill(p)) break;
    p = skipWs(in8, 0, validLen);
  }
  if (p < validLen) return false;
  putByte(93);
  flushOut();
  return true;
}

function fallbackAll(inBufAll) {
  const cases = JSON.parse(inBufAll.toString('utf8'));
  const answers = new Array(cases.length);
  for (let i = 0; i < cases.length; i++) answers[i] = run(cases[i].input);
  return JSON.stringify(answers);
}

// Stream inPath (a cases.json array) to outPath (answers.json). inWin / outWin override the window sizes (tests only).
function transduceFile(inPath, outPath, inWin, outWin) {
  inFd = fs.openSync(inPath, 'r');
  outFd = fs.openSync(outPath, 'w');
  let ok = false;
  try {
    fileSize = fs.fstatSync(inFd).size;
    const iw = inWin > 0 ? inWin : (fileSize + 64 < DEF_IN_WIN ? (fileSize + 64 < 65536 ? 65536 : fileSize + 64) : DEF_IN_WIN);
    const ow = outWin > 0 ? outWin : (fileSize < 131072 ? 65536 : DEF_OUT_WIN);
    inBuf = Buffer.allocUnsafe(iw);
    in8 = new Uint8Array(inBuf.buffer, inBuf.byteOffset, inBuf.byteLength);
    inDV = new DataView(inBuf.buffer, inBuf.byteOffset, inBuf.byteLength);
    outBuf = Buffer.allocUnsafe(ow);
    out8 = new Uint8Array(outBuf.buffer, outBuf.byteOffset, outBuf.byteLength);
    outDV = new DataView(outBuf.buffer, outBuf.byteOffset, outBuf.byteLength);
    errBuf = Buffer.allocUnsafe(ERR_INIT);
    err8 = new Uint8Array(errBuf.buffer, errBuf.byteOffset, errBuf.byteLength);
    flushAt = ow >= 524288 ? ow - 131072 : (ow >> 1);
    gOp = 0; fileOffset = 0; needTrunc = false; errPos = 0; gFastCalls = 0;
    winAbs = 0; validLen = 0; scanBuf = null; scan8 = null;
    fillWin();
    ok = streamAll();
    if (ok && needTrunc) fs.ftruncateSync(outFd, fileOffset);
  } catch {
    ok = false;
  }
  fs.closeSync(inFd);
  fs.closeSync(outFd);
  inBuf = in8 = inDV = outBuf = out8 = outDV = errBuf = err8 = scanBuf = scan8 = null;
  if (!ok) fs.writeFileSync(outPath, fallbackAll(fs.readFileSync(inPath)));
}

function main() {
  const inDir = process.env.MAKEFUN_INPUT_DIR || '/input';
  const outDir = process.env.MAKEFUN_OUTPUT_DIR || '/output';
  transduceFile(inDir + '/cases.json', outDir + '/answers.json');
}

exports.run = run;
exports.transduceFile = transduceFile;
exports.main = main;
exports._fallbacks = () => gFallbacks; // tests only

