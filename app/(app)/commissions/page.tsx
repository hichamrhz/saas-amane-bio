import { requireSession } from "@/lib/auth/rbac";
import { ComingSoon } from "../_components/coming-soon";

export default async function CommissionsPage() {
  await requireSession();
  return (
    <ComingSoon
      title="Commissions et paiements"
      description="Commissions acquises à la livraison, séparation charge/paiement, paiements partiels et soldes reportés, fiches périodiques par personne (cahier des charges §11-13)."
    />
  );
}
