import { requireSession } from "@/lib/auth/rbac";
import { listCarriers } from "@/lib/carriers/service";
import { prisma } from "@/lib/db/prisma";
import { formatMoney } from "@/lib/numbers";
import { CarrierForm } from "./carrier-form";

export default async function CarriersPage() {
  const session = await requireSession();
  const carriers = await listCarriers(session.organizationId);

  const orders = await prisma.order.findMany({
    where: { organizationId: session.organizationId, carrierId: { not: null } },
    include: { carrier: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Transporteurs et encaissements COD</h1>
      <p className="max-w-2xl text-sm text-neutral-500">
        Fondations uniquement : affectation transporteur/suivi par commande et montant COD
        attendu. Le rapprochement des versements et les relevés transporteur (§15) restent à
        construire — voir PROGRESS.md.
      </p>

      <CarrierForm />

      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-start text-xs uppercase text-neutral-500">
            <tr>
              <Th>Nom</Th>
              <Th>Frais par défaut</Th>
              <Th>Notes</Th>
            </tr>
          </thead>
          <tbody>
            {carriers.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-neutral-400">
                  Aucun transporteur pour le moment.
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

      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-start text-xs uppercase text-neutral-500">
            <tr>
              <Th>Commande</Th>
              <Th>Transporteur</Th>
              <Th>Suivi</Th>
              <Th>Statut</Th>
              <Th>COD attendu</Th>
              <Th>Frais de livraison</Th>
            </tr>
          </thead>
          <tbody>
            {orders.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-neutral-400">
                  Aucune commande affectée à un transporteur pour le moment.
                </td>
              </tr>
            )}
            {orders.map((o) => (
              <tr key={o.id} className="border-t border-neutral-100">
                <td className="px-4 py-2 font-mono text-xs">{o.orderNumber}</td>
                <td className="px-4 py-2">{o.carrier?.name ?? "—"}</td>
                <td className="px-4 py-2">{o.trackingNumber ?? "—"}</td>
                <td className="px-4 py-2">{o.status}</td>
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
