import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeTodayProgress,
  emptyTodayProgress,
  TODAY_PROGRESS_TOTAL,
} from "@workspace/shared/facility-today-progress";

test("emptyTodayProgress: 신호 없음 → 0/4, 모두 false (보수적 기본값)", () => {
  const r = emptyTodayProgress();
  assert.equal(r.totalCount, 4);
  assert.equal(r.completedCount, 0);
  assert.equal(r.items.inspections, false);
  assert.equal(r.items.safetyChecklists, false);
  assert.equal(r.items.maintenanceLogs, false);
  assert.equal(r.items.safetyTrainings, false);
});

test("TODAY_PROGRESS_TOTAL 상수는 4", () => {
  assert.equal(TODAY_PROGRESS_TOTAL, 4);
});

test("법정점검: 오늘 예정 0건이면 완료 (예정 없으면 자동 완료)", () => {
  const r = computeTodayProgress({
    inspectionsDueRemaining: 0,
    safetyChecklistsCompletedToday: 0,
    maintenanceLogsToday: 0,
    safetyTrainingsPendingToday: 0,
  });
  assert.equal(r.items.inspections, true);
});

test("법정점검: 오늘/지연 예정이 1건 이상이면 미완료", () => {
  const r = computeTodayProgress({
    inspectionsDueRemaining: 1,
    safetyChecklistsCompletedToday: 0,
    maintenanceLogsToday: 0,
    safetyTrainingsPendingToday: 0,
  });
  assert.equal(r.items.inspections, false);
});

test("안전점검표: 오늘 작성된 비-pending 점검표 1건 있으면 완료", () => {
  const r = computeTodayProgress({
    inspectionsDueRemaining: 0,
    safetyChecklistsCompletedToday: 1,
    maintenanceLogsToday: 0,
    safetyTrainingsPendingToday: 0,
  });
  assert.equal(r.items.safetyChecklists, true);
});

test("안전점검표: 오늘 작성된 비-pending 점검표 0건이면 미완료", () => {
  const r = computeTodayProgress({
    inspectionsDueRemaining: 0,
    safetyChecklistsCompletedToday: 0,
    maintenanceLogsToday: 0,
    safetyTrainingsPendingToday: 0,
  });
  assert.equal(r.items.safetyChecklists, false);
});

test("기전 업무일지: 오늘 1건 이상 있으면 완료, 0건이면 미완료", () => {
  const a = computeTodayProgress({
    inspectionsDueRemaining: 0,
    safetyChecklistsCompletedToday: 0,
    maintenanceLogsToday: 1,
    safetyTrainingsPendingToday: 0,
  });
  const b = computeTodayProgress({
    inspectionsDueRemaining: 0,
    safetyChecklistsCompletedToday: 0,
    maintenanceLogsToday: 0,
    safetyTrainingsPendingToday: 0,
  });
  assert.equal(a.items.maintenanceLogs, true);
  assert.equal(b.items.maintenanceLogs, false);
});

test("안전교육: 오늘 미완 일정 0건이면 완료(일정 없음 포함)", () => {
  const r = computeTodayProgress({
    inspectionsDueRemaining: 0,
    safetyChecklistsCompletedToday: 0,
    maintenanceLogsToday: 0,
    safetyTrainingsPendingToday: 0,
  });
  assert.equal(r.items.safetyTrainings, true);
});

test("안전교육: 오늘 미완 일정 1건 이상이면 미완료", () => {
  const r = computeTodayProgress({
    inspectionsDueRemaining: 0,
    safetyChecklistsCompletedToday: 0,
    maintenanceLogsToday: 0,
    safetyTrainingsPendingToday: 2,
  });
  assert.equal(r.items.safetyTrainings, false);
});

test("4/4 시 completedCount=4, 모두 true", () => {
  const r = computeTodayProgress({
    inspectionsDueRemaining: 0,
    safetyChecklistsCompletedToday: 3,
    maintenanceLogsToday: 1,
    safetyTrainingsPendingToday: 0,
  });
  assert.equal(r.completedCount, 4);
  assert.equal(r.items.inspections, true);
  assert.equal(r.items.safetyChecklists, true);
  assert.equal(r.items.maintenanceLogs, true);
  assert.equal(r.items.safetyTrainings, true);
});

test("부분 완료 카운팅: 2/4 (점검표·일지만 완료)", () => {
  const r = computeTodayProgress({
    inspectionsDueRemaining: 5,
    safetyChecklistsCompletedToday: 1,
    maintenanceLogsToday: 1,
    safetyTrainingsPendingToday: 3,
  });
  assert.equal(r.completedCount, 2);
});

test("음수 입력 방어: <=0 비교라 음수도 완료로 취급", () => {
  // 데이터 이상으로 음수 들어와도 명시적 미완료가 아님 → 보수적으로 완료 처리.
  const r = computeTodayProgress({
    inspectionsDueRemaining: -1,
    safetyChecklistsCompletedToday: 0,
    maintenanceLogsToday: 0,
    safetyTrainingsPendingToday: -1,
  });
  assert.equal(r.items.inspections, true);
  assert.equal(r.items.safetyTrainings, true);
});
