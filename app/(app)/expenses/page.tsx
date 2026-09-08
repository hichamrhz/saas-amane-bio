import { getTranslations } from "next-intl/server";
import { requireSession } from "@/lib/auth/rbac";
import { listExpenses } from "@/lib/expenses/service";
import { listProductArticles } from "@/lib/catalog/service";
import { formatMoney } from "@/lib/numbers";
import { ExpenseForm } from "./expense-form";
import { RecurringExpenseForm } from "./recurring-expense-form";

export default async function ExpensesPage() {
  const session = await requireSession();
  const t = await getTranslations("expenses");
  const tCommon = await getTranslations("common");

  const [expenses, products] = await Promise.all([
    listExpenses(session.organizationId),
    listProductArticles(session.organizationId),
  ]);
  const total = expenses.reduce((sum, e) => sum + Number(e.amount), 0);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p className="max-w-2xl text-sm text-neutral-500">{t("description")}</p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-brand-100 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-neutral-500">{t("total")}</p>
          <p className="mt-1 text-2xl font-semibold text-brand-800">{formatMoney(total)} MAD</p>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="flex-1">
          <ExpenseForm products={products} />
        </div>
        <div className="flex-1">
          <RecurringExpenseForm />
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-brand-100 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-cream-dark/60 text-start text-xs uppercase text-neutral-500">
            <tr>
              <Th>{tCommon("date")}</Th>
              <Th>{t("category")}</Th>
              <Th>{t("platformOrLabel")}</Th>
              <Th>{t("product")}</Th>
              <Th>{t("amount")}</Th>
              <Th>{t("leads")}</Th>
              <Th>{t("cpl")}</Th>
              <Th>{tCommon("notes")}</Th>
            </tr>
          </thead>
          <tbody>
            {expenses.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-neutral-400">
                  {t("empty")}
                </td>
              </tr>
            )}
            {expenses.map((e) => {
              const cpl = e.leads && e.leads > 0 ? (Number(e.amount) / e.leads).toFixed(2) : null;
              return (
                <tr key={e.id} className="border-t border-neutral-100">
                  <td className="px-4 py-2">{e.eventDate.toLocaleDateString("fr-FR")}</td>
                  <td className="px-4 py-2">
                    {e.category === "ADVERTISING" ? t("categoryAdvertising") : t("categoryOther")}
                  </td>
                  <td className="px-4 py-2">{e.platform ?? e.label ?? "—"}</td>
                  <td className="px-4 py-2">{e.article?.name ?? "—"}</td>
                  <td className="px-4 py-2">{formatMoney(e.amount)} MAD</td>
                  <td className="px-4 py-2">{e.leads ?? "—"}</td>
                  <td className="px-4 py-2">{cpl ? `${cpl} MAD` : "—"}</td>
                  <td className="px-4 py-2">{e.notes ?? "—"}</td>
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
