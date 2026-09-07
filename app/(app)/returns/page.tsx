import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requireSession } from "@/lib/auth/rbac";
import { listReturns } from "@/lib/returns/service";

export default async function ReturnsPage() {
  const session = await requireSession();
  const t = await getTranslations("returns");
  const tReturnStatus = await getTranslations("returnStatus");
  const returns = await listReturns(session.organizationId);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p className="max-w-2xl text-sm text-neutral-500">{t("description")}</p>
      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-start text-xs uppercase text-neutral-500">
            <tr>
              <Th>{t("tableOrder")}</Th>
              <Th>{t("tableExpectedArticles")}</Th>
              <Th>{t("tableStatus")}</Th>
              <Th>{t("tableDeclaredAt")}</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {returns.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-neutral-400">
                  {t("empty")}
                </td>
              </tr>
            )}
            {returns.map((r) => (
              <tr key={r.id} className="border-t border-neutral-100">
                <td className="px-4 py-2 font-mono text-xs">{r.order.orderNumber}</td>
                <td className="px-4 py-2">
                  {r.expectedLines
                    .map((l) => `${l.sourceMovement.articleVariant.article.name} · ${l.expectedQuantity.toString()}`)
                    .join(", ")}
                </td>
                <td className="px-4 py-2">{tReturnStatus(r.status)}</td>
                <td className="px-4 py-2">{r.announcedAt.toLocaleDateString("fr-FR")}</td>
                <td className="px-4 py-2 text-end">
                  <Link href={`/orders/${r.orderId}`} className="text-xs text-neutral-600 underline">
                    {t("process")}
                  </Link>
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
