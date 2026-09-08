import { getTranslations } from "next-intl/server";
import { requireSession } from "@/lib/auth/rbac";
import { listBalances, listCommissions, listPayments } from "@/lib/commissions/service";
import { listTeamMembers, listAffiliates } from "@/lib/team/service";
import { formatMoney } from "@/lib/numbers";
import { PaymentForm } from "./payment-form";
import { FixedSalaryForm } from "./fixed-salary-form";

export default async function CommissionsPage() {
  const session = await requireSession();
  const t = await getTranslations("commissions");
  const tTeam = await getTranslations("team");
  const tCommon = await getTranslations("common");

  const [balances, commissions, payments, users, affiliates] = await Promise.all([
    listBalances(session.organizationId),
    listCommissions(session.organizationId),
    listPayments(session.organizationId),
    listTeamMembers(session.organizationId),
    listAffiliates(session.organizationId),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p className="max-w-2xl text-sm text-neutral-500">{t("description")}</p>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase text-neutral-500">{t("balances")}</h2>
        <div className="overflow-x-auto rounded-lg border border-brand-100 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-cream-dark/60 text-start text-xs uppercase text-neutral-500">
              <tr>
                <Th>{tCommon("name")}</Th>
                <Th>{t("earned")}</Th>
                <Th>{t("paid")}</Th>
                <Th>{t("balance")}</Th>
              </tr>
            </thead>
            <tbody>
              {balances.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-neutral-400">
                    {t("emptyBalances")}
                  </td>
                </tr>
              )}
              {balances.map((b) => (
                <tr key={`${b.payeeType}-${b.userId ?? b.affiliateId}`} className="border-t border-neutral-100">
                  <td className="px-4 py-2">{b.name}</td>
                  <td className="px-4 py-2">{formatMoney(b.earned)} MAD</td>
                  <td className="px-4 py-2">{formatMoney(b.paid)} MAD</td>
                  <td className="px-4 py-2 font-medium">{formatMoney(b.balance)} MAD</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase text-neutral-500">{t("payments")}</h2>
        <PaymentForm
          users={users.map((u) => ({ id: u.id, name: u.name }))}
          affiliates={affiliates.map((a) => ({ id: a.id, name: a.name }))}
        />
        <div className="overflow-x-auto rounded-lg border border-brand-100 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-cream-dark/60 text-start text-xs uppercase text-neutral-500">
              <tr>
                <Th>{tCommon("date")}</Th>
                <Th>{tCommon("name")}</Th>
                <Th>{t("amount")}</Th>
                <Th>{tCommon("notes")}</Th>
              </tr>
            </thead>
            <tbody>
              {payments.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-neutral-400">
                    {t("emptyPayments")}
                  </td>
                </tr>
              )}
              {payments.map((p) => (
                <tr key={p.id} className="border-t border-neutral-100">
                  <td className="px-4 py-2">{p.paidAt.toLocaleDateString("fr-FR")}</td>
                  <td className="px-4 py-2">{p.user?.name ?? p.affiliate?.name ?? "—"}</td>
                  <td className="px-4 py-2">{formatMoney(p.amount)} MAD</td>
                  <td className="px-4 py-2">{p.notes ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase text-neutral-500">{t("fixedSalary")}</h2>
        <FixedSalaryForm users={users.map((u) => ({ id: u.id, name: u.name }))} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase text-neutral-500">{t("commissionLedger")}</h2>
        <div className="overflow-x-auto rounded-lg border border-brand-100 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-cream-dark/60 text-start text-xs uppercase text-neutral-500">
              <tr>
                <Th>{tCommon("date")}</Th>
                <Th>{tCommon("name")}</Th>
                <Th>{tTeam("role")}</Th>
                <Th>{t("order")}</Th>
                <Th>{t("amount")}</Th>
              </tr>
            </thead>
            <tbody>
              {commissions.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-neutral-400">
                    {t("emptyCommissions")}
                  </td>
                </tr>
              )}
              {commissions.map((c) => (
                <tr key={c.id} className="border-t border-neutral-100">
                  <td className="px-4 py-2">{c.earnedAt.toLocaleDateString("fr-FR")}</td>
                  <td className="px-4 py-2">{c.user?.name ?? c.affiliate?.name ?? "—"}</td>
                  <td className="px-4 py-2">{tTeam(`roleKind.${c.roleKind}`)}</td>
                  <td className="px-4 py-2 font-mono text-xs">{c.order?.orderNumber ?? "—"}</td>
                  <td className="px-4 py-2">{formatMoney(c.amount)} MAD</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Th({ children }: { children?: React.ReactNode }) {
  return <th className="px-4 py-2 font-medium">{children}</th>;
}
