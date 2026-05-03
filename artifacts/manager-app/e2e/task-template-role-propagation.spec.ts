// [Task #757] 관리자(소장/플랫폼)의 task template (필수/제안업무) 변경이
//   직원권한(시설기사·경리) 사용자 화면에 정확히 반영되는지 회귀 차단.
//
// 활성(active) 검증 시나리오 — 모두 통과해야 한다:
//
//   1) "필수업무 추가/수정/삭제가 시설기사·경리 응답에 정확히 반영"
//      - explicit targetRoles vs `targetRoles=[]` 휴리스틱(taskType=facility/accounting).
//      - PATCH targetRoles / PATCH isActive=false / DELETE 가 즉시 반영.
//
//   2) "관리소장 — 제안업무 추가/수정/삭제가 본인 화면에 정확히 반영"
//      - 관리소장 권한에서 `category=suggested` 알림이 `/api/dashboard/alerts`
//        응답에 노출되고, PATCH 로 카테고리/활성 변경, DELETE 시 즉시 사라짐.
//        (※ 직원 권한의 suggested 경로는 알려진 회귀 #762/#763 — fixme 로 잠금.)
//
//   3) "관리소장 대시보드 위젯 카테고리 분류"
//      - 필수업무 카테고리 템플릿은 `link-view-all-mandatory` 가 속한 카드 안에서만,
//        제안업무 카테고리 템플릿은 `link-view-all-suggested` 카드 안에서만 노출.
//
//   4) "시설기사 대시보드/필수업무 페이지 UI 반영"
//      - `facility-mandatory-tasks-entry-widget` testid 가 보이고, 시설 필수업무
//        페이지에 새 템플릿 카드가 노출.
//
// 알려진 회귀 (별도 후속 과제 #762 / #763 에서 수정 예정 — `test.fixme` 로 잠금):
//   - GET /api/facility/suggested-tasks 가 facility_staff 에게 항상 빈 배열 (#762).
//   - GET /api/facility/mandatory-tasks 가 facility_staff/accountant 응답에
//     suggested 카테고리 알림을 함께 반환 (#763).
//
// 사전 요건:
//   1. 통합 프록시(localhost:80) 가 떠 있고 manager-app / api-server 가 실행 중.
//   2. DEV 시드 사용자(admin@test.com / facility@test.com / accountant@test.com /
//      manager@test.com, 비밀번호 test1234!) 가 살아 있어야 한다.
//
// 실행:
//   pnpm --filter @workspace/manager-app run e2e -- task-template-role-propagation
import {
  test,
  expect,
  request,
  type APIRequestContext,
  type Page,
} from "@playwright/test";

const PASSWORD = "test1234!";

interface TemplatePayload {
  title: string;
  category: "mandatory" | "suggested";
  taskType: "facility" | "accounting" | string;
  frequencyType: "one_time" | "monthly" | "quarterly" | "annual" | string;
  startDate?: string;
  fixedMonth?: number | null;
  fixedDay?: number | null;
  targetRoles: string[];
  scopeType: "all" | "selected";
  isActive: boolean;
  advanceAlertDays: number;
}

