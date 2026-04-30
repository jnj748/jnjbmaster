// [Task #496] buildings 라우터 분리 — 1주소 1인 중복 가입 차단 헬퍼·엔드포인트.
//   원본 routes/buildings.ts 의 BUILDING_DUPLICATE_MESSAGE / DuplicateCheckRole /
//   isDuplicateCheckRole / findExistingActiveUserForAddress / findExistingManagerForAddress /
//   GET /buildings/check-manager 를 그대로 옮긴다. 외부에서 import 하는 공개 API
//   (`BUILDING_DUPLICATE_MESSAGE`, `isDuplicateCheckRole`, `findExistingActiveUserForAddress`,
//   `DuplicateCheckRole`)는 부모 index.ts 에서 그대로 re-export 한다.
// [Task #642] 헬퍼 반환값을 boolean → DuplicateCheckResult 객체로 확장한다.
//   - selfAlreadyMember: 요청자가 이미 동일 building에 동일 role로 묶여 있는 경우 true.
//     이 경우 PUT 등 본인 갱신 동선은 차단하지 않는다(본인 행 = "내 건물").
//   - conflictBuildingName/Id/Role: 진짜 다른 사용자가 점유 중일 때 위저드 안내에 활용.
//   - 2차 검사(동일 지번의 다른 building 행)는 사용자 0명인 고아 행을 충돌 후보에서 제외.
import { Router, type IRouter, type Request, type Response } from "express";
import { db, buildingsTable, usersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { logger } from "../../lib/logger";

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

// [Task #642] 차단 여부 + 충돌 컨텍스트(상대 건물명/역할) + 본인 소속 여부.
//   - exists=true 일 때만 차단해야 한다.
//   - selfAlreadyMember=true 인 경우엔 exists 가 false 로 떨어진다(본인 갱신 허용).
//     이 상황에서 다른 활성 사용자가 함께 있다면 별도로 server log 경고를 남긴다.
export type DuplicateCheckResult = {
  exists: boolean;
  selfAlreadyMember: boolean;
  conflictBuildingId?: number | null;
  conflictBuildingName?: string | null;
  conflictRole?: DuplicateCheckRole | null;
};

// [Task #642] 위저드 차단 안내에 함께 노출할 건물명 부분 마스킹.
//   - 1~2자: 그대로 노출(마스킹할 정보가 거의 없음).
//   - 3자 이상: 첫 글자 + 중간 별표 + 마지막 글자.
function maskBuildingName(name: string | null | undefined): string | null {
  if (name == null) return null;
  const trimmed = String(name).trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length <= 2) return trimmed;
  const masked = "*".repeat(Math.max(1, trimmed.length - 2));
  return `${trimmed[0]}${masked}${trimmed[trimmed.length - 1]}`;
}

