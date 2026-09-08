import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { createOrder, confirmOrder, deliverOrder } from "@/lib/orders/service";
import {
  createExpense,
  generateRecurringExpense,
  getAdSpendBreakdown,
  ExpenseError,
} from "@/lib/expenses/service";
import { getPeriodReport, getLowStockAlerts } from "@/lib/reports/service";
import {
  createTestContext,
  createProductVariant,
  createConsumableVariant,
  createTestRecipe,
  seedOpeningStock,
} from "./helpers/fixtures";

describe("dépenses : charges récurrentes idempotentes (cahier des charges §14)", () => {
  it("générer deux fois la même charge pour le même mois échoue la deuxième fois", async () => {
    const ctx = await createTestContext();
    const key = `abonnement-${randomUUID().slice(0, 8)}`;

    await generateRecurringExpense({
      organizationId: ctx.organizationId,
      createdById: ctx.userId,
      category: "OTHER",
      label: "Abonnement test",
      amount: "150",
      recurrenceKey: key,
      year: 2026,
      month: 3,
    });

    await expect(
      generateRecurringExpense({
        organizationId: ctx.organizationId,
        createdById: ctx.userId,
        category: "OTHER",
        label: "Abonnement test",
        amount: "150",
        recurrenceKey: key,
        year: 2026,
        month: 3,
      })
    ).rejects.toBeInstanceOf(ExpenseError);
  });

  it("la même clé pour un mois différent génère une charge distincte", async () => {
    const ctx = await createTestContext();
    const key = `abonnement-${randomUUID().slice(0, 8)}`;

    await generateRecurringExpense({
      organizationId: ctx.organizationId,
      createdById: ctx.userId,
      category: "OTHER",
      label: "Abonnement test",
      amount: "150",
      recurrenceKey: key,
      year: 2026,
      month: 3,
    });
    await generateRecurringExpense({
      organizationId: ctx.organizationId,
      createdById: ctx.userId,
      category: "OTHER",
      label: "Abonnement test",
      amount: "150",
      recurrenceKey: key,
      year: 2026,
      month: 4,
    });

    const from = new Date(Date.UTC(2026, 0, 1));
    const to = new Date(Date.UTC(2026, 11, 31));
    const report = await getPeriodReport(ctx.organizationId, from, to);
    expect(report.expenses).toBe("300");
  });

  it("une dépense publicitaire sans plateforme est rejetée", async () => {
    const ctx = await createTestContext();
    await expect(
      createExpense({
        organizationId: ctx.organizationId,
        createdById: ctx.userId,
        category: "ADVERTISING",
        amount: "100",
        eventDate: new Date(),
      })
    ).rejects.toBeInstanceOf(ExpenseError);
  });
});

describe("rapports : cohortes honnêtes, jamais de division par zéro (cahier des charges §17, test d'acceptation #27)", () => {
  it("aucune commande sur la période : taux à null, jamais 0% ni NaN", async () => {
    const ctx = await createTestContext();
    const from = new Date(Date.UTC(2020, 0, 1));
    const to = new Date(Date.UTC(2020, 0, 31));

    const report = await getPeriodReport(ctx.organizationId, from, to);
    expect(report.ordersPlaced).toBe(0);
    expect(report.confirmationRate).toBeNull();
    expect(report.deliveryRate).toBeNull();
    expect(report.revenue).toBe("0");
    expect(report.netMargin).toBe("0");
  });

  it("commande livrée dans la période : revenu, coût, commission et dépense agrégés correctement", async () => {
    const ctx = await createTestContext();
    const product = await createProductVariant(ctx.organizationId, {
      name: "Vinaigre rapport",
      sku: `REP-${randomUUID().slice(0, 6)}`,
    });
    const carton = await createConsumableVariant(ctx.organizationId, {
      name: "Carton rapport",
      sku: `CREP-${randomUUID().slice(0, 6)}`,
      consumableType: "CARTON",
    });
    await createTestRecipe({
      organizationId: ctx.organizationId,
      name: "Recette rapport",
      minBottles: 1,
      maxBottles: 9999,
      bottlesPerPackage: 5,
      components: [{ articleVariantId: carton.id, mode: "PER_PACKAGE", quantityPerUnit: "1" }],
    });
    await seedOpeningStock({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      articleVariantId: product.id,
      locationId: ctx.internal.id,
      quantity: "1000",
      unitCost: "10",
    });
    await seedOpeningStock({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      articleVariantId: carton.id,
      locationId: ctx.internal.id,
      quantity: "100",
      unitCost: "3",
    });

    const order = await createOrder({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      channel: "WHATSAPP",
      locationId: ctx.internal.id,
      placedAt: new Date(),
      lines: [{ articleVariantId: product.id, quantity: "2", unitPrice: "100" }], // subtotal 200
    });
    await confirmOrder(ctx.organizationId, ctx.userId, order.id);
    await deliverOrder(ctx.organizationId, ctx.userId, order.id);

    await createExpense({
      organizationId: ctx.organizationId,
      createdById: ctx.userId,
      category: "ADVERTISING",
      platform: "FACEBOOK",
      amount: "50",
      eventDate: new Date(),
    });

    const from = new Date();
    from.setDate(from.getDate() - 1);
    const to = new Date();
    to.setDate(to.getDate() + 1);

    const report = await getPeriodReport(ctx.organizationId, from, to);
    expect(report.ordersPlaced).toBe(1);
    expect(report.ordersConfirmed).toBe(1);
    expect(report.ordersDelivered).toBe(1);
    expect(report.confirmationRate).toBe(1);
    expect(report.deliveryRate).toBe(1);
    expect(report.revenue).toBe("200");
    // cogs = 2 bottles * 10 (product) + 1 carton * 3 (packaging) = 23
    expect(report.cogs).toBe("23");
    expect(report.expenses).toBe("50");
    // netMargin = 200 - 23 - 0 (no commission rule configured) - 50 = 127
    expect(report.netMargin).toBe("127");
  });
});

