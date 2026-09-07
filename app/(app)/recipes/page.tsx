import { requireSession } from "@/lib/auth/rbac";
import { listRecipes } from "@/lib/recipes/service";
import { prisma } from "@/lib/db/prisma";
import { RecipeForm } from "./recipe-form";
import { ArchiveButton } from "../_components/archive-button";
import { archiveRecipeAction } from "./actions";

const MODE_LABELS: Record<string, string> = {
  PER_BOTTLE: "/ bouteille",
  PER_PACKAGE: "/ colis",
  PER_ORDER: "/ commande",
};

export default async function RecipesPage() {
  const session = await requireSession();
  const [recipes, consumables] = await Promise.all([
    listRecipes(session.organizationId),
    prisma.articleVariant.findMany({
      where: {
        organizationId: session.organizationId,
        status: "ACTIVE",
        article: { kind: "CONSUMABLE", consumableType: { not: "LABEL" } },
      },
      include: { article: true },
      orderBy: [{ article: { name: "asc" } }],
    }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Recettes d&apos;emballage</h1>
      <p className="max-w-2xl text-sm text-neutral-500">
        Une recette décrit l&apos;emballage (carton, papier bulle, ruban, sel, sachet, carte,
        notice, cadeau) pour un nombre total de bouteilles dans la commande — jamais par
        produit, jamais les étiquettes (consommées uniquement à la réception coopérative).
      </p>

      <RecipeForm
        consumables={consumables.map((c) => ({ id: c.id, sku: c.sku, label: c.label, articleName: c.article.name }))}
      />

      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-start text-xs uppercase text-neutral-500">
            <tr>
              <Th>Nom</Th>
              <Th>Tranche (bouteilles)</Th>
              <Th>Bouteilles/colis</Th>
              <Th>Composants (version courante)</Th>
              <Th>Statut</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {recipes.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-neutral-400">
                  Aucune recette pour le moment — la confirmation de commande sera bloquée
                  tant qu&apos;aucune recette ne couvre la tranche de bouteilles vendue.
                </td>
              </tr>
            )}
            {recipes.map((r) => {
              const version = r.versions[0];
              return (
                <tr key={r.id} className="border-t border-neutral-100 align-top">
                  <td className="px-4 py-2">{r.name}</td>
                  <td className="px-4 py-2">
                    {r.minBottles}–{r.maxBottles}
                  </td>
                  <td className="px-4 py-2">{r.bottlesPerPackage ?? "1 (défaut)"}</td>
                  <td className="px-4 py-2">
                    {version ? (
                      <ul className="list-disc ps-4">
                        {version.components.map((c) => (
                          <li key={c.id}>
                            {c.articleVariant.article.name} · {c.quantityPerUnit.toString()}{" "}
                            {MODE_LABELS[c.mode]}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-2">{r.archivedAt ? "Archivée" : "Active"}</td>
                  <td className="px-4 py-2 text-end">
                    {!r.archivedAt && <ArchiveButton id={r.id} action={archiveRecipeAction} />}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({ children }: { children?: React.ReactNode }) {
  return <th className="px-4 py-2 font-medium">{children}</th>;
}
