import { requireSession } from "@/lib/auth/rbac";
import { ComingSoon } from "../_components/coming-soon";

export default async function ReturnsPage() {
  await requireSession();
  return (
    <ComingSoon
      title="Retours"
      description="Déclaration puis réception réelle des retours, lignes attendu/reçu/sain/abîmé, écarts ouverts et résolution de litige (cahier des charges §10)."
    />
  );
}
