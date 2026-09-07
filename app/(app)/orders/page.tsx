import { requireSession } from "@/lib/auth/rbac";
import { ComingSoon } from "../_components/coming-soon";

export default async function OrdersPage() {
  await requireSession();
  return (
    <ComingSoon
      title="Commandes et import"
      description="Statuts Confirmed/Livrée/Retour, sortie de stock atomique à la confirmation, import copier-coller Google Sheets et CSV avec mapping des colonnes (cahier des charges §8-9)."
    />
  );
}
