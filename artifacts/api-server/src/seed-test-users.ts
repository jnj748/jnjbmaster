import bcrypt from "bcryptjs";
import { db, usersTable, hqBuildingAssignmentsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
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

  // [Task #596] hq@test.com 본부장은 기본 관할 건물 1번을 할당해야 e2e 가시 데이터가 나온다.
  //   매핑이 비어 있으면 HQ 대시보드는 빈 응답을 받게 되어 회귀 테스트가 불안정해진다.
  try {
    const [hq] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, "hq@test.com"));
    if (hq) {
      const existingMapping = await db
        .select({ id: hqBuildingAssignmentsTable.id })
        .from(hqBuildingAssignmentsTable)
        .where(and(
          eq(hqBuildingAssignmentsTable.hqUserId, hq.id),
          eq(hqBuildingAssignmentsTable.buildingId, 1),
        ));
      if (existingMapping.length === 0) {
        await db.insert(hqBuildingAssignmentsTable).values({
          hqUserId: hq.id,
          buildingId: 1,
          assignedByUserId: null,
        });
        logger.info({ hqUserId: hq.id, buildingId: 1 }, "Default HQ building assignment seeded");
      }
    }
  } catch (e) {
    logger.warn({ err: e }, "Failed to seed default HQ building assignment");
  }

  if (created > 0) {
    logger.info({ created }, "Test user accounts seeded");
  }
}
