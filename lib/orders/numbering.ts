import { randomBytes } from "node:crypto";

/** Human-readable, collision-resistant business order number. The DB unique
 * constraint on (organizationId, orderNumber) is still the real guarantee —
 * this is just a good default when the caller doesn't supply their own. */
export function generateOrderNumber(date: Date): string {
  const datePart = date.toISOString().slice(0, 10).replace(/-/g, "");
  const randomPart = randomBytes(3).toString("hex").toUpperCase();
  return `CMD-${datePart}-${randomPart}`;
}
