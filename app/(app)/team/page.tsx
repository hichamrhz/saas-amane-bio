import { getTranslations } from "next-intl/server";
import { requireSession } from "@/lib/auth/rbac";
import { listTeamMembers, listAffiliates, listCommissionRules } from "@/lib/team/service";
import { formatMoney } from "@/lib/numbers";
import { AffiliateForm } from "./affiliate-form";
import { CommissionRuleForm } from "./commission-rule-form";
import { ArchiveAffiliateButton } from "./archive-affiliate-button";

export default async function TeamPage() {
  const session = await requireSession();
  const t = await getTranslations("team");
  const tCommon = await getTranslations("common");
  const tRoles = await getTranslations("roles");
  const tSettings = await getTranslations("settings");
  const tSuppliers = await getTranslations("suppliers");

  const [users, affiliates, rules] = await Promise.all([
    listTeamMembers(session.organizationId),
    listAffiliates(session.organizationId),
    listCommissionRules(session.organizationId),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p className="max-w-2xl text-sm text-neutral-500">{t("description")}</p>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase text-neutral-500">{t("teamMembers")}</h2>
        <div className="overflow-x-auto rounded-lg border border-brand-100 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-cream-dark/60 text-start text-xs uppercase text-neutral-500">
              <tr>
                <Th>{tCommon("name")}</Th>
                <Th>{tSettings("email")}</Th>
                <Th>{tCommon("role")}</Th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-t border-neutral-100">
                  <td className="px-4 py-2">{u.name}</td>
                  <td className="px-4 py-2">{u.email}</td>
                  <td className="px-4 py-2">{tRoles(u.role)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase text-neutral-500">{t("affiliates")}</h2>
        <AffiliateForm />
        <div className="overflow-x-auto rounded-lg border border-brand-100 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-cream-dark/60 text-start text-xs uppercase text-neutral-500">
              <tr>
                <Th>{tCommon("name")}</Th>
                <Th>{tSuppliers("phone")}</Th>
                <Th>{tCommon("status")}</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {affiliates.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-neutral-400">
                    {t("emptyAffiliates")}
                  </td>
                </tr>
              )}
              {affiliates.map((a) => (
                <tr key={a.id} className="border-t border-neutral-100">
                  <td className="px-4 py-2">{a.name}</td>
                  <td className="px-4 py-2">{a.phone ?? "—"}</td>
                  <td className="px-4 py-2">
                    <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">
                      {tCommon("active")}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-end">
                    <ArchiveAffiliateButton id={a.id} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase text-neutral-500">{t("commissionRules")}</h2>
        <CommissionRuleForm
          users={users.map((u) => ({ id: u.id, name: u.name }))}
          affiliates={affiliates.map((a) => ({ id: a.id, name: a.name }))}
        />
        <div className="overflow-x-auto rounded-lg border border-brand-100 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-cream-dark/60 text-start text-xs uppercase text-neutral-500">
              <tr>
                <Th>{tCommon("name")}</Th>
                <Th>{t("role")}</Th>
                <Th>{t("rateTypeLabel")}</Th>
                <Th>{t("rateValue")}</Th>
                <Th>{t("effectiveFrom")}</Th>
              </tr>
            </thead>
            <tbody>
              {rules.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-neutral-400">
                    {t("emptyRules")}
                  </td>
                </tr>
              )}
              {rules.map((r) => (
                <tr key={r.id} className="border-t border-neutral-100">
                  <td className="px-4 py-2">{r.user?.name ?? r.affiliate?.name ?? "—"}</td>
                  <td className="px-4 py-2">{t(`roleKind.${r.roleKind}`)}</td>
                  <td className="px-4 py-2">{t(`rateType.${r.rateType}`)}</td>
                  <td className="px-4 py-2">
                    {r.rateType === "PERCENT_OF_SUBTOTAL"
                      ? `${r.rateValue.toString()}%`
                      : `${formatMoney(r.rateValue)} MAD`}
                  </td>
                  <td className="px-4 py-2">{r.effectiveFrom.toLocaleDateString("fr-FR")}</td>
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
