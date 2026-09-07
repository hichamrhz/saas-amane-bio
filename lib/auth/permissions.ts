import type { OrgRole } from "@/app/generated/prisma/enums";

/**
 * Pure role-decision logic, kept separate from rbac.ts (which pulls in
 * `server-only` and the request-scoped `auth()` call) so it can be unit
 * tested directly without a Next.js request context.
 *
 * OWNER always passes — "propriétaire complet" (cahier des charges §19).
 * Everyone else needs to be explicitly in the allowed list. Deny by default.
 */
export function isRoleAllowed(role: OrgRole, allowed: OrgRole[]): boolean {
  if (role === "OWNER") return true;
  return allowed.includes(role);
}
