import { Client } from "pg";

/**
 * Runs once before the whole Vitest run. Verifies the dedicated test
 * database (TEST_DATABASE_URL) already has the current schema applied,
 * rather than pushing it automatically.
 *
 * Deliberately does NOT run `prisma db push` here: that command mutates a
 * database's schema, and Prisma's own CLI refuses to run it when invoked by
 * an AI agent without a human explicitly consenting first — the right place
 * for that consent is an explicit, one-off `pnpm db:push:test` a person
 * runs themselves (see package.json / PROGRESS.md), never something the
 * test runner does silently on every `pnpm test`.
 */
export default async function globalSetup() {
  const testDatabaseUrl = process.env.TEST_DATABASE_URL;
  if (!testDatabaseUrl) {
    throw new Error(
      "TEST_DATABASE_URL is not set. Configure a dedicated PostgreSQL test database in .env before running tests."
    );
  }

  const client = new Client({ connectionString: testDatabaseUrl });
  await client.connect();
  try {
    const result = await client.query(`SELECT to_regclass('public."Organization"') AS exists`);
    if (!result.rows[0]?.exists) {
      throw new Error(
        'The test database has no schema yet. Run "pnpm db:push:test" once (it applies prisma/schema.prisma to TEST_DATABASE_URL) before running the test suite.'
      );
    }
  } finally {
    await client.end();
  }
}
