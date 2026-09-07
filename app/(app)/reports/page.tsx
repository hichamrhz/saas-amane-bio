import { requireSession } from "@/lib/auth/rbac";
import { ComingSoon } from "../_components/coming-soon";

export default async function ReportsPage() {
  await requireSession();
  return (
    <ComingSoon
      title="Rapports"
      description="Résultat de période, taux de confirmation/livraison par cohorte, marge par commande et alertes de réapprovisionnement (cahier des charges §16-17)."
    />
  );
}
