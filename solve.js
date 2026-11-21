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

export function run(input) {
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