// [Task #341] Task #227 의 매니저 전용 검사를 역할 파라미터화한 일반화 헬퍼.
// [Task #642] 본인이 이미 그 building 에 동일 role 로 묶인 경우엔 차단하지 않고
//   selfAlreadyMember=true 만 회신한다(본인 PUT 갱신 동선이 영구 차단되던 회귀 차단).
//   2차 검사는 사용자 0명인 고아 building 행을 충돌 후보에서 제외해, 과거 위저드 재진입으로
//   누적된 고아 행이 신규 가입자를 영구 차단하던 문제를 해소한다.
export async function findExistingActiveUserForAddress(opts: {
  role: DuplicateCheckRole;
  addressJibun?: string | null;
  buildingId?: number | null;
  excludeUserId: number;
}): Promise<DuplicateCheckResult> {
  const jibun = normalizeJibun(opts.addressJibun);
  let selfAlreadyMember = false;

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
    selfAlreadyMember = rows.some(r => r.id === opts.excludeUserId);
    const otherIds = rows.filter(r => r.id !== opts.excludeUserId).map(r => r.id);

    if (selfAlreadyMember) {
      // 본인이 이미 매니저인 건물. 다른 활성 사용자가 함께 있다면 데이터 정합 깨짐 가능성이
      // 있으므로 본사 관리자가 추후 정리할 수 있도록 경고 로그만 남기고, 본 PUT 동선은
      // 정상 진행시킨다(과거: 두 명 매니저가 묶인 채 누구도 저장 못 하던 회귀).
      if (otherIds.length > 0) {
        logger.warn(
          { buildingId: opts.buildingId, role: opts.role, requesterUserId: opts.excludeUserId, coexistingUserIds: otherIds },
          "[duplicate-check] self is already a member but additional active users coexist on the same building/role — allowing self-update; please reconcile",
        );
      }
    } else if (otherIds.length > 0) {
      const [b] = await db
        .select({ id: buildingsTable.id, name: buildingsTable.name })
        .from(buildingsTable)
        .where(eq(buildingsTable.id, opts.buildingId));
      return {
        exists: true,
        selfAlreadyMember: false,
        conflictBuildingId: opts.buildingId,
        conflictBuildingName: maskBuildingName(b?.name ?? null),
        conflictRole: opts.role,
      };
    }
  }

  // 2) 동일 지번 주소를 가진 다른 building 행이 있는 경우, 그쪽에 묶인 동일 역할 활성 사용자가 있는지
  //    [Task #642] 사용자 0명인 고아 building 행은 충돌 후보에서 제외한다.
  if (jibun) {
    const buildings = await db
      .select({ id: buildingsTable.id, name: buildingsTable.name })
      .from(buildingsTable)
      .where(eq(buildingsTable.addressJibun, jibun));
    const otherBuildings = buildings.filter(b => !opts.buildingId || b.id !== opts.buildingId);
    if (otherBuildings.length > 0) {
      const otherBuildingIds = otherBuildings.map(b => b.id);
      const rows = await db
        .select({ id: usersTable.id, buildingId: usersTable.buildingId })
        .from(usersTable)
        .where(and(
          eq(usersTable.role, opts.role),
          eq(usersTable.approvalStatus, "active"),
        ));
      const buildingIdSet = new Set(otherBuildingIds);
      // (요청자 본인 제외) 동일 역할 활성 사용자가 적어도 한 명 묶여 있는 building 만 추려낸다.
      // 사용자 0명인 building (= 고아 행) 은 자연스럽게 제외된다.
      const occupiedBuildingId = (() => {
        for (const r of rows) {
          if (r.id === opts.excludeUserId) continue;
          if (r.buildingId != null && buildingIdSet.has(r.buildingId)) return r.buildingId;
        }
        return null;
      })();
      if (occupiedBuildingId != null) {
        const conflictBuilding = otherBuildings.find(b => b.id === occupiedBuildingId);
        return {
          exists: true,
          selfAlreadyMember,
          conflictBuildingId: occupiedBuildingId,
          conflictBuildingName: maskBuildingName(conflictBuilding?.name ?? null),
          conflictRole: opts.role,
        };
      }
    }
  }
  return { exists: false, selfAlreadyMember };
}

// [Task #227] 매니저 전용 호출부의 시그니처/동작 회귀를 막기 위한 얇은 래퍼.
// [Task #642] 헬퍼가 객체를 반환하도록 바뀌었지만 기존 호출부는 boolean 만 필요로 하므로
//   exists 만 노출하는 boolean 시그니처를 그대로 유지한다.
export async function findExistingManagerForAddress(opts: {
  addressJibun?: string | null;
  buildingId?: number | null;
  excludeUserId: number;
}): Promise<boolean> {
  const r = await findExistingActiveUserForAddress({ ...opts, role: "manager" });
  return r.exists;
}

const router: IRouter = Router();

// [Task #227/#341] 위저드/승인 화면이 빠르게 차단 안내를 띄울 수 있도록 사전 점검 엔드포인트.
//   - 기본 역할은 manager (Task #227 호환)
//   - role 쿼리 파라미터로 accountant / facility_staff 도 검사 가능 (Task #341)
// [Task #642] 응답에 충돌 컨텍스트(conflictBuildingName/Role)를 함께 내려, 위저드가
//   "어떤 건물에서 막혔는지"를 한 줄로 안내할 수 있게 한다.
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
    const result = await findExistingActiveUserForAddress({
      role: roleParam,
      addressJibun,
      buildingId: buildingId && Number.isFinite(buildingId) ? buildingId : null,
      excludeUserId: userId,
    });
    res.json({
      exists: result.exists,
      message: result.exists ? BUILDING_DUPLICATE_MESSAGE : null,
      conflictBuildingName: result.exists ? result.conflictBuildingName ?? null : null,
      conflictRole: result.exists ? result.conflictRole ?? null : null,
      selfAlreadyMember: result.selfAlreadyMember,
    });
  } catch (e) {
    req.log.error({ err: e }, "Failed to check building duplicate");
    res.status(500).json({ error: "중복 검사에 실패했습니다." });
  }
});

export default router;
