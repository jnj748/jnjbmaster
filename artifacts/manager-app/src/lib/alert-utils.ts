// [Task #413] /dashboard/alerts 와 시설관리 "필수업무"/"제안업무" 페이지에서
//   공통으로 사용하는 알림 처리 유틸. dashboard-manager-legacy 에서 인라인으로
//   정의돼 있던 헬퍼들을 단일 출처로 분리한다.

export interface DashboardAlert {
  id: number;
  type: string;
  title: string;
  message: string;
  severity: string;
  relatedId?: number | null;
  hasDraft?: boolean;
  actionStatus?: string | null;
  dueDate?: string | null;
  penaltyInfo?: string | null;
  inspectionType?: string | null;
  cycleMonths?: number | null;
  intervalDays?: number | null;
  noticeTemplateId?: number | null;
  // [Task #511] 가장 최근 액션이 "scheduled" 인 경우 매니저가 정한 처리예정 메타.
  //   actionStatus === "scheduled" 일 때만 의미가 있으며 카드 우측의 노란/빨간
  //   "처리예정 D-N" 라벨과 모달 내부 폼 prefill 에 사용된다.
  scheduledDate?: string | null;
  scheduledNotes?: string | null;
  // [Task #511] 알림에 첨부된 근경/원경 사진 URL. 가장 최근 액션의 첨부에서 흘러오며,
  //   비교견적 탭에서 /rfqs?prefill 의 closeUpPhoto/widePhoto 쿼리로 그대로 전달된다.
  closeUpPhotoUrl?: string | null;
  widePhotoUrl?: string | null;
  createdAt: string;
}

// [Task #511] 알림 처리 모달 탭 식별자.
//   탭 노출 순서는 항상 [complete → scheduled → postpone → rfq] 이며
//   알림 유형에 관계없이 4개 탭 모두 동일하게 표시된다.
export type AlertActionTab = "complete" | "scheduled" | "postpone" | "rfq";

// 알림 카드 클릭 시 처리 모달이 열리는 알림 유형.
//   이 목록 외의 유형은 ALERT_FALLBACK_ROUTES 의 경로로 네비게이트한다.
//   (모달이 열린 뒤에는 모든 탭이 동일하게 노출되며 알림 유형으로 가르지 않음)
export const ACTIONABLE_ALERT_TYPES = [
  "inspection_due",
  "tax_due",
  "task_overdue",
  "task_followup",
  "warranty_expiry",
] as const;

// 다이얼로그가 열리지 못하는 경우(relatedId 부재 등) 의 폴백 라우트.
export const ALERT_FALLBACK_ROUTES: Record<string, string> = {
  inspection_due: "/inspections",
  tax_due: "/tax-schedules",
  task_overdue: "/tasks",
  task_followup: "/tasks",
  warranty_expiry: "/settings/building",
};

// alert.type → alertActions.relatedEntityType 변환.
export function getEntityType(alertType: string): string {
  switch (alertType) {
    case "inspection_due": return "inspection";
    case "tax_due": return "tax";
    case "task_overdue": return "task";
    case "task_followup": return "task";
    case "warranty_expiry": return "warranty";
    case "task_template_mandatory": return "task_template";
    case "task_template_suggested": return "task_template";
    case "notice_posting": return "building_notice_template";
    default: return "task";
  }
}

// D-day 라벨/일수/기한초과 여부.
export function getDdayLabel(
  dueDate: string | null,
): { label: string; days: number | null; isOverdue: boolean } {
  if (!dueDate) return { label: "기한없음", days: null, isOverdue: false };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);
  const diff = Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diff < 0) return { label: `${Math.abs(diff)}일 지남`, days: diff, isOverdue: true };
  if (diff === 0) return { label: "D-Day", days: 0, isOverdue: false };
  return { label: `D-${diff}`, days: diff, isOverdue: false };
}

