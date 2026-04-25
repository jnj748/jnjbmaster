import { test } from "node:test";
import assert from "node:assert/strict";
import {
  pickRfqSuggestionFromAlerts,
  buildEmptyQuoteRfqPrefillQuery,
  type AlertLike,
} from "./empty-quote-suggestion";

function isoDaysFromNow(days: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

test("알림이 비어있거나 null 이면 null 을 반환한다", () => {
  assert.equal(pickRfqSuggestionFromAlerts(null), null);
  assert.equal(pickRfqSuggestionFromAlerts(undefined), null);
  assert.equal(pickRfqSuggestionFromAlerts([]), null);
});

test("RFQ 적합 카테고리가 없으면 null 을 반환한다", () => {
  const alerts: AlertLike[] = [
    {
      id: 1,
      type: "task_template_mandatory",
      title: "주민 회의록 작성",
      dueDate: isoDaysFromNow(2),
    },
  ];
  assert.equal(pickRfqSuggestionFromAlerts(alerts), null);
});

test("행정/세무성 키워드가 포함된 항목은 후보에서 제외된다", () => {
  const alerts: AlertLike[] = [
    {
      id: 1,
      type: "task_template_mandatory",
      title: "관리비 결산 보고",
      dueDate: isoDaysFromNow(1),
    },
    {
      id: 2,
      type: "task_template_suggested",
      title: "엘리베이터 정기 점검",
      dueDate: isoDaysFromNow(5),
    },
  ];
  const r = pickRfqSuggestionFromAlerts(alerts);
  assert.ok(r);
  assert.equal(r!.alert.id, 2);
  assert.equal(r!.category, "elevator");
});

test("필수업무가 제안업무보다 우선 선정된다", () => {
  const alerts: AlertLike[] = [
    {
      id: 10,
      type: "task_template_suggested",
      title: "소방 시설 점검",
      dueDate: isoDaysFromNow(1),
    },
    {
      id: 11,
      type: "task_template_mandatory",
      title: "전기 안전 점검",
      dueDate: isoDaysFromNow(5),
    },
  ];
  const r = pickRfqSuggestionFromAlerts(alerts);
  assert.ok(r);
  assert.equal(r!.alert.id, 11);
  assert.equal(r!.category, "electrical");
});

test("같은 등급 안에서는 dueDate 가 가장 임박한 항목이 선정된다", () => {
  const alerts: AlertLike[] = [
    {
      id: 20,
      type: "task_template_mandatory",
      title: "정화조 청소",
      dueDate: isoDaysFromNow(10),
    },
    {
      id: 21,
      type: "task_template_mandatory",
      title: "승강기 안전 점검",
      dueDate: isoDaysFromNow(2),
    },
    {
      id: 22,
      type: "task_template_mandatory",
      title: "저수조 청소",
      dueDate: isoDaysFromNow(7),
    },
  ];
  const r = pickRfqSuggestionFromAlerts(alerts);
  assert.ok(r);
  assert.equal(r!.alert.id, 21);
  assert.equal(r!.category, "elevator");
  assert.equal(r!.dDayLabel, "D-2");
});

test("inspection_due 는 mandatory 다음, suggested 보다 우선이다", () => {
  const alerts: AlertLike[] = [
    {
      id: 30,
      type: "task_template_suggested",
      title: "공조 설비 점검",
      dueDate: isoDaysFromNow(1),
    },
    {
      id: 31,
      type: "inspection_due",
      title: "소방 정기 점검",
      dueDate: isoDaysFromNow(3),
    },
  ];
  const r = pickRfqSuggestionFromAlerts(alerts);
  assert.ok(r);
  assert.equal(r!.alert.id, 31);
  assert.equal(r!.category, "fire_safety");
});

test("dueDate 가 없는 항목은 후순위로 밀린다", () => {
  const alerts: AlertLike[] = [
    {
      id: 40,
      type: "task_template_mandatory",
      title: "보일러 정비",
      dueDate: null,
    },
    {
      id: 41,
      type: "task_template_mandatory",
      title: "수전 설비 점검",
      dueDate: isoDaysFromNow(7),
    },
  ];
  const r = pickRfqSuggestionFromAlerts(alerts);
  assert.ok(r);
  assert.equal(r!.alert.id, 41);
});

test("기한이 지난 항목은 '○일 지남' 라벨이 된다", () => {
  const alerts: AlertLike[] = [
    {
      id: 50,
      type: "task_template_mandatory",
      title: "누수 보수",
      dueDate: isoDaysFromNow(-3),
    },
  ];
  const r = pickRfqSuggestionFromAlerts(alerts);
  assert.ok(r);
  assert.equal(r!.dDayLabel, "3일 지남");
  assert.equal(r!.daysLeft, -3);
});

test("buildEmptyQuoteRfqPrefillQuery 가 prefill 키들을 모두 채운다", () => {
  const alerts: AlertLike[] = [
    {
      id: 60,
      relatedId: 999,
      type: "task_template_mandatory",
      title: "비상발전기 무부하 가동",
      message: "월 1회 정기 점검",
      dueDate: isoDaysFromNow(2),
    },
  ];
  const c = pickRfqSuggestionFromAlerts(alerts);
  assert.ok(c);
  const qs = buildEmptyQuoteRfqPrefillQuery(c!);
  const params = new URLSearchParams(qs);
  assert.equal(params.get("prefill"), "1");
  assert.equal(params.get("title"), "비상발전기 무부하 가동");
  assert.equal(params.get("category"), "electrical");
  assert.equal(params.get("sourceType"), "alert_action");
  assert.equal(params.get("sourceId"), "999");
  const body = params.get("body");
  assert.ok(body && body.startsWith("[자동 추천] "));
  assert.ok(body!.includes("D-2") || body!.includes("D-Day"));
  assert.ok(body!.includes("월 1회 정기 점검"));
});
