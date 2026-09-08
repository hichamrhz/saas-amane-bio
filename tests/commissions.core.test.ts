import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { createOrder, confirmOrder, deliverOrder } from "@/lib/orders/service";
import { createAffiliate, createCommissionRule } from "@/lib/team/service";
import { listBalances, listCommissions, recordPayment, generateMonthlyFixedSalary, CommissionError } from "@/lib/commissions/service";
import {
  createTestContext,
  createProductVariant,
  createConsumableVariant,
  createTestRecipe,
  seedOpeningStock,
} from "./helpers/fixtures";

async function setupCommissionFixture() {
  const ctx = await createTestContext();

  const confirmationAgent = await prisma.user.create({
    data: {
      organizationId: ctx.organizationId,
      email: `confirm-${randomUUID().slice(0, 8)}@test.local`,
      name: "Agent Confirmation",
      passwordHash: "unused",
      role: "CONFIRMATION",
    },
  });
  const deliveryAgent = await prisma.user.create({
    data: {
      organizationId: ctx.organizationId,
      email: `delivery-${randomUUID().slice(0, 8)}@test.local`,
      name: "Agent Livraison",
      passwordHash: "unused",
      role: "STOCK",
    },
  });

  const product = await createProductVariant(ctx.organizationId, {
    name: "Vinaigre commission",
    sku: `COM-${randomUUID().slice(0, 6)}`,
  });
  const carton = await createConsumableVariant(ctx.organizationId, {
    name: "Carton",
    sku: `CTNC-${randomUUID().slice(0, 6)}`,
    consumableType: "CARTON",
  });

  await createTestRecipe({
    organizationId: ctx.organizationId,
    name: "Emballage commission",
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
    quantity: "1000",
    unitCost: "3",
  });

  return { ctx, confirmationAgent, deliveryAgent, product };
}

async function placeAndConfirm(
  ctx: Awaited<ReturnType<typeof createTestContext>>,
  product: { id: string },
  confirmedByUserId: string,
  quantity: string,
  unitPrice: string
) {
  const order = await createOrder({
    organizationId: ctx.organizationId,
    userId: confirmedByUserId,
    channel: "WHATSAPP",
    locationId: ctx.internal.id,
    placedAt: new Date(),
    lines: [{ articleVariantId: product.id, quantity, unitPrice }],
  });
  await confirmOrder(ctx.organizationId, confirmedByUserId, order.id);
  return order;
}

describe("commissions : accordées uniquement à la livraison (cahier des charges §11-13, test d'acceptation #17)", () => {
  it("aucune commission n'est créée à la confirmation ; les deux rôles sont crédités à la livraison", async () => {
    const { ctx, confirmationAgent, deliveryAgent, product } = await setupCommissionFixture();

    await createCommissionRule({
      organizationId: ctx.organizationId,
      createdById: ctx.userId,
      payeeType: "USER",
      userId: confirmationAgent.id,
      roleKind: "CONFIRMATION",
      rateType: "FIXED_PER_ORDER",
      rateValue: "20",
      effectiveFrom: new Date("2020-01-01"),
    });
    await createCommissionRule({
      organizationId: ctx.organizationId,
      createdById: ctx.userId,
      payeeType: "USER",
      userId: deliveryAgent.id,
      roleKind: "DELIVERY",
      rateType: "FIXED_PER_ORDER",
      rateValue: "15",
      effectiveFrom: new Date("2020-01-01"),
    });

    const order = await placeAndConfirm(ctx, product, confirmationAgent.id, "2", "50");

    const beforeDelivery = await prisma.commission.count({ where: { organizationId: ctx.organizationId } });
    expect(beforeDelivery).toBe(0);

    await deliverOrder(ctx.organizationId, deliveryAgent.id, order.id);

    const commissions = await listCommissions(ctx.organizationId);
    expect(commissions).toHaveLength(2);
    const byRole = Object.fromEntries(commissions.map((c) => [c.roleKind, c]));
    expect(byRole.CONFIRMATION.amount.toString()).toBe("20");
    expect(byRole.CONFIRMATION.userId).toBe(confirmationAgent.id);
    expect(byRole.DELIVERY.amount.toString()).toBe("15");
    expect(byRole.DELIVERY.userId).toBe(deliveryAgent.id);
  });

  it("sans tarif configuré pour un rôle, aucune commission n'est créée pour ce rôle (pas une erreur)", async () => {
    const { ctx, confirmationAgent, deliveryAgent, product } = await setupCommissionFixture();
    const order = await placeAndConfirm(ctx, product, confirmationAgent.id, "1", "50");
    await deliverOrder(ctx.organizationId, deliveryAgent.id, order.id);

    const commissions = await listCommissions(ctx.organizationId);
    expect(commissions).toHaveLength(0);
  });
});

