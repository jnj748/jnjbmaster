// [Task #745] 협력업체 등록 다이얼로그의 계약서·사업자등록증 드래그앤드롭
// 자동입력 회귀 e2e.
//
// 검증 포인트:
//   1. 다이얼로그에 두 개의 OCR 드롭존이 보인다 (ocr-contract / ocr-business-reg).
//   2. 사업자등록증을 업로드하면 OCR mock 응답대로 vendorName / businessRegNumber /
//      representativeName 가 자동 채움된다. confidence < 0.5 인 representativeName 은
//      "확인 필요" 뱃지가 보인다.
//   3. 사용자가 vendorName 을 직접 편집한 뒤 계약서를 업로드해도 vendorName 은
//      덮어쓰이지 않는다 (touched 보호).
//   4. 사업자등록증 OCR 로 채워진 businessRegNumber 도 두 번째 OCR 결과에 의해
//      덮어쓰이지 않는다 (이미 채워진 필드 보호).
//
// 실제 Gemini 호출은 하지 않고 /api/contracts/ocr-preview 와
// /api/vendors/business-reg/ocr-preview 를 page.route() 로 모킹한다.
//
// 실행:
//   pnpm --filter @workspace/manager-app run e2e
import { test, expect, type Page } from "@playwright/test";

async function quickLogin(page: Page, label: string) {
  await page.goto("/login");
  const button = page.getByRole("button", { name: label, exact: true });
  await expect(button).toBeVisible({ timeout: 15_000 });
  await button.click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), {
    timeout: 15_000,
  });
}

