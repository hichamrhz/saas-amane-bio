import { requireSession } from "@/lib/auth/rbac";
import { listStockMovements, getOnHandSummary } from "@/lib/inventory/stock";
import { MOVEMENT_TYPE_LABELS } from "@/lib/inventory/labels";

export default async function InventoryPage() {
  const session = await requireSession();
  const [movements, summary] = await Promise.all([
    listStockMovements(session.organizationId),
    getOnHandSummary(session.organizationId),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Inventaires et mouvements</h1>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase text-neutral-500">
          Stock disponible par emplacement
        </h2>
        <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-start text-xs uppercase text-neutral-500">
              <tr>
                <Th>Article</Th>
                <Th>Emplacement</Th>
                <Th>Quantité</Th>
                <Th>Unité</Th>
              </tr>
            </thead>
            <tbody>
              {summary.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-neutral-400">
                    Aucun mouvement enregistré pour le moment.
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
        <h2 className="text-sm font-semibold uppercase text-neutral-500">Journal des mouvements</h2>
        <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-start text-xs uppercase text-neutral-500">
              <tr>
                <Th>Date</Th>
                <Th>Type</Th>
                <Th>Article</Th>
                <Th>Emplacement</Th>
                <Th>Quantité</Th>
                <Th>Coût unitaire</Th>
                <Th>Par</Th>
              </tr>
            </thead>
            <tbody>
              {movements.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-neutral-400">
                    Aucun mouvement pour le moment.
                  </td>
                </tr>
              )}
              {movements.map((m) => (
                <tr key={m.id} className="border-t border-neutral-100">
                  <td className="px-4 py-2">{m.eventDate.toLocaleDateString("fr-FR")}</td>
                  <td className="px-4 py-2">{MOVEMENT_TYPE_LABELS[m.type] ?? m.type}</td>
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
