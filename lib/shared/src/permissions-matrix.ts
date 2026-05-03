// [Task #773] 권한·감사로그 엔진 — 역할 × 액션 매트릭스 (단일 출처).
//
// 이 파일은 모든 도메인 엔진(T3~T10)이 공유하는 권한 매트릭스다. 흩어져 있던
// `requireRole(['accountant', ...])` 분산 호출은 점진적으로 이 매트릭스로 흡수된다.
//
//   - 서버: `can(role, action)` 헬퍼로 라우트 가드.
//   - 클라이언트: `useCan(action)` 훅으로 UI 분기.
//   - 감사로그 미들웨어 `audit('action')` 도 같은 액션 키를 그대로 사용한다.
//
// 액션 키 규칙: `<도메인>.<엔티티>.<동사>` — 도메인 단위로 묶어서 grep 가독성을 살린다.
// 새 액션을 추가할 때는 반드시 이 파일에 행을 추가하고 ROLES 컬럼을 모두 채운다.
//
// [Task #773 spec] 매트릭스 위치는 `lib/permissions/matrix.ts` 로 명세돼 있으나,
// 현재 monorepo 가 leaf TS 패키지를 lib/* 에 두는 컨벤션이고 새 lib 패키지를 추가
// 할 때 root tsconfig refs / project refs 를 모두 손봐야 하므로, 동등한 의미를
// 갖는 `lib/shared/src/permissions-matrix.ts` 에 배치한다 (export 경로:
// `@workspace/shared/permissions-matrix`).

import type { AppRole } from "./role-labels.js";

/** 7대 표준 액션 + 후속 엔진의 도메인 액션을 합한 전체 키 집합. */
export const AUDIT_ACTIONS = [
  // ── 7대 표준 액션 (T2 spec) ────────────────────────────────────
  "expense_voucher.create",
  "expense_voucher.update",
  "expense_voucher.cancel",
  "journal.post",
  "journal.reverse",
  "billing.calculate",
  "billing.finalize",
  "closing.lock",
  "closing.unlock",
  "dispatch.send",
  "dispatch.retry",
  "permission.change",
  "data.export",
  "audit_log.view",

  // ── 결재 라인 (#707/#611) ──────────────────────────────────────
  "approval.draft.create",
  "approval.draft.update",
  "approval.draft.delete",
  "approval.line.submit",
  "approval.line.urgent_execute",
  "approval.step.approve",
  "approval.step.reject",
  "approval.step.process_offline",
  "approval.signed_copy.upload",
  "approval.signed_copy.delete",
  "approval.contract_evidence.register",
  // [Task #775] 정체된 결재단계 알림 발송, 정기지출 라인 복제.
  "approval.line.notify_stalled",
  "expense_voucher.duplicate",

  // ── 본부장 임계 금액 ───────────────────────────────────────────
  "hq_threshold.update",

  // ── 부과·관리비 (T7 placeholder) ───────────────────────────────
  "fees.payment.record",
  "fees.kakao.notify",
  "fees.interim.calculate",

  // ── 부과엔진 v01 (#777) ────────────────────────────────────
  "billing.settings.update",
  "billing.installment.create",
  "billing.installment.update",
  "billing.installment.delete",
  "billing.adjustment.create",
  "billing.line.override",

  // ── 건물 응대자료 (#178) ───────────────────────────────────────
  "building_record.upsert",
  "building_record.delete",

  // ── 예산·집행통제 (#776) ───────────────────────────────────────
  "budget.upsert",
  "budget.approve",
  "budget.override.allow",

  // ── 고지·수납엔진 v01 (#779) ───────────────────────────────
  "bill.generate",
  "bill.void",
  "bill.payment.record",
  "bill.payment.reverse",
  "bank_tx.import",
  "bank_tx.match",
  "delinquency.stage.set",
  "delinquency.dispatch.send",
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

/** 위험 액션 — 사유 칩 + 2단계 확인 필수. UI 가 빨간 큰 버튼으로 렌더한다. */
export const DESTRUCTIVE_ACTIONS = new Set<AuditAction>([
  "expense_voucher.cancel",
  "journal.reverse",
  "closing.unlock",
  "approval.draft.delete",
  "approval.step.reject",
  "approval.signed_copy.delete",
  "building_record.delete",
  "billing.installment.delete",
  "bill.void",
  "bill.payment.reverse",
]);

/** 표시용 라벨 — 감사로그 화면 칩, 로그 메시지 등에서 사용. */
export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  "expense_voucher.create": "지출결의서 발행",
  "expense_voucher.update": "지출결의서 출납등록",
  "expense_voucher.cancel": "지출결의서 취소",
  "journal.post": "분개 전기",
  "journal.reverse": "분개 역분개",
  "billing.calculate": "관리비 산출",
  "billing.finalize": "관리비 확정",
  "closing.lock": "마감",
  "closing.unlock": "마감 해제",
  "dispatch.send": "발송",
  "dispatch.retry": "발송 재시도",
  "permission.change": "권한 변경",
  "data.export": "데이터 내보내기",
  "audit_log.view": "감사로그 조회",

  "approval.draft.create": "기안서 작성",
  "approval.draft.update": "기안서 수정",
  "approval.draft.delete": "기안서 삭제",
  "approval.line.submit": "결재 라인 상신",
  "approval.line.urgent_execute": "긴급 집행(사후결재)",
  "approval.step.approve": "결재 승인",
  "approval.step.reject": "결재 반려",
  "approval.step.process_offline": "오프라인 결재 마감",
  "approval.signed_copy.upload": "서명본 업로드",
  "approval.signed_copy.delete": "서명본 삭제",
  "approval.contract_evidence.register": "계약·증빙 등록",
  "approval.line.notify_stalled": "정체 결재자 알림 발송",
  "expense_voucher.duplicate": "정기지출 라인 복제",

  "hq_threshold.update": "본부장 임계 금액 변경",

  "fees.payment.record": "관리비 수납 기록",
  "fees.kakao.notify": "관리비 알림 발송",
  "fees.interim.calculate": "중간정산 산출",

  "billing.settings.update": "부과환경 변경",
  "billing.installment.create": "분할부과 등록",
  "billing.installment.update": "분할부과 수정",
  "billing.installment.delete": "분할부과 삭제",
  "billing.adjustment.create": "부과 조정 등록",
  "billing.line.override": "호실 부과액 보정",

  "building_record.upsert": "응대자료 저장",
  "building_record.delete": "응대자료 삭제",

  "budget.upsert": "예산 편성",
  "budget.approve": "예산 의결 승인",
  "budget.override.allow": "예산 초과 집행 승인",

  "bill.generate": "고지서 발행",
  "bill.void": "고지서 무효 처리",
  "bill.payment.record": "수납 기록",
  "bill.payment.reverse": "수납 취소",
  "bank_tx.import": "통장 내역 업로드",
  "bank_tx.match": "통장 내역 매칭",
  "delinquency.stage.set": "연체 단계 변경",
  "delinquency.dispatch.send": "연체 안내 발송",
};

