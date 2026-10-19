/**
 * An Excel statement (.xlsx or .xls: the Amex "Summary" download, a bank's
 * Excel export) to rows of text, read in the BROWSER like the app's other
 * spreadsheet imports, so the spreadsheet library never parses an uploaded
 * file on the server. The rows then go through the same parser as a CSV
 * (parse.ts → parseStatementRows).
 *
 * Date cells become YYYY-MM-DD from their serial number (no time zone
 * involved); number cells keep their raw value (-54.2, not "($54.20)").
 * The sheet with the most dated rows is used.
 */
import type * as XLSXModule from "xlsx";
import { parseStatementDate } from "./values";

/** Rows read from one sheet, at most. */
export const MAX_SHEET_ROWS = 20000;
/** Columns read per row, at most. */
export const MAX_SHEET_COLUMNS = 40;

const pad = (n: number) => String(n).padStart(2, "0");

export function rowsFromWorkbook(XLSX: typeof XLSXModule, bytes: ArrayBuffer | Uint8Array): string[][] {
  const wb = XLSX.read(bytes, { type: "array", cellDates: false, cellNF: true });
  let best: string[][] = [];
  let bestScore = -1;
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    if (!ws || !ws["!ref"]) continue;
    const range = XLSX.utils.decode_range(ws["!ref"]);
    const rows: string[][] = [];
    const lastRow = Math.min(range.e.r, range.s.r + MAX_SHEET_ROWS - 1);
    const lastCol = Math.min(range.e.c, range.s.c + MAX_SHEET_COLUMNS - 1);
    for (let r = range.s.r; r <= lastRow; r++) {
      const row: string[] = [];
      for (let c = range.s.c; c <= lastCol; c++) {
        const cell = ws[XLSX.utils.encode_cell({ r, c })] as XLSXModule.CellObject | undefined;
        if (!cell || cell.v === undefined || cell.v === null) {
          row.push("");
        } else if (cell.t === "n" && typeof cell.v === "number" && cell.z && XLSX.SSF.is_date(String(cell.z))) {
          const d = XLSX.SSF.parse_date_code(cell.v);
          row.push(d ? `${d.y}-${pad(d.m)}-${pad(d.d)}` : String(cell.v));
        } else if (cell.t === "n") {
          row.push(String(cell.v));
        } else {
          row.push(String(cell.w ?? cell.v).trim());
        }
      }
      if (row.some((v) => v !== "")) rows.push(row);
    }
    const score = rows.filter((row) => row.some((v) => parseStatementDate(v) !== null)).length;
    if (score > bestScore) {
      best = rows;
      bestScore = score;
    }
  }
  return best;
}