describe("suivi publicitaire : leads, CPL et lien produit (cahier des charges §14, inspiré du media buying)", () => {
  it("le CPL se déduit du montant et des leads, jamais stocké ni divisé par zéro", async () => {
    const ctx = await createTestContext();
    const from = new Date();
    from.setDate(from.getDate() - 1);
    const to = new Date();
    to.setDate(to.getDate() + 1);

    await createExpense({
      organizationId: ctx.organizationId,
      createdById: ctx.userId,
      category: "ADVERTISING",
      platform: "FACEBOOK",
      amount: "100",
      leads: 20,
      eventDate: new Date(),
    });
    // Une dépense sans leads renseignés ne doit jamais produire un CPL à 0 :
    // elle doit simplement ne pas peser sur le calcul du CPL (Spend et Leads
    // s'additionnent séparément, seul le total dérivé compte).
    await createExpense({
      organizationId: ctx.organizationId,
      createdById: ctx.userId,
      category: "ADVERTISING",
      platform: "GOOGLE",
      amount: "50",
      eventDate: new Date(),
    });

    const breakdown = await getAdSpendBreakdown(ctx.organizationId, from, to);
    expect(breakdown.totalSpend).toBe("150");
    expect(breakdown.totalLeads).toBe(20);
    expect(breakdown.totalCpl).toBe("7.50"); // 150 / 20

    const facebook = breakdown.byPlatform.find((r) => r.key === "FACEBOOK");
    expect(facebook?.spend).toBe("100");
    expect(facebook?.cpl).toBe("5.00");

    const google = breakdown.byPlatform.find((r) => r.key === "GOOGLE");
    expect(google?.spend).toBe("50");
    expect(google?.leads).toBe(0);
    expect(google?.cpl).toBeNull(); // jamais 0 quand il n'y a rien à diviser
  });

  it("aucune dépense publicitaire sur la période : totaux à zéro, CPL à null", async () => {
    const ctx = await createTestContext();
    const from = new Date(Date.UTC(2020, 0, 1));
    const to = new Date(Date.UTC(2020, 0, 31));

    const breakdown = await getAdSpendBreakdown(ctx.organizationId, from, to);
    expect(breakdown.totalSpend).toBe("0");
    expect(breakdown.totalLeads).toBe(0);
    expect(breakdown.totalCpl).toBeNull();
    expect(breakdown.byPlatform).toHaveLength(0);
    expect(breakdown.byProduct).toHaveLength(0);
  });

  it("une dépense liée à un produit apparaît dans byProduct ; sans produit, elle n'y apparaît pas", async () => {
    const ctx = await createTestContext();
    const product = await createProductVariant(ctx.organizationId, {
      name: `Vinaigre pub ${randomUUID().slice(0, 6)}`,
      sku: `PUB-${randomUUID().slice(0, 6)}`,
    });
    const from = new Date();
    from.setDate(from.getDate() - 1);
    const to = new Date();
    to.setDate(to.getDate() + 1);

    await createExpense({
      organizationId: ctx.organizationId,
      createdById: ctx.userId,
      category: "ADVERTISING",
      platform: "TIKTOK",
      amount: "80",
      leads: 10,
      articleId: product.articleId,
      eventDate: new Date(),
    });
    await createExpense({
      organizationId: ctx.organizationId,
      createdById: ctx.userId,
      category: "ADVERTISING",
      platform: "TIKTOK",
      amount: "20",
      eventDate: new Date(),
    });

    const breakdown = await getAdSpendBreakdown(ctx.organizationId, from, to);
    expect(breakdown.totalSpend).toBe("100");
    expect(breakdown.byProduct).toHaveLength(1);
    expect(breakdown.byProduct[0].spend).toBe("80");
    expect(breakdown.byProduct[0].cpl).toBe("8.00");
  });

  it("un articleId d'une autre organisation est rejeté", async () => {
    const ctx = await createTestContext();
    const other = await createTestContext();
    const foreignProduct = await createProductVariant(other.organizationId, {
      name: "Produit étranger",
      sku: `FOR-${randomUUID().slice(0, 6)}`,
    });

    await expect(
      createExpense({
        organizationId: ctx.organizationId,
        createdById: ctx.userId,
        category: "ADVERTISING",
        platform: "FACEBOOK",
        amount: "10",
        articleId: foreignProduct.articleId,
        eventDate: new Date(),
      })
    ).rejects.toBeInstanceOf(ExpenseError);
  });

  it("CAC = dépense publicitaire totale ÷ commandes livrées sur la période ; null sans commande livrée", async () => {
    const ctx = await createTestContext();
    const from = new Date(Date.UTC(2020, 0, 1));
    const to = new Date(Date.UTC(2020, 0, 31));

    // Pas de commande livrée sur cette période : CAC ne doit jamais valoir 0.
    await createExpense({
      organizationId: ctx.organizationId,
      createdById: ctx.userId,
      category: "ADVERTISING",
      platform: "FACEBOOK",
      amount: "100",
      leads: 10,
      eventDate: new Date(Date.UTC(2020, 0, 15)),
    });
    const noOrdersReport = await getPeriodReport(ctx.organizationId, from, to);
    expect(noOrdersReport.cac).toBeNull();

    const product = await createProductVariant(ctx.organizationId, {
      name: "Vinaigre CAC",
      sku: `CAC-${randomUUID().slice(0, 6)}`,
    });
    const carton = await createConsumableVariant(ctx.organizationId, {
      name: "Carton CAC",
      sku: `CCAC-${randomUUID().slice(0, 6)}`,
      consumableType: "CARTON",
    });
    await createTestRecipe({
      organizationId: ctx.organizationId,
      name: "Recette CAC",
      minBottles: 1,
      maxBottles: 9999,
      bottlesPerPackage: 5,
      components: [{ articleVariantId: carton.id, mode: "PER_PACKAGE", quantityPerUnit: "1" }],
    });
    await seedOpeningStock({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      articleVariantId: product.id,
      locationId: ctx.internal.id,
      quantity: "100",
      unitCost: "10",
    });
    await seedOpeningStock({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      articleVariantId: carton.id,
      locationId: ctx.internal.id,
      quantity: "50",
      unitCost: "3",
    });
    const order = await createOrder({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      channel: "WHATSAPP",
      locationId: ctx.internal.id,
      placedAt: new Date(),
      lines: [{ articleVariantId: product.id, quantity: "1", unitPrice: "50" }],
    });
    await confirmOrder(ctx.organizationId, ctx.userId, order.id);
    await deliverOrder(ctx.organizationId, ctx.userId, order.id);

    await createExpense({
      organizationId: ctx.organizationId,
      createdById: ctx.userId,
      category: "ADVERTISING",
      platform: "GOOGLE",
      amount: "50",
      eventDate: new Date(),
    });

    const today = new Date();
    const from2 = new Date(today);
    from2.setDate(from2.getDate() - 1);
    const to2 = new Date(today);
    to2.setDate(to2.getDate() + 1);
    const report = await getPeriodReport(ctx.organizationId, from2, to2);
    expect(report.ordersDelivered).toBe(1);
    expect(report.cac).toBe("50.00"); // 50 MAD de pub / 1 commande livrée
  });
});

describe("alertes de réapprovisionnement", () => {
  it("un article sous le seuil apparaît, un article au-dessus n'apparaît pas", async () => {
    const ctx = await createTestContext();
    const low = await createProductVariant(ctx.organizationId, {
      name: "Stock bas",
      sku: `LOW-${randomUUID().slice(0, 6)}`,
    });
    const high = await createProductVariant(ctx.organizationId, {
      name: "Stock haut",
      sku: `HIGH-${randomUUID().slice(0, 6)}`,
    });
    await seedOpeningStock({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      articleVariantId: low.id,
      locationId: ctx.internal.id,
      quantity: "3",
      unitCost: "10",
    });
    await seedOpeningStock({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      articleVariantId: high.id,
      locationId: ctx.internal.id,
      quantity: "500",
      unitCost: "10",
    });

    const alerts = await getLowStockAlerts(ctx.organizationId, "10");
    const skus = alerts.map((a) => a.sku);
    expect(skus).toContain(low.sku);
    expect(skus).not.toContain(high.sku);
  });
});