test("[manager] AddVendorContractDialog 의 계약서·사업자등록증 OCR 자동입력 (Task #745)", async ({
  page,
}) => {
  // ─── 업로드(요청 URL → finalize) 와 OCR 미리보기를 모두 모킹한다.
  // 1) request-url: 단순한 가짜 PUT 가능 URL 을 돌려준다.
  await page.route(/\/api\/storage\/uploads\/request-url(\?.*)?$/, async (route) => {
    if (route.request().method() === "OPTIONS") {
      return route.fulfill({ status: 204 });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        uploadURL: "https://example.invalid/upload",
        objectPath: "/objects/test-doc-123",
      }),
    });
  });
  // 2) 가짜 PUT 업로드: 항상 200 OK.
  await page.route("https://example.invalid/upload", async (route) => {
    return route.fulfill({ status: 200, body: "" });
  });
  // 3) finalize: object metadata 에코.
  await page.route(/\/api\/storage\/uploads\/finalize(\?.*)?$/, async (route) => {
    const body = route.request().postDataJSON?.() ?? {};
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        objectPath: body.objectPath ?? "/objects/test-doc-123",
        metadata: { name: body.fileName ?? "test.pdf", size: 1234, mimeType: "application/pdf" },
      }),
    });
  });

  // 4) 사업자등록증 OCR — 대표자명만 confidence 낮음.
  let businessRegCalls = 0;
  await page.route(/\/api\/vendors\/business-reg\/ocr-preview$/, async (route) => {
    businessRegCalls += 1;
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        vendorName: "OCR테스트청소",
        businessRegNumber: "111-22-33333",
        representativeName: "홍길동",
        address: "서울특별시 강남구 테헤란로 1",
        businessType: "서비스업",
        businessItem: "건물청소",
        openedAt: "2020-03-15",
        fieldConfidence: {
          vendorName: 0.92,
          businessRegNumber: 0.88,
          representativeName: 0.3, // 낮음 → "확인 필요"
          address: 0.85,
          businessType: 0.4, // 낮음 → "확인 필요"
          businessItem: 0.9,
          openedAt: 0.9,
        },
        rawText: "",
      }),
    });
  });

  // 5) 계약서 OCR — 다른 vendorName / businessRegNumber 를 돌려주지만,
  //    이미 채워졌거나 사용자가 편집한 필드는 덮어쓰지 않는지 검증한다.
  let contractCalls = 0;
  await page.route(/\/api\/contracts\/ocr-preview$/, async (route) => {
    contractCalls += 1;
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        vendorName: "다른업체이름",
        businessRegNumber: "999-99-99999",
        representativeName: null,
        category: "cleaning",
        title: "○○빌딩 청소용역 계약서",
        startDate: "2026-01-01",
        endDate: "2026-12-31",
        contractAmount: 1200000,
        isRecurring: true,
        fieldConfidence: {
          vendorName: 0.9,
          businessRegNumber: 0.9,
          category: 0.85,
          title: 0.95,
          startDate: 0.9,
          endDate: 0.9,
          contractAmount: 0.9,
          isRecurring: 0.8,
        },
        rawText: "",
      }),
    });
  });

  await quickLogin(page, "관리소장");
  await page.goto("/building/vendor-directory");

  await expect(page.getByTestId("building-vendor-directory-page")).toBeVisible({
    timeout: 15_000,
  });

  // 등록 다이얼로그 열기. "첫 협력업체 등록하기" 또는 상단 "등록" 버튼 어느 쪽이든.
  const openCandidates = [
    page.getByRole("button", { name: /첫 협력업체 등록하기/ }),
    page.getByRole("button", { name: /협력업체.*등록|등록하기|^등록$/ }),
  ];
  let opened = false;
  for (const btn of openCandidates) {
    if (await btn.first().isVisible().catch(() => false)) {
      await btn.first().click();
      opened = true;
      break;
    }
  }
  expect(opened, "등록 다이얼로그를 열지 못했습니다").toBeTruthy();

  // 두 드롭존이 모두 보인다.
  const bizDropzone = page.getByTestId("ocr-business-reg-dropzone");
  const contractDropzone = page.getByTestId("ocr-contract-dropzone");
  await expect(bizDropzone).toBeVisible();
  await expect(contractDropzone).toBeVisible();

  // ─── 1) 사업자등록증 업로드 → OCR 자동 채움.
  const bizInput = page.getByTestId("ocr-business-reg-file-input");
  await bizInput.setInputFiles({
    name: "biz.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4 fake"),
  });
  await expect.poll(() => businessRegCalls, { timeout: 15_000 }).toBe(1);

  // 자동 채움 확인. VendorNameCombobox 의 input 값으로 검증.
  await expect.poll(async () => {
    return page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll<HTMLInputElement>("input"));
      const v = inputs.find((i) => i.value === "OCR테스트청소");
      return v ? "found" : "missing";
    });
  }, { timeout: 10_000 }).toBe("found");

  // 대표자명 "확인 필요" 뱃지 노출 + 업태(낮은 신뢰도) 뱃지 노출.
  await expect(page.getByTestId("badge-low-conf-representativeName")).toBeVisible();
  await expect(page.getByTestId("badge-low-conf-businessType")).toBeVisible();

  // 사업자등록증 OCR 결과(주소/업태/종목/개업일) 자동 채움 검증.
  await expect(page.getByTestId("input-vendor-address")).toHaveValue(
    "서울특별시 강남구 테헤란로 1",
  );
  await expect(page.getByTestId("input-vendor-business-type")).toHaveValue("서비스업");
  await expect(page.getByTestId("input-vendor-business-item")).toHaveValue("건물청소");
  // 개업연월일은 모바일 친화 DatePicker 버튼이라 텍스트로 검증.
  const dialogForOpenedAt = page.getByRole("dialog", { name: /협력업체.*계약 등록/ });
  await expect(dialogForOpenedAt.getByText("2020-03-15")).toBeVisible();

  // ─── 2) 사용자가 vendorName 을 직접 편집 → touched 마킹.
  // value 가 OCR테스트청소 인 input 을 찾아 직접 덮어쓴다.
  const ocrFilled = page.locator("input[value='OCR테스트청소']");
  await ocrFilled.fill("내가직접입력한업체");

  // ─── 3) 계약서 업로드 → vendorName / businessRegNumber 는 보호되어야 한다.
  const contractInput = page.getByTestId("ocr-contract-file-input");
  await contractInput.setInputFiles({
    name: "contract.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4 fake2"),
  });
  await expect.poll(() => contractCalls, { timeout: 15_000 }).toBe(1);

  // touched 보호: vendorName 은 사용자가 입력한 값 그대로.
  await expect(page.locator("input[value='내가직접입력한업체']")).toBeVisible();
  // 이미 채워진 사업자번호도 그대로 (포맷팅 후 111-22-33333).
  await expect(page.locator("input[value='111-22-33333']")).toBeVisible();

  // 비어있던 카테고리/계약제목/시작일/종료일은 계약서 OCR 로 채워진다.
  // (시작일/종료일은 모바일 친화 날짜 선택 버튼으로 렌더되므로 텍스트로 검증.)
  const dialog = page.getByRole("dialog", { name: /협력업체.*계약 등록/ });
  await expect(dialog.getByTestId("input-contract-title")).toHaveValue(
    "○○빌딩 청소용역 계약서",
  );
  await expect(dialog.getByText("2026-01-01")).toBeVisible();
  await expect(dialog.getByText("2026-12-31")).toBeVisible();
  await expect(dialog.getByTestId("checkbox-is-recurring")).toBeChecked();

  // 계약금액도 OCR 결과로 자동 채움 (contractAmount: 1200000).
  await expect(dialog.getByTestId("input-contract-amount")).toHaveValue("1200000");

  // category 도 OCR 로 "cleaning" 으로 자동 매핑되어야 한다.
  // (기본값 building_maintenance 였지만 사용자가 손대지 않은 select 는 OCR 로 덮어쓰여야 한다.)
  await expect(dialog.getByTestId("select-category")).toContainText("청소");
});

