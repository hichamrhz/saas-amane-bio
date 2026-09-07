import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { listArticleVariants } from "@/lib/catalog/service";
import { getOnHandAt } from "@/lib/inventory/stock";
import { createReception } from "@/lib/purchasing/receptions";
import { createOrder, OrderError } from "@/lib/orders/service";
import { createTestContext, createProductVariant, createLabelVariant } from "./helpers/fixtures";

describe("isolation par organisation (cahier des charges §19, test d'acceptation #28)", () => {
  it("le catalogue d'une organisation n'apparaît jamais dans les requêtes d'une autre organisation", async () => {
    const orgA = await createTestContext();
    const orgB = await createTestContext();

    await createProductVariant(orgA.organizationId, { name: "Produit A", sku: `A-${randomUUID().slice(0, 6)}` });
    await createProductVariant(orgB.organizationId, { name: "Produit B", sku: `B-${randomUUID().slice(0, 6)}` });

    const variantsA = await listArticleVariants(orgA.organizationId, "PRODUCT");
    const variantsB = await listArticleVariants(orgB.organizationId, "PRODUCT");

    expect(variantsA.some((v) => v.article.name === "Produit B")).toBe(false);
    expect(variantsB.some((v) => v.article.name === "Produit A")).toBe(false);
  });

  it("le stock d'une organisation n'est jamais visible ni modifiable depuis une autre organisation", async () => {
    const orgA = await createTestContext();
    const orgB = await createTestContext();

    const productA = await createProductVariant(orgA.organizationId, { name: "P", sku: `PA-${randomUUID().slice(0, 6)}` });
    const labelA = await createLabelVariant(orgA.organizationId, {
      name: "L",
      sku: `LA-${randomUUID().slice(0, 6)}`,
      productVariantId: productA.id,
    });
    await createReception({
      organizationId: orgA.organizationId,
      userId: orgA.userId,
      kind: "SUPPLIER_PURCHASE",
      locationId: orgA.internal.id,
      costIncludesLabel: false,
      eventDate: new Date(),
      lines: [{ articleVariantId: labelA.id, quantity: "100", unitCost: "1" }],
    });

    // Querying org A's stock while scoped to org B must see nothing —
    // organizationId is not just a display filter, it is the security
    // boundary, matched on every ledger query.
    const asSeenFromOrgB = await getOnHandAt(orgB.organizationId, labelA.id, orgA.internal.id);
    expect(asSeenFromOrgB.toString()).toBe("0");

    const asSeenFromOrgA = await getOnHandAt(orgA.organizationId, labelA.id, orgA.internal.id);
    expect(asSeenFromOrgA.toString()).toBe("100");
  });

  it("une commande ne peut pas référencer l'emplacement ou les articles d'une autre organisation", async () => {
    const orgA = await createTestContext();
    const orgB = await createTestContext();

    const productB = await createProductVariant(orgB.organizationId, {
      name: "Produit B",
      sku: `XB-${randomUUID().slice(0, 6)}`,
    });

    // Org B's location, referenced from an order created under org A.
    await expect(
      createOrder({
        organizationId: orgA.organizationId,
        userId: orgA.userId,
        channel: "WHATSAPP",
        locationId: orgB.internal.id,
        placedAt: new Date(),
        lines: [{ articleVariantId: productB.id, quantity: "1", unitPrice: "10" }],
      })
    ).rejects.toBeInstanceOf(OrderError);

    // Org B's product, referenced from an order that otherwise uses org A's
    // own location — the article-variant check must catch it independently
    // of the location check.
    await expect(
      createOrder({
        organizationId: orgA.organizationId,
        userId: orgA.userId,
        channel: "WHATSAPP",
        locationId: orgA.internal.id,
        placedAt: new Date(),
        lines: [{ articleVariantId: productB.id, quantity: "1", unitPrice: "10" }],
      })
    ).rejects.toBeInstanceOf(OrderError);
  });
});
