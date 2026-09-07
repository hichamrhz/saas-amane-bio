import { getTranslations } from "next-intl/server";
import { requireSession } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/prisma";
import { getOrderStatusCounts } from "@/lib/orders/service";

export default async function DashboardPage() {
  const session = await requireSession();
  const t = await getTranslations();

  const [productCount, consumableCount, locationCount, movementCount, orderStatusCounts] = await Promise.all([
    prisma.article.count({ where: { organizationId: session.organizationId, kind: "PRODUCT" } }),
    prisma.article.count({ where: { organizationId: session.organizationId, kind: "CONSUMABLE" } }),
    prisma.location.count({ where: { organizationId: session.organizationId } }),
    prisma.stockMovement.count({ where: { organizationId: session.organizationId } }),
    getOrderStatusCounts(session.organizationId),
  ]);

  const totalOrders = Object.values(orderStatusCounts).reduce((a, b) => a + b, 0);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">
        {t("dashboard.welcome", { name: session.name })}
      </h1>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label={t("nav.products")} value={productCount} />
        <StatCard label={t("nav.packaging")} value={consumableCount} />
        <StatCard label={t("locations.title")} value={locationCount} />
        <StatCard label={t("inventory.movementsLog")} value={movementCount} />
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Commandes (total)" value={totalOrders} />
        <StatCard label="Nouvelles" value={orderStatusCounts.NEW ?? 0} />
        <StatCard label="Confirmées" value={orderStatusCounts.CONFIRMED ?? 0} />
        <StatCard label="Livrées" value={orderStatusCounts.DELIVERED ?? 0} />
      </div>
      <p className="max-w-2xl text-sm text-neutral-500">
        Ce tableau de bord affiche uniquement des compteurs réels tirés de la
        base de données. Les taux de confirmation/livraison par cohorte, le
        résultat de période et les alertes de réapprovisionnement (§17 du
        cahier des charges) restent à construire — voir PROGRESS.md.
      </p>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4">
      <p className="text-xs uppercase tracking-wide text-neutral-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-neutral-900">{value}</p>
    </div>
  );
}
