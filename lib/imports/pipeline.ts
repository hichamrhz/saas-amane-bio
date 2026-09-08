import { prisma } from "@/lib/db/prisma";
import { createOrder, confirmOrder, shipOrder, deliverOrder, OrderError } from "@/lib/orders/service";
import { parseDecimalInput } from "@/lib/numbers";
import { parseDateWithFormat, normalizePhone, type DateFormat } from "./normalize";
import { groupImportRows, type RawGroup } from "./group";
import type { ColumnMapping } from "./mapping";
import type { OrderChannel, MarketingSource } from "@/app/generated/prisma/enums";

export type ImportableStatus = "NEW" | "CONFIRMED" | "SHIPPED" | "DELIVERED";
const STATUS_RANK: Record<ImportableStatus, number> = { NEW: 0, CONFIRMED: 1, SHIPPED: 2, DELIVERED: 3 };

export type ImportOptions = {
  organizationId: string;
  userId: string;
  dateFormat: DateFormat;
  defaultLocationId: string;
  skipStockImpact: boolean;
};

export type ResolvedOrderInput = {
  orderNumber: string;
  externalRef: string | null;
  customerName: string | null;
  customerPhone: string | null;
  deliveryAddress: string | null;
  channel: OrderChannel;
  marketingSource: MarketingSource;
  carrierId: string | null;
  trackingNumber: string | null;
  withSalt: boolean;
  placedAt: Date;
  lines: { articleVariantId: string; quantity: string; unitPrice: string; discount?: string }[];
  deliveryFeeAmount?: string;
  codAmount?: string | null;
  notes: string | null;
};

export type ClassifiedGroup =
  | { kind: "INVALID"; group: RawGroup; message: string }
  | { kind: "REGRESSION_SKIPPED"; group: RawGroup; message: string; existingOrderId: string }
  | { kind: "DUPLICATE_NO_CHANGE"; group: RawGroup; existingOrderId: string }
  | {
      kind: "READY";
      group: RawGroup;
      isNew: boolean;
      existingOrderId?: string;
      input: ResolvedOrderInput;
      targetStatus: ImportableStatus;
    };

const CHANNEL_MAP: Record<string, OrderChannel> = {
  site: "SITE",
  web: "SITE",
  whatsapp: "WHATSAPP",
  wa: "WHATSAPP",
};
const MARKETING_MAP: Record<string, MarketingSource> = {
  facebook: "FACEBOOK",
  fb: "FACEBOOK",
  tiktok: "TIKTOK",
  google: "GOOGLE",
  affilie: "AFFILIATE",
  "affilié": "AFFILIATE",
  affiliate: "AFFILIATE",
  autre: "OTHER",
  other: "OTHER",
  inconnu: "UNKNOWN",
  unknown: "UNKNOWN",
};
const STATUS_MAP: Record<string, ImportableStatus> = {
  nouvelle: "NEW",
  new: "NEW",
  confirmee: "CONFIRMED",
  "confirmée": "CONFIRMED",
  confirmed: "CONFIRMED",
  expediee: "SHIPPED",
  "expédiée": "SHIPPED",
  shipped: "SHIPPED",
  livree: "DELIVERED",
  "livrée": "DELIVERED",
  delivered: "DELIVERED",
};
const TRUE_VALUES = new Set(["oui", "yes", "true", "1"]);
const FALSE_VALUES = new Set(["non", "no", "false", "0"]);

function normalizeKey(value: string): string {
  return value.trim().toLowerCase();
}

