// [Task #752] 비-관리소장 4개 역할 모바일 스모크 테스트.
//
// 시나리오 — 각 역할별로 모바일 뷰포트(390x844) 에서:
//   1. /login 의 DEV 빠른 로그인 버튼으로 로그인.
//   2. 대시보드 홈에서:
//      - body[data-role] 가 정확히 세팅 (CSS 스코프 회귀 차단).
//      - 가로 스크롤 0 (documentElement.scrollWidth ≤ viewport+1).
//      - 하단 탭바 .layout-bottom-nav 가 보이고 paddingBottom ≥ 0.
//      - 보이는 button 의 height ≥ 44px (.inline-icon-btn ≥32px 예외).
//      - 폼 입력(input/select/textarea) 의 fontSize ≥ 16px (iOS 자동 줌
//        방지) — 페이지에 입력이 있을 때만.
//      - 역할별 모바일 분기 testid 가 있다면 보인다.
//   3. 대시보드 → 대표 리스트 페이지 1개로 이동, 동일 회귀 검사 반복:
//      - 가로 스크롤 0
//      - 보이는 button height ≥ 44px
//
// 실행:
//   pnpm --filter @workspace/manager-app run e2e
import { test, expect, type Page } from "@playwright/test";

interface RoleCase {
  label: string;
  role: "facility_staff" | "platform_admin" | "hq_executive" | "partner";
  homeTestId?: string;
  /** 대시보드에서 이동해서 회귀 검사를 한 번 더 돌릴 대표 리스트 페이지. */
  listPath: string;
}

const ROLES: RoleCase[] = [
  {
    label: "시설기사",
    role: "facility_staff",
    homeTestId: "facility-dashboard-mobile",
    listPath: "/maintenance-logs",
  },
  // 관리자: 보유 메뉴가 가장 많음 — 수수료 정산 표(commissions) 가
  // 데스크톱-전용 표 + 모바일 카드 분기를 둘 다 갖고 있어 회귀 가치가 높다.
  { label: "관리자", role: "platform_admin", listPath: "/commissions" },
  // 본부장: /reports 가 권한이 있는 대표 페이지.
  { label: "본부장", role: "hq_executive", listPath: "/reports" },
  // 파트너사: 가장 자주 보는 페이지가 /rfqs (견적 요청 목록).
  { label: "파트너사", role: "partner", listPath: "/rfqs" },
];

const MOBILE_VIEWPORT = { width: 390, height: 844 };

async function quickLogin(page: Page, label: string) {
  await page.goto("/login");
  const button = page.getByRole("button", { name: label, exact: true });
  await expect(button).toBeVisible({ timeout: 15_000 });
  await button.click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), {
    timeout: 15_000,
  });
}

/** 가로 스크롤이 발생하는지 확인. 1px 부동소수 오차 허용. */
async function assertNoHorizontalScroll(page: Page, viewportWidth: number) {
  const scrollWidth = await page.evaluate(() =>
    Math.max(
      document.documentElement.scrollWidth,
      document.body.scrollWidth,
    ),
  );
  expect(
    scrollWidth,
    `가로 스크롤 — documentElement.scrollWidth=${scrollWidth}`,
  ).toBeLessThanOrEqual(viewportWidth + 1);
}

/** 보이는 button 의 height 가 ≥44px 인지 확인 (.inline-icon-btn ≥32px 예외). */
async function assertTouchTargets(page: Page, sampleSize = 30) {
  const offenders = await page.evaluate((max) => {
    const els = Array.from(
      document.querySelectorAll<HTMLElement>("button, [role='button']"),
    ).slice(0, max);
    const out: { html: string; h: number; min: number }[] = [];
    for (const b of els) {
      const r = b.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue; // 숨김
      const cls = typeof b.className === "string" ? b.className : "";
      const minH = cls.includes("inline-icon-btn") ? 32 : 44;
      if (r.height < minH - 0.5) {
        out.push({
          html: (b.outerHTML || "").slice(0, 140),
          h: r.height,
          min: minH,
        });
      }
    }
    return out;
  }, sampleSize);
  expect(offenders, `터치 타겟 미달: ${JSON.stringify(offenders)}`).toEqual([]);
}

