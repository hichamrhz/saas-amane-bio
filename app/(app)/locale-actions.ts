"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { LOCALE_COOKIE, isAppLocale } from "@/i18n/locale";

export async function setLocaleAction(formData: FormData) {
  const locale = formData.get("locale");
  if (typeof locale !== "string" || !isAppLocale(locale)) return;

  const cookieStore = await cookies();
  cookieStore.set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  revalidatePath("/", "layout");
}
