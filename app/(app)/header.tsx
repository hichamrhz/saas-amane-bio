import { getTranslations, getLocale } from "next-intl/server";
import { signOut } from "@/auth";
import type { Session } from "next-auth";
import { setLocaleAction } from "./locale-actions";

export async function Header({ session }: { session: Session["user"] }) {
  const t = await getTranslations();
  const locale = await getLocale();

  return (
    <header className="flex items-center justify-between border-b border-brand-100 bg-white px-6 py-3">
      <div className="text-sm text-neutral-600">
        <p className="font-medium text-neutral-900">{session.name}</p>
        <p>
          {t("dashboard.orgLabel", { org: session.organizationName })} ·{" "}
          {t("dashboard.roleLabel", { role: t(`roles.${session.role}`) })}
        </p>
      </div>
      <div className="flex items-center gap-4">
        <form action={setLocaleAction} className="flex gap-1 text-xs">
          <button
            type="submit"
            name="locale"
            value="fr"
            className={`rounded px-2 py-1 ${locale === "fr" ? "bg-brand-700 text-white" : "bg-cream-dark text-neutral-600"}`}
          >
            {t("settings.french")}
          </button>
          <button
            type="submit"
            name="locale"
            value="ar"
            className={`rounded px-2 py-1 ${locale === "ar" ? "bg-brand-700 text-white" : "bg-cream-dark text-neutral-600"}`}
          >
            {t("settings.arabic")}
          </button>
        </form>
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/login" });
          }}
        >
          <button type="submit" className="text-sm text-neutral-600 underline hover:text-brand-700">
            {t("auth.signOut")}
          </button>
        </form>
      </div>
    </header>
  );
}
