import type { Request } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";

export async function getUserBuildingId(req: Request): Promise<number | null> {
  const userId = req.user?.userId;
  if (!userId) return null;
  const user = await db
    .select({ buildingId: usersTable.buildingId })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .then((r) => r[0]);
  return user?.buildingId ?? null;
}

// [Task #551] 건물 단위 직원 역할 화이트리스트.
// 이들 역할은 본인 소속 건물(users.buildingId) 의 데이터만 읽고 쓸 수 있다.
// platform_admin / hq_executive 는 전 건물 가시성을 가지므로 제외하고,
// partner 는 vendor 소유 모델로 별도 가드되므로 역시 제외한다.
// 새 건물 단위 역할이 추가되면 이 한 곳만 갱신하면 된다.
export const BUILDING_SCOPED_ROLES: ReadonlyArray<string> = [
  "manager",
  "accountant",
  "facility_staff",
];

export function isBuildingScopedRole(role: string | undefined | null): boolean {
  if (!role) return false;
  return BUILDING_SCOPED_ROLES.includes(role);
}
