// [Task #697] 역할별 알림/업무 라우팅 단일 출처(SoT).
//
// 같은 건물에서 관리소장 / 시설기사 / 경리 가 대시보드 "필수업무현황" 카드를
// 봤을 때 어떤 알림이 어떤 카드에 노출돼야 하는가? 의 분류 룰을 한 곳에 모은다.
//
//   - 클라이언트(`dashboard-alert-filters.ts`)는 알림을 카드별로 분류할 때 사용.
//   - 서버(`routes/tasks.ts`, `scripts/backfill-task-target-roles.ts`)는 카테고리만
//     입력받았을 때 합리적인 `targetRoles` 기본값을 산출할 때 사용.
//
// 분류 기준이 필요한 두 입력값:
//   1. `tasks.category` (수동 등록 업무) — daily_check / maintenance / facility /
//      security / cleaning / accounting / tax / finance / administrative / other …
//   2. `task_templates.taskType` (관리 템플릿) — facility / security / cleaning /
//      accounting / fee / other …
//
// 모호한 입력(빈 값, other, etc) 은 보수적으로 `["manager"]` 로 떨어진다 — 그래야
// 적어도 관리소장 카드에서는 사라지지 않는다.

import type { AppRole } from "./role-labels.js";

// ── 알림 분류용 카테고리/타입 화이트리스트 ──────────────────────────
//   세 역할 카드의 클라이언트 필터(`isFacilityLegalAlert`/`isAccountantLegalAlert`)
//   가 동일한 집합을 사용하도록 한 곳에서 관리한다.

export const FACILITY_TASK_CATEGORIES: ReadonlySet<string> = new Set([
  "facility",
  "security",
  "cleaning",
  "maintenance",
  "inspection",
  "safety",
  // [Task #697] tasks 페이지의 기본 카테고리(daily_check) 와 점검·수리 카테고리도
  //   시설 카드로 분류한다. 시설 운영의 일상 점검·정비가 빠지지 않도록.
  "daily_check",
  "safety_inspection",
  "repair",
]);

export const ACCOUNTING_TASK_CATEGORIES: ReadonlySet<string> = new Set([
  "accounting",
  "tax",
  "finance",
  // [Task #697] 회계·세무·정산 관련 변형 카테고리도 포함.
  "fee",
  "billing",
]);

export const FACILITY_TASK_TYPES: ReadonlySet<string> = new Set([
  "facility",
  "security",
  "cleaning",
]);

export const ACCOUNTING_TASK_TYPES: ReadonlySet<string> = new Set([
  "accounting",
  "fee",
]);

// ── 입력 정규화 ──────────────────────────────────────────────────
function normalize(value: string | null | undefined): string {
  if (!value) return "";
  return value.toString().trim().toLowerCase();
}

// ── 카테고리/타입 → 역할 매핑 ─────────────────────────────────────

/**
 * `tasks.category` 또는 facility 카테고리 문자열 → 합리적인 `targetRoles` 기본값.
 *
 *   - 시설 화이트리스트 → `["manager", "facility_staff"]`
 *   - 회계 화이트리스트 → `["manager", "accountant"]`
 *   - administrative → `["manager"]`
 *   - 그 외(other/etc/null/빈 문자열) → `["manager"]` (보수적 기본값)
 *
 * 항상 `manager` 를 포함시키므로 기존 관리소장 카드는 회귀하지 않는다.
 */
export function categoryToTargetRoles(
  category: string | null | undefined,
): AppRole[] {
  const c = normalize(category);
  if (FACILITY_TASK_CATEGORIES.has(c)) return ["manager", "facility_staff"];
  if (ACCOUNTING_TASK_CATEGORIES.has(c)) return ["manager", "accountant"];
  return ["manager"];
}

/**
 * `task_templates.taskType` → 합리적인 `targetRoles` 기본값.
 *
 *   - 시설/보안/청소 → `["manager", "facility_staff"]`
 *   - 회계/관리비 → `["manager", "accountant"]`
 *   - 그 외 → `["manager"]`
 */
export function taskTypeToTargetRoles(
  taskType: string | null | undefined,
): AppRole[] {
  const t = normalize(taskType);
  if (FACILITY_TASK_TYPES.has(t)) return ["manager", "facility_staff"];
  if (ACCOUNTING_TASK_TYPES.has(t)) return ["manager", "accountant"];
  return ["manager"];
}

// ── 비템플릿 자동 알림용 기본 역할 매핑 ────────────────────────────
//   /dashboard/alerts 의 5종 알림 빌더가 응답에 채울 `targetRoles`.
//   클라이언트 splitDashboardAlerts 가 "type 추정" 대신 직접 신뢰하는 값.

export const DEFAULT_ALERT_TARGET_ROLES: Record<string, AppRole[]> = {
  // 하자담보는 시설/소장/본부장 모두 시야에 있어야 함.
  warranty_expiry: ["manager", "facility_staff", "hq_executive"],
  // 세무는 경리와 소장.
  tax_due: ["manager", "accountant"],
  // 자료파기/공고문은 소장 책임.
  data_destruction: ["manager"],
  notice_posting: ["manager"],
  // 견적 도착은 발주 라인(소장).
  quote_received: ["manager"],
};

/**
 * inspection_due 알림의 inspectionType 별 역할 매핑.
 *
 *   - legal / self_regular / biweekly / seasonal → 시설+소장
 *   - administrative → 소장 단독 (행정점검)
 *   - 분류 불명(null) → 시설+소장 (보수적으로 시설도 포함)
 */
export function inspectionTargetRoles(
  inspectionType: string | null | undefined,
): AppRole[] {
  const t = normalize(inspectionType);
  if (t === "administrative") return ["manager"];
  return ["manager", "facility_staff"];
}

/**
 * targetRoles 배열에 특정 역할이 포함돼 있는지 검사.
 * 빈 배열/null 은 "전체 공통" 의미가 아니라 "정보 없음" 으로 취급해 false 반환.
 */
export function targetRolesIncludes(
  roles: readonly string[] | null | undefined,
  role: string,
): boolean {
  if (!Array.isArray(roles) || roles.length === 0) return false;
  return roles.includes(role);
}