export async function classifyImportGroup(
  options: ImportOptions,
  group: RawGroup
): Promise<ClassifiedGroup> {
  if (!group.orderNumber) {
    return { kind: "INVALID", group, message: "Numéro de commande manquant." };
  }
  if (group.contradiction) {
    return { kind: "INVALID", group, message: group.contradiction };
  }
  if (group.lines.length === 0) {
    return { kind: "INVALID", group, message: "Aucune ligne d'article pour cette commande." };
  }

  const resolvedLines: ResolvedOrderInput["lines"] = [];
  for (const line of group.lines) {
    if (!line.sku) {
      return { kind: "INVALID", group, message: `SKU manquant (ligne ${line.rowNumber}).` };
    }
    const variant = await prisma.articleVariant.findFirst({
      where: { organizationId: options.organizationId, sku: line.sku },
    });
    if (!variant) {
      return { kind: "INVALID", group, message: `SKU inconnu "${line.sku}" (ligne ${line.rowNumber}).` };
    }
    const quantity = line.quantity ? parseDecimalInput(line.quantity) : null;
    if (!quantity || Number(quantity) <= 0) {
      return { kind: "INVALID", group, message: `Quantité invalide pour ${line.sku} (ligne ${line.rowNumber}).` };
    }
    const unitPrice = line.unitPrice ? parseDecimalInput(line.unitPrice) : "0";
    if (unitPrice === null) {
      return { kind: "INVALID", group, message: `Prix unitaire invalide pour ${line.sku} (ligne ${line.rowNumber}).` };
    }
    const discount = line.discount ? parseDecimalInput(line.discount) : "0";
    resolvedLines.push({ articleVariantId: variant.id, quantity, unitPrice, discount: discount ?? "0" });
  }

  const channelRaw = group.globals.channel ? normalizeKey(group.globals.channel) : null;
  const channel = channelRaw ? CHANNEL_MAP[channelRaw] : "WHATSAPP";
  if (channelRaw && !channel) {
    return { kind: "INVALID", group, message: `Canal inconnu : "${group.globals.channel}".` };
  }

  const marketingRaw = group.globals.marketingSource ? normalizeKey(group.globals.marketingSource) : null;
  const marketingSource = marketingRaw ? MARKETING_MAP[marketingRaw] : "UNKNOWN";
  if (marketingRaw && !marketingSource) {
    return { kind: "INVALID", group, message: `Source marketing inconnue : "${group.globals.marketingSource}".` };
  }

  let carrierId: string | null = null;
  if (group.globals.carrierName) {
    const carrier = await prisma.carrier.findFirst({
      where: { organizationId: options.organizationId, name: group.globals.carrierName },
    });
    if (!carrier) {
      return { kind: "INVALID", group, message: `Transporteur inconnu : "${group.globals.carrierName}".` };
    }
    carrierId = carrier.id;
  }

  let placedAt = new Date();
  if (group.globals.eventDate) {
    const parsed = parseDateWithFormat(group.globals.eventDate, options.dateFormat);
    if (!parsed) {
      return { kind: "INVALID", group, message: `Date invalide : "${group.globals.eventDate}".` };
    }
    placedAt = parsed;
  }

  const statusRaw = group.globals.status ? normalizeKey(group.globals.status) : null;
  const targetStatus: ImportableStatus = statusRaw ? STATUS_MAP[statusRaw] : "NEW";
  if (statusRaw && !targetStatus) {
    return {
      kind: "INVALID",
      group,
      message: `Statut non pris en charge par l'import : "${group.globals.status}" (annulations/retours : utilisez l'interface).`,
    };
  }

  let withSalt = true;
  if (group.globals.withSalt) {
    const key = normalizeKey(group.globals.withSalt);
    if (TRUE_VALUES.has(key)) withSalt = true;
    else if (FALSE_VALUES.has(key)) withSalt = false;
    else return { kind: "INVALID", group, message: `Valeur "avec sel" invalide : "${group.globals.withSalt}".` };
  }

  const deliveryFeeAmount = group.globals.deliveryFeeAmount
    ? (parseDecimalInput(group.globals.deliveryFeeAmount) ?? undefined)
    : undefined;
  const codAmount = group.globals.codAmount ? parseDecimalInput(group.globals.codAmount) : null;

  const input: ResolvedOrderInput = {
    orderNumber: group.orderNumber,
    externalRef: group.globals.externalRef ?? null,
    customerName: group.globals.customerName ?? null,
    customerPhone: group.globals.customerPhone ? normalizePhone(group.globals.customerPhone) : null,
    deliveryAddress: group.globals.deliveryAddress ?? null,
    channel,
    marketingSource,
    carrierId,
    trackingNumber: group.globals.trackingNumber ?? null,
    withSalt,
    placedAt,
    lines: resolvedLines,
    deliveryFeeAmount,
    codAmount,
    notes: group.globals.notes ?? null,
  };

  const existing = await prisma.order.findUnique({
    where: { organizationId_orderNumber: { organizationId: options.organizationId, orderNumber: group.orderNumber } },
  });

  if (!existing) {
    return { kind: "READY", group, isNew: true, input, targetStatus };
  }

  const currentRank = STATUS_RANK[existing.status as ImportableStatus] ?? Infinity;
  const requestedRank = STATUS_RANK[targetStatus];
  if (requestedRank < currentRank) {
    return {
      kind: "REGRESSION_SKIPPED",
      group,
      existingOrderId: existing.id,
      message: `La commande ${group.orderNumber} est déjà à un statut plus avancé (${existing.status}) ; la mise à jour vers ${targetStatus} est ignorée.`,
    };
  }
  if (
    requestedRank === currentRank &&
    (existing.trackingNumber ?? null) === input.trackingNumber &&
    (existing.carrierId ?? null) === input.carrierId
  ) {
    return { kind: "DUPLICATE_NO_CHANGE", group, existingOrderId: existing.id };
  }

  return { kind: "READY", group, isNew: false, existingOrderId: existing.id, input, targetStatus };
}

