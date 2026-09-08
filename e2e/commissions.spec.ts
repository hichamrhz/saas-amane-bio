import { test, expect, type Page } from "@playwright/test";

const OWNER_EMAIL = process.env.SEED_OWNER_EMAIL ?? "owner@amanebio.test";
const OWNER_PASSWORD = process.env.SEED_OWNER_PASSWORD ?? "changeme123";
const SUFFIX = Date.now().toString().slice(-6);
const PRODUCT_NAME = `Produit Comm ${SUFFIX}`;
const PRODUCT_SKU = `PCOM-${SUFFIX}`;
const CARTON_NAME = `Carton Comm ${SUFFIX}`;
const CARTON_SKU = `CCOM-${SUFFIX}`;
const AFFILIATE_NAME = `Affilié E2E ${SUFFIX}`;
const BOTTLE_COUNT = 100_000 + Math.floor(Math.random() * 50_000);

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Adresse e-mail").fill(OWNER_EMAIL);
  await page.getByLabel("Mot de passe").fill(OWNER_PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).toHaveURL("/");
}

test("commission d'affilié accordée à la livraison, puis versement partiel reflété dans le solde", async ({ page }) => {
  await login(page);

  // Product + packaging + opening stock + a recipe covering exactly this run's bottle count.
  await page.goto("/products");
  await page.getByText("+ Nouvelle variante de produit").click();
  await page.getByLabel("Nom du produit").fill(PRODUCT_NAME);
  await page.getByLabel("SKU", { exact: true }).fill(PRODUCT_SKU);
  await page.getByLabel("Format").fill("500ml");
  await page.getByRole("button", { name: "Créer" }).click();
  await expect(page.getByText(PRODUCT_SKU)).toBeVisible();

  await page.goto("/packaging");
  await page.getByText("+ Nouveau consommable").click();
  await page.getByLabel("Type de consommable").selectOption("CARTON");
  await page.getByLabel("Nom", { exact: true }).fill(CARTON_NAME);
  await page.getByLabel("SKU", { exact: true }).fill(CARTON_SKU);
  await page.getByLabel("Format").fill("standard");
  await page.getByRole("button", { name: "Créer" }).click();
  await expect(page.getByText(CARTON_SKU)).toBeVisible();

  await page.goto("/purchases");
  const receptionForm = page.locator("details", { hasText: "achat ou stock d'ouverture" });
  async function receiveOpening(articleLabel: string, quantity: string) {
    await receptionForm.getByLabel("Type de réception").selectOption("OPENING_STOCK");
    await receptionForm.getByLabel("Article").selectOption({ label: articleLabel });
    await receptionForm.getByLabel("Quantité").fill(quantity);
    await receptionForm.getByLabel("Emplacement de destination").selectOption({ label: "Chez moi" });
    await receptionForm.getByRole("button", { name: "Enregistrer la réception" }).click();
    await expect(page.getByText(`${articleLabel.split(" · ")[0]} · ${quantity}`)).toBeVisible();
  }
  await receiveOpening(`${PRODUCT_NAME} · 500ml (${PRODUCT_SKU})`, String(BOTTLE_COUNT + 10));
  await receiveOpening(`${CARTON_NAME} · standard (${CARTON_SKU})`, "10");

  await page.goto("/recipes");
  await page.getByText("+ Nouvelle recette d'emballage").click();
  const recipeDetails = page.locator("details", { hasText: "Nouvelle recette d'emballage" });
  await recipeDetails.getByLabel("Nom").fill(`Commission ${SUFFIX}`);
  await recipeDetails.getByLabel("Min. bouteilles").fill(String(BOTTLE_COUNT));
  await recipeDetails.getByLabel("Max. bouteilles").fill(String(BOTTLE_COUNT));
  await recipeDetails
    .locator('select[name="component-0-articleVariantId"]')
    .selectOption({ label: `${CARTON_NAME} · standard (${CARTON_SKU})` });
  await recipeDetails.locator('select[name="component-0-mode"]').selectOption("PER_ORDER");
  await recipeDetails.locator('input[name="component-0-quantityPerUnit"]').fill("1");
  await recipeDetails.getByRole("button", { name: "Créer" }).click();
  await expect(page.getByText(`Commission ${SUFFIX}`)).toBeVisible();

  // Affiliate + a commission rule for the referral role.
  await page.goto("/team");
  await page.getByText("+ Nouvel affilié").click();
  const affiliateForm = page.locator("details", { hasText: "Nouvel affilié" });
  await affiliateForm.getByLabel("Nom").fill(AFFILIATE_NAME);
  await affiliateForm.getByRole("button", { name: "Créer" }).click();
  await expect(page.getByText(AFFILIATE_NAME)).toBeVisible();

  await page.getByText("+ Nouveau tarif de commission").click();
  const ruleForm = page.locator("details", { hasText: "Nouveau tarif de commission" });
  await ruleForm.locator('select[name="payeeType"]').selectOption("AFFILIATE");
  await ruleForm.locator('select[name="affiliateId"]').selectOption({ label: AFFILIATE_NAME });
  await ruleForm.locator('select[name="rateType"]').selectOption("PERCENT_OF_SUBTOTAL");
  await ruleForm.locator('input[name="rateValue"]').fill("10");
  await ruleForm.getByRole("button", { name: "Créer" }).click();
  await expect(page.locator("tbody tr", { hasText: AFFILIATE_NAME })).toBeVisible();

  // Order referencing that affiliate: subtotal = BOTTLE_COUNT * 10, so the commission = 10% of that.
  const customerName = `Client Comm ${SUFFIX}`;
  await page.goto("/orders");
  await page.getByText("+ Nouvelle commande").click();
  const orderForm = page.locator("details", { hasText: "Nouvelle commande" });
  await orderForm.getByLabel("Client").fill(customerName);
  await orderForm.getByLabel("Affilié (commission)").selectOption({ label: AFFILIATE_NAME });
  await orderForm.getByLabel("Emplacement de sortie").selectOption({ label: "Chez moi" });
  await orderForm.locator('select[name="lineSku"]').first().selectOption({ label: `${PRODUCT_NAME} · 500ml (${PRODUCT_SKU})` });
  await orderForm.locator('input[name="lineQuantity"]').first().fill(String(BOTTLE_COUNT));
  await orderForm.locator('input[name="lineUnitPrice"]').first().fill("10");
  await orderForm.getByRole("button", { name: "Créer la commande" }).click();
  const orderRow = page.locator("tbody tr", { hasText: customerName });
  await expect(orderRow).toBeVisible();
  await orderRow.getByRole("link", { name: "Détail" }).click();

  const statusBadge = page.locator("span.rounded-full.bg-neutral-100");
  await page.getByRole("button", { name: "Confirmer (sortie de stock)" }).click();
  await expect(statusBadge).toHaveText("Confirmée");
  await page.getByRole("button", { name: "Marquer en livraison" }).click();
  await expect(statusBadge).toHaveText("En livraison");
  await page.getByRole("button", { name: "Marquer comme livrée" }).click();
  await expect(statusBadge).toHaveText("Livrée");

  // The referral commission (10% of BOTTLE_COUNT*10) must now be visible on /commissions.
  const expectedCommission = (BOTTLE_COUNT * 10 * 0.1).toFixed(2);
  await page.goto("/commissions");
  const balanceRow = page.locator("table").first().locator("tbody tr", { hasText: AFFILIATE_NAME });
  await expect(balanceRow).toBeVisible();
  await expect(balanceRow).toContainText(`${expectedCommission} MAD`);

  const ledgerRow = page.locator("table").last().locator("tbody tr", { hasText: AFFILIATE_NAME });
  await expect(ledgerRow).toBeVisible();
  await expect(ledgerRow).toContainText(`${expectedCommission} MAD`);

  // Partial payment must reduce the balance without ever changing what was earned.
  await page.getByText("+ Nouveau versement").click();
  const paymentForm = page.locator("details", { hasText: "Nouveau versement" });
  await paymentForm.locator('select[name="payeeType"]').selectOption("AFFILIATE");
  await paymentForm.locator('select[name="affiliateId"]').selectOption({ label: AFFILIATE_NAME });
  await paymentForm.locator('input[name="amount"]').fill("500");
  await paymentForm.getByRole("button", { name: "Enregistrer" }).click();

  await expect(balanceRow).toContainText("500.00 MAD"); // paid column
  await expect(balanceRow).toContainText(`${expectedCommission} MAD`); // earned column unchanged
});
