import { test, expect, type Page } from "@playwright/test";

const OWNER_EMAIL = process.env.SEED_OWNER_EMAIL ?? "owner@amanebio.test";
const OWNER_PASSWORD = process.env.SEED_OWNER_PASSWORD ?? "changeme123";
const SUFFIX = Date.now().toString().slice(-6);
const PRODUCT_NAME = `Produit Cmd ${SUFFIX}`;
const PRODUCT_SKU = `PCMD-${SUFFIX}`;
const CARTON_NAME = `Carton Cmd ${SUFFIX}`;
const CARTON_SKU = `CCMD-${SUFFIX}`;
// A single exact bottle count, unique enough per run that this run's recipe
// range (min=max=BOTTLE_COUNT) can never overlap with another run's — the
// dev database's orgs/recipes persist across e2e runs, unlike the isolated
// per-test orgs the Vitest suite creates.
const BOTTLE_COUNT = 10_000 + Math.floor(Math.random() * 50_000);
const OPENING_STOCK = BOTTLE_COUNT + 100;

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Adresse e-mail").fill(OWNER_EMAIL);
  await page.getByLabel("Mot de passe").fill(OWNER_PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).toHaveURL("/");
}

test("cycle de vie complet d'une commande : création -> confirmation -> livraison -> retour", async ({ page }) => {
  await login(page);

  // Product + packaging consumable.
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

  // Opening stock for both via /purchases.
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
  await receiveOpening(`${PRODUCT_NAME} · 500ml (${PRODUCT_SKU})`, String(OPENING_STOCK));
  await receiveOpening(`${CARTON_NAME} · standard (${CARTON_SKU})`, "50");

  // Recipe covering exactly BOTTLE_COUNT bottles (unique to this run): 1 carton per order.
  await page.goto("/recipes");
  await page.getByText("+ Nouvelle recette d'emballage").click();
  const recipeDetails = page.locator("details", { hasText: "Nouvelle recette d'emballage" });
  await recipeDetails.getByLabel("Nom").fill(`Standard ${SUFFIX}`);
  await recipeDetails.getByLabel("Min. bouteilles").fill(String(BOTTLE_COUNT));
  await recipeDetails.getByLabel("Max. bouteilles").fill(String(BOTTLE_COUNT));
  const firstComponentArticleSelect = recipeDetails.locator('select[name="component-0-articleVariantId"]');
  await firstComponentArticleSelect.selectOption({ label: `${CARTON_NAME} · standard (${CARTON_SKU})` });
  await recipeDetails.locator('select[name="component-0-mode"]').selectOption("PER_ORDER");
  await recipeDetails.locator('input[name="component-0-quantityPerUnit"]').fill("1");
  await recipeDetails.getByRole("button", { name: "Créer" }).click();
  await expect(page.getByText(`Standard ${SUFFIX}`)).toBeVisible();

  // Create the order.
  await page.goto("/orders");
  await page.getByText("+ Nouvelle commande").click();
  const orderForm = page.locator("details", { hasText: "Nouvelle commande" });
  const customerName = `Client E2E ${SUFFIX}`;
  await orderForm.getByLabel("Client").fill(customerName);
  await orderForm.getByLabel("Emplacement de sortie").selectOption({ label: "Chez moi" });
  const firstLineSelect = orderForm.locator('select[name="lineSku"]').first();
  await firstLineSelect.selectOption({ label: `${PRODUCT_NAME} · 500ml (${PRODUCT_SKU})` });
  await orderForm.locator('input[name="lineQuantity"]').first().fill(String(BOTTLE_COUNT));
  await orderForm.locator('input[name="lineUnitPrice"]').first().fill("50");
  await orderForm.getByRole("button", { name: "Créer la commande" }).click();
  const orderRow = page.locator("tbody tr", { hasText: customerName });
  await expect(orderRow).toBeVisible();

  // Open the order detail page.
  await orderRow.getByRole("link", { name: "Détail" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  const statusBadge = page.locator("span.rounded-full.bg-neutral-100");

  // Confirm.
  await page.getByRole("button", { name: "Confirmer (sortie de stock)" }).click();
  await expect(statusBadge).toHaveText("Confirmée");

  // Ship.
  await page.getByRole("button", { name: "Marquer en livraison" }).click();
  await expect(statusBadge).toHaveText("En livraison");

  // Deliver.
  await page.getByRole("button", { name: "Marquer comme livrée" }).click();
  await expect(statusBadge).toHaveText("Livrée");

  // Verify stock was deducted.
  await page.goto("/inventory");
  const summaryTable = page.locator("table").first();
  await expect(summaryTable.getByText(PRODUCT_SKU)).toBeVisible();
  const productRow = summaryTable.locator("tbody tr", { hasText: PRODUCT_SKU });
  await expect(productRow).toContainText(String(OPENING_STOCK - BOTTLE_COUNT));

  // Declare and receive a return: 3 announced, only 2 healthy actually received.
  await page.goto("/orders");
  await orderRow.getByRole("link", { name: "Détail" }).click();
  await page.getByText("Déclarer un retour").click();
  const declareForm = page.locator("details", { hasText: "Déclarer un retour" });
  const declareProductRow = declareForm.locator("div", { hasText: PRODUCT_NAME }).last();
  await declareProductRow.getByPlaceholder("Attendu").fill("3");
  await declareForm.getByRole("button", { name: "Déclarer le retour" }).click();
  await expect(statusBadge).toHaveText("Retour annoncé");

  const receiveForm = page.locator("div", { has: page.getByRole("heading", { name: "Réceptionner le retour" }) });
  const receiveProductRow = receiveForm.locator("tbody tr", { hasText: PRODUCT_NAME });
  await receiveProductRow.locator('input[name="receivedQuantity"]').fill("2");
  await receiveProductRow.locator('input[name="healthyQuantity"]').fill("2");
  await receiveForm.getByRole("button", { name: "Enregistrer la réception" }).click();
  await expect(statusBadge).toHaveText("Retour reçu");

  await page.goto("/inventory");
  await expect(productRow).toContainText(String(OPENING_STOCK - BOTTLE_COUNT + 2));
});
