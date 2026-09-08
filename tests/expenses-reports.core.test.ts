import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { createOrder, confirmOrder, deliverOrder } from "@/lib/orders/service";
import { createExpense, generateRecurringExpense, ExpenseError } from "@/lib/expenses/service";
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
