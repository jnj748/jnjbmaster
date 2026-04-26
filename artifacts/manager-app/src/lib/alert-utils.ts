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
  createdAt: string;
}

export type AlertActionTab = "complete" | "postpone" | "rfq";

// 다이얼로그를 통한 직접 처리(완료/연기/견적요청) 가 가능한 알림 유형.
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
  warranty_expiry: "/settings?tab=building",
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
//   - 소방점검 카드: 두 줄 안내, 클릭 시 호실 관리(/units) 로 이동(모달 미표시).
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
const FIRE_TITLE_PREFIX = "(테스트업무) 소방점검";

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
        "호실 데이터 구성하기",
        "여기를 눌러 호실별 면적정보를 가져오세요",
      ],
      navigateTo: "/units",
    };
  }
  return null;
}
