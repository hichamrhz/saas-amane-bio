import { describe, it, expect } from "vitest";
import { isRoleAllowed } from "@/lib/auth/permissions";

describe("isRoleAllowed (cahier des charges §19, test d'acceptation #28)", () => {
  it("OWNER a toujours accès, même si non listé explicitement", () => {
    expect(isRoleAllowed("OWNER", ["FINANCE"])).toBe(true);
    expect(isRoleAllowed("OWNER", [])).toBe(true);
  });

  it("un rôle STOCK n'a pas accès à une action réservée à FINANCE", () => {
    expect(isRoleAllowed("STOCK", ["FINANCE"])).toBe(false);
  });

  it("un rôle explicitement listé est autorisé", () => {
    expect(isRoleAllowed("STOCK", ["STOCK", "FINANCE"])).toBe(true);
  });

  it("refuse par défaut un rôle non listé", () => {
    expect(isRoleAllowed("READONLY", ["STOCK", "CONFIRMATION", "FINANCE"])).toBe(false);
  });
});
