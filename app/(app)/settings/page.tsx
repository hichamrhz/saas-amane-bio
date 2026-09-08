import { getTranslations } from "next-intl/server";
import { requireSession } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/prisma";

export default async function SettingsPage() {
  const session = await requireSession();
  const t = await getTranslations("settings");
  const tRoles = await getTranslations("roles");
  const tCommon = await getTranslations("common");

  const [organization, users] = await Promise.all([
    prisma.organization.findUniqueOrThrow({ where: { id: session.organizationId } }),
    prisma.user.findMany({
      where: { organizationId: session.organizationId },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>

      <section className="rounded-lg border border-brand-100 bg-white p-4 text-sm">
        <h2 className="mb-2 font-semibold text-neutral-800">{t("organization")}</h2>
        <p>{t("orgName", { name: organization.name })}</p>
        <p>{t("currency", { currency: organization.currency })}</p>
        <p>{t("timezone", { tz: organization.timezone })}</p>
      </section>

      <section className="rounded-lg border border-brand-100 bg-white p-4 text-sm">
        <h2 className="mb-2 font-semibold text-neutral-800">{t("users")}</h2>
        <table className="w-full text-sm">
          <thead className="text-start text-xs uppercase text-neutral-500">
            <tr>
              <th className="px-2 py-1 font-medium">{tCommon("name")}</th>
              <th className="px-2 py-1 font-medium">{t("email")}</th>
              <th className="px-2 py-1 font-medium">{tCommon("role")}</th>
              <th className="px-2 py-1 font-medium">{tCommon("status")}</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t border-neutral-100">
                <td className="px-2 py-1">{u.name}</td>
                <td className="px-2 py-1">{u.email}</td>
                <td className="px-2 py-1">{tRoles(u.role)}</td>
                <td className="px-2 py-1">
                  {u.status === "ACTIVE" ? tCommon("active") : tCommon("archived")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-xs text-neutral-400">{t("usersComingSoon")}</p>
      </section>
    </div>
  );
}
