import app from "./app";
import { logger } from "./lib/logger";
import { seedDocumentTemplates } from "./routes/seedTemplates";
import { db, usersTable } from "@workspace/db";
import { sql } from "drizzle-orm";

async function migrateLegacyUsers() {
  await db.update(usersTable)
    .set({ role: "manager", portalType: "building" })
    .where(sql`${usersTable.role} IN ('executive', 'facility_staff')`);

  await db.update(usersTable)
    .set({ role: "partner", portalType: "partner" })
    .where(sql`${usersTable.role} = 'vendor'`);

  await db.update(usersTable)
    .set({ portalType: "partner" })
    .where(sql`${usersTable.portalType} = 'vendor'`);
}

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, async (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  try {
    await migrateLegacyUsers();
    logger.info("Legacy user roles migrated");
  } catch (e) {
    logger.warn({ err: e }, "Failed to migrate legacy user roles");
  }

  try {
    await seedDocumentTemplates();
    logger.info("Document templates seeded");
  } catch (e) {
    logger.warn({ err: e }, "Failed to seed document templates");
  }
});