// [Task #745] 회귀: 사용자가 빈 폼에서 업체명을 먼저 직접 입력한 뒤 사업자등록증 OCR
//   을 업로드해도 vendorName 이 OCR 값으로 덮어써지지 않아야 한다 (touched 보호).
test("[manager] 수동 입력한 업체명은 이후 OCR 로 덮어써지지 않는다 (Task #745 회귀)", async ({
  page,
}) => {
  await page.route(/\/api\/storage\/uploads\/request-url(\?.*)?$/, async (route) => {
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204 });
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        uploadURL: "https://example.invalid/upload",
        objectPath: "/objects/test-doc-456",
      }),
    });
  });
  await page.route("https://example.invalid/upload", async (route) =>
    route.fulfill({ status: 200, body: "" }),
  );
  await page.route(/\/api\/storage\/uploads\/finalize(\?.*)?$/, async (route) => {
    const body = route.request().postDataJSON?.() ?? {};
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        objectPath: body.objectPath ?? "/objects/test-doc-456",
        metadata: {
          name: body.fileName ?? "biz.pdf",
          size: 1234,
          mimeType: "application/pdf",
        },
      }),
    });
  });
  await page.route(/\/api\/vendors\/business-reg\/ocr-preview$/, async (route) => {
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        vendorName: "OCR가읽은업체",
        businessRegNumber: "222-33-44444",
        representativeName: "김OCR",
        address: null,
        businessType: null,
        businessItem: null,
        openedAt: null,
        fieldConfidence: {
          vendorName: 0.95,
          businessRegNumber: 0.95,
          representativeName: 0.9,
        },
        rawText: "",
      }),
    });
  });

  await quickLogin(page, "관리소장");
  await page.goto("/building/vendor-directory");
  await expect(page.getByTestId("building-vendor-directory-page")).toBeVisible({
    timeout: 15_000,
  });

  const openCandidates = [
    page.getByRole("button", { name: /첫 협력업체 등록하기/ }),
    page.getByRole("button", { name: /협력업체.*등록|등록하기|^등록$/ }),
  ];
  for (const btn of openCandidates) {
    if (await btn.first().isVisible().catch(() => false)) {
      await btn.first().click();
      break;
    }
  }

  // 1) 사용자가 업체명 먼저 직접 입력.
  await page.getByTestId("input-vendor-name").fill("내가먼저입력한업체");

  // 2) 사업자등록증 업로드 → OCR 머지 시도.
  await page.getByTestId("ocr-business-reg-file-input").setInputFiles({
    name: "biz.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4 fake3"),
  });

  // OCR 다른 자동 채움 결과(사업자번호) 가 들어와 OCR 동작은 확인되지만,
  await expect(page.locator("input[value='222-33-44444']")).toBeVisible({
    timeout: 10_000,
  });
  // 사용자가 직접 입력한 vendorName 은 그대로 유지되어야 한다.
  await expect(page.locator("input[value='내가먼저입력한업체']")).toBeVisible();
  await expect(page.locator("input[value='OCR가읽은업체']")).toHaveCount(0);
});