describe("cumul de rôles et tarif daté (test d'acceptation #18)", () => {
  it("une même personne confirmant ET livrant la même commande est créditée pour les deux rôles", async () => {
    const { ctx, confirmationAgent, product } = await setupCommissionFixture();

    await createCommissionRule({
      organizationId: ctx.organizationId,
      createdById: ctx.userId,
      payeeType: "USER",
      userId: confirmationAgent.id,
      roleKind: "CONFIRMATION",
      rateType: "FIXED_PER_ORDER",
      rateValue: "20",
      effectiveFrom: new Date("2020-01-01"),
    });
    await createCommissionRule({
      organizationId: ctx.organizationId,
      createdById: ctx.userId,
      payeeType: "USER",
      userId: confirmationAgent.id,
      roleKind: "DELIVERY",
      rateType: "FIXED_PER_ORDER",
      rateValue: "15",
      effectiveFrom: new Date("2020-01-01"),
    });

    const order = await placeAndConfirm(ctx, product, confirmationAgent.id, "1", "50");
    await deliverOrder(ctx.organizationId, confirmationAgent.id, order.id);

    const commissions = await listCommissions(ctx.organizationId);
    expect(commissions).toHaveLength(2);
    expect(commissions.every((c) => c.userId === confirmationAgent.id)).toBe(true);
    const total = commissions.reduce((sum, c) => sum + Number(c.amount), 0);
    expect(total).toBe(35);
  });

  it("le tarif appliqué est celui en vigueur à la date de passation de la commande, pas un tarif plus récent", async () => {
    const { ctx, confirmationAgent, deliveryAgent, product } = await setupCommissionFixture();

    await createCommissionRule({
      organizationId: ctx.organizationId,
      createdById: ctx.userId,
      payeeType: "USER",
      userId: deliveryAgent.id,
      roleKind: "DELIVERY",
      rateType: "FIXED_PER_ORDER",
      rateValue: "10",
      effectiveFrom: new Date("2020-01-01"),
    });

    const order = await placeAndConfirm(ctx, product, confirmationAgent.id, "1", "50");

    // A newer rate takes effect after the order was placed — must not apply retroactively.
    await createCommissionRule({
      organizationId: ctx.organizationId,
      createdById: ctx.userId,
      payeeType: "USER",
      userId: deliveryAgent.id,
      roleKind: "DELIVERY",
      rateType: "FIXED_PER_ORDER",
      rateValue: "999",
      effectiveFrom: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    await deliverOrder(ctx.organizationId, deliveryAgent.id, order.id);

    const commissions = await listCommissions(ctx.organizationId);
    expect(commissions).toHaveLength(1);
    expect(commissions[0].amount.toString()).toBe("10");
  });
});

describe("affilié cumulé avec les commissions internes (test d'acceptation #19)", () => {
  it("une commande référant un affilié accorde sa commission en plus de celles de l'équipe", async () => {
    const { ctx, confirmationAgent, deliveryAgent, product } = await setupCommissionFixture();
    const affiliate = await createAffiliate({
      organizationId: ctx.organizationId,
      createdById: ctx.userId,
      name: "Affilié Test",
    });

    await createCommissionRule({
      organizationId: ctx.organizationId,
      createdById: ctx.userId,
      payeeType: "USER",
      userId: confirmationAgent.id,
      roleKind: "CONFIRMATION",
      rateType: "FIXED_PER_ORDER",
      rateValue: "20",
      effectiveFrom: new Date("2020-01-01"),
    });
    await createCommissionRule({
      organizationId: ctx.organizationId,
      createdById: ctx.userId,
      payeeType: "AFFILIATE",
      affiliateId: affiliate.id,
      roleKind: "AFFILIATE_REFERRAL",
      rateType: "PERCENT_OF_SUBTOTAL",
      rateValue: "10",
      effectiveFrom: new Date("2020-01-01"),
    });

    const order = await createOrder({
      organizationId: ctx.organizationId,
      userId: confirmationAgent.id,
      channel: "WHATSAPP",
      marketingSource: "AFFILIATE",
      affiliateId: affiliate.id,
      locationId: ctx.internal.id,
      placedAt: new Date(),
      lines: [{ articleVariantId: product.id, quantity: "2", unitPrice: "100" }], // subtotal 200
    });
    await confirmOrder(ctx.organizationId, confirmationAgent.id, order.id);
    await deliverOrder(ctx.organizationId, deliveryAgent.id, order.id);

    const commissions = await listCommissions(ctx.organizationId);
    expect(commissions).toHaveLength(2);
    const byRole = Object.fromEntries(commissions.map((c) => [c.roleKind, c]));
    expect(byRole.CONFIRMATION.amount.toString()).toBe("20");
    expect(byRole.AFFILIATE_REFERRAL.amount.toString()).toBe("20"); // 10% of 200
    expect(byRole.AFFILIATE_REFERRAL.affiliateId).toBe(affiliate.id);
  });
});

describe("versements et solde dérivé, jamais un compteur muté (test d'acceptation #20)", () => {
  it("80×5=400 dus, 300 payés : solde 100, mais le dû reste 400", async () => {
    const { ctx, confirmationAgent, deliveryAgent, product } = await setupCommissionFixture();

    await createCommissionRule({
      organizationId: ctx.organizationId,
      createdById: ctx.userId,
      payeeType: "USER",
      userId: deliveryAgent.id,
      roleKind: "DELIVERY",
      rateType: "FIXED_PER_ORDER",
      rateValue: "80",
      effectiveFrom: new Date("2020-01-01"),
    });

    for (let i = 0; i < 5; i++) {
      const order = await placeAndConfirm(ctx, product, confirmationAgent.id, "1", "50");
      await deliverOrder(ctx.organizationId, deliveryAgent.id, order.id);
    }

    await recordPayment({
      organizationId: ctx.organizationId,
      createdById: ctx.userId,
      payeeType: "USER",
      userId: deliveryAgent.id,
      amount: "300",
      paidAt: new Date(),
    });

    const balances = await listBalances(ctx.organizationId);
    const entry = balances.find((b) => b.userId === deliveryAgent.id);
    expect(entry?.earned).toBe("400");
    expect(entry?.paid).toBe("300");
    expect(entry?.balance).toBe("100");
  });
});

describe("fixe mensuel : génération unique (test d'acceptation #21)", () => {
  it("générer deux fois le même mois pour la même personne échoue la deuxième fois", async () => {
    const { ctx, deliveryAgent } = await setupCommissionFixture();

    await createCommissionRule({
      organizationId: ctx.organizationId,
      createdById: ctx.userId,
      payeeType: "USER",
      userId: deliveryAgent.id,
      roleKind: "FIXED_SALARY",
      rateType: "FIXED_PER_MONTH",
      rateValue: "3000",
      effectiveFrom: new Date("2020-01-01"),
    });

    await generateMonthlyFixedSalary({ organizationId: ctx.organizationId, userId: deliveryAgent.id, year: 2026, month: 3 });

    await expect(
      generateMonthlyFixedSalary({ organizationId: ctx.organizationId, userId: deliveryAgent.id, year: 2026, month: 3 })
    ).rejects.toBeInstanceOf(CommissionError);

    const balances = await listBalances(ctx.organizationId);
    const entry = balances.find((b) => b.userId === deliveryAgent.id);
    expect(entry?.earned).toBe("3000");
  });

  it("le même mois pour deux années différentes génère deux charges distinctes", async () => {
    const { ctx, deliveryAgent } = await setupCommissionFixture();
    await createCommissionRule({
      organizationId: ctx.organizationId,
      createdById: ctx.userId,
      payeeType: "USER",
      userId: deliveryAgent.id,
      roleKind: "FIXED_SALARY",
      rateType: "FIXED_PER_MONTH",
      rateValue: "3000",
      effectiveFrom: new Date("2020-01-01"),
    });

    await generateMonthlyFixedSalary({ organizationId: ctx.organizationId, userId: deliveryAgent.id, year: 2026, month: 1 });
    await generateMonthlyFixedSalary({ organizationId: ctx.organizationId, userId: deliveryAgent.id, year: 2027, month: 1 });

    const balances = await listBalances(ctx.organizationId);
    const entry = balances.find((b) => b.userId === deliveryAgent.id);
    expect(entry?.earned).toBe("6000");
  });
});
