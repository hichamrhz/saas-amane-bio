import { requireSession } from "@/lib/auth/rbac";
import { listLocations } from "@/lib/purchasing/suppliers";
import { listReceptions } from "@/lib/purchasing/receptions";
import { listCooperativeTransfers } from "@/lib/purchasing/transfers";
import { prisma } from "@/lib/db/prisma";
import { TransferForm } from "./transfer-form";
import { ReceptionForm } from "../_components/reception-form";
import { createCooperativeReceptionAction } from "./actions";

export default async function CooperativePage() {
  const session = await requireSession();

  const [locations, consumables, productVariants, transfers, receptions] = await Promise.all([
    listLocations(session.organizationId),
    prisma.articleVariant.findMany({
      where: { organizationId: session.organizationId, status: "ACTIVE", article: { kind: "CONSUMABLE" } },
      include: { article: true },
      orderBy: [{ article: { name: "asc" } }],
    }),
    prisma.articleVariant.findMany({
      where: { organizationId: session.organizationId, status: "ACTIVE", article: { kind: "PRODUCT" } },
      include: { article: true },
      orderBy: [{ article: { name: "asc" } }],
    }),
    listCooperativeTransfers(session.organizationId),
    listReceptions(session.organizationId, ["COOPERATIVE_PRODUCT"]),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Coopérative et réceptions</h1>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase text-neutral-500">
          Transferts vers la coopérative
        </h2>
        <TransferForm
          articles={consumables.map((v) => ({
            id: v.id,
            sku: v.sku,
            label: v.label,
            articleName: v.article.name,
          }))}
          locations={locations.map((l) => ({ id: l.id, name: l.name }))}
        />
        <div className="overflow-x-auto rounded-lg border border-brand-100 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-cream-dark/60 text-start text-xs uppercase text-neutral-500">
              <tr>
                <Th>Date</Th>
                <Th>Article</Th>
                <Th>Quantité</Th>
                <Th>Depuis</Th>
                <Th>Vers</Th>
              </tr>
            </thead>
            <tbody>
              {transfers.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-neutral-400">
                    Aucun transfert pour le moment.
                  </td>
                </tr>
              )}
              {transfers.map((t) => (
                <tr key={t.id} className="border-t border-neutral-100">
                  <td className="px-4 py-2">{t.eventDate.toLocaleDateString("fr-FR")}</td>
                  <td className="px-4 py-2">
                    {t.articleVariant.article.name} · {t.articleVariant.label}
                  </td>
                  <td className="px-4 py-2">{t.quantity.toString()}</td>
                  <td className="px-4 py-2">{t.fromLocation.name}</td>
                  <td className="px-4 py-2">{t.toLocation.name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase text-neutral-500">
          Réceptions de bouteilles (consomme les étiquettes)
        </h2>
        <ReceptionForm
          title="+ Nouvelle réception coopérative"
          action={createCooperativeReceptionAction}
          kindOptions={[{ value: "COOPERATIVE_PRODUCT", label: "Réception coopérative (bouteilles)" }]}
          articles={productVariants.map((v) => ({
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
                <Th>Produit</Th>
                <Th>Quantité</Th>
                <Th>Destination</Th>
              </tr>
            </thead>
            <tbody>
              {receptions.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-neutral-400">
                    Aucune réception coopérative pour le moment.
                  </td>
                </tr>
              )}
              {receptions.map((r) => (
                <tr key={r.id} className="border-t border-neutral-100">
                  <td className="px-4 py-2">{r.eventDate.toLocaleDateString("fr-FR")}</td>
                  <td className="px-4 py-2">
                    {r.lines.map((l) => l.articleVariant.article.name).join(", ")}
                  </td>
                  <td className="px-4 py-2">
                    {r.lines.reduce((sum, l) => sum + Number(l.quantity), 0)}
                  </td>
                  <td className="px-4 py-2">{r.location.name}</td>
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
