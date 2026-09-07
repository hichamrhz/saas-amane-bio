// Redirect the app's Prisma client (lib/db/prisma.ts reads DATABASE_URL at
// import time) to the dedicated test database before any test file imports
// application code.
if (!process.env.TEST_DATABASE_URL) {
  throw new Error("TEST_DATABASE_URL is not set — see .env.example.");
}
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
