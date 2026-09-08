import { getTranslations } from "next-intl/server";
import { requireSession } from "@/lib/auth/rbac";
import { listStockMovements, getOnHandSummary } from "@/lib/inventory/stock";

export default async function InventoryPage() {
  const session = await requireSession();
  const t = await getTranslations("inventory");
  const tCommon = await getTranslations("common");
  const tPurchases = await getTranslations("purchases");
  const [movements, summary] = await Promise.all([
    listStockMovements(session.organizationId),
    getOnHandSummary(session.organizationId),
  ]);

  const movementTypeLabels: Record<string, string> = {
    OPENING: t("movementOpening"),
    PURCHASE_RECEPTION: t("movementPurchaseReception"),
    COOPERATIVE_TRANSFER_OUT: t("movementCooperativeTransferOut"),
    COOPERATIVE_TRANSFER_IN: t("movementCooperativeTransferIn"),
    LABEL_CONSUMPTION: t("movementLabelConsumption"),
    COOPERATIVE_RECEPTION: t("movementCooperativeReception"),
    CORRECTION: t("movementCorrection"),
    ORDER_EXIT: t("movementOrderExit"),
    RETURN_RECEPTION: t("movementReturnReception"),
    LOSS: t("movementLoss"),
  };

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase text-neutral-500">
          {t("onHandByLocation")}
        </h2>
        <div className="overflow-x-auto rounded-lg border border-brand-100 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-cream-dark/60 text-start text-xs uppercase text-neutral-500">
              <tr>
                <Th>{tCommon("article")}</Th>
                <Th>{tCommon("location")}</Th>
                <Th>{tCommon("quantity")}</Th>
                <Th>{tCommon("unit")}</Th>
              </tr>
            </thead>
            <tbody>
              {summary.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-neutral-400">
                    {t("emptyOnHand")}
                  </td>
                </tr>
              )}
              {summary.map((row) => (
                <tr
                  key={`${row.variant!.id}-${row.location!.id}`}
                  className="border-t border-neutral-100"
                >
                  <td className="px-4 py-2">
                    {row.variant!.article.name} · {row.variant!.label} ({row.variant!.sku})
                  </td>
                  <td className="px-4 py-2">{row.location!.name}</td>
                  <td className="px-4 py-2 font-medium">{row.quantity}</td>
                  <td className="px-4 py-2">{row.variant!.stockUnitLabel}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase text-neutral-500">{t("movementsLog")}</h2>
        <div className="overflow-x-auto rounded-lg border border-brand-100 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-cream-dark/60 text-start text-xs uppercase text-neutral-500">
              <tr>
                <Th>{tCommon("date")}</Th>
                <Th>{t("type")}</Th>
                <Th>{tCommon("article")}</Th>
                <Th>{tCommon("location")}</Th>
                <Th>{tCommon("quantity")}</Th>
                <Th>{tPurchases("unitCost")}</Th>
                <Th>{tCommon("by")}</Th>
              </tr>
            </thead>
            <tbody>
              {movements.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-neutral-400">
                    {t("emptyMovements")}
                  </td>
                </tr>
              )}
              {movements.map((m) => (
                <tr key={m.id} className="border-t border-neutral-100">
                  <td className="px-4 py-2">{m.eventDate.toLocaleDateString("fr-FR")}</td>
                  <td className="px-4 py-2">{movementTypeLabels[m.type] ?? m.type}</td>
                  <td className="px-4 py-2">
                    {m.articleVariant.article.name} · {m.articleVariant.label}
                  </td>
                  <td className="px-4 py-2">{m.location.name}</td>
                  <td
                    className={`px-4 py-2 font-medium ${
                      Number(m.quantityDelta) < 0 ? "text-red-600" : "text-green-700"
                    }`}
                  >
                    {m.quantityDelta.toString()}
                  </td>
                  <td className="px-4 py-2">{m.unitCost?.toString() ?? "—"}</td>
                  <td className="px-4 py-2">{m.createdBy.name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Th({ children }: { children?: React.ReactNode }) {
  return <th className="px-4 py-2 font-medium">{children}</th>;
}
