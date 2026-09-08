import { prisma } from "@/lib/db/prisma";

export async function createCustomer(input: {
  organizationId: string;
  name: string;
  phone?: string | null;
  address?: string | null;
  notes?: string | null;
}) {
  return prisma.customer.create({
    data: {
      organizationId: input.organizationId,
      name: input.name,
      phone: input.phone ?? null,
      address: input.address ?? null,
      notes: input.notes ?? null,
    },
  });
}

export async function listCustomers(organizationId: string) {
  return prisma.customer.findMany({
    where: { organizationId, archivedAt: null },
    orderBy: { name: "asc" },
  });
}

export async function findCustomerByPhone(organizationId: string, phone: string) {
  return prisma.customer.findFirst({
    where: { organizationId, phone, archivedAt: null },
  });
}
