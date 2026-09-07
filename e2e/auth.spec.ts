import { test, expect } from "@playwright/test";

const OWNER_EMAIL = process.env.SEED_OWNER_EMAIL ?? "owner@amanebio.test";
const OWNER_PASSWORD = process.env.SEED_OWNER_PASSWORD ?? "changeme123";

test("propriétaire peut se connecter, changer de langue en RTL, puis se déconnecter", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);

  await page.getByLabel("Adresse e-mail").fill(OWNER_EMAIL);
  await page.getByLabel("Mot de passe").fill(OWNER_PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();

  await expect(page).toHaveURL("/");
  await expect(page.getByRole("heading")).toContainText("Bienvenue");
  await expect(page.getByRole("link", { name: "Produits" })).toBeVisible();

  await page.getByRole("button", { name: "العربية" }).click();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.locator("html")).toHaveAttribute("lang", "ar");
  await expect(page.getByRole("link", { name: "المنتجات" })).toBeVisible();

  await page.getByRole("button", { name: "تسجيل الخروج" }).click();
  await expect(page).toHaveURL(/\/login$/);
});
