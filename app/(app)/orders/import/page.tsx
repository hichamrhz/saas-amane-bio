import { requireRole } from "@/lib/auth/rbac";
import { getLastColumnMapping } from "@/lib/imports/service";
import { ImportWizard } from "./import-wizard";

export default async function OrderImportPage() {
  const session = await requireRole(["CONFIRMATION", "STOCK"]);
  const lastMapping = await getLastColumnMapping(session.organizationId);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Import de commandes (CSV / XLSX / copier-coller)</h1>
      <p className="max-w-2xl text-sm text-neutral-500">
        Une ligne par article, même numéro de commande pour les commandes multi-produits. Le
        mapping des colonnes est mémorisé et pré-rempli à partir de votre dernier import.
      </p>
      <ImportWizard initialMapping={lastMapping} />
    </div>
  );
}
