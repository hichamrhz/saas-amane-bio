import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireSession } from "@/lib/auth/rbac";
import { getOrder } from "@/lib/orders/service";
import { getReturnByOrderId } from "@/lib/returns/service";
import { listCarriers } from "@/lib/carriers/service";
import { formatMoney } from "@/lib/numbers";
import { ActionButton } from "../../_components/action-button";
import { confirmOrderAction, deliverOrderAction, cancelBeforePrepAction } from "../actions";
import { ShipForm } from "./ship-form";
import { CancelAfterPrepForm } from "./cancel-after-prep-form";
import { DeclareReturnForm } from "./declare-return-form";
import { ReceiveReturnForm } from "./receive-return-form";

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession();
  const t = await getTranslations("orders");
  const tStatus = await getTranslations("orderStatus");
  const tChannel = await getTranslations("orderChannel");
  const tMarketing = await getTranslations("marketingSource");
  const [order, carriers] = await Promise.all([
    getOrder(session.organizationId, id),
    listCarriers(session.organizationId),
  ]);
  if (!order) notFound();

  const orderExitMovements = order.stockMovements.filter((m) => m.type === "ORDER_EXIT");
  const movementSummaries = orderExitMovements.map((m) => ({
    id: m.id,
    articleName: m.articleVariant.article.name,
    label: m.articleVariant.label,
    quantity: m.quantityDelta.toString().replace("-", ""),
  }));

  const activeReturn = await getReturnByOrderId(session.organizationId, id);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{order.orderNumber}</h1>
          <p className="text-sm text-neutral-500">
            {tChannel(order.channel)} · {tMarketing(order.marketingSource)} ·{" "}
            {order.placedAt.toLocaleDateString("fr-FR")}
          </p>
        </div>
        <span className="rounded-full bg-neutral-100 px-3 py-1 text-sm font-medium text-neutral-700">
          {tStatus(order.status)}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <section className="rounded-lg border border-brand-100 bg-white p-4 text-sm">
          <h2 className="mb-2 font-semibold text-neutral-800">{t("detailCustomerTitle")}</h2>
          <p>{order.customer?.name ?? order.customerName ?? "—"}</p>
          <p>{order.customer?.phone ?? order.customerPhone ?? "—"}</p>
          <p>{order.deliveryAddress ?? "—"}</p>
        </section>
        <section className="rounded-lg border border-brand-100 bg-white p-4 text-sm">
          <h2 className="mb-2 font-semibold text-neutral-800">{t("detailAmountsTitle")}</h2>
          <p>
            {t("subtotal")} : {formatMoney(order.subtotalAmount)} MAD
          </p>
          <p>
            {t("discount")} : {formatMoney(order.discountAmount)} MAD
          </p>
          <p>
            {t("deliveryFee")} : {formatMoney(order.deliveryFeeAmount)} MAD
          </p>
          <p className="font-medium">
            {t("codAmount")} : {formatMoney(order.codAmount)} MAD
          </p>
        </section>
      </div>

      <section className="overflow-x-auto rounded-lg border border-brand-100 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-cream-dark/60 text-start text-xs uppercase text-neutral-500">
            <tr>
              <th className="px-4 py-2 font-medium">{t("tableProduct")}</th>
              <th className="px-4 py-2 font-medium">{t("tableQuantity")}</th>
              <th className="px-4 py-2 font-medium">{t("tableUnitPrice")}</th>
            </tr>
          </thead>
          <tbody>
            {order.lines.map((l) => (
              <tr key={l.id} className="border-t border-neutral-100">
                <td className="px-4 py-2">
                  {l.articleVariant.article.name} · {l.articleVariant.label}
                </td>
                <td className="px-4 py-2">{l.quantity.toString()}</td>
                <td className="px-4 py-2">{formatMoney(l.unitPrice)} MAD</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="flex flex-wrap gap-3">
        {order.status === "NEW" && (
          <>
            <ActionButton id={order.id} action={confirmOrderAction} label={t("confirmButton")} />
            <ActionButton
              id={order.id}
              action={cancelBeforePrepAction}
              label={t("cancelBeforePrepButton")}
              className="rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700"
              confirmMessage={t("cancelBeforePrepConfirm")}
            />
          </>
        )}
        {order.status === "CONFIRMED" && <ShipForm orderId={order.id} carriers={carriers} />}
        {(order.status === "CONFIRMED" || order.status === "SHIPPED") && (
          <ActionButton id={order.id} action={deliverOrderAction} label={t("deliverButton")} />
        )}
        {(order.status === "CONFIRMED" || order.status === "SHIPPED") && movementSummaries.length > 0 && (
          <CancelAfterPrepForm orderId={order.id} movements={movementSummaries} title={t("cancelAfterPrepTitle")} />
        )}
        {(order.status === "DELIVERED" || order.status === "SHIPPED") &&
          !activeReturn &&
          movementSummaries.length > 0 && (
            <DeclareReturnForm orderId={order.id} movements={movementSummaries} title={t("declareReturnTitle")} />
          )}
      </section>

      {activeReturn && (
        <ReceiveReturnForm
          orderId={order.id}
          returnId={activeReturn.id}
          expectedLines={activeReturn.expectedLines.map((line) => ({
            id: line.id,
            articleName: line.sourceMovement.articleVariant.article.name,
            label: line.sourceMovement.articleVariant.label,
            expectedQuantity: line.expectedQuantity.toString(),
            alreadyReceived: line.receiptLines
              .reduce((sum, r) => sum + Number(r.receivedQuantity), 0)
              .toString(),
          }))}
        />
      )}

      <section className="rounded-lg border border-brand-100 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-neutral-800">{t("historyTitle")}</h2>
        <ul className="flex flex-col gap-2 text-sm">
          {order.events.map((e) => (
            <li key={e.id} className="border-b border-neutral-100 pb-2 last:border-0">
              {e.fromStatus ? `${tStatus(e.fromStatus)} → ` : ""}
              {tStatus(e.toStatus)} · {e.occurredAt.toLocaleString("fr-FR")} · {e.createdBy.name}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
