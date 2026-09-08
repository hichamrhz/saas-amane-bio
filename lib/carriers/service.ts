import { prisma } from "@/lib/db/prisma";

export class CarrierError extends Error {}

export async function createCarrier(input: {
  organizationId: string;
  name: string;
  defaultFee?: string | null;
  notes?: string | null;
}) {
  try {
    return await prisma.carrier.create({
      data: {
        organizationId: input.organizationId,
        name: input.name,
        defaultFee: input.defaultFee ?? null,
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
      throw new CarrierError(`Le transporteur "${input.name}" existe déjà.`);
    }
    throw error;
  }
}

export async function listCarriers(organizationId: string) {
  return prisma.carrier.findMany({
    where: { organizationId, archivedAt: null },
    orderBy: { name: "asc" },
  });
}
