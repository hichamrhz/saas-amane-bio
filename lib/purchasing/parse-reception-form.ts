import { parseDecimalInput, requireString } from "@/lib/numbers";
import type { ReceptionKind } from "@/app/generated/prisma/enums";
import type { CreateReceptionInput } from "./receptions";

export type ParsedReceptionForm =
  | { ok: true; input: Omit<CreateReceptionInput, "organizationId" | "userId"> }
  | { ok: false; error: string };

const VALID_KINDS: ReceptionKind[] = ["SUPPLIER_PURCHASE", "COOPERATIVE_PRODUCT", "OPENING_STOCK"];

export function parseReceptionForm(formData: FormData): ParsedReceptionForm {
  const kindRaw = requireString(formData.get("kind"));
  const kind = VALID_KINDS.find((k) => k === kindRaw);
  if (!kind) return { ok: false, error: "Type de réception invalide." };

  const articleVariantId = requireString(formData.get("articleVariantId"));
  const quantity = parseDecimalInput(formData.get("quantity"));
  const unitCost = parseDecimalInput(formData.get("unitCost")) ?? "0";
  const locationId = requireString(formData.get("locationId"));
  const cooperativeLocationId = requireString(formData.get("cooperativeLocationId"));
  const eventDateRaw = requireString(formData.get("eventDate"));
  const costIncludesLabel = formData.get("costIncludesLabel") === "on";
  const reference = requireString(formData.get("reference"));
  const notes = requireString(formData.get("notes"));
  const lotNumber = requireString(formData.get("lotNumber"));
  const clientRequestId = requireString(formData.get("clientRequestId"));

  if (!articleVariantId || !quantity || !locationId || !eventDateRaw) {
    return { ok: false, error: "Article, quantité, emplacement et date sont requis." };
  }
  const eventDate = new Date(eventDateRaw);
  if (Number.isNaN(eventDate.getTime())) {
    return { ok: false, error: "Date invalide." };
  }
  if (kind === "COOPERATIVE_PRODUCT" && !cooperativeLocationId) {
    return { ok: false, error: "L'emplacement coopérative est requis pour une réception coopérative." };
  }

  return {
    ok: true,
    input: {
      kind,
      locationId,
      cooperativeLocationId: kind === "COOPERATIVE_PRODUCT" ? cooperativeLocationId : null,
      costIncludesLabel,
      reference,
      eventDate,
      notes,
      clientRequestId,
      lines: [{ articleVariantId, quantity, unitCost, lotNumber }],
    },
  };
}
