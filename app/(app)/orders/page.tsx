import Link from "next/link";
import { requireSession } from "@/lib/auth/rbac";
import { listOrders, getOrderStatusCounts } from "@/lib/orders/service";
import { listLocations } from "@/lib/purchasing/suppliers";
import { prisma } from "@/lib/db/prisma";
import { formatMoney } from "@/lib/numbers";
import { ORDER_STATUS_LABELS, ORDER_STATUS_COLORS } from "@/lib/orders/labels";
import { NewOrderForm } from "./new-order-form";

export default async function OrdersPage() {
  const session = await requireSession();

  const [orders, statusCounts, locations, products] = await Promise.all([
    listOrders(session.organizationId),
    getOrderStatusCounts(session.organizationId),
    listLocations(session.organizationId),
    prisma.articleVariant.findMany({
      where: { organizationId: session.organizationId, status: "ACTIVE", article: { kind: "PRODUCT" } },
      include: { article: true },
      orderBy: [{ article: { name: "asc" } }],
    }),
  ]);

  const kpis: { key: string; label: string }[] = [
    { key: "NEW", label: "Nouvelles" },
    { key: "CONFIRMED", label: "Confirmées" },
    { key: "SHIPPED", label: "En livraison" },
    { key: "DELIVERED", label: "Livrées" },
    { key: "RETURN_ANNOUNCED", label: "Retours annoncés" },
    { key: "CANCELLED_AFTER_PREP", label: "Annulées après prépa" },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Commandes et import</h1>
        <Link href="/orders/import" className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white">
          Importer (CSV/XLSX)
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {kpis.map((k) => (
          <div key={k.key} className="rounded-lg border border-neutral-200 bg-white p-4">
            <p className="text-xs uppercase tracking-wide text-neutral-500">{k.label}</p>
            <p className="mt-1 text-2xl font-semibold text-neutral-900">{statusCounts[k.key] ?? 0}</p>
          </div>
        ))}
      </div>

      <NewOrderForm
        products={products.map((p) => ({ id: p.id, sku: p.sku, label: p.label, articleName: p.article.name }))}
        locations={locations.map((l) => ({ id: l.id, name: l.name }))}
      />

      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-start text-xs uppercase text-neutral-500">
            <tr>
              <Th>Commande</Th>
              <Th>Client</Th>
              <Th>Canal</Th>
              <Th>Articles</Th>
              <Th>Total</Th>
              <Th>Statut</Th>
              <Th>Date</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {orders.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-neutral-400">
                  Aucune commande pour le moment.
                </td>
              </tr>
            )}
            {orders.map((o) => (
              <tr key={o.id} className="border-t border-neutral-100">
                <td className="px-4 py-2 font-mono text-xs">{o.orderNumber}</td>
                <td className="px-4 py-2">{o.customer?.name ?? o.customerName ?? "—"}</td>
                <td className="px-4 py-2">{o.channel}</td>
                <td className="px-4 py-2">{o.lines.length}</td>
                <td className="px-4 py-2">{formatMoney(o.codAmount)}</td>
                <td className="px-4 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${ORDER_STATUS_COLORS[o.status] ?? ""}`}>
                    {ORDER_STATUS_LABELS[o.status] ?? o.status}
                  </span>
                </td>
                <td className="px-4 py-2">{o.createdAt.toLocaleDateString("fr-FR")}</td>
                <td className="px-4 py-2 text-end">
                  <Link href={`/orders/${o.id}`} className="text-xs text-neutral-600 underline">
                    Détail
                  </Link>
                </td>
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
