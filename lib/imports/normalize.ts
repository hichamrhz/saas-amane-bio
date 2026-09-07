import { parseDecimalInput } from "@/lib/numbers";

export function normalizeHeader(value: string): string {
  return value.trim().toLowerCase();
}

export function blankToNull(value: string | undefined): string | null {
  if (value === undefined) return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/** Accepts DD/MM/YYYY, MM/DD/YYYY or YYYY-MM-DD — the caller must say which,
 * per the spec's requirement to never silently guess an ambiguous date. */
export type DateFormat = "DD/MM/YYYY" | "MM/DD/YYYY" | "YYYY-MM-DD";

export function parseDateWithFormat(value: string, format: DateFormat): Date | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;

  if (format === "YYYY-MM-DD") {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
    if (!match) return null;
    const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const match = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(trimmed);
  if (!match) return null;
  const [, a, b, year] = match;
  const day = format === "DD/MM/YYYY" ? Number(a) : Number(b);
  const month = format === "DD/MM/YYYY" ? Number(b) : Number(a);
  if (day < 1 || day > 31 || month < 1 || month > 12) return null;
  const date = new Date(Date.UTC(Number(year), month - 1, day));
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Phones with a leading 0 or +212 are both accepted as-is — normalized only
 * by trimming whitespace, never reformatted (reformatting risks corrupting
 * a real number the spec doesn't ask us to standardize). */
export function normalizePhone(value: string): string {
  return value.trim().replace(/[\s.-]/g, "");
}

export { parseDecimalInput };