// [Task #745] 회귀: 두 OCR 콜백이 거의 동시에 도착해도 first-OCR-wins 가 깨지지 않는다.
//   contract OCR 응답을 인위적으로 지연시켜 business-reg OCR(나중 시작) 이 먼저 끝나게 만들고,
//   그 다음 도착한 contract OCR 의 vendorName/businessRegNumber 가 덮어쓰지 못함을 검증.
test("[manager] 두 OCR 동시 완료 시 먼저 commit 된 값이 유지된다 (Task #745 race-safety)", async ({
  page,
}) => {
  await page.route(/\/api\/storage\/uploads\/request-url(\?.*)?$/, async (route) => {
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204 });
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        uploadURL: "https://example.invalid/upload",
        objectPath: "/objects/test-doc-789",
      }),
    });
  });
  await page.route("https://example.invalid/upload", async (route) =>
    route.fulfill({ status: 200, body: "" }),
  );
  await page.route(/\/api\/storage\/uploads\/finalize(\?.*)?$/, async (route) => {
    const body = route.request().postDataJSON?.() ?? {};
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        objectPath: body.objectPath ?? "/objects/test-doc-789",
        metadata: { name: body.fileName ?? "f.pdf", size: 1, mimeType: "application/pdf" },
      }),
    });
  });
  // contract OCR 은 지연 — business-reg 가 먼저 끝나도록.
  await page.route(/\/api\/contracts\/ocr-preview$/, async (route) => {
    await new Promise((r) => setTimeout(r, 1500));
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        vendorName: "계약서가준업체",
        businessRegNumber: "999-99-99999",
        representativeName: null,
        category: "cleaning",
        title: "테스트 계약서",
        startDate: "2026-02-01",
        endDate: "2026-12-31",
        contractAmount: 500000,
        isRecurring: false,
        fieldConfidence: {
          vendorName: 0.95,
          businessRegNumber: 0.95,
          category: 0.9,
          title: 0.95,
          startDate: 0.9,
          endDate: 0.9,
          contractAmount: 0.9,
          isRecurring: 0.9,
        },
        rawText: "",
      }),
    });
  });
  await page.route(/\/api\/vendors\/business-reg\/ocr-preview$/, async (route) => {
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        vendorName: "사업자증업체",
        businessRegNumber: "111-22-33333",
        representativeName: "박OCR",
        address: null,
        businessType: null,
        businessItem: null,
        openedAt: null,
        fieldConfidence: {
          vendorName: 0.95,
          businessRegNumber: 0.95,
          representativeName: 0.9,
        },
        rawText: "",
      }),
    });
  });

  await quickLogin(page, "관리소장");
  await page.goto("/building/vendor-directory");
  await expect(page.getByTestId("building-vendor-directory-page")).toBeVisible({
    timeout: 15_000,
  });

  for (const btn of [
    page.getByRole("button", { name: /첫 협력업체 등록하기/ }),
    page.getByRole("button", { name: /협력업체.*등록|등록하기|^등록$/ }),
  ]) {
    if (await btn.first().isVisible().catch(() => false)) {
      await btn.first().click();
      break;
    }
  }

  // 먼저 contract 업로드 시작(OCR 응답 1.5s 지연), 곧바로 business-reg 업로드 → business-reg 가 먼저 commit.
  await page.getByTestId("ocr-contract-file-input").setInputFiles({
    name: "c.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4 c"),
  });
  await page.getByTestId("ocr-business-reg-file-input").setInputFiles({
    name: "b.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4 b"),
  });

  // business-reg 결과가 먼저 commit 되어야 한다.
  await expect(page.locator("input[value='사업자증업체']")).toBeVisible({
    timeout: 5_000,
  });
  await expect(page.locator("input[value='111-22-33333']")).toBeVisible();

  // 그 후 contract OCR 이 도착해도 vendorName/businessRegNumber 는 덮어쓰지 않아야 한다.
  // (단, contract 만 가진 title/startDate/endDate 등은 채워진다.)
  const dialog = page.getByRole("dialog", { name: /협력업체.*계약 등록/ });
  await expect(dialog.getByTestId("input-contract-title")).toHaveValue(
    "테스트 계약서",
    { timeout: 5_000 },
  );
  await expect(page.locator("input[value='사업자증업체']")).toBeVisible();
  await expect(page.locator("input[value='111-22-33333']")).toBeVisible();
  await expect(page.locator("input[value='계약서가준업체']")).toHaveCount(0);
  await expect(page.locator("input[value='999-99-99999']")).toHaveCount(0);
});

