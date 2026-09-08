import { test, expect, type Page } from "@playwright/test";

const OWNER_EMAIL = process.env.SEED_OWNER_EMAIL ?? "owner@amanebio.test";
const OWNER_PASSWORD = process.env.SEED_OWNER_PASSWORD ?? "changeme123";
const SUFFIX = Date.now().toString().slice(-6);
const PRODUCT_NAME = `Produit Import ${SUFFIX}`;
const PRODUCT_SKU = `PIMP-${SUFFIX}`;
const ORDER_NUMBER = `IMP-E2E-${SUFFIX}`;

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Adresse e-mail").fill(OWNER_EMAIL);
  await page.getByLabel("Mot de passe").fill(OWNER_PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).toHaveURL("/");
}

test("import CSV collé : mapping, aperçu, confirmation, commande créée", async ({ page }) => {
  await login(page);

  await page.goto("/products");
  await page.getByText("+ Nouvelle variante de produit").click();
  await page.getByLabel("Nom du produit").fill(PRODUCT_NAME);
  await page.getByLabel("SKU", { exact: true }).fill(PRODUCT_SKU);
  await page.getByLabel("Format").fill("500ml");
  await page.getByRole("button", { name: "Créer" }).click();
  await expect(page.getByText(PRODUCT_SKU)).toBeVisible();

  await page.goto("/orders/import");
  const csv = ["commande,sku,quantite,prix", `${ORDER_NUMBER},${PRODUCT_SKU},1,50`].join("\n");
  await page.getByPlaceholder(/Collez ici/).fill(csv);
  await page.getByRole("button", { name: "Analyser le texte collé" }).click();

  await expect(page.getByText("1 ligne(s) de données")).toBeVisible();

  // Columns are rendered in header order: commande, sku, quantite, prix.
  const mappingSection = page.locator("section", { hasText: "Faire correspondre les colonnes" });
  const mappingSelects = mappingSection.locator("select");
  await mappingSelects.nth(0).selectOption("orderNumber");
  await mappingSelects.nth(1).selectOption("sku");
  await mappingSelects.nth(2).selectOption("quantity");
  await mappingSelects.nth(3).selectOption("unitPrice");

  await page.getByRole("button", { name: "Prévisualiser" }).click();
  await expect(page.getByText(ORDER_NUMBER)).toBeVisible();
  await expect(page.getByText("Prête")).toBeVisible();

  await page.getByRole("button", { name: "Confirmer l'import" }).click();
  await expect(page.getByText("Import terminé")).toBeVisible();
  await expect(page.getByText("Créées : 1")).toBeVisible();

  await page.goto("/orders");
  await expect(page.locator("tbody tr", { hasText: ORDER_NUMBER })).toBeVisible();
});