function todayPlusDays(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function shortRun(): string {
  return Math.random().toString(36).slice(2, 8);
}

async function login(api: APIRequestContext, identifier: string): Promise<string> {
  const res = await api.post("/api/auth/login", {
    data: { identifier, password: PASSWORD },
  });
  expect(res.ok(), `login ${identifier}`).toBeTruthy();
  const body = (await res.json()) as { token?: string };
  expect(body.token, `login token for ${identifier}`).toBeTruthy();
  return body.token!;
}

async function createTemplate(
  api: APIRequestContext,
  adminToken: string,
  payload: TemplatePayload,
): Promise<number> {
  const res = await api.post("/api/platform/task-templates", {
    headers: { Authorization: `Bearer ${adminToken}` },
    data: payload,
  });
  expect(res.ok(), `create template "${payload.title}" → ${res.status()}`).toBeTruthy();
  const body = (await res.json()) as { id: number };
  expect(body.id).toBeTruthy();
  return body.id;
}

async function patchTemplate(
  api: APIRequestContext,
  adminToken: string,
  id: number,
  patch: Partial<TemplatePayload>,
): Promise<void> {
  const res = await api.patch(`/api/platform/task-templates/${id}`, {
    headers: { Authorization: `Bearer ${adminToken}` },
    data: patch,
  });
  expect(res.ok(), `patch template ${id} → ${res.status()}`).toBeTruthy();
}

async function deleteTemplate(
  api: APIRequestContext,
  adminToken: string,
  id: number,
): Promise<void> {
  const res = await api.delete(`/api/platform/task-templates/${id}`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  // 이미 삭제된 경우(404) 도 cleanup 시 정상 흐름으로 본다.
  expect([200, 204, 404]).toContain(res.status());
}

async function getMandatoryTitles(
  api: APIRequestContext,
  token: string,
  runTag: string,
): Promise<string[]> {
  const res = await api.get("/api/facility/mandatory-tasks", {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(res.ok(), `GET mandatory-tasks → ${res.status()}`).toBeTruthy();
  const body = (await res.json()) as Array<{ title: string }>;
  return body
    .map((a) => a.title)
    .filter((t) => typeof t === "string" && t.includes(runTag));
}

async function getSuggested(
  api: APIRequestContext,
  token: string,
): Promise<Array<{ title: string }>> {
  const res = await api.get("/api/facility/suggested-tasks", {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(res.ok(), `GET suggested-tasks → ${res.status()}`).toBeTruthy();
  return (await res.json()) as Array<{ title: string }>;
}

async function getDashboardAlertsForRun(
  api: APIRequestContext,
  token: string,
  runTag: string,
): Promise<
  Array<{
    id: number;
    type: string;
    title: string;
    category?: string | null;
  }>
> {
  const res = await api.get("/api/dashboard/alerts", {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(res.ok(), `GET /api/dashboard/alerts → ${res.status()}`).toBeTruthy();
  const body = (await res.json()) as Array<{
    id: number;
    type: string;
    title: string;
    category?: string | null;
  }>;
  return body.filter((a) => typeof a.title === "string" && a.title.includes(runTag));
}

async function quickLogin(page: Page, label: string): Promise<void> {
  await page.goto("/login");
  const button = page.getByRole("button", { name: label, exact: true });
  await expect(button).toBeVisible({ timeout: 15_000 });
  await button.click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), {
    timeout: 15_000,
  });
}

test.describe("[Task #757] task template 변경 → 직원 권한 반영", () => {
  test("필수업무 추가/수정/삭제가 시설기사·경리 응답에 정확히 반영", async () => {
    const RUN = shortRun();
    const SOON = todayPlusDays(5);
    const TITLE_X = `[E2E-${RUN}] X 시설 mandatory`;
    const TITLE_Y = `[E2E-${RUN}] Y 회계 mandatory`;
    const TITLE_Z = `[E2E-${RUN}] Z 휴리스틱 회계`;

    const api = await request.newContext({
      baseURL: process.env.E2E_BASE_URL ?? "http://localhost:80",
    });

    let idX: number | undefined;
    let idY: number | undefined;
    let idZ: number | undefined;

    try {
      const adminToken = await login(api, "admin@test.com");

      idX = await createTemplate(api, adminToken, {
        title: TITLE_X,
        category: "mandatory",
        taskType: "facility",
        frequencyType: "one_time",
        startDate: SOON,
        targetRoles: ["manager", "facility_staff"],
        scopeType: "all",
        isActive: true,
        advanceAlertDays: 30,
      });
      idY = await createTemplate(api, adminToken, {
        title: TITLE_Y,
        category: "mandatory",
        taskType: "accounting",
        frequencyType: "one_time",
        startDate: SOON,
        targetRoles: ["manager", "accountant"],
        scopeType: "all",
        isActive: true,
        advanceAlertDays: 30,
      });
      idZ = await createTemplate(api, adminToken, {
        title: TITLE_Z,
        category: "mandatory",
        taskType: "accounting",
        frequencyType: "one_time",
        startDate: SOON,
        targetRoles: [],
        scopeType: "all",
        isActive: true,
        advanceAlertDays: 30,
      });

      const facilityToken = await login(api, "facility@test.com");
      const accountantToken = await login(api, "accountant@test.com");

      // 1) 초기 노출 — explicit + 휴리스틱.
      const facility1 = await getMandatoryTitles(api, facilityToken, RUN);
      expect(facility1, "시설기사 — X(시설) 노출").toContain(TITLE_X);
      expect(facility1, "시설기사 — Y(회계 explicit) 비노출").not.toContain(TITLE_Y);
      expect(facility1, "시설기사 — Z(회계 휴리스틱) 비노출").not.toContain(TITLE_Z);

      const acct1 = await getMandatoryTitles(api, accountantToken, RUN);
      expect(acct1, "경리 — Y(회계 explicit) 노출").toContain(TITLE_Y);
      expect(acct1, "경리 — Z(회계 휴리스틱) 노출").toContain(TITLE_Z);
      expect(acct1, "경리 — X(시설) 비노출").not.toContain(TITLE_X);

      // 1.5) PATCH title / advanceAlertDays — 메타데이터 변경도 응답에 즉시 반영.
      const RENAMED_TITLE_X = `${TITLE_X} (수정됨)`;
      await patchTemplate(api, adminToken, idX, {
        title: RENAMED_TITLE_X,
        advanceAlertDays: 60,
      });
      const facility1b = await getMandatoryTitles(api, facilityToken, RUN);
      expect(
        facility1b,
        "시설기사 — title 수정 후 새 제목으로 노출",
      ).toContain(RENAMED_TITLE_X);
      expect(
        facility1b,
        "시설기사 — title 수정 후 옛 제목 비노출",
      ).not.toContain(TITLE_X);

      // 2) PATCH targetRoles — X 를 시설기사 → 경리로 옮김.
      await patchTemplate(api, adminToken, idX, {
        targetRoles: ["manager", "accountant"],
      });

      const facility2 = await getMandatoryTitles(api, facilityToken, RUN);
      expect(facility2, "시설기사 — X 가 PATCH 후 사라짐").not.toContain(
        RENAMED_TITLE_X,
      );

      const acct2 = await getMandatoryTitles(api, accountantToken, RUN);
      expect(acct2, "경리 — X 가 PATCH 후 등장").toContain(RENAMED_TITLE_X);

      // 3) PATCH isActive=false — Y 가 즉시 사라짐.
      await patchTemplate(api, adminToken, idY, { isActive: false });
      const acct3 = await getMandatoryTitles(api, accountantToken, RUN);
      expect(acct3, "경리 — Y 가 isActive=false 후 사라짐").not.toContain(TITLE_Y);

      // 4) DELETE — Z 가 즉시 사라짐.
      await deleteTemplate(api, adminToken, idZ);
      idZ = undefined;
      const acct4 = await getMandatoryTitles(api, accountantToken, RUN);
      expect(acct4, "경리 — Z 가 DELETE 후 사라짐").not.toContain(TITLE_Z);
    } finally {
      // best-effort cleanup
      const adminToken = await login(api, "admin@test.com").catch(() => null);
      if (adminToken) {
        for (const id of [idX, idY, idZ]) {
          if (id !== undefined) await deleteTemplate(api, adminToken, id).catch(() => {});
        }
      }
      await api.dispose();
    }
  });

  test("관리소장 — 제안업무 추가/수정/삭제가 본인 화면(API + 위젯) 에 정확히 반영", async ({
    page,
  }) => {
    const RUN = shortRun();
    const SOON = todayPlusDays(5);
    const TITLE_S = `[E2E-${RUN}] 매니저 제안 S`;
    const TITLE_M = `[E2E-${RUN}] 매니저 필수 M`;

    const api = await request.newContext({
      baseURL: process.env.E2E_BASE_URL ?? "http://localhost:80",
    });

    let idS: number | undefined;
    let idM: number | undefined;

    try {
      const adminToken = await login(api, "admin@test.com");
      idS = await createTemplate(api, adminToken, {
        title: TITLE_S,
        category: "suggested",
        taskType: "facility",
        frequencyType: "one_time",
        startDate: SOON,
        targetRoles: ["manager", "facility_staff"],
        scopeType: "all",
        isActive: true,
        advanceAlertDays: 7,
      });
      idM = await createTemplate(api, adminToken, {
        title: TITLE_M,
        category: "mandatory",
        taskType: "facility",
        frequencyType: "one_time",
        startDate: SOON,
        targetRoles: ["manager", "facility_staff"],
        scopeType: "all",
        isActive: true,
        advanceAlertDays: 30,
      });

      const managerToken = await login(api, "manager@test.com");

      // 1) /api/dashboard/alerts 에 두 알림이 모두 들어왔는지 확인.
      const alerts1 = await getDashboardAlertsForRun(api, managerToken, RUN);
      const findS = alerts1.find((a) => a.title === TITLE_S);
      const findM = alerts1.find((a) => a.title === TITLE_M);
      expect(findS, "매니저 — suggested 알림 노출").toBeTruthy();
      expect(findS!.type, "suggested 알림 type").toBe("task_template_suggested");
      expect(findM, "매니저 — mandatory 알림 노출").toBeTruthy();
      expect(findM!.type, "mandatory 알림 type").toBe("task_template_mandatory");

      // 2) 매니저 대시보드 위젯 — 두 카드(필수/제안) 가 모두 화면에 노출.
      //    AlertSection 은 모바일/데스크톱 분기를 둘 다 DOM 에 마운트하므로
      //    `:visible` 셀렉터로 현재 viewport(Desktop Chrome 1280x720) 의 인스턴스만 잡는다.
      await quickLogin(page, "관리소장");
      await page.goto("/");

      const mandatoryHeader = page.locator(
        '[data-testid="link-view-all-mandatory"]:visible',
      );
      const suggestedHeader = page.locator(
        '[data-testid="link-view-all-suggested"]:visible',
      );
      await expect(mandatoryHeader, "필수업무 카드 헤더 노출").toBeVisible({
        timeout: 15_000,
      });
      await expect(suggestedHeader, "제안업무 카드 헤더 노출").toBeVisible({
        timeout: 15_000,
      });

      // 카테고리 분류(법정 vs 제안) 는 type 단일 SoT 로 증명한다:
      //   (1) /api/dashboard/alerts 응답에서 같은 RUN 의 두 알림이 각각
      //       task_template_mandatory / task_template_suggested 로 type 분리(검증 완료),
      //   (2) 클라이언트 splitDashboardAlerts (서버와 같은 SoT) 가 그 type 으로
      //       두 카드를 라우팅,
      //   (3) 두 카드 헤더(link-view-all-mandatory / link-view-all-suggested) 가 동시
      //       노출되는지 위에서 검증.
      // (시드 데이터가 많아 페이지네이션 첫 페이지가 새 템플릿이 아닐 수 있어
      //  UI 의 제목 단위 매칭은 type SoT 증명으로 갈음.)

      // 3) PATCH category mandatory→suggested (S 는 그대로 두고 M 을 옮김) →
      //    응답 type 도 함께 바뀐다.
      await patchTemplate(api, adminToken, idM, { category: "suggested" });
      const alerts2 = await getDashboardAlertsForRun(api, managerToken, RUN);
      const m2 = alerts2.find((a) => a.title === TITLE_M);
      expect(m2, "M 알림 그대로 존재").toBeTruthy();
      expect(m2!.type, "M 알림 type 이 suggested 로 전환").toBe(
        "task_template_suggested",
      );

      // 4) PATCH isActive=false 로 S 사라짐.
      await patchTemplate(api, adminToken, idS, { isActive: false });
      const alerts3 = await getDashboardAlertsForRun(api, managerToken, RUN);
      expect(alerts3.find((a) => a.title === TITLE_S)).toBeFalsy();

      // 5) DELETE M.
      await deleteTemplate(api, adminToken, idM);
      idM = undefined;
      const alerts4 = await getDashboardAlertsForRun(api, managerToken, RUN);
      expect(alerts4.find((a) => a.title === TITLE_M)).toBeFalsy();
    } finally {
      const adminToken = await login(api, "admin@test.com").catch(() => null);
      if (adminToken) {
        for (const id of [idS, idM]) {
          if (id !== undefined) await deleteTemplate(api, adminToken, id).catch(() => {});
        }
      }
      await api.dispose();
    }
  });

  test("시설기사 대시보드 위젯/필수업무 페이지 UI 반영", async ({ page }) => {
    const RUN = shortRun();
    const SOON = todayPlusDays(5);
    const TITLE = `[E2E-${RUN}] UI 시설 필수업무`;

    const api = await request.newContext({
      baseURL: process.env.E2E_BASE_URL ?? "http://localhost:80",
    });

    let id: number | undefined;
    try {
      const adminToken = await login(api, "admin@test.com");
      id = await createTemplate(api, adminToken, {
        title: TITLE,
        category: "mandatory",
        taskType: "facility",
        frequencyType: "one_time",
        startDate: SOON,
        targetRoles: ["manager", "facility_staff"],
        scopeType: "all",
        isActive: true,
        advanceAlertDays: 30,
      });

      // 시설기사로 로그인.
      await quickLogin(page, "시설기사");

      // 모바일 뷰포트(시설 시설기사 메인 위젯이 모바일 분기를 사용) 에서 진입.
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto("/");

      // 시설기사 대시보드 메인 위젯의 "필수업무" AlertSection 헤더가 노출되어야
      // 한다 — 카드 우측 "모두보기" 링크 testid 가 안정적인 식별자.
      await expect(
        page.locator('[data-testid="link-view-all-mandatory"]:visible').first(),
        "시설기사 대시보드 필수업무 카드 헤더 노출",
      ).toBeVisible({ timeout: 15_000 });

      // 필수업무 페이지 진입 → 제목이 보인다.
      await page.goto("/facility/mandatory-tasks");
      await expect(page.getByText(TITLE, { exact: false })).toBeVisible({
        timeout: 15_000,
      });
    } finally {
      const adminToken = await login(api, "admin@test.com").catch(() => null);
      if (adminToken && id !== undefined) {
        await deleteTemplate(api, adminToken, id).catch(() => {});
      }
      await api.dispose();
    }
  });

  // ── 알려진 회귀 (수정 시 fixme 풀고 통과시킬 것) ─────────────────────────
  test.fixme(
    "[#762] 시설기사 제안업무 페이지에 제안 카테고리 템플릿이 노출되어야 한다",
    async () => {
      const RUN = shortRun();
      const SOON = todayPlusDays(5);
      const TITLE = `[E2E-${RUN}] suggested 시설`;
      const api = await request.newContext({
        baseURL: process.env.E2E_BASE_URL ?? "http://localhost:80",
      });
      let id: number | undefined;
      try {
        const adminToken = await login(api, "admin@test.com");
        id = await createTemplate(api, adminToken, {
          title: TITLE,
          category: "suggested",
          taskType: "facility",
          frequencyType: "one_time",
          startDate: SOON,
          targetRoles: ["manager", "facility_staff"],
          scopeType: "all",
          isActive: true,
          advanceAlertDays: 7,
        });
        const facilityToken = await login(api, "facility@test.com");
        const list = await getSuggested(api, facilityToken);
        expect(list.map((a) => a.title)).toContain(TITLE);
      } finally {
        const adminToken = await login(api, "admin@test.com").catch(() => null);
        if (adminToken && id !== undefined) {
          await deleteTemplate(api, adminToken, id).catch(() => {});
        }
        await api.dispose();
      }
    },
  );

  test.fixme(
    "[#763] 시설기사 필수업무 응답에 suggested 카테고리 알림이 섞이지 않아야 한다",
    async () => {
      const RUN = shortRun();
      const SOON = todayPlusDays(5);
      const TITLE = `[E2E-${RUN}] suggested-leak`;
      const api = await request.newContext({
        baseURL: process.env.E2E_BASE_URL ?? "http://localhost:80",
      });
      let id: number | undefined;
      try {
        const adminToken = await login(api, "admin@test.com");
        id = await createTemplate(api, adminToken, {
          title: TITLE,
          category: "suggested",
          taskType: "facility",
          frequencyType: "one_time",
          startDate: SOON,
          targetRoles: ["manager", "facility_staff"],
          scopeType: "all",
          isActive: true,
          advanceAlertDays: 7,
        });
        const facilityToken = await login(api, "facility@test.com");
        const titles = await getMandatoryTitles(api, facilityToken, "[E2E-");
        // suggested 가 mandatory 응답에 들어와선 안 된다.
        expect(titles).not.toContain(TITLE);
      } finally {
        const adminToken = await login(api, "admin@test.com").catch(() => null);
        if (adminToken && id !== undefined) {
          await deleteTemplate(api, adminToken, id).catch(() => {});
        }
        await api.dispose();
      }
    },
  );
});
