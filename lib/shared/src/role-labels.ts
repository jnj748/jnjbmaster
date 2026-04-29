// 역할 표시 라벨 — 단일 소스(SoT).
//
// 6개 역할의 한국어 표시명을 한 곳에서 정의한다. 화면·알림·백엔드 에러
// 메시지 등에서 직접 한국어 문자열을 쓰지 말고 반드시 이 파일의
// `ROLE_LABELS` 또는 `roleLabel(role)` 헬퍼를 거치도록 한다.
//
// 라벨이 향후 다시 바뀔 수 있으므로(예: "본부장" → "지점장"), 라벨만
// 이 파일에서 수정하면 프런트엔드(@workspace/manager-app)와 백엔드
// (@workspace/api-server)가 동시에 반영된다.
//
// 주의: 역할 키(`platform_admin`, `hq_executive` 등)는 DB enum / OpenAPI
// 스키마에서 사용 중이므로 절대 변경하지 말 것. 이 파일에서는 표시
// 라벨(values)만 다룬다.

export type AppRole =
  | "manager"
  | "accountant"
  | "facility_staff"
  | "hq_executive"
  | "platform_admin"
  | "partner"
  // [Task #611] 관리인 — 집합건물법상 예산집행 결정권자. 결재함/입금요청함만 본다.
  | "custodian";

export const ROLE_LABELS: Record<AppRole, string> = {
  manager: "관리소장",
  accountant: "경리",
  facility_staff: "시설기사",
  hq_executive: "본부장",
  platform_admin: "관리자",
  partner: "파트너사",
  custodian: "관리인",
};

/**
 * 임의의 역할 문자열에 대해 표시 라벨을 반환한다.
 * 알 수 없는 값은 입력값을 그대로 돌려준다.
 */
export function roleLabel(role: string | null | undefined): string {
  if (!role) return "";
  if (role in ROLE_LABELS) return ROLE_LABELS[role as AppRole];
  return role;
}

/**
 * 포털(로그인) 단위 라벨. 포털 키는 백엔드 portal_type 컬럼과 일치한다.
 *  - building : 관리소장 / 경리 / 시설기사 공용 건물 포털
 *  - hq       : 본부장 + 관리자 공용 포털
 *  - partner  : 파트너사 포털
 */
// [Task #611] custodian(관리인) 포털 추가 — 결재함/입금요청함 전용 진입.
export type PortalType = "building" | "hq" | "partner" | "custodian";

export const PORTAL_LABELS: Record<PortalType, string> = {
  building: "건물관리",
  hq: ROLE_LABELS.hq_executive,
  partner: ROLE_LABELS.partner,
  custodian: ROLE_LABELS.custodian,
};

/**
 * 본사(HQ) 포털 소속 역할들의 단일 정의.
 *
 * 시설기사 가입 승인 게이트(`approvalGateMiddleware`)는 시설기사 온보딩 흐름을
 * 위해 만들어진 것이므로, 본사 포털 역할(관리자/본부장)은 게이트의 차단 대상에서
 * 제외해야 한다. 향후 HQ 포털에 새 역할이 추가되면 이 배열에만 더하면 된다.
 *
 * 사용처: `artifacts/api-server/src/middlewares/auth.ts`
 */
export const HQ_PORTAL_ROLES = ["platform_admin", "hq_executive"] as const satisfies readonly AppRole[];
export type HqPortalRole = (typeof HQ_PORTAL_ROLES)[number];

export function isHqPortalRole(role: string | null | undefined): role is HqPortalRole {
  return !!role && (HQ_PORTAL_ROLES as readonly string[]).includes(role);
}
