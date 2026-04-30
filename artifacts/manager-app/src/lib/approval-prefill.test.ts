// [Task #719] /approvals/create 경로 정합화 회귀 방지 테스트.
//   알림 다이얼로그·일/주/월간 일지·공고문 템플릿·리포트 시스템에서
//   "기안서로 만들기"를 눌렀을 때 라우터에 등록된 경로(/approvals/create)
//   로 이동하는지 검증한다. 과거 잘못된 경로(/approval-create)로 회귀하면
//   바로 실패한다.
//
//   추가로 권한 정합성도 같이 잠근다 — "기안서로 만들기" 진입점은 모든
//   건물 역할(관리소장/경리/시설기사/관리인) 에서 공통 사용되므로
//   /approvals/create access 가 4 역할 모두 포함하는지 확인한다.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildApprovalPrefillSearch,
  buildApprovalPrefillUrl,
} from "./approval-prefill";
import { ROUTES } from "./permissions";

test("buildApprovalPrefillUrl 은 /approvals/create 로 시작한다", () => {
  const url = buildApprovalPrefillUrl({
    kind: "alert_action_output",
    sourceTable: "alert_actions",
    title: "엘리베이터 정기 점검",
    metadata: { category: "maintenance", alertId: 42 },
  });
  assert.ok(
    url.startsWith("/approvals/create?"),
    `expected /approvals/create prefix, got: ${url}`,
  );
  assert.ok(!url.includes("/approval-create"), "must not use legacy path");
});

test("buildApprovalPrefillSearch 는 표준 prefill 키와 출처 정보를 담는다", () => {
  const params = buildApprovalPrefillSearch({
    kind: "alert_action_output",
    sourceTable: "alert_actions",
    title: "엘리베이터 정기 점검",
    metadata: {
      category: "maintenance",
      alertType: "elevator",
      alertId: 42,
    },
  });
  assert.equal(params.get("prefill"), "1");
  assert.equal(params.get("source_kind"), "alert_action_output");
  assert.equal(params.get("source_table"), "alert_actions");
  assert.equal(params.get("category"), "maintenance");
  assert.equal(params.get("title"), "엘리베이터 정기 점검");
});

test("notice_output / weekly_report / monthly_report / journal 진입도 동일 경로", () => {
  for (const kind of [
    "notice_output",
    "weekly_report",
    "monthly_report",
    "journal",
  ] as const) {
    const url = buildApprovalPrefillUrl({
      kind,
      sourceTable: "x",
      sourceId: 1,
      title: "t",
    });
    assert.ok(
      url.startsWith("/approvals/create?"),
      `${kind} should target /approvals/create, got: ${url}`,
    );
  }
});

test("/approvals/create 라우트가 ROUTES 에 등록되어 있고 prefill 진입을 쓰는 4 역할 모두 access 보유", () => {
  // [Task #719 review-fix] 알림 다이얼로그·보고서·공고문 등에서 "기안서로 만들기"를
  //   누르는 4 역할(관리소장/경리/시설기사/관리인) 모두 라우터 access 가
  //   있어야 navigate 후 작성 화면이 정상 렌더된다.
  const route = ROUTES.find((r) => r.path === "/approvals/create");
  assert.ok(route, "/approvals/create 가 ROUTES 에 등록되어 있어야 한다");
  for (const role of [
    "manager",
    "accountant",
    "facility_staff",
    "custodian",
  ] as const) {
    assert.ok(
      route!.access.includes(role),
      `${role} 역할이 /approvals/create access 에 포함되어야 한다 (현재: ${route!.access.join(",")})`,
    );
  }
});

test("ROUTES 에 잘못된 구 경로(/approval-create)가 존재하지 않는다", () => {
  // [Task #719 review-fix] 라우터에 등록되지 않은 구 경로로 회귀하지 않도록 잠근다.
  const wrong = ROUTES.find((r) => r.path === "/approval-create");
  assert.equal(wrong, undefined, "라우터에 /approval-create 경로가 다시 등록되면 안 된다");
});
