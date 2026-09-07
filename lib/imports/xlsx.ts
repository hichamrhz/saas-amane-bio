import * as XLSX from "xlsx";

/** Parses the first sheet of an .xlsx workbook into raw string rows, the
 * same shape `parseCsv` returns, so both formats feed the same pipeline. */
export function parseXlsx(buffer: ArrayBuffer): string[][] {
  const workbook = XLSX.read(buffer, { type: "array" });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) return [];
  const sheet = workbook.Sheets[firstSheetName];
  const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" });
  return rows.map((row) => row.map((cell) => (cell === null || cell === undefined ? "" : String(cell))));
}
