// [Task #697] 역할별 대시보드 알림 분류 회귀 테스트.
//
// 새 분류 규칙(`isFacilityLegalAlert` / `isAccountantLegalAlert` 가
// `targetRoles` 를 카테고리/타입 추정보다 먼저 신뢰하는 동작) 을 잠그고,
// Task #681 이전부터 있던 매니저 동작이 회귀하지 않는지 확인한다.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  splitDashboardAlerts,
  type DashboardAlertRole,
} from "./dashboard-alert-filters.js";
import type { DashboardAlert } from "./alert-utils.js";

function alert(over: Partial<DashboardAlert>): DashboardAlert {
  return {
    id: 0,
    type: "task_template_mandatory",
    title: "t",
    message: "m",
    severity: "info",
    createdAt: new Date(0).toISOString(),
    ...over,
  } as DashboardAlert;
}

function legalIds(
  alerts: DashboardAlert[],
  role: DashboardAlertRole,
): number[] {
  return splitDashboardAlerts(alerts, role).legalAlerts.map((a) => a.id);
}

test("manager role keeps legacy split (legal vs proposed)", () => {
  const alerts: DashboardAlert[] = [
    alert({ id: 1, type: "inspection_due", inspectionType: "legal" }),
    alert({ id: 2, type: "inspection_due", inspectionType: "self_regular" }),
    alert({ id: 3, type: "task_template_mandatory" }),
    alert({ id: 4, type: "task_template_suggested" }),
    alert({ id: 5, type: "notice_posting" }),
    alert({ id: 6, type: "tax_due" }),
    alert({ id: 7, type: "warranty_expiry" }),
    alert({ id: 8, type: "data_destruction" }),
  ];
  const { legalAlerts, proposedAlerts } = splitDashboardAlerts(alerts, "manager");
  // notice_posting 은 manager 에서 legacy 동작상 legal/proposed 양쪽에 노출된다
  // (Task #389 이후 dashboard-manager-legacy 의 기존 동작을 그대로 유지).
  assert.deepEqual(
    legalAlerts.map((a) => a.id).sort((a, b) => a - b),
    [1, 3, 5, 6, 7, 8],
  );
  assert.deepEqual(
    proposedAlerts.map((a) => a.id).sort((a, b) => a - b),
    [2, 4, 5],
  );
});

test("facility role: facility category task_overdue is included", () => {
  const alerts: DashboardAlert[] = [
    alert({ id: 1, type: "task_overdue", category: "facility" }),
    alert({ id: 2, type: "task_overdue", category: "accounting" }),
    alert({ id: 3, type: "task_overdue", category: "daily_check" }),
    alert({ id: 4, type: "task_overdue", category: "other" }),
    alert({ id: 5, type: "task_overdue", category: null }),
  ];
  // facility, daily_check 만 시설 카드에 노출 (accounting/other/null 은 제외)
  assert.deepEqual(legalIds(alerts, "facility_staff").sort((a, b) => a - b), [1, 3]);
});

test("facility role: warranty + inspection types included", () => {
  const alerts: DashboardAlert[] = [
    alert({ id: 1, type: "warranty_expiry" }),
    alert({ id: 2, type: "inspection_due", inspectionType: "legal" }),
    alert({ id: 3, type: "inspection_due", inspectionType: "self_regular" }),
    alert({ id: 4, type: "tax_due" }),
    alert({ id: 5, type: "data_destruction" }),
    alert({ id: 6, type: "notice_posting" }),
  ];
  assert.deepEqual(legalIds(alerts, "facility_staff").sort((a, b) => a - b), [1, 2, 3]);
});

test("facility role: administrative inspection is excluded unless explicitly targeted", () => {
  const alerts: DashboardAlert[] = [
    alert({ id: 1, type: "inspection_due", inspectionType: "administrative" }),
    alert({
      id: 2,
      type: "inspection_due",
      inspectionType: "administrative",
      targetRoles: ["manager", "facility_staff"],
    }),
  ];
  assert.deepEqual(legalIds(alerts, "facility_staff"), [2]);
});

