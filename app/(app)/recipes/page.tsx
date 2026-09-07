import { requireSession } from "@/lib/auth/rbac";
import { ComingSoon } from "../_components/coming-soon";

export default async function RecipesPage() {
  await requireSession();
  return (
    <ComingSoon
      title="Recettes d'emballage"
      description="Recettes configurables par quantité de bouteilles, mode de calcul par produit/bouteille/colis/commande, versionnage et aperçu des consommations (cahier des charges §7)."
    />
  );
}
