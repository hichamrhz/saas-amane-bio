import "server-only";
import { auth } from "@/auth";
import type { OrgRole } from "@/app/generated/prisma/enums";
import { isRoleAllowed } from "./permissions";

export class AccessDeniedError extends Error {
  constructor(message = "Accès refusé.") {
    super(message);
    this.name = "AccessDeniedError";
  }
}

export type AuthenticatedSession = {
  userId: string;
  organizationId: string;
  organizationName: string;
  role: OrgRole;
  email: string;
  name: string;
};

/**
 * Every server action / route handler that touches organization data must
 * call this first. Deny-by-default: no session, no organization scope.
 */
export async function requireSession(): Promise<AuthenticatedSession> {
  const session = await auth();
  if (!session?.user) throw new AccessDeniedError("Non authentifié.");
  return {
    userId: session.user.id,
    organizationId: session.user.organizationId,
    organizationName: session.user.organizationName,
    role: session.user.role,
    email: session.user.email,
    name: session.user.name,
  };
}

/**
 * Restrict an action to a set of roles. OWNER always passes, matching the
 * "propriétaire complet" rule from the spec (§19).
 */
export async function requireRole(allowed: OrgRole[]): Promise<AuthenticatedSession> {
  const session = await requireSession();
  if (!isRoleAllowed(session.role, allowed)) {
    throw new AccessDeniedError(
      `Ce rôle (${session.role}) n'a pas accès à cette action.`
    );
  }
  return session;
}