/** 매트릭스 행: 액션 → 허용 역할 집합. true 인 항목만 통과한다. */
type RolePermissionRow = Partial<Record<AppRole, boolean>>;

const ALL_BUILDING_OPS: RolePermissionRow = {
  manager: true,
  accountant: true,
  facility_staff: true,
  platform_admin: true,
};

/**
 * 역할 × 액션 매트릭스.
 *
 * 명시되지 않은 (action, role) 쌍은 false 로 간주한다. 즉 "허용된 역할만 등록".
 *
 * [구코드 검토 보고]
 *   - `accountant.approval.approve = false` 는 명시적으로 보존(후속 회귀 방지).
 *   - 결재 결정권자(approval.step.approve/reject)는 hq_executive / custodian /
 *     platform_admin 만 허용 (#707 정책).
 *   - 마감 해제(closing.unlock)는 관리소장 단독 불가 — 본부장/플랫폼관리자 승인 필요.
 */
export const PERMISSION_MATRIX: Record<AuditAction, RolePermissionRow> = {
  // ── 지출결의서 ───────────────────────────────────────────────
  "expense_voucher.create": { manager: true, accountant: true, platform_admin: true },
  "expense_voucher.update": { accountant: true, platform_admin: true },
  // 취소는 경리 + 플랫폼관리자만 (본부장은 본 라인의 결재 결정권자이지 회계 처리권자가 아님).
  "expense_voucher.cancel": { accountant: true, platform_admin: true },

  // ── 분개·회계 (T6) ──────────────────────────────────────────
  "journal.post": { accountant: true, platform_admin: true },
  "journal.reverse": { accountant: true, platform_admin: true, hq_executive: true },

  // ── 부과·관리비 ─────────────────────────────────────────────
  "billing.calculate": { manager: true, accountant: true, platform_admin: true },
  "billing.finalize": { manager: true, accountant: true, platform_admin: true },

  // ── 마감 ────────────────────────────────────────────────────
  "closing.lock": { accountant: true, manager: true, platform_admin: true },
  // [T2 spec] 마감 해제는 관리소장 단독 불가. 본부장 또는 플랫폼관리자만.
  "closing.unlock": { hq_executive: true, platform_admin: true },

  // ── 발송·통지 ───────────────────────────────────────────────
  // custodian 은 입금요청서 송금(payment-requests/:id/remit) 권한이 있다 (#611).
  "dispatch.send": { manager: true, accountant: true, custodian: true, platform_admin: true },
  "dispatch.retry": { manager: true, accountant: true, platform_admin: true },

  // ── 권한 변경·내보내기 ───────────────────────────────────────
  "permission.change": { platform_admin: true, hq_executive: true },
  // custodian(관리단장) 도 본인 건물 감사로그 CSV 를 내려받을 수 있어야 한다 (책임 추적).
  "data.export": { manager: true, accountant: true, custodian: true, platform_admin: true, hq_executive: true },
  // [Task #773] 감사로그 화면 자체의 가시성 — 매트릭스에서 한 곳으로 관리.
  "audit_log.view": { platform_admin: true, hq_executive: true, custodian: true },

  // ── 결재 라인 ───────────────────────────────────────────────
  "approval.draft.create": { manager: true, accountant: true, hq_executive: true, platform_admin: true },
  "approval.draft.update": { manager: true, accountant: true, hq_executive: true, platform_admin: true },
  "approval.draft.delete": { manager: true, accountant: true, hq_executive: true, platform_admin: true },
  "approval.line.submit": { manager: true, accountant: true, hq_executive: true, platform_admin: true },
  "approval.line.urgent_execute": { manager: true, platform_admin: true },
  // [#707 정책 보존] 경리는 결재 결정권자가 아니다.
  "approval.step.approve": { hq_executive: true, custodian: true, manager: true, platform_admin: true },
  "approval.step.reject": { hq_executive: true, custodian: true, manager: true, platform_admin: true },
  "approval.step.process_offline": { manager: true, platform_admin: true },
  "approval.signed_copy.upload": { manager: true, accountant: true, hq_executive: true, custodian: true, platform_admin: true },
  "approval.signed_copy.delete": { manager: true, platform_admin: true },
  "approval.contract_evidence.register": { manager: true, accountant: true, platform_admin: true },
  // [Task #775] 정체 알림은 상신자(manager)/같은 건물 회계가 누를 수 있고, 복제는 manager·accountant.
  "approval.line.notify_stalled": { manager: true, accountant: true, hq_executive: true, platform_admin: true },
  "expense_voucher.duplicate": { manager: true, accountant: true, platform_admin: true },

  // ── 본부장 임계 금액 ────────────────────────────────────────
  "hq_threshold.update": { hq_executive: true, platform_admin: true },

  // ── 부과·관리비 운영 ────────────────────────────────────────
  "fees.payment.record": { manager: true, accountant: true, platform_admin: true },
  "fees.kakao.notify": { manager: true, accountant: true, platform_admin: true },
  "fees.interim.calculate": ALL_BUILDING_OPS,

  // ── 건물 응대자료 ───────────────────────────────────────────
  "building_record.upsert": { manager: true, accountant: true, platform_admin: true },
  "building_record.delete": { accountant: true, platform_admin: true },

  // ── 고지·수납엔진 v01 (#779) ───────────────────────────────
  "bill.generate": { manager: true, accountant: true, platform_admin: true },
  "bill.void": { accountant: true, platform_admin: true },
  "bill.payment.record": { manager: true, accountant: true, platform_admin: true },
  "bill.payment.reverse": { accountant: true, platform_admin: true },
  "bank_tx.import": { manager: true, accountant: true, platform_admin: true },
  "bank_tx.match": { manager: true, accountant: true, platform_admin: true },
  "delinquency.stage.set": { manager: true, accountant: true, platform_admin: true },
  "delinquency.dispatch.send": { manager: true, accountant: true, platform_admin: true },

  // ── 부과엔진 v01 (#777) ────────────────────────────────────
  "billing.settings.update": { manager: true, accountant: true, platform_admin: true },
  "billing.installment.create": { manager: true, accountant: true, platform_admin: true },
  "billing.installment.update": { manager: true, accountant: true, platform_admin: true },
  "billing.installment.delete": { accountant: true, platform_admin: true },
  "billing.adjustment.create": { manager: true, accountant: true, platform_admin: true },
  "billing.line.override": { manager: true, accountant: true, platform_admin: true },

  // ── 예산·집행통제 ───────────────────────────────────────────
  // 편성은 경리·관리소장이 입력, 의결 승인은 본부장/관리단장/플랫폼관리자.
  "budget.upsert": { manager: true, accountant: true, platform_admin: true },
  "budget.approve": { hq_executive: true, custodian: true, platform_admin: true },
  // 초과 집행 사유 입력 후 진행 — 결재 라인을 만드는 역할들과 동일.
  "budget.override.allow": { manager: true, accountant: true, hq_executive: true, custodian: true, platform_admin: true },
};

/** 서버·클라이언트 공용 가드. */
export function can(role: string | null | undefined, action: AuditAction): boolean {
  if (!role) return false;
  const row = PERMISSION_MATRIX[action];
  if (!row) return false;
  return row[role as AppRole] === true;
}

/** 위험 액션 여부. 클라이언트가 사유 칩 + 2단계 확인을 띄울지 결정한다. */
export function isDestructive(action: AuditAction): boolean {
  return DESTRUCTIVE_ACTIONS.has(action);
}

/** 액션 표시 라벨. */
export function actionLabel(action: AuditAction | string): string {
  if (action in AUDIT_ACTION_LABELS) return AUDIT_ACTION_LABELS[action as AuditAction];
  return action;
}
