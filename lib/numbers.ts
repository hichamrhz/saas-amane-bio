/**
 * Parses a user-entered decimal (accepts "," or "." as the separator, per the
 * spec's requirement to tolerate French-style decimals) into a normalized
 * string safe to hand directly to a Prisma Decimal field. Returns null if the
 * input is missing or not a valid non-negative decimal — callers must treat
 * that as a validation error, never silently coerce to 0.
 */
export function parseDecimalInput(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(",", ".");
  if (normalized === "") return null;
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;
  return normalized;
}

export function parseIntegerInput(value: FormDataEntryValue | null): number | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  return Number.parseInt(trimmed, 10);
}

export function requireString(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}
