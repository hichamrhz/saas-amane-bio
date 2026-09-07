import { requireSession } from "@/lib/auth/rbac";
import { ComingSoon } from "../_components/coming-soon";

export default async function TeamPage() {
  await requireSession();
  return (
    <ComingSoon
      title="Équipe et affiliés"
      description="Fiches employés (fixe/commission/mixte), règles de commission datées par rôle, fiches affiliés et rapports par affilié (cahier des charges §11-12)."
    />
  );
}
