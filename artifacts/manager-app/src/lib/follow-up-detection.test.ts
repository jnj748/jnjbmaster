import { test } from "node:test";
import assert from "node:assert/strict";
import {
  detectFollowUp,
  formatSourceFooter,
  FOLLOW_UP_KEYWORDS,
  SOURCE_TYPE_LABEL,
} from "./follow-up-detection";

test("키워드가 없는 텍스트는 null 을 반환한다", () => {
  assert.equal(detectFollowUp("오늘 특이사항 없음. 정상 운영"), null);
  assert.equal(detectFollowUp(""), null);
  assert.equal(detectFollowUp(null), null);
});

test("'고장' 키워드를 감지하고 시설 도메인으로 분류한다", () => {
  const r = detectFollowUp("3층 복도등 1개 점등 불량 → 교체 필요");
  assert.ok(r);
  const kws = r!.matched.map((m) => m.keyword);
  assert.ok(kws.includes("불량"));
  assert.ok(kws.includes("교체"));
  assert.equal(r!.primaryDomain, "facility");
  assert.equal(r!.recommendedRfqCategory, "maintenance_repair");
});

test("'누수' 는 방수 RFQ 카테고리를 추천한다", () => {
  const r = detectFollowUp("지하 1층 천장 누수 발견");
  assert.ok(r);
  assert.equal(r!.recommendedRfqCategory, "waterproofing");
});

test("스니펫은 매칭된 키워드 주변 문맥을 포함한다", () => {
  const long =
    "오늘 정기 순찰 중 ".repeat(5) + "엘리베이터 비상정지 고장 발생, 점검 의뢰 예정 " + "기타 메모".repeat(5);
  const r = detectFollowUp(long);
  assert.ok(r);
  assert.ok(r!.snippet.includes("고장"));
});

test("힌트 도메인이 우선 적용된다", () => {
  const r = detectFollowUp("청소 상태 불량", { domainHint: "cleaning" });
  assert.ok(r);
  assert.equal(r!.primaryDomain, "cleaning");
});

test("출처 footer 직렬화 결과에 출처 종류와 키워드가 포함된다", () => {
  const r = detectFollowUp("엘리베이터 고장");
  const footer = formatSourceFooter(
    { type: "inspection_legal_complete", id: 42, title: "승강기", occurredAt: "2026-04-21" },
    r,
  );
  assert.ok(footer.includes("법정점검 완료 #42"));
  assert.ok(footer.includes("2026-04-21"));
  assert.ok(footer.includes("고장"));
});

test("법정/권장 점검 출처가 별도 라벨로 구분된다 (필수업무 vs 제안업무)", () => {
  assert.equal(SOURCE_TYPE_LABEL.inspection_legal_complete, "법정점검 완료");
  assert.equal(SOURCE_TYPE_LABEL.inspection_suggested_complete, "권장점검 완료");
  // 빠른메모 / 일일·주간 일지도 모두 존재해야 한다 (5개 트리거 출처).
  assert.ok(SOURCE_TYPE_LABEL.work_log_memo);
  assert.ok(SOURCE_TYPE_LABEL.daily_journal);
  assert.ok(SOURCE_TYPE_LABEL.weekly_journal);
});

test("여러 도메인이 섞여 있어도 hint 가 우선 카테고리를 결정한다", () => {
  const r = detectFollowUp("청소 상태가 전반적으로 불량하고 일부 누수도 있다", {
    domainHint: "facility",
  });
  assert.ok(r);
  assert.equal(r!.primaryDomain, "facility");
  // facility 도메인 매칭 중 첫 매치(불량 또는 누수) 의 카테고리가 추천됨.
  assert.ok(["maintenance_repair", "waterproofing"].includes(r!.recommendedRfqCategory));
});

test("키워드 사전은 빈 항목이 없고 모든 항목이 비어있지 않은 키워드를 가진다", () => {
  assert.ok(FOLLOW_UP_KEYWORDS.length > 0);
  for (const entry of FOLLOW_UP_KEYWORDS) {
    assert.ok(entry.keyword.length > 0);
    assert.ok(entry.rfqCategory.length > 0);
  }
});
