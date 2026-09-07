import { getTranslations } from "next-intl/server";
import { requireSession } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/prisma";

export default async function SettingsPage() {
  const session = await requireSession();
  const t = await getTranslations("settings");
  const tRoles = await getTranslations("roles");

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

      <section className="rounded-lg border border-neutral-200 bg-white p-4 text-sm">
        <h2 className="mb-2 font-semibold text-neutral-800">Organisation</h2>
        <p>Nom : {organization.name}</p>
        <p>Devise de reporting : {organization.currency}</p>
        <p>Fuseau horaire : {organization.timezone}</p>
      </section>

      <section className="rounded-lg border border-neutral-200 bg-white p-4 text-sm">
        <h2 className="mb-2 font-semibold text-neutral-800">Utilisateurs</h2>
        <table className="w-full text-sm">
          <thead className="text-start text-xs uppercase text-neutral-500">
            <tr>
              <th className="px-2 py-1 font-medium">Nom</th>
              <th className="px-2 py-1 font-medium">E-mail</th>
              <th className="px-2 py-1 font-medium">Rôle</th>
              <th className="px-2 py-1 font-medium">Statut</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t border-neutral-100">
                <td className="px-2 py-1">{u.name}</td>
                <td className="px-2 py-1">{u.email}</td>
                <td className="px-2 py-1">{tRoles(u.role)}</td>
                <td className="px-2 py-1">{u.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-xs text-neutral-400">
          La création et l&apos;édition d&apos;utilisateurs depuis cette page arrivera avec la
          phase équipe/permissions avancées — voir PROGRESS.md.
        </p>
      </section>
    </div>
  );
}