// [Task #511] 처리예정(scheduled) 배지 표시 메타. 알림에 scheduled 액션이
//   걸려 있을 때 카드 우측에 노출되는 작은 라벨에 사용한다.
//   - tone="yellow" : 예정일이 오늘 이후 (D-Day 포함)
//   - tone="red"    : 예정일이 이미 지남 → "예정일 N일 경과"
//   - null          : 예정일이 없거나 actionStatus 가 scheduled 가 아닌 경우
export interface ScheduledBadgeMeta {
  tone: "yellow" | "red";
  text: string;
}

export function getScheduledBadge(
  alert: { actionStatus?: string | null; scheduledDate?: string | null },
): ScheduledBadgeMeta | null {
  if (alert.actionStatus !== "scheduled") return null;
  const scheduled = alert.scheduledDate;
  if (!scheduled) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(scheduled);
  due.setHours(0, 0, 0, 0);
  if (Number.isNaN(due.getTime())) return null;
  const diff = Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  const month = due.getMonth() + 1;
  const day = due.getDate();
  if (diff < 0) {
    return { tone: "red", text: `예정일 ${Math.abs(diff)}일 경과 (${month}/${day})` };
  }
  if (diff === 0) {
    return { tone: "yellow", text: `처리예정 D-Day (${month}/${day})` };
  }
  return { tone: "yellow", text: `처리예정 D-${diff} (${month}/${day})` };
}

// 트래픽 라이트(녹색/노란색/빨간색) 색상.
export function getTrafficColor(dueDate: string | null): "red" | "yellow" | "green" {
  const dday = getDdayLabel(dueDate);
  if (dday.isOverdue || (dday.days !== null && dday.days < 7)) return "red";
  if (dday.days !== null && dday.days < 30) return "yellow";
  return "green";
}

// [Task #437] (테스트업무) 시드 카드의 둘째 줄 안내·클릭 동작 오버라이드.
//   - 신규 매니저가 첫 화면에서 "직접 한번 눌러보세요" 형태로 자연스럽게 사용
//     흐름을 익히도록 단순 경고 문구 대신 행동 유도 카피로 바꾼다.
//   - 정화조 청소 카드: 한 줄 안내, 클릭 시 기존 처리 모달 열기.
//   - 호실데이터 불러오기 카드(구 "소방점검"): 한 줄 안내, 클릭 시 호실 관리
//     (/units) 로 이동(모달 미표시). [Task #491] 카드명을 "(테스트업무) 호실데이터
//     불러오기" 로 리네이밍하고 안내를 한 줄로 정리.
//   - 식별은 alert.title 접두 일치로 한다 (서버 시드명과 동일).
export type TestTaskCardKind = "septic" | "fire";

export interface TestTaskCardOverride {
  kind: TestTaskCardKind;
  // 둘째 줄 문구 — 1줄 또는 2줄. 화면에서 줄바꿈 처리한다.
  secondLines: string[];
  // 지정 시 카드 클릭은 처리 모달 대신 해당 경로로 네비게이트.
  navigateTo?: string;
}

const SEPTIC_TITLE_PREFIX = "(테스트업무) 정화조 청소";
// [Task #491] 신규 시드명. 기존 매니저 계정의 잔존 행은 서버 시드 함수가 자연
//   마이그레이션하므로 클라이언트는 새 이름만 식별하면 된다.
const FIRE_TITLE_PREFIX = "(테스트업무) 호실데이터 불러오기";

export function getTestTaskCardOverride(alert: { title: string }): TestTaskCardOverride | null {
  const t = alert.title ?? "";
  if (t.startsWith(SEPTIC_TITLE_PREFIX)) {
    return {
      kind: "septic",
      secondLines: ["여기를 눌러 테스트 업무를 완료처리해보세요"],
    };
  }
  if (t.startsWith(FIRE_TITLE_PREFIX)) {
    return {
      kind: "fire",
      secondLines: [
        "이 업무를 누르면 AI가 호실별 데이터를 자동으로 가져옵니다.",
      ],
      navigateTo: "/units",
    };
  }
  return null;
}
