import { getTranslations } from "next-intl/server";
import { requireSession } from "@/lib/auth/rbac";
import { listArticleVariants } from "@/lib/catalog/service";
import { getOnHandByVariant } from "@/lib/inventory/stock";
import { PackagingForm } from "./packaging-form";
import { ArchiveButton } from "../_components/archive-button";
import { archiveConsumableVariantAction } from "./actions";

export default async function PackagingPage() {
  const session = await requireSession();
  const t = await getTranslations("catalog");
  const tCommon = await getTranslations("common");

  const [variants, productVariants] = await Promise.all([
    listArticleVariants(session.organizationId, "CONSUMABLE"),
    listArticleVariants(session.organizationId, "PRODUCT"),
  ]);
  const onHand = await getOnHandByVariant(
    session.organizationId,
    variants.map((v) => v.id)
  );

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Emballages et étiquettes</h1>
      <PackagingForm
        productVariants={productVariants.map((p) => ({
          id: p.id,
          sku: p.sku,
          label: p.label,
          articleName: p.article.name,
        }))}
      />
      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-start text-xs uppercase text-neutral-500">
            <tr>
              <Th>{t("sku")}</Th>
              <Th>Nom</Th>
              <Th>Type</Th>
              <Th>{t("label")}</Th>
              <Th>Produit associé</Th>
              <Th>{t("onHand")}</Th>
              <Th>{t("stockUnit")}</Th>
              <Th>Statut</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {variants.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-6 text-center text-neutral-400">
                  Aucun consommable pour le moment.
                </td>
              </tr>
            )}
            {variants.map((v) => (
              <tr key={v.id} className="border-t border-neutral-100">
                <td className="px-4 py-2 font-mono text-xs">{v.sku}</td>
                <td className="px-4 py-2">{v.article.name}</td>
                <td className="px-4 py-2">{v.article.consumableType}</td>
                <td className="px-4 py-2">{v.label}</td>
                <td className="px-4 py-2">
                  {v.productVariant
                    ? `${v.productVariant.article.name} · ${v.productVariant.label}`
                    : "—"}
                </td>
                <td className="px-4 py-2">{onHand.get(v.id) ?? "0"}</td>
                <td className="px-4 py-2">{v.stockUnitLabel}</td>
                <td className="px-4 py-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      v.status === "ACTIVE"
                        ? "bg-green-100 text-green-700"
                        : "bg-neutral-200 text-neutral-500"
                    }`}
                  >
                    {v.status === "ACTIVE" ? tCommon("active") : tCommon("archived")}
                  </span>
                </td>
                <td className="px-4 py-2 text-end">
                  {v.status === "ACTIVE" && (
                    <ArchiveButton id={v.id} action={archiveConsumableVariantAction} />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({ children }: { children?: React.ReactNode }) {
  return <th className="px-4 py-2 font-medium">{children}</th>;
}
