import { getTranslations } from "next-intl/server";
import { requireSession } from "@/lib/auth/rbac";
import { listCarriers } from "@/lib/carriers/service";
import { prisma } from "@/lib/db/prisma";
import { formatMoney } from "@/lib/numbers";
import { CarrierForm } from "./carrier-form";

export default async function CarriersPage() {
  const session = await requireSession();
  const t = await getTranslations("carriers");
  const tCommon = await getTranslations("common");
  const tStatus = await getTranslations("orderStatus");
  const carriers = await listCarriers(session.organizationId);

  const orders = await prisma.order.findMany({
    where: { organizationId: session.organizationId, carrierId: { not: null } },
    include: { carrier: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p className="max-w-2xl text-sm text-neutral-500">{t("description")}</p>

      <CarrierForm />

      <div className="overflow-x-auto rounded-lg border border-brand-100 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-cream-dark/60 text-start text-xs uppercase text-neutral-500">
            <tr>
              <Th>{t("tableName")}</Th>
              <Th>{t("tableDefaultFee")}</Th>
              <Th>{tCommon("notes")}</Th>
            </tr>
          </thead>
          <tbody>
            {carriers.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-neutral-400">
                  {t("emptyCarriers")}
                </td>
              </tr>
            )}
            {carriers.map((c) => (
              <tr key={c.id} className="border-t border-neutral-100">
                <td className="px-4 py-2">{c.name}</td>
                <td className="px-4 py-2">{c.defaultFee ? formatMoney(c.defaultFee) : "—"}</td>
                <td className="px-4 py-2">{c.notes ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="overflow-x-auto rounded-lg border border-brand-100 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-cream-dark/60 text-start text-xs uppercase text-neutral-500">
            <tr>
              <Th>{t("tableName")}</Th>
              <Th>{t("tableTracking")}</Th>
              <Th>{t("tableStatus")}</Th>
              <Th>COD</Th>
              <Th>{t("tableDeliveryFee")}</Th>
            </tr>
          </thead>
          <tbody>
            {orders.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-neutral-400">
                  {t("emptyOrders")}
                </td>
              </tr>
            )}
            {orders.map((o) => (
              <tr key={o.id} className="border-t border-neutral-100">
                <td className="px-4 py-2 font-mono text-xs">{o.orderNumber}</td>
                <td className="px-4 py-2">{o.trackingNumber ?? "—"}</td>
                <td className="px-4 py-2">{tStatus(o.status)}</td>
                <td className="px-4 py-2">{formatMoney(o.codAmount)}</td>
                <td className="px-4 py-2">{formatMoney(o.deliveryFeeAmount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({ children }: { children?: React.ReactNode }) {
  return <th className="px-4 py-2 font-medium">{children}</th>;
}
