import type { Request } from "express";
import { eq, inArray, type SQL } from "drizzle-orm";
import { type AnyPgColumn } from "drizzle-orm/pg-core";
import { db, usersTable, hqBuildingAssignmentsTable } from "@workspace/db";

export async function getUserBuildingId(req: Request | number): Promise<number | null> {
  // Overload tolerance: 일부 라우트는 userId 숫자를 직접 넘긴다.
  const userId = typeof req === "number" ? req : req.user?.userId;
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
// platform_admin 은 전 건물 가시성을 가지므로 제외한다.
// hq_executive 는 [Task #596] 부터 hq_building_assignments 매핑 기반으로
// 전환되었으므로 단일 buildingId 화이트리스트가 아니라 별도 헬퍼
// (`getHqAssignedBuildingIds` / `getAccessibleBuildingIds`) 로 처리한다.
// partner 는 vendor 소유 모델로 별도 가드되므로 역시 제외한다.
// 새 건물 단위 역할이 추가되면 이 한 곳만 갱신하면 된다.
// [Task #773] custodian(관리단장)도 본인 소속 건물 단위로 묶인다 — 감사로그 등에서
//   getAccessibleBuildingIds() 가 빈 배열을 돌려 권한이 차단되던 회귀를 막는다.
export const BUILDING_SCOPED_ROLES: ReadonlyArray<string> = [
  "manager",
  "accountant",
  "facility_staff",
  "custodian",
];

export function isBuildingScopedRole(role: string | undefined | null): boolean {
  if (!role) return false;
  return BUILDING_SCOPED_ROLES.includes(role);
}

// [Task #596] 본부장(hq_executive)에게 할당된 관할 건물 id 목록.
// 매핑이 비어 있으면 빈 배열. 다른 역할 id 가 들어와도 빈 배열을 반환한다.
export async function getHqAssignedBuildingIds(userId: number): Promise<number[]> {
  if (!userId) return [];
  const rows = await db
    .select({ buildingId: hqBuildingAssignmentsTable.buildingId })
    .from(hqBuildingAssignmentsTable)
    .where(eq(hqBuildingAssignmentsTable.hqUserId, userId));
  return rows.map((r) => r.buildingId);
}

/**
 * [Task #596] 통일 헬퍼 — 호출자가 접근 가능한 건물 id 집합을 계산한다.
 *
 *   - `unrestricted: true`  → 전 건물 가시(platform_admin). `ids` 는 비어있다.
 *   - `unrestricted: false, ids: [...]` → 해당 id 안의 건물만 가시.
 *   - `unrestricted: false, ids: []`    → 가시 건물 0개. 라우트는 빈 결과를 반환해야 한다.
 *
 * 적용 역할:
 *   - platform_admin → unrestricted
 *   - hq_executive   → hq_building_assignments 매핑 결과
 *   - manager / accountant / facility_staff → users.building_id 단일 묶음
 *   - partner / 그 외 → 빈 배열 (해당 라우트는 별도 vendor ACL 로 처리해야 함)
 */
export async function getAccessibleBuildingIds(
  req: Request,
): Promise<{ unrestricted: boolean; ids: number[] }> {
  const role = req.user?.role;
  const userId = req.user?.userId;
  if (!role || !userId) return { unrestricted: false, ids: [] };
  if (role === "platform_admin") return { unrestricted: true, ids: [] };
  if (role === "hq_executive") {
    const ids = await getHqAssignedBuildingIds(userId);
    return { unrestricted: false, ids };
  }
  if (isBuildingScopedRole(role)) {
    const bid = await getUserBuildingId(userId);
    return { unrestricted: false, ids: bid != null ? [bid] : [] };
  }
  return { unrestricted: false, ids: [] };
}

/**
 * Drizzle where-절 보조 헬퍼.
 *   - 반환값이 `null` 이면 필터 불필요(전 건물 가시).
 *   - 반환값이 문자열 `"empty"` 이면 호출자는 즉시 빈 결과를 반환해야 한다.
 *   - 그 외 SQL fragment 면 `conds.push(...)` 에 그대로 넣으면 된다.
 *
 * 사용 예:
 *   const scope = await getAccessibleBuildingIds(req);
 *   const sf = buildingScopeFilter(scope, table.buildingId);
 *   if (sf === "empty") { res.json([]); return; }
 *   if (sf) conds.push(sf);
 */
export function buildingScopeFilter(
  scope: { unrestricted: boolean; ids: number[] },
  column: AnyPgColumn,
): SQL | null | "empty" {
  if (scope.unrestricted) return null;
  if (scope.ids.length === 0) return "empty";
  return scope.ids.length === 1 ? eq(column, scope.ids[0]) : inArray(column, scope.ids);
}

/**
 * 단일 건물에 대한 접근 가능 여부.
 *  - platform_admin → 항상 true
 *  - hq_executive   → 매핑에 포함된 건물이면 true
 *  - 그 외 building-scoped → users.building_id 와 일치하면 true
 */
export async function canAccessBuilding(
  req: Request,
  buildingId: number,
): Promise<boolean> {
  const scope = await getAccessibleBuildingIds(req);
  if (scope.unrestricted) return true;
  return scope.ids.includes(buildingId);
}
