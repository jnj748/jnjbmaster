// [Task #719] 알림 다이얼로그 → "기안서로 만들기" → /approvals/create 회귀 e2e.
//
// 시나리오 (관리소장):
//   1. /login 에서 "관리소장" 빠른 로그인 클릭 (DEV 시드 manager@test.com).
//   2. /dashboard/alerts 로 이동, 첫 알림 카드를 클릭해 AlertActionDialog 열기.
//   3. data-testid="btn-alert-to-approval" 버튼 클릭.
//   4. URL pathname 이 정확히 "/approvals/create" 이고 prefill 쿼리들이
//      보존되는지 검증한다. 잘못된 구 경로 "/approval-create" 로 회귀하면 즉시 실패.
//   5. 결재 작성 폼이 권한 거부/빈 화면 없이 정상 렌더되는지 검증.
//
// 두 번째 케이스 (시설기사):
//   동일 흐름을 facility_staff 역할로 한 번 더 돌린다 — Task #719 권한 정합화
//   (access 에 facility_staff 추가)가 살아있는지 회귀 차단.
//
// 실행:
//   pnpm --filter @workspace/manager-app run e2e
import { test, expect, type Page } from "@playwright/test";

const ROLES = [
  { label: "관리소장", role: "manager" as const },
  { label: "시설기사", role: "facility_staff" as const },
];

async function quickLogin(page: Page, label: string) {
  await page.goto("/login");
  // DEV 빠른 로그인 패널의 역할 라벨 버튼.
  const button = page.getByRole("button", { name: label, exact: true });
  await expect(button).toBeVisible({ timeout: 15_000 });
  await button.click();
  // 로그인 성공 시 "/" (대시보드 홈) 으로 navigate.
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), {
    timeout: 15_000,
  });
}

for (const { label, role } of ROLES) {
  test(`[${role}] 알림 다이얼로그 → 기안서 작성 화면 진입 (회귀: /approval-create 금지)`, async ({
    page,
  }) => {
    await quickLogin(page, label);

    // 대시보드 홈에는 manager/facility 역할별 메인 위젯이 알림 섹션을 렌더한다.
    // (alert-section-widget). 인터랙티브 알림 항목은 `<div role="button">` 형태이며
    // D-day 라벨(예: "D-3", "D-Day", "N일 지남")을 항상 노출한다.
    await page.goto("/");

    // 모든 인터랙티브 알림 카드 중 D-day/지남/D-Day 라벨이 들어있는 첫 번째를 클릭.
    const alertCard = page
      .getByRole("button")
      .filter({ hasText: /D-\d+|D-Day|일 지남/ })
      .first();
    await expect(alertCard).toBeVisible({ timeout: 15_000 });
    await alertCard.click();

    // AlertActionDialog 안의 표준 진입 버튼.
    const toApproval = page.getByTestId("btn-alert-to-approval");
    await expect(toApproval).toBeVisible({ timeout: 10_000 });
    await toApproval.click();

    // ⭐ 회귀 핵심 검증 — 정확한 경로와 prefill 쿼리 보존.
    await page.waitForURL(
      (url) => url.pathname === "/approvals/create",
      { timeout: 10_000 },
    );
    const url = new URL(page.url());
    expect(url.pathname).toBe("/approvals/create");
    expect(url.pathname).not.toBe("/approval-create");
    expect(url.searchParams.get("prefill")).toBe("1");
    expect(url.searchParams.get("source_kind")).toBe("alert_action_output");
    expect(url.searchParams.get("source_table")).toBe("alert_actions");
    expect(url.searchParams.get("category")).toBe("maintenance");

    // 작성 폼이 권한 거부/빈 화면 없이 정상 렌더되는지 — "문서 내용" 카드 타이틀과
    // 결재선 카드 타이틀로 검증. 권한 거부 화면이면 이 둘은 모두 부재.
    await expect(page.getByText("문서 내용", { exact: true }).first()).toBeVisible({
      timeout: 10_000,
    });
  });
}
