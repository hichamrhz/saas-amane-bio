import { test, expect, type Page } from "@playwright/test";

const OWNER_EMAIL = process.env.SEED_OWNER_EMAIL ?? "owner@amanebio.test";
const OWNER_PASSWORD = process.env.SEED_OWNER_PASSWORD ?? "changeme123";

const SUFFIX = Date.now().toString().slice(-6);
const PRODUCT_NAME = `Vinaigre Test ${SUFFIX}`;
const PRODUCT_SKU = `VIN-TEST-${SUFFIX}`;
const LABEL_NAME = `Étiquette Test ${SUFFIX}`;
const LABEL_SKU = `ETQ-TEST-${SUFFIX}`;

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Adresse e-mail").fill(OWNER_EMAIL);
  await page.getByLabel("Mot de passe").fill(OWNER_PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).toHaveURL("/");
}

test("boucle étiquettes -> coopérative -> réceptions (exemple obligatoire du cahier des charges)", async ({
  page,
}) => {
  await login(page);

  // 1. Create the product variant.
  await page.goto("/products");
  await page.getByText("+ Nouvelle variante de produit").click();
  await page.getByLabel("Nom du produit").fill(PRODUCT_NAME);
  await page.getByLabel("SKU", { exact: true }).fill(PRODUCT_SKU);
  await page.getByLabel("Format").fill("500ml");
  await page.getByRole("button", { name: "Créer" }).click();
  await expect(page.getByText(PRODUCT_SKU)).toBeVisible();

  // 2. Create the label consumable, mapped to that product.
  await page.goto("/packaging");
  await page.getByText("+ Nouveau consommable").click();
  await page.getByLabel("Type de consommable").selectOption("LABEL");
  await page.getByLabel("Nom", { exact: true }).fill(LABEL_NAME);
  await page.getByLabel("SKU", { exact: true }).fill(LABEL_SKU);
  await page.getByLabel("Format").fill("500ml");
  await page
    .getByLabel("Produit associé (uniquement pour une étiquette)")
    .selectOption({ label: `${PRODUCT_NAME} · 500ml (${PRODUCT_SKU})` });
  await page.getByRole("button", { name: "Créer" }).click();
  await expect(page.getByText(LABEL_SKU)).toBeVisible();

  // 3. Buy 2000 labels, received at "Chez moi".
  await page.goto("/purchases");
  const purchaseForm = page.locator("details", { hasText: "achat ou stock d'ouverture" });
  await purchaseForm.getByLabel("Article").selectOption({
    label: `${LABEL_NAME} · 500ml (${LABEL_SKU})`,
  });
  await purchaseForm.getByLabel("Quantité").fill("2000");
  await purchaseForm.getByLabel("Emplacement de destination").selectOption({ label: "Chez moi" });
  await purchaseForm.getByRole("button", { name: "Enregistrer la réception" }).click();
  await expect(page.getByText(`${LABEL_NAME} · 2000`)).toBeVisible();

  // 4. Transfer 1500 labels to the cooperative.
  await page.goto("/cooperative");
  const transferForm = page.locator("details", { hasText: "Nouveau transfert" });
  await transferForm
    .getByLabel("Étiquette / consommable")
    .selectOption({ label: `${LABEL_NAME} · 500ml (${LABEL_SKU})` });
  await transferForm.getByLabel("Quantité").fill("1500");
  await transferForm.getByLabel("Depuis").selectOption({ label: "Chez moi" });
  await transferForm.getByLabel("Vers").selectOption({ label: "Coopérative" });
  await transferForm.getByRole("button", { name: "Transférer" }).click();
  const transferRow = page.locator("tbody tr", { hasText: LABEL_NAME }).first();
  await expect(transferRow).toContainText("1500");

  // 5. Receive 200 bottles from the cooperative.
  const receptionForm = page.locator("details", { hasText: "Nouvelle réception coopérative" });
  const receptionRows = page.locator("tbody tr", { hasText: PRODUCT_NAME });
  async function receiveBottles(quantity: string, expectedRowCount: number) {
    await receptionForm.getByLabel("Article").selectOption({
      label: `${PRODUCT_NAME} · 500ml (${PRODUCT_SKU})`,
    });
    await receptionForm.getByLabel("Quantité").fill(quantity);
    await receptionForm.getByLabel("Emplacement de destination").selectOption({ label: "Chez moi" });
    await receptionForm
      .getByLabel("Emplacement coopérative (source des étiquettes)")
      .selectOption({ label: "Coopérative" });
    await receptionForm.getByRole("button", { name: "Enregistrer la réception" }).click();
    // Wait for the reception to actually land (not just for the click to fire)
    // before starting the next one, and surface any form error otherwise.
    await expect(receptionRows).toHaveCount(expectedRowCount, { timeout: 10_000 });
  }
  await receiveBottles("200", 1);

  // 6. Receive 400 more.
  await receiveBottles("400", 2);

  // 7. Verify the exact numbers from the obligatory example: 500 chez moi,
  // 900 chez la coopérative, 600 bouteilles reçues.
  await page.goto("/inventory");
  const summaryTable = page.locator("table").first();
  await expect(summaryTable.getByText(LABEL_NAME)).toHaveCount(2);

  const rows = summaryTable.locator("tbody tr");
  const rowTexts = await rows.allTextContents();

  const labelHomeRow = rowTexts.find((t) => t.includes(LABEL_SKU) && t.includes("Chez moi"));
  const labelCoopRow = rowTexts.find((t) => t.includes(LABEL_SKU) && t.includes("Coopérative"));
  const productRow = rowTexts.find((t) => t.includes(PRODUCT_SKU));

  expect(labelHomeRow).toBeTruthy();
  expect(labelCoopRow).toBeTruthy();
  expect(productRow).toBeTruthy();
  expect(labelHomeRow).toContain("500");
  expect(labelCoopRow).toContain("900");
  expect(productRow).toContain("600");
});
