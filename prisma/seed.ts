import { hash } from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const OWNER_EMAIL = process.env.SEED_OWNER_EMAIL ?? "owner@amanebio.test";
const OWNER_PASSWORD = process.env.SEED_OWNER_PASSWORD ?? "changeme123";

async function main() {
  const org = await prisma.organization.upsert({
    where: { id: "org-amane-bio" },
    update: {},
    create: {
      id: "org-amane-bio",
      name: "AMANE BIO",
      currency: "MAD",
      timezone: "Africa/Casablanca",
    },
  });

  await prisma.location.upsert({
    where: { organizationId_name: { organizationId: org.id, name: "Chez moi" } },
    update: {},
    create: {
      organizationId: org.id,
      name: "Chez moi",
      kind: "INTERNAL",
      isDefault: true,
    },
  });

  await prisma.location.upsert({
    where: { organizationId_name: { organizationId: org.id, name: "Coopérative" } },
    update: {},
    create: {
      organizationId: org.id,
      name: "Coopérative",
      kind: "COOPERATIVE",
    },
  });

  await prisma.location.upsert({
    where: { organizationId_name: { organizationId: org.id, name: "Quarantaine" } },
    update: {},
    create: {
      organizationId: org.id,
      name: "Quarantaine",
      kind: "QUARANTINE",
    },
  });

  const passwordHash = await hash(OWNER_PASSWORD, 10);
  const owner = await prisma.user.upsert({
    where: { email: OWNER_EMAIL },
    update: {},
    create: {
      organizationId: org.id,
      email: OWNER_EMAIL,
      name: "Propriétaire",
      passwordHash,
      role: "OWNER",
      status: "ACTIVE",
    },
  });

  console.log(`Organisation prête : ${org.name} (${org.id})`);
  console.log(`Utilisateur propriétaire : ${owner.email} / mot de passe : ${OWNER_PASSWORD}`);
  console.log("Changez ce mot de passe après la première connexion.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