test("accountant role: tax_due always included; only accounting tasks", () => {
  const alerts: DashboardAlert[] = [
    alert({ id: 1, type: "tax_due" }),
    alert({ id: 2, type: "task_overdue", category: "accounting" }),
    alert({ id: 3, type: "task_overdue", category: "tax" }),
    alert({ id: 4, type: "task_overdue", category: "facility" }),
    alert({ id: 5, type: "warranty_expiry" }),
    alert({ id: 6, type: "data_destruction" }),
    alert({ id: 7, type: "task_template_mandatory", taskType: "fee" }),
    alert({ id: 8, type: "task_template_mandatory", taskType: "facility" }),
  ];
  assert.deepEqual(legalIds(alerts, "accountant").sort((a, b) => a - b), [1, 2, 3, 7]);
});

test("Task #697: explicit targetRoles takes priority over type inference", () => {
  const alerts: DashboardAlert[] = [
    // facility_staff 명시 → facility 카드에 무조건 노출
    alert({
      id: 1,
      type: "task_overdue",
      category: "other",
      targetRoles: ["manager", "facility_staff"],
    }),
    // accountant 명시 → accountant 카드에 무조건 노출 (data_destruction 인데도)
    alert({
      id: 2,
      type: "data_destruction",
      targetRoles: ["accountant"],
    }),
    // 둘 다 명시 → 양쪽 카드에 노출
    alert({
      id: 3,
      type: "task_template_mandatory",
      taskType: "other",
      targetRoles: ["facility_staff", "accountant"],
    }),
  ];
  assert.deepEqual(legalIds(alerts, "facility_staff").sort((a, b) => a - b), [1, 3]);
  assert.deepEqual(legalIds(alerts, "accountant").sort((a, b) => a - b), [2, 3]);
});

test("Task #697: task_template_mandatory with manager-only targetRoles is excluded from other roles", () => {
  const alerts: DashboardAlert[] = [
    alert({
      id: 1,
      type: "task_template_mandatory",
      taskType: "facility",
      targetRoles: ["manager"],
    }),
  ];
  // [Task #697] explicit targetRoles 가 ["manager"] 만이면, taskType=facility 라도
  //   시설 카드에서 제외돼야 한다. (explicit 가 type/카테고리 휴리스틱보다 우선)
  assert.deepEqual(legalIds(alerts, "facility_staff"), []);
  assert.deepEqual(legalIds(alerts, "manager").sort((a, b) => a - b), [1]);
});

test("Task #697: explicit targetRoles excluding role overrides type-based inclusion", () => {
  const alerts: DashboardAlert[] = [
    // tax_due 인데 explicit 가 manager 만 — accountant 카드에서 제외돼야 함.
    alert({
      id: 1,
      type: "tax_due",
      targetRoles: ["manager"],
    }),
    // warranty_expiry 인데 explicit 가 manager 만 — facility 카드에서 제외돼야 함.
    alert({
      id: 2,
      type: "warranty_expiry",
      targetRoles: ["manager"],
    }),
    // inspection_due (legal) 인데 explicit 가 manager 만 — facility 카드에서 제외.
    alert({
      id: 3,
      type: "inspection_due",
      inspectionType: "legal",
      targetRoles: ["manager"],
    }),
  ];
  assert.deepEqual(legalIds(alerts, "accountant"), []);
  assert.deepEqual(legalIds(alerts, "facility_staff"), []);
  assert.deepEqual(legalIds(alerts, "manager").sort((a, b) => a - b), [1, 2, 3]);
});

test("Task #697: empty/missing targetRoles falls back to type/category heuristic", () => {
  const alerts: DashboardAlert[] = [
    // targetRoles 누락 → fallback 으로 facility 노출 (warranty_expiry).
    alert({ id: 1, type: "warranty_expiry" }),
    // targetRoles=[] → fallback. tax_due 는 accountant 노출.
    alert({ id: 2, type: "tax_due", targetRoles: [] }),
  ];
  assert.deepEqual(legalIds(alerts, "facility_staff"), [1]);
  assert.deepEqual(legalIds(alerts, "accountant"), [2]);
});
