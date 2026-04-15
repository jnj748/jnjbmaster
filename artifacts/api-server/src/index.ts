import app from "./app";
import { logger } from "./lib/logger";
import { seedDocumentTemplates } from "./routes/seedTemplates";
import { db, usersTable, unitsTable, tenantsTable, ownersTable } from "@workspace/db";
import { sql, eq, and, isNull, isNotNull } from "drizzle-orm";
import { startScheduler, stopScheduler } from "./scheduler";

async function backfillUnitIds() {
  const tenantsResult = await db.execute(sql`
    UPDATE tenants t
    SET unit_id = u.id
    FROM units u
    WHERE t.unit_id IS NULL
      AND t.unit IS NOT NULL
      AND t.unit != ''
      AND t.unit = u.unit_number
      AND u.building_id IS NOT NULL
  `);

  const ownersResult = await db.execute(sql`
    UPDATE owners o
    SET unit_id = u.id
    FROM units u
    WHERE o.unit_id IS NULL
      AND o.unit IS NOT NULL
      AND o.unit != ''
      AND o.unit = u.unit_number
      AND u.building_id IS NOT NULL
  `);

  const remainingTenants = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(tenantsTable)
    .where(and(isNull(tenantsTable.unitId), isNotNull(tenantsTable.unit)));

  const remainingOwners = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(ownersTable)
    .where(and(isNull(ownersTable.unitId), isNotNull(ownersTable.unit)));

  const tRemaining = remainingTenants[0]?.count ?? 0;
  const oRemaining = remainingOwners[0]?.count ?? 0;

  if (tRemaining > 0 || oRemaining > 0) {
    logger.warn({ tenantsWithoutUnitId: tRemaining, ownersWithoutUnitId: oRemaining },
      "Some records could not be backfilled (unit number not found in units table)");
  }
}

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

  try {
    await backfillUnitIds();
    logger.info("Unit ID backfill completed");
  } catch (e) {
    logger.warn({ err: e }, "Failed to backfill unit IDs");
  }

  startScheduler();
});

process.on("SIGTERM", () => {
  stopScheduler();
  process.exit(0);
});

process.on("SIGINT", () => {
  stopScheduler();
  process.exit(0);
});