// [Task #745] 사업자등록증 OCR 가 실패하면 드롭존에 인라인 에러가 보여야 한다.
test("[manager] 사업자등록증 OCR 실패 시 드롭존에 인라인 에러가 보인다 (Task #745)", async ({
  page,
}) => {
  await page.route(/\/api\/storage\/uploads\/request-url(\?.*)?$/, async (route) => {
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204 });
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        uploadURL: "https://example.invalid/upload",
        objectPath: "/objects/test-doc-fail",
      }),
    });
  });
  await page.route("https://example.invalid/upload", async (route) =>
    route.fulfill({ status: 200, body: "" }),
  );
  await page.route(/\/api\/storage\/uploads\/finalize(\?.*)?$/, async (route) => {
    const body = route.request().postDataJSON?.() ?? {};
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        objectPath: body.objectPath ?? "/objects/test-doc-fail",
        metadata: { name: body.fileName ?? "f.pdf", size: 1, mimeType: "application/pdf" },
      }),
    });
  });
  // OCR preview 가 500 으로 실패.
  await page.route(/\/api\/vendors\/business-reg\/ocr-preview$/, async (route) => {
    return route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ message: "Gemini 호출 실패" }),
    });
  });

  await quickLogin(page, "관리소장");
  await page.goto("/building/vendor-directory");
  await expect(page.getByTestId("building-vendor-directory-page")).toBeVisible({
    timeout: 15_000,
  });
  for (const btn of [
    page.getByRole("button", { name: /첫 협력업체 등록하기/ }),
    page.getByRole("button", { name: /협력업체.*등록|등록하기|^등록$/ }),
  ]) {
    if (await btn.first().isVisible().catch(() => false)) {
      await btn.first().click();
      break;
    }
  }

  await page.getByTestId("ocr-business-reg-file-input").setInputFiles({
    name: "biz.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4 fail"),
  });

  // 인라인 에러가 보이고 메시지에 실패 사유가 노출.
  const errorEl = page.getByTestId("ocr-business-reg-processing-error");
  await expect(errorEl).toBeVisible({ timeout: 10_000 });
  await expect(errorEl).toContainText(/실패|Gemini|오류/);
});
