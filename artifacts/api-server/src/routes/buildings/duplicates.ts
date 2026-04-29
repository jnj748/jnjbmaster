// [Task #496] buildings 라우터 분리 — 1주소 1인 중복 가입 차단 헬퍼·엔드포인트.
//   원본 routes/buildings.ts 의 BUILDING_DUPLICATE_MESSAGE / DuplicateCheckRole /
//   isDuplicateCheckRole / findExistingActiveUserForAddress / findExistingManagerForAddress /
//   GET /buildings/check-manager 를 그대로 옮긴다. 외부에서 import 하는 공개 API
//   (`BUILDING_DUPLICATE_MESSAGE`, `isDuplicateCheckRole`, `findExistingActiveUserForAddress`,
//   `DuplicateCheckRole`)는 부모 index.ts 에서 그대로 re-export 한다.
import { Router, type IRouter, type Request, type Response } from "express";
import { db, buildingsTable, usersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

// [Task #227/#341] 한 건물에는 관리소장·경리가 각 1명씩만 가입할 수 있다.
// 시설담당자는 한 건물에 여러 명이 활동할 수 있으므로 중복 검사 대상에서 제외한다
// (현장 실무: 한 단지에 시설기사·전기·소방·기계 담당이 동시에 배치되는 경우가 많음).
// 위저드/우회 모두를 막기 위해 동일한 지번 주소(또는 동일 building.id)에
// 동일 역할의 다른 활성 사용자가 묶여 있는지 검사한다. 모든 역할에 동일 안내 문구를 사용.
export const BUILDING_DUPLICATE_MESSAGE =
  "이미 해당 건물의 가입자가 존재합니다. 자세한 문의는 관리의달인으로 문의주시기 바랍니다. 1800-0416";

// [Task #227] 하위 호환을 위한 별칭. 동일 한국어 메시지.
// [Task #496] 원본에서 선언만 되고 사용처가 없어 사실상 dead code 이지만, 분리
//   리팩터링 범위 밖의 변경을 피하기 위해 그대로 보존한다.
const MANAGER_DUPLICATE_MESSAGE = BUILDING_DUPLICATE_MESSAGE;
void MANAGER_DUPLICATE_MESSAGE;

// [Task #559] 1주소 1인 차단의 적용 대상 역할 — 시설담당자는 다인원 허용으로 정책 변경되어
//   대상에서 제외된다. 매니저·경리는 그대로 1건물 1명을 유지한다.
export type DuplicateCheckRole = "manager" | "accountant";
const DUPLICATE_CHECK_ROLES: readonly DuplicateCheckRole[] = ["manager", "accountant"];

export function isDuplicateCheckRole(v: unknown): v is DuplicateCheckRole {
  return typeof v === "string" && (DUPLICATE_CHECK_ROLES as readonly string[]).includes(v);
}

function normalizeJibun(s: string | null | undefined): string {
  return String(s ?? "").trim().replace(/\s+/g, " ");
}

// [Task #341] Task #227 의 매니저 전용 검사를 역할 파라미터화한 일반화 헬퍼.
// 본인 제외, approval_status='active' 만 대상, building.id 직접 일치 + 동일 지번 주소의
// 다른 building.id 까지 보는 2중 조회 로직을 그대로 재사용한다.
export async function findExistingActiveUserForAddress(opts: {
  role: DuplicateCheckRole;
  addressJibun?: string | null;
  buildingId?: number | null;
  excludeUserId: number;
}): Promise<boolean> {
  const jibun = normalizeJibun(opts.addressJibun);
  // 1) 동일 building.id에 이미 동일 역할의 다른 활성 사용자가 있는지
  if (opts.buildingId) {
    const rows = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(and(
        eq(usersTable.buildingId, opts.buildingId),
        eq(usersTable.role, opts.role),
        eq(usersTable.approvalStatus, "active"),
      ));
    if (rows.some(r => r.id !== opts.excludeUserId)) return true;
  }
  // 2) 동일 지번 주소를 가진 다른 building 행이 있는 경우, 그쪽에 묶인 동일 역할 활성 사용자가 있는지
  if (jibun) {
    const buildings = await db
      .select({ id: buildingsTable.id })
      .from(buildingsTable)
      .where(eq(buildingsTable.addressJibun, jibun));
    const otherBuildingIds = buildings
      .map(b => b.id)
      .filter(bid => !opts.buildingId || bid !== opts.buildingId);
    if (otherBuildingIds.length > 0) {
      const rows = await db
        .select({ id: usersTable.id, buildingId: usersTable.buildingId })
        .from(usersTable)
        .where(and(
          eq(usersTable.role, opts.role),
          eq(usersTable.approvalStatus, "active"),
        ));
      const buildingIdSet = new Set(otherBuildingIds);
      if (rows.some(r => r.id !== opts.excludeUserId && r.buildingId != null && buildingIdSet.has(r.buildingId))) {
        return true;
      }
    }
  }
  return false;
}

// [Task #227] 매니저 전용 호출부의 시그니처/동작 회귀를 막기 위한 얇은 래퍼.
export async function findExistingManagerForAddress(opts: {
  addressJibun?: string | null;
  buildingId?: number | null;
  excludeUserId: number;
}): Promise<boolean> {
  return findExistingActiveUserForAddress({ ...opts, role: "manager" });
}

const router: IRouter = Router();

// [Task #227/#341] 위저드/승인 화면이 빠르게 차단 안내를 띄울 수 있도록 사전 점검 엔드포인트.
//   - 기본 역할은 manager (Task #227 호환)
//   - role 쿼리 파라미터로 accountant / facility_staff 도 검사 가능 (Task #341)
router.get("/buildings/check-manager", async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const addressJibun = typeof req.query.addressJibun === "string" ? req.query.addressJibun : "";
  const buildingIdRaw = typeof req.query.buildingId === "string" ? req.query.buildingId : "";
  const buildingId = buildingIdRaw ? parseInt(buildingIdRaw) : null;
  const roleParam = typeof req.query.role === "string" ? req.query.role : "manager";
  if (!isDuplicateCheckRole(roleParam)) {
    res.status(400).json({ error: "role 값이 유효하지 않습니다." });
    return;
  }
  if (!addressJibun && !buildingId) {
    res.status(400).json({ error: "addressJibun 또는 buildingId가 필요합니다." });
    return;
  }
  try {
    const exists = await findExistingActiveUserForAddress({
      role: roleParam,
      addressJibun,
      buildingId: buildingId && Number.isFinite(buildingId) ? buildingId : null,
      excludeUserId: userId,
    });
    res.json({ exists, message: exists ? BUILDING_DUPLICATE_MESSAGE : null });
  } catch (e) {
    req.log.error({ err: e }, "Failed to check building duplicate");
    res.status(500).json({ error: "중복 검사에 실패했습니다." });
  }
});

export default router;
