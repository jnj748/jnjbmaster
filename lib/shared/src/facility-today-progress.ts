/**
 * Pure judgment rules for the "오늘 4대 핵심 과업" progress meter
 * shown in the sidebar 시설 및 안전관리 group header.
 *
 * Server-side aggregates raw counts/dates and feeds them into
 * `computeTodayProgress` to derive the four booleans + N/4 totals.
 * Frontend only consumes the result; it never re-derives the rules
 * (single source of truth).
 *
 * Judgment rules (per task #113):
 *  - 법정점검:       오늘 마감(nextDueDate === today) 미등록 0건이면 완료.
 *                    (지연 건은 별도 신호등 배지에 반영되며, 본 진행률에는 포함하지 않는다.)
 *                    1건 이상 남아 있으면 미완료. 점검 완료 시 nextDueDate가
 *                    다음 주기로 이동하므로 "남은 0건 = 모두 결과 등록"과 동치.
 *  - 안전점검표:     오늘 작성된 일일 점검표 중 status != 'pending' 인 것이
 *                    1건 이상 있으면 완료.
 *  - 기전 업무일지:  오늘 workDate 일지가 1건 이상이면 완료.
 *  - 안전교육:       오늘 trainingDate 교육 중 status != 'completed' 인 것이
 *                    0건이면 완료(일정 없음 포함).
 *
 * Conservative defaults: when there is no signal (e.g. user without
 * buildingId), we report 0/4 with all flags false rather than 4/4.
 */

export interface TodayProgressInput {
  /** 오늘(KST) 마감인 법정점검 중 결과 미등록 건수. 지연(overdue)은 포함하지 않으며 별도 신호등으로 노출된다. */
  inspectionsDueRemaining: number;
  /** Safety checklists for today with status != 'pending'. */
  safetyChecklistsCompletedToday: number;
  /** Maintenance logs with workDate == today (any). */
  maintenanceLogsToday: number;
  /** Safety trainings scheduled today with status != 'completed'. */
  safetyTrainingsPendingToday: number;
}

export interface TodayProgressItems {
  inspections: boolean;
  safetyChecklists: boolean;
  maintenanceLogs: boolean;
  safetyTrainings: boolean;
}

export interface TodayProgress {
  items: TodayProgressItems;
  completedCount: number;
  totalCount: number;
}

export const TODAY_PROGRESS_TOTAL = 4;

export function computeTodayProgress(input: TodayProgressInput): TodayProgress {
  const items: TodayProgressItems = {
    inspections: input.inspectionsDueRemaining <= 0,
    safetyChecklists: input.safetyChecklistsCompletedToday > 0,
    maintenanceLogs: input.maintenanceLogsToday > 0,
    safetyTrainings: input.safetyTrainingsPendingToday <= 0,
  };
  const completedCount =
    (items.inspections ? 1 : 0) +
    (items.safetyChecklists ? 1 : 0) +
    (items.maintenanceLogs ? 1 : 0) +
    (items.safetyTrainings ? 1 : 0);
  return { items, completedCount, totalCount: TODAY_PROGRESS_TOTAL };
}

/** Conservative empty progress (used when no building scope is available). */
export function emptyTodayProgress(): TodayProgress {
  return {
    items: {
      inspections: false,
      safetyChecklists: false,
      maintenanceLogs: false,
      safetyTrainings: false,
    },
    completedCount: 0,
    totalCount: TODAY_PROGRESS_TOTAL,
  };
}
