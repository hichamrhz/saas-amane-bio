import { prisma } from "@/lib/db/prisma";

export class SupplierError extends Error {}

export async function createSupplier(input: {
  organizationId: string;
  name: string;
  phone?: string | null;
  leadTimeDays?: number | null;
  notes?: string | null;
}) {
  try {
    return await prisma.supplier.create({
      data: {
        organizationId: input.organizationId,
        name: input.name,
        phone: input.phone ?? null,
        leadTimeDays: input.leadTimeDays ?? null,
        notes: input.notes ?? null,
      },
    });
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code: string }).code === "P2002"
    ) {
      throw new SupplierError(`Le fournisseur "${input.name}" existe déjà.`);
    }
    throw error;
  }
}

export async function listSuppliers(organizationId: string) {
  return prisma.supplier.findMany({
    where: { organizationId, archivedAt: null },
    orderBy: { name: "asc" },
  });
}

export async function listLocations(organizationId: string) {
  return prisma.location.findMany({
    where: { organizationId, archivedAt: null },
    orderBy: { name: "asc" },
  });
}
