import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { auth } from "@/auth";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) redirect("/");

  const t = await getTranslations("auth");

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-4">
      <div className="w-full max-w-sm rounded-xl border border-neutral-200 bg-white p-8 shadow-sm">
        <h1 className="mb-6 text-center text-xl font-semibold text-neutral-900">
          {t("signInTitle")}
        </h1>
        <LoginForm
          emailLabel={t("email")}
          passwordLabel={t("password")}
          submitLabel={t("submit")}
          invalidCredentialsLabel={t("invalidCredentials")}
        />
      </div>
    </div>
  );
}
