"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/rbac";
import {
  createOrder,
  confirmOrder,
  shipOrder,
  deliverOrder,
  cancelOrderBeforePrep,
  cancelOrderAfterPrep,
  OrderError,
} from "@/lib/orders/service";
import { createCustomer } from "@/lib/customers/service";
import { declareReturn, receiveReturnLines, ReturnError } from "@/lib/returns/service";
import { parseDecimalInput, requireString } from "@/lib/numbers";
import type { OrderChannel, MarketingSource } from "@/app/generated/prisma/enums";

export type FormState = { error?: string } | undefined;

const CONFIRMATION_ROLES = ["CONFIRMATION", "STOCK"] as const;

export async function createOrderAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireRole([...CONFIRMATION_ROLES]);

  const skuList = formData.getAll("lineSku") as string[];
  const qtyList = formData.getAll("lineQuantity") as string[];
  const priceList = formData.getAll("lineUnitPrice") as string[];

  const lines: { articleVariantId: string; quantity: string; unitPrice: string }[] = [];
  for (let i = 0; i < skuList.length; i++) {
    const articleVariantId = requireString(skuList[i]);
    const quantity = parseDecimalInput(qtyList[i]);
    const unitPrice = parseDecimalInput(priceList[i]) ?? "0";
    if (!articleVariantId || !quantity) continue;
    lines.push({ articleVariantId, quantity, unitPrice });
  }
  if (lines.length === 0) {
    return { error: "Ajoutez au moins un article valide (quantité > 0)." };
  }

  const locationId = requireString(formData.get("locationId"));
  const channelRaw = requireString(formData.get("channel"));
  if (!locationId || !channelRaw) {
    return { error: "L'emplacement et le canal sont requis." };
  }

  let customerId: string | null = null;
  const customerName = requireString(formData.get("customerName"));
  const customerPhone = requireString(formData.get("customerPhone"));
  if (customerName) {
    const customer = await createCustomer({
      organizationId: session.organizationId,
      name: customerName,
      phone: customerPhone,
      address: requireString(formData.get("deliveryAddress")),
    });
    customerId = customer.id;
  }

  try {
    await createOrder({
      organizationId: session.organizationId,
      userId: session.userId,
      customerId,
      customerName,
      customerPhone,
      deliveryAddress: requireString(formData.get("deliveryAddress")),
      channel: channelRaw as OrderChannel,
      marketingSource: (requireString(formData.get("marketingSource")) as MarketingSource) ?? "UNKNOWN",
      locationId,
      withSalt: formData.get("withSalt") === "on",
      placedAt: new Date(),
      deliveryFeeAmount: parseDecimalInput(formData.get("deliveryFeeAmount")) ?? "0",
      notes: requireString(formData.get("notes")),
      lines,
    });
  } catch (error) {
    if (error instanceof OrderError) return { error: error.message };
    throw error;
  }

  revalidatePath("/orders");
  revalidatePath("/");
  return undefined;
}

export async function confirmOrderAction(orderId: string) {
  const session = await requireRole([...CONFIRMATION_ROLES]);
  try {
    await confirmOrder(session.organizationId, session.userId, orderId);
  } catch (error) {
    if (error instanceof OrderError) throw new Error(error.message);
    throw error;
  }
  revalidatePath("/orders");
  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/inventory");
  revalidatePath("/");
}

export async function shipOrderAction(orderId: string, formData: FormData) {
  const session = await requireRole([...CONFIRMATION_ROLES]);
  await shipOrder(session.organizationId, session.userId, orderId, {
    carrierId: requireString(formData.get("carrierId")),
    trackingNumber: requireString(formData.get("trackingNumber")),
  });
  revalidatePath("/orders");
  revalidatePath(`/orders/${orderId}`);
}

export async function deliverOrderAction(orderId: string) {
  const session = await requireRole([...CONFIRMATION_ROLES]);
  await deliverOrder(session.organizationId, session.userId, orderId);
  revalidatePath("/orders");
  revalidatePath(`/orders/${orderId}`);
}

export async function cancelBeforePrepAction(orderId: string) {
  const session = await requireRole([...CONFIRMATION_ROLES]);
  await cancelOrderBeforePrep(session.organizationId, session.userId, orderId);
  revalidatePath("/orders");
  revalidatePath(`/orders/${orderId}`);
}

export async function cancelAfterPrepAction(orderId: string, formData: FormData) {
  const session = await requireRole([...CONFIRMATION_ROLES]);
  const movementIds = formData.getAll("recoverMovementId") as string[];
  const quantities = formData.getAll("recoverQuantity") as string[];
  const recoveries = movementIds
    .map((id, i) => ({ movementId: id, quantity: quantities[i] ?? "0" }))
    .filter((r) => Number(r.quantity) > 0);

  await cancelOrderAfterPrep(session.organizationId, session.userId, orderId, recoveries);
  revalidatePath("/orders");
  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/inventory");
}

export async function declareReturnAction(orderId: string, formData: FormData) {
  const session = await requireRole([...CONFIRMATION_ROLES]);
  const movementIds = formData.getAll("expectMovementId") as string[];
  const quantities = formData.getAll("expectQuantity") as string[];
  const lines = movementIds
    .map((id, i) => ({ sourceMovementId: id, expectedQuantity: quantities[i] ?? "0" }))
    .filter((l) => Number(l.expectedQuantity) > 0);

  try {
    await declareReturn({ organizationId: session.organizationId, userId: session.userId, orderId, lines });
  } catch (error) {
    if (error instanceof ReturnError) throw new Error(error.message);
    throw error;
  }
  revalidatePath("/orders");
  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/returns");
}

export async function receiveReturnAction(returnId: string, orderId: string, formData: FormData) {
  const session = await requireRole([...CONFIRMATION_ROLES]);
  const expectedLineIds = formData.getAll("expectedLineId") as string[];
  const received = formData.getAll("receivedQuantity") as string[];
  const healthy = formData.getAll("healthyQuantity") as string[];
  const damaged = formData.getAll("damagedQuantity") as string[];

  const lines = expectedLineIds
    .map((id, i) => ({
      expectedLineId: id,
      receivedQuantity: received[i] ?? "0",
      healthyQuantity: healthy[i] ?? "0",
      damagedQuantity: damaged[i] ?? "0",
    }))
    .filter((l) => Number(l.receivedQuantity) > 0);

  if (lines.length === 0) return;

  try {
    await receiveReturnLines({ organizationId: session.organizationId, userId: session.userId, returnId, lines });
  } catch (error) {
    if (error instanceof ReturnError) throw new Error(error.message);
    throw error;
  }
  revalidatePath("/orders");
  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/returns");
  revalidatePath("/inventory");
  redirect(`/orders/${orderId}`);
}
