// [Task #719] 알림 다이얼로그 → 기안서 작성 화면 진입 회귀 e2e 설정.
//   본 설정은 manager-app 의 단일 회귀 시나리오를 운영한다. 추가 e2e 가
//   생기면 `testDir` 안에 새 spec 을 두면 된다.
//
//   실행:
//     pnpm --filter @workspace/manager-app run e2e
//
//   사전 요건:
//     1. 통합 프록시(localhost:80) 가 떠 있고 manager-app / api-server 가
//        함께 실행 중이어야 한다 (Replit 의 워크플로 실행 상태와 동일).
//     2. DEV 시드 사용자(manager@test.com / test1234!) 가 살아 있어야 한다.
import { defineConfig, devices } from "@playwright/test";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:80";

export default defineConfig({
  testDir: "./e2e",
  testMatch: /.*\.spec\.ts$/,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    headless: true,
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
});
