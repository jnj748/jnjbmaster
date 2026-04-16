import bcrypt from "bcryptjs";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./lib/logger";

const TEST_PASSWORD = "test1234!";

const TEST_USERS = [
  { email: "manager@test.com", name: "테스트 관리소장", role: "manager" as const, portalType: "building" as const, buildingId: 1 },
  { email: "accountant@test.com", name: "테스트 경리", role: "accountant" as const, portalType: "building" as const, buildingId: 1 },
  { email: "facility@test.com", name: "테스트 시설기사", role: "facility_staff" as const, portalType: "building" as const, buildingId: 1 },
  { email: "hq@test.com", name: "테스트 총괄임원", role: "hq_executive" as const, portalType: "hq" as const, buildingId: null },
  { email: "admin@test.com", name: "테스트 관리자", role: "platform_admin" as const, portalType: "hq" as const, buildingId: null },
  { email: "partner@test.com", name: "테스트 파트너사", role: "partner" as const, portalType: "partner" as const, buildingId: null },
];

export async function seedTestUsers() {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10);
  let created = 0;

  for (const u of TEST_USERS) {
    try {
      const existing = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, u.email));
      if (existing.length > 0) continue;

      await db.insert(usersTable).values({
        email: u.email,
        passwordHash,
        name: u.name,
        role: u.role,
        portalType: u.portalType,
        buildingId: u.buildingId,
      });
      created++;
    } catch (e) {
      logger.warn({ email: u.email, err: e }, "Failed to seed test user");
    }
  }

  if (created > 0) {
    logger.info({ created }, "Test user accounts seeded");
  }
}