export async function classifyImportBatch(
  options: ImportOptions,
  rows: string[][],
  header: string[],
  mapping: ColumnMapping
): Promise<ClassifiedGroup[]> {
  const groups = groupImportRows(rows, header, mapping);
  const results: ClassifiedGroup[] = [];
  for (const group of groups) {
    results.push(await classifyImportGroup(options, group));
  }
  return results;
}

export type ExecutedRow = {
  rowNumbers: number[];
  orderNumber: string | null;
  status: "VALID_NEW" | "VALID_UPDATE" | "DUPLICATE_NO_CHANGE" | "INVALID" | "REGRESSION_SKIPPED";
  message: string | null;
  orderId: string | null;
};

/** Executes a classified batch, one order per (independent) transaction, so
 * one order failing never blocks the rest of the batch (cahier des charges
 * §9 : "aucune moitié de commande validée" per order, not per file). */
export async function executeImportBatch(
  options: ImportOptions,
  classified: ClassifiedGroup[]
): Promise<ExecutedRow[]> {
  const results: ExecutedRow[] = [];

  for (const item of classified) {
    if (item.kind === "INVALID") {
      results.push({ rowNumbers: item.group.rowNumbers, orderNumber: item.group.orderNumber, status: "INVALID", message: item.message, orderId: null });
      continue;
    }
    if (item.kind === "REGRESSION_SKIPPED") {
      results.push({ rowNumbers: item.group.rowNumbers, orderNumber: item.group.orderNumber, status: "REGRESSION_SKIPPED", message: item.message, orderId: item.existingOrderId });
      continue;
    }
    if (item.kind === "DUPLICATE_NO_CHANGE") {
      results.push({ rowNumbers: item.group.rowNumbers, orderNumber: item.group.orderNumber, status: "DUPLICATE_NO_CHANGE", message: null, orderId: item.existingOrderId });
      continue;
    }

    try {
      let orderId: string;
      if (item.isNew) {
        const order = await createOrder({
          organizationId: options.organizationId,
          userId: options.userId,
          orderNumber: item.input.orderNumber,
          externalRef: item.input.externalRef,
          customerName: item.input.customerName,
          customerPhone: item.input.customerPhone,
          deliveryAddress: item.input.deliveryAddress,
          channel: item.input.channel,
          marketingSource: item.input.marketingSource,
          carrierId: item.input.carrierId,
          locationId: options.defaultLocationId,
          withSalt: item.input.withSalt,
          skipStockImpact: options.skipStockImpact,
          placedAt: item.input.placedAt,
          deliveryFeeAmount: item.input.deliveryFeeAmount,
          codAmount: item.input.codAmount,
          notes: item.input.notes,
          lines: item.input.lines,
        });
        orderId = order.id;
      } else {
        orderId = item.existingOrderId!;
        await prisma.order.update({
          where: { id: orderId },
          data: {
            trackingNumber: item.input.trackingNumber ?? undefined,
            carrierId: item.input.carrierId ?? undefined,
            deliveryAddress: item.input.deliveryAddress ?? undefined,
          },
        });
      }

      let progressMessage: string | null = null;
      try {
        if (item.targetStatus === "CONFIRMED" || item.targetStatus === "SHIPPED" || item.targetStatus === "DELIVERED") {
          await confirmOrder(options.organizationId, options.userId, orderId);
        }
        if (item.targetStatus === "SHIPPED" || item.targetStatus === "DELIVERED") {
          await shipOrder(options.organizationId, options.userId, orderId, {});
        }
        if (item.targetStatus === "DELIVERED") {
          await deliverOrder(options.organizationId, options.userId, orderId);
        }
      } catch (error) {
        if (error instanceof OrderError) {
          // The order exists (created or already there) but couldn't reach
          // the imported status automatically — flagged for manual
          // resolution, never a silently invented zero cost (test #13).
          progressMessage = `Commande créée/mise à jour mais bloquée avant ${item.targetStatus} : ${error.message}`;
        } else {
          throw error;
        }
      }

      results.push({
        rowNumbers: item.group.rowNumbers,
        orderNumber: item.group.orderNumber,
        status: item.isNew ? "VALID_NEW" : "VALID_UPDATE",
        message: progressMessage,
        orderId,
      });
    } catch (error) {
      const message = error instanceof OrderError ? error.message : "Erreur inattendue lors du traitement de cette commande.";
      results.push({ rowNumbers: item.group.rowNumbers, orderNumber: item.group.orderNumber, status: "INVALID", message, orderId: null });
    }
  }

  return results;
}
