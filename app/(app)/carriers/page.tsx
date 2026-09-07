import { requireSession } from "@/lib/auth/rbac";
import { ComingSoon } from "../_components/coming-soon";

export default async function CarriersPage() {
  await requireSession();
  return (
    <ComingSoon
      title="Transporteurs et encaissements COD"
      description="Créances transporteur, rapprochement des versements (y compris partiels/groupés), frais retenus et écarts visibles (cahier des charges §15)."
    />
  );
}
