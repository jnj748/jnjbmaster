// [Task #868] 엑셀/한글(.hwpx) 텍스트 추출 + 통장 휴리스틱 단위 테스트.
// 픽스처는 exceljs / jszip 으로 메모리에 동적 생성한다 (디스크 픽스처 X).
import { test } from "node:test";
import assert from "node:assert/strict";

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret";
process.env.DATABASE_URL = process.env.DATABASE_URL || "postgres://test:test@localhost:5432/test";

const ExcelJS = (await import("exceljs")).default;
const JSZip = (await import("jszip")).default;
const {
  extractXlsxText,
  extractHwpxText,
  extractHwpTextBestEffort,
  extractTextIfOfficeDoc,
  isOfficeDocMime,
  looksLikeBankStatement,
} = await import("../lib/officeDocs.js");

async function makeXlsx(rows: Array<Array<string | number>>): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Sheet1");
  for (const row of rows) ws.addRow(row);
  const ab = await wb.xlsx.writeBuffer();
  return Buffer.from(ab);
}

async function makeHwpx(sectionTexts: string[]): Promise<Buffer> {
  const zip = new JSZip();
  zip.file("mimetype", "application/hwp+zip");
  // 가장 단순한 섹션 XML — 실 제품 hwpx 와 정확히 같진 않지만 <hp:t> 노드 추출 로직만 검증.
  sectionTexts.forEach((txt, i) => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<hp:sec xmlns:hp="http://www.hancom.co.kr/hwpml/2011/section">
  <hp:p><hp:run><hp:t>${txt}</hp:t></hp:run></hp:p>
</hp:sec>`;
    zip.file(`Contents/section${i}.xml`, xml);
  });
  const ab = await zip.generateAsync({ type: "nodebuffer" });
  return ab;
}

test("isOfficeDocMime 은 xlsx/xls/docx/hwpx/hwp 모두 true (.doc 만 친절 거절)", async () => {
  const { REJECTED_LEGACY_OFFICE_MIMES, getRejectedLegacyOfficeMessage } = await import(
    "../lib/officeDocs.js"
  );
  assert.equal(isOfficeDocMime("application/pdf"), false);
  assert.equal(isOfficeDocMime("text/csv"), false);
  assert.equal(
    isOfficeDocMime("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
    true,
  );
  // .xls(BIFF) 도 office 그룹 — 추출 실패해도 unknown 으로 보관.
  assert.equal(isOfficeDocMime("application/vnd.ms-excel"), true);
  assert.equal(REJECTED_LEGACY_OFFICE_MIMES.has("application/vnd.ms-excel"), false);
  // .doc 만 친절 거절 그룹.
  assert.equal(isOfficeDocMime("application/msword"), false);
  assert.equal(REJECTED_LEGACY_OFFICE_MIMES.has("application/msword"), true);
  assert.match(getRejectedLegacyOfficeMessage("application/msword") ?? "", /워드 구버전.*docx/);
  assert.equal(getRejectedLegacyOfficeMessage("application/vnd.ms-excel"), null);
  assert.equal(
    isOfficeDocMime("application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
    true,
  );
  assert.equal(isOfficeDocMime("application/vnd.hancom.hwpx"), true);
  assert.equal(isOfficeDocMime("application/vnd.hancom.hwp"), true);
  assert.equal(isOfficeDocMime("application/x-hwp"), true);
});

test(".xls(BIFF) 빈 더미는 추출 실패 → classifyDocument 에서 unknown 폴백", async () => {
  const { classifyDocument, __setRoutedGenerateForTests } = await import("../lib/ocrPipeline.js");
  let called = false;
  __setRoutedGenerateForTests((async () => {
    called = true;
    return {
      text: "bill",
      tier: "tier0" as const,
      model: "stub",
      inputTokens: null,
      outputTokens: null,
      costEstimateUsd: 0,
    };
  }) as never);
  try {
    const k = await classifyDocument({
      buffer: Buffer.from("xls-binary-not-real"),
      mimeType: "application/vnd.ms-excel",
    });
    // 추출 실패 → unknown 폴백. 사용자가 화면에서 직접 종류 지정.
    assert.equal(k, "unknown");
    assert.equal(called, false, "추출 실패 시 LLM 호출 없이 즉답해야 한다");
  } finally {
    __setRoutedGenerateForTests(null);
  }
});

test("classifyDocument: 엑셀이지만 통장 키워드 없으면 unknown 폴백 (모호한 엑셀 보존)", async () => {
  const { classifyDocument, __setRoutedGenerateForTests } = await import("../lib/ocrPipeline.js");
  __setRoutedGenerateForTests((async () => ({
    text: "이건 분류 못합니다 죄송",
    tier: "tier0" as const,
    model: "stub",
    inputTokens: null,
    outputTokens: null,
    costEstimateUsd: 0,
  })) as never);
  try {
    const buf = await makeXlsx([
      ["이름", "부서", "메모"],
      ["홍길동", "관리", "2026 신년 인사"],
    ]);
    const k = await classifyDocument({
      buffer: buf,
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    assert.equal(k, "unknown", "통장 키워드 없고 LLM 도 분류 못하면 unknown 으로 보존");
  } finally {
    __setRoutedGenerateForTests(null);
  }
});

test("extractXlsxText: 첫 시트를 CSV 한 덩어리로 변환", async () => {
  const buf = await makeXlsx([
    ["거래일자", "적요", "출금", "입금", "잔액"],
    ["2026-04-01", "관리비 수납", 0, 1200000, 5000000],
    ["2026-04-02", "전기료 이체", 800000, 0, 4200000],
  ]);
  const text = await extractXlsxText(buf);
  assert.match(text, /거래일자,적요,출금,입금,잔액/);
  assert.match(text, /2026-04-01,관리비 수납,0,1200000,5000000/);
  assert.match(text, /2026-04-02,전기료 이체,800000,0,4200000/);
});

test("extractXlsxText: 콤마/따옴표 셀은 따옴표로 감싸진다", async () => {
  const buf = await makeXlsx([
    ["품목", "비고"],
    ["일반관리비", '메모: "긴급", 처리'],
  ]);
  const text = await extractXlsxText(buf);
  assert.match(text, /일반관리비,"메모: ""긴급"", 처리"/);
});

test("extractHwpxText: <hp:t> 노드 텍스트만 모은다", async () => {
  const buf = await makeHwpx(["입주자대표회의 의결문", "안건 1: 정기총회 개최"]);
  const text = await extractHwpxText(buf);
  assert.match(text, /입주자대표회의 의결문/);
  assert.match(text, /안건 1: 정기총회 개최/);
});

test("extractHwpxText: section*.xml 이 없으면 빈 문자열", async () => {
  const zip = new JSZip();
  zip.file("mimetype", "application/hwp+zip");
  const buf = await zip.generateAsync({ type: "nodebuffer" });
  const text = await extractHwpxText(buf);
  assert.equal(text, "");
});

test("extractHwpTextBestEffort: 본문 추출은 시도하지 않고 항상 빈 문자열", () => {
  const ole2 = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0x00, 0x00]);
  const garbage = Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08]);
  assert.equal(extractHwpTextBestEffort(ole2), "");
  assert.equal(extractHwpTextBestEffort(garbage), "");
  assert.equal(extractHwpTextBestEffort(Buffer.from([])), "");
});

test("extractTextIfOfficeDoc: MIME 별 적절한 추출기로 라우팅 + 비-오피스는 null", async () => {
  const xlsx = await makeXlsx([["a", "b"]]);
  const hwpx = await makeHwpx(["테스트"]);
  const a = await extractTextIfOfficeDoc({
    buffer: xlsx,
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const b = await extractTextIfOfficeDoc({ buffer: hwpx, mimeType: "application/vnd.hancom.hwpx" });
  const c = await extractTextIfOfficeDoc({ buffer: Buffer.from("hi"), mimeType: "text/plain" });
  assert.match(a ?? "", /a,b/);
  assert.match(b ?? "", /테스트/);
  assert.equal(c, null);
});

test("looksLikeBankStatement: 통장 키워드 2개 이상이면 true", () => {
  assert.equal(looksLikeBankStatement("거래일자,적요,입금,출금,잔액"), true);
  assert.equal(looksLikeBankStatement("거래내역\n2026-01-01 이체 1,000,000"), true);
  assert.equal(looksLikeBankStatement("그냥 평범한 메모입니다"), false);
  assert.equal(looksLikeBankStatement("입금만 있고 다른 키워드 없음"), false);
});

test("classifyDocument 통합: xlsx 통장 헤더면 LLM 안 거치고 bank_statement", async () => {
  const { classifyDocument, __setRoutedGenerateForTests } = await import(
    "../lib/ocrPipeline.js"
  );
  let called = false;
  __setRoutedGenerateForTests((async () => {
    called = true;
    return {
      text: "receipt",
      tier: "tier0" as const,
      model: "stub",
      inputTokens: null,
      outputTokens: null,
      costEstimateUsd: 0,
    };
  }) as never);
  try {
    const buf = await makeXlsx([
      ["거래일자", "적요", "출금", "입금", "잔액"],
      ["2026-04-01", "관리비", 0, 1000, 1000],
    ]);
    const k = await classifyDocument({
      buffer: buf,
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    assert.equal(k, "bank_statement");
    assert.equal(called, false, "통장 휴리스틱 적중 시 LLM 호출이 일어나면 안 된다");
  } finally {
    __setRoutedGenerateForTests(null);
  }
});

test("classifyDocument 통합: hwpx 본문이 LLM 응답 그대로 매핑된다", async () => {
  const { classifyDocument, __setRoutedGenerateForTests } = await import(
    "../lib/ocrPipeline.js"
  );
  __setRoutedGenerateForTests((async () => ({
    text: "resolution",
    tier: "tier0" as const,
    model: "stub",
    inputTokens: null,
    outputTokens: null,
    costEstimateUsd: 0,
  })) as never);
  try {
    const buf = await makeHwpx(["입주자대표회의 의결사항"]);
    const k = await classifyDocument({
      buffer: buf,
      mimeType: "application/vnd.hancom.hwpx",
    });
    assert.equal(k, "resolution");
  } finally {
    __setRoutedGenerateForTests(null);
  }
});
