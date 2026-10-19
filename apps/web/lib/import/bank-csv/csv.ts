/**
 * Delimited-text reading for bank and card exports: CSV with commas (most
 * banks), semicolons (French-language exports, where the comma is the
 * decimal mark) or tabs. Quoted fields may hold the delimiter, doubled
 * quotes and line breaks. A UTF-8 byte-order mark and blank lines are
 * dropped. Pure; no I/O.
 */

export type Delimiter = "," | ";" | "\t";

/** Count delimiters outside quotes on one line. */
function countOutsideQuotes(line: string, delimiter: Delimiter): number {
  let n = 0;
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') quoted = !quoted;
    else if (!quoted && ch === delimiter) n++;
  }
  return n;
}

/**
 * The delimiter that splits the first lines into the most consistent number
 * of fields. Comma wins ties (it is what nearly every bank uses).
 */
export function detectDelimiter(text: string): Delimiter {
  const sample = text.split(/\r\n|\n|\r/).filter((l) => l.trim()).slice(0, 25);
  let best: Delimiter = ",";
  let bestScore = -1;
  for (const d of [",", ";", "\t"] as const) {
    const counts = sample.map((l) => countOutsideQuotes(l, d)).filter((c) => c > 0);
    if (counts.length === 0) continue;
    const freq = new Map<number, number>();
    for (const c of counts) freq.set(c, (freq.get(c) ?? 0) + 1);
    const [mode, modeCount] = [...freq.entries()].sort((a, b) => b[1] - a[1])[0];
    // Lines that agree on a field count, weighted by how many fields.
    const score = modeCount * 10 + Math.min(mode, 9);
    if (score > bestScore) {
      bestScore = score;
      best = d;
    }
  }
  return best;
}

/** Parse delimited text into rows of trimmed cells. */
export function parseDelimited(text: string, delimiter: Delimiter = detectDelimiter(text)): string[][] {
  const src = text.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  const endCell = () => {
    row.push(cell.trim());
    cell = "";
  };
  const endRow = () => {
    endCell();
    if (row.some((c) => c !== "")) rows.push(row);
    row = [];
  };

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') {
      // A quote opens a quoted field only at the start of a cell; elsewhere
      // it is a literal character (some exports write 12" SIGN).
      if (cell.trim() === "") {
        cell = "";
        quoted = true;
      } else {
        cell += ch;
      }
    } else if (ch === delimiter) {
      endCell();
    } else if (ch === "\r") {
      if (src[i + 1] === "\n") i++;
      endRow();
    } else if (ch === "\n") {
      endRow();
    } else {
      cell += ch;
    }
  }
  if (cell !== "" || row.length > 0) endRow();
  return rows;
}

/**
 * Decode an uploaded file's bytes. UTF-8 first; a file with bytes that are
 * not valid UTF-8 (an older Windows export with accented names) is read as
 * Windows-1252. UTF-16 is detected from its byte-order mark.
 */
export function decodeStatementBytes(bytes: Uint8Array): string {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes.subarray(2));
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes.subarray(2));
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}
