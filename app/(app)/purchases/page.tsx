import { requireSession } from "@/lib/auth/rbac";
import { listSuppliers, listLocations } from "@/lib/purchasing/suppliers";
import { listReceptions } from "@/lib/purchasing/receptions";
import { prisma } from "@/lib/db/prisma";
import { SupplierForm } from "./supplier-form";
import { ReceptionForm } from "../_components/reception-form";
import { createPurchaseReceptionAction } from "./actions";
import { RECEPTION_KIND_LABELS } from "@/lib/inventory/labels";

export default async function PurchasesPage() {
  const session = await requireSession();

  const [suppliers, locations, variants, receptions] = await Promise.all([
    listSuppliers(session.organizationId),
    listLocations(session.organizationId),
    prisma.articleVariant.findMany({
      where: { organizationId: session.organizationId, status: "ACTIVE" },
      include: { article: true },
      orderBy: [{ article: { name: "asc" } }],
    }),
    listReceptions(session.organizationId, ["SUPPLIER_PURCHASE", "OPENING_STOCK"]),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Achats et fournisseurs</h1>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase text-neutral-500">Fournisseurs</h2>
        <SupplierForm />
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {suppliers.map((s) => (
            <li key={s.id} className="rounded-md border border-neutral-200 bg-white p-3 text-sm">
              <p className="font-medium">{s.name}</p>
              {s.phone && <p className="text-neutral-500">{s.phone}</p>}
              {s.leadTimeDays != null && (
                <p className="text-neutral-500">Délai : {s.leadTimeDays} j</p>
              )}
            </li>
          ))}
          {suppliers.length === 0 && (
            <li className="text-sm text-neutral-400">Aucun fournisseur pour le moment.</li>
          )}
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase text-neutral-500">Réceptions</h2>
        <ReceptionForm
          title="+ Nouvelle réception (achat ou stock d'ouverture)"
          action={createPurchaseReceptionAction}
          kindOptions={[
            { value: "SUPPLIER_PURCHASE", label: "Achat fournisseur" },
            { value: "OPENING_STOCK", label: "Stock d'ouverture" },
          ]}
          articles={variants.map((v) => ({
            id: v.id,
            sku: v.sku,
            label: v.label,
            articleName: v.article.name,
          }))}
          locations={locations.map((l) => ({ id: l.id, name: l.name, kind: l.kind }))}
        />

        <div className="overflow-x-auto rounded-lg border border-brand-100 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-cream-dark/60 text-start text-xs uppercase text-neutral-500">
              <tr>
                <Th>Date</Th>
                <Th>Type</Th>
                <Th>Article</Th>
                <Th>Quantité</Th>
                <Th>Destination</Th>
                <Th>Référence</Th>
              </tr>
            </thead>
            <tbody>
              {receptions.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-neutral-400">
                    Aucune réception pour le moment.
                  </td>
                </tr>
              )}
              {receptions.map((r) => (
                <tr key={r.id} className="border-t border-neutral-100">
                  <td className="px-4 py-2">{r.eventDate.toLocaleDateString("fr-FR")}</td>
                  <td className="px-4 py-2">{RECEPTION_KIND_LABELS[r.kind]}</td>
                  <td className="px-4 py-2">
                    {r.lines.map((l) => `${l.articleVariant.article.name} · ${l.quantity}`).join(", ")}
                  </td>
                  <td className="px-4 py-2">
                    {r.lines.reduce((sum, l) => sum + Number(l.quantity), 0)}
                  </td>
                  <td className="px-4 py-2">{r.location.name}</td>
                  <td className="px-4 py-2">{r.reference ?? "—"}</td>
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
