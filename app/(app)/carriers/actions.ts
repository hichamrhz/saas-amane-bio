"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/rbac";
import { createCarrier, CarrierError } from "@/lib/carriers/service";
import { parseDecimalInput, requireString } from "@/lib/numbers";

export type FormState = { error?: string } | undefined;

export async function createCarrierAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireRole(["STOCK", "CONFIRMATION"]);
  const name = requireString(formData.get("name"));
  if (!name) return { error: "Le nom du transporteur est requis." };

  try {
    await createCarrier({
      organizationId: session.organizationId,
      name,
      defaultFee: parseDecimalInput(formData.get("defaultFee")),
      notes: requireString(formData.get("notes")),
    });
  } catch (error) {
    if (error instanceof CarrierError) return { error: error.message };
    throw error;
  }
  revalidatePath("/carriers");
  return undefined;
}