/** 보이는 input/select/textarea 의 fontSize 가 ≥16px 인지 (iOS 줌 방지). */
async function assertInputFontSize(page: Page) {
  const offenders = await page.evaluate(() => {
    const els = Array.from(
      document.querySelectorAll<HTMLElement>("input, select, textarea"),
    );
    const out: { tag: string; fs: number }[] = [];
    for (const el of els) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      // hidden/숨겨진 input 제외 (type=hidden, search 헬퍼 등)
      if (el instanceof HTMLInputElement && el.type === "hidden") continue;
      const fs = parseFloat(window.getComputedStyle(el).fontSize || "0");
      if (fs < 16 - 0.5) {
        out.push({ tag: el.tagName.toLowerCase(), fs });
      }
    }
    return out;
  });
  expect(offenders, `iOS 자동 줌 위험 입력: ${JSON.stringify(offenders)}`).toEqual([]);
}

for (const { label, role, homeTestId, listPath } of ROLES) {
  test(`[${role}] 모바일 스모크 — 대시보드 + ${listPath}`, async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await quickLogin(page, label);

    // body[data-role] 는 useEffect 로 set — 데이터 로드까지 살짝 대기.
    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});

    // ── 1) 대시보드 검사 ────────────────────────────────────
    const dataRole = await page.evaluate(() =>
      document.body.getAttribute("data-role"),
    );
    expect(dataRole, "body[data-role]").toBe(role);

    await assertNoHorizontalScroll(page, MOBILE_VIEWPORT.width);

    const bottomNav = page.locator("nav.layout-bottom-nav");
    await expect(bottomNav).toBeVisible();
    const paddingBottomPx = await bottomNav.evaluate((el) =>
      parseFloat(window.getComputedStyle(el).paddingBottom || "0"),
    );
    expect(paddingBottomPx).toBeGreaterThanOrEqual(0);

    await assertTouchTargets(page);
    await assertInputFontSize(page);

    if (homeTestId) {
      await expect(page.getByTestId(homeTestId)).toBeVisible({ timeout: 10_000 });
    }

    // ── 2) 대표 리스트 페이지로 이동 후 회귀 검사 ─────────────
    await page.goto(listPath);
    await page
      .waitForLoadState("networkidle", { timeout: 15_000 })
      .catch(() => {});

    // role 은 그대로 유지되어야 한다 (라우팅 회귀 차단).
    const dataRoleAfter = await page.evaluate(() =>
      document.body.getAttribute("data-role"),
    );
    expect(dataRoleAfter, `${listPath} 이동 후 body[data-role]`).toBe(role);

    await assertNoHorizontalScroll(page, MOBILE_VIEWPORT.width);
    await assertTouchTargets(page);

    // ── 3) 리스트 → 상세/액션 화면 회귀 검사 ─────────────────────
    //   리스트 페이지의 첫 행/카드가 가진 "보기" 또는 "상세" 액션을
    //   클릭해 드릴다운 한 단계 더 들어간 뒤(없으면 대시보드 메뉴의 첫
    //   번째 카드 링크로 대체) 동일 회귀 검사를 한 번 더 한다.
    //   페이지 모양이 역할마다 달라서 가장 흔한 두 가지 패턴만 시도하고,
    //   둘 다 매칭이 없으면 단순히 대시보드 홈으로 돌아와 회귀 검사만
    //   수행한다 (테스트가 환경/데이터 상태에 좌우되지 않게).
    const drillCandidates = [
      page.getByRole("link", { name: /상세|보기|확인/ }).first(),
      page.getByRole("button", { name: /상세|보기|확인|편집/ }).first(),
      page.locator("a[href*='/']:visible").first(),
    ];
    let drilled = false;
    for (const candidate of drillCandidates) {
      if (await candidate.count().catch(() => 0)) {
        try {
          await candidate.click({ timeout: 2_000 });
          drilled = true;
          break;
        } catch {
          // 다음 후보 시도
        }
      }
    }
    if (!drilled) {
      await page.goto("/");
    }
    await page
      .waitForLoadState("networkidle", { timeout: 15_000 })
      .catch(() => {});

    await assertNoHorizontalScroll(page, MOBILE_VIEWPORT.width);
    await assertTouchTargets(page);

    // 마지막으로 — 어떤 화면이든 "닫기/뒤로/취소" 와 같은 액션 버튼이
    // 보일 때, 그 버튼이 클릭 가능한 (높이 ≥44px) 영역인지 확인.
    const actionButton = page
      .getByRole("button", {
        name: /저장|제출|확인|승인|반려|닫기|뒤로|취소|등록|로그아웃/,
      })
      .first();
    if (await actionButton.count().catch(() => 0)) {
      const box = await actionButton.boundingBox().catch(() => null);
      if (box) {
        expect(box.height, "주요 액션 버튼 높이").toBeGreaterThanOrEqual(43.5);
      }
    }
  });
}
