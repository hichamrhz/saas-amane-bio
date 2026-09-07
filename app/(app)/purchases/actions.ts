"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/rbac";
import { createSupplier, SupplierError } from "@/lib/purchasing/suppliers";
import { createReception, ReceptionError } from "@/lib/purchasing/receptions";
import { parseReceptionForm } from "@/lib/purchasing/parse-reception-form";
import { requireString, parseIntegerInput } from "@/lib/numbers";

export type FormState = { error?: string } | undefined;

export async function createSupplierAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireRole(["STOCK"]);
  const name = requireString(formData.get("name"));
  if (!name) return { error: "Le nom du fournisseur est requis." };

  try {
    await createSupplier({
      organizationId: session.organizationId,
      name,
      phone: requireString(formData.get("phone")),
      leadTimeDays: parseIntegerInput(formData.get("leadTimeDays")),
    });
  } catch (error) {
    if (error instanceof SupplierError) return { error: error.message };
    throw error;
  }
  revalidatePath("/purchases");
  return undefined;
}

export async function createPurchaseReceptionAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const session = await requireRole(["STOCK"]);
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
  revalidatePath("/purchases");
  revalidatePath("/inventory");
  revalidatePath("/");
  return undefined;
}
