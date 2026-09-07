import { requireSession } from "@/lib/auth/rbac";
import { ComingSoon } from "../_components/coming-soon";

export default async function ExpensesPage() {
  await requireSession();
  return (
    <ComingSoon
      title="Dépenses et publicité"
      description="Saisie journalière publicité par plateforme, autres charges (UGC, abonnements, etc.), charges récurrentes idempotentes (cahier des charges §14)."
    />
  );
}
