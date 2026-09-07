"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/rbac";
import { createReception, ReceptionError } from "@/lib/purchasing/receptions";
import { createCooperativeTransfer, TransferError } from "@/lib/purchasing/transfers";
import { parseReceptionForm } from "@/lib/purchasing/parse-reception-form";
import { parseDecimalInput, requireString } from "@/lib/numbers";

export type FormState = { error?: string } | undefined;

export async function createCooperativeReceptionAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const session = await requireRole(["STOCK"]);
  formData.set("kind", "COOPERATIVE_PRODUCT");
  const parsed = parseReceptionForm(formData);
  if (!parsed.ok) return { error: parsed.error };

  try {
    await createReception({
      organizationId: session.organizationId,
      userId: session.userId,
      ...parsed.input,
    });
  } catch (error) {
    if (error instanceof ReceptionError) return { error: error.message };
    throw error;
  }
  revalidatePath("/cooperative");
  revalidatePath("/inventory");
  revalidatePath("/");
  return undefined;
}

export async function createTransferAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireRole(["STOCK"]);

  const articleVariantId = requireString(formData.get("articleVariantId"));
  const fromLocationId = requireString(formData.get("fromLocationId"));
  const toLocationId = requireString(formData.get("toLocationId"));
  const quantity = parseDecimalInput(formData.get("quantity"));
  const eventDateRaw = requireString(formData.get("eventDate"));

  if (!articleVariantId || !fromLocationId || !toLocationId || !quantity || !eventDateRaw) {
    return { error: "Tous les champs sont requis." };
  }
  const eventDate = new Date(eventDateRaw);
  if (Number.isNaN(eventDate.getTime())) return { error: "Date invalide." };

  try {
    await createCooperativeTransfer({
      organizationId: session.organizationId,
      userId: session.userId,
      articleVariantId,
      fromLocationId,
      toLocationId,
      quantity,
      eventDate,
      notes: requireString(formData.get("notes")),
      clientRequestId: requireString(formData.get("clientRequestId")),
    });
  } catch (error) {
    if (error instanceof TransferError) return { error: error.message };
    throw error;
  }
  revalidatePath("/cooperative");
  revalidatePath("/inventory");
  return undefined;
}
