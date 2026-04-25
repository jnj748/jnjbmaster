// [Task #388] 빈 견적 상태(SubmittedQuotesWidget / RFQs 페이지)에서 비교견적 유도
// 추천 카드를 띄우기 위한 후보 선정 + RFQ prefill URL 빌더.
//
// 아이디어:
//   - 서버는 이미 /api/dashboard/alerts 응답에 곧 도래하는 필수업무
//     (task_template_mandatory) / 제안업무 (task_template_suggested) +
//     법정/자체 점검(inspection_due) 을 dueDate 와 함께 내려준다.
//   - 그 중 RFQ 로 발주하기에 적합한 항목(점검·수리·시설 유지보수) 1건을 골라
//     "곧 ○○○을 해야 하는 시기입니다. 비교 견적을 받아보시면 어떨까요?" 라는
//     맞춤형 추천 카드로 빈 상태를 강화한다.
//   - "곧 도래하는 업무" 알림 자체의 산출 로직(taskTemplateCycle.ts)은 변경하지 않고,
//     클라이언트에서 필터/정렬만 수행한다.

export interface AlertLike {
  id: number;
  type: string;
  title: string;
  message?: string;
  severity?: string;
  dueDate?: string | null;
  inspectionType?: string | null;
  relatedId?: number | null;
}

// 매니저앱의 RFQ 작성 다이얼로그가 받는 카테고리 코드. (rfqs.tsx categoryOptions 와 동기화)
export type RfqSuggestionCategory =
  | "elevator"
  | "water_tank"
  | "fire_safety"
  | "electrical"
  | "gas"
  | "septic"
  | "cleaning"
  | "security"
  | "waterproofing"
  | "maintenance_repair"
  | "defect_diagnosis"
  | "building_maintenance"
  | "mechanical"
  | "other";

// 제목에 포함되면 RFQ 카테고리로 매핑되는 키워드. 등장 순서대로 우선 매칭한다.
const CATEGORY_KEYWORD_RULES: Array<{ keyword: string; category: RfqSuggestionCategory }> = [
  { keyword: "승강기", category: "elevator" },
  { keyword: "엘리베이터", category: "elevator" },
  { keyword: "저수조", category: "water_tank" },
  { keyword: "물탱크", category: "water_tank" },
  { keyword: "소방", category: "fire_safety" },
  { keyword: "방재", category: "fire_safety" },
  { keyword: "전기", category: "electrical" },
  { keyword: "수전", category: "electrical" },
  { keyword: "변전", category: "electrical" },
  { keyword: "가스", category: "gas" },
  { keyword: "정화조", category: "septic" },
  { keyword: "오수", category: "septic" },
  { keyword: "청소", category: "cleaning" },
  { keyword: "위생", category: "cleaning" },
  { keyword: "방역", category: "cleaning" },
  { keyword: "경비", category: "security" },
  { keyword: "보안", category: "security" },
  { keyword: "방수", category: "waterproofing" },
  { keyword: "누수", category: "waterproofing" },
  { keyword: "하자", category: "defect_diagnosis" },
  { keyword: "결함", category: "defect_diagnosis" },
  { keyword: "균열", category: "defect_diagnosis" },
  { keyword: "기계", category: "mechanical" },
  { keyword: "냉난방", category: "mechanical" },
  { keyword: "보일러", category: "mechanical" },
  { keyword: "공조", category: "mechanical" },
  // 점검/수리/보수/유지/관리 류는 시설 유지보수로 묶는다.
  { keyword: "점검", category: "maintenance_repair" },
  { keyword: "수리", category: "maintenance_repair" },
  { keyword: "보수", category: "maintenance_repair" },
  { keyword: "정비", category: "maintenance_repair" },
  { keyword: "교체", category: "maintenance_repair" },
  { keyword: "도색", category: "maintenance_repair" },
  { keyword: "건물관리", category: "building_maintenance" },
];

// 행정/세무/보고성 알림은 비교 견적 발주 대상이 아니다 — 제외한다.
const EXCLUDE_KEYWORDS = [
  "세무", "세금", "납세", "신고", "결산", "공시", "공고", "보고",
  "감사", "파기", "데이터", "장부", "회계", "정산", "기록", "보존",
];

function matchRfqCategory(title: string): RfqSuggestionCategory | null {
  if (!title) return null;
  const t = title.replace(/\s+/g, "");
  for (const rule of CATEGORY_KEYWORD_RULES) {
    if (t.includes(rule.keyword)) return rule.category;
  }
  return null;
}

function isExcludedTitle(title: string): boolean {
  if (!title) return false;
  const t = title.replace(/\s+/g, "");
  return EXCLUDE_KEYWORDS.some((kw) => t.includes(kw));
}

// mandatory 우선, 같은 등급 안에서는 dueDate 가 빠른 순. dueDate 가 비어있으면 후순위.
function alertRank(a: AlertLike): readonly [number, number, string] {
  const tier =
    a.type === "task_template_mandatory"
      ? 0
      : a.type === "inspection_due"
      ? 1
      : a.type === "task_template_suggested"
      ? 2
      : 9;
  // dueDate ISO 가 없으면 매우 큰 값으로 — 항상 후순위.
  const dueKey = a.dueDate ? Date.parse(a.dueDate) : Number.POSITIVE_INFINITY;
  return [tier, Number.isFinite(dueKey) ? dueKey : Number.POSITIVE_INFINITY, a.dueDate ?? "9999-12-31"];
}

export interface SuggestedRfqCandidate {
  alert: AlertLike;
  category: RfqSuggestionCategory;
  /** 마감일까지 남은 일수. 음수 = 기한 초과. */
  daysLeft: number | null;
  /** 사람이 읽기 좋은 D-day 라벨 ("D-3" / "D-Day" / "3일 지남"). */
  dDayLabel: string;
}

function dDayInfo(dueDate: string | null | undefined): {
  daysLeft: number | null;
  dDayLabel: string;
} {
  if (!dueDate) return { daysLeft: null, dDayLabel: "기한미정" };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate);
  if (Number.isNaN(due.getTime())) return { daysLeft: null, dDayLabel: "기한미정" };
  due.setHours(0, 0, 0, 0);
  const diff = Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diff < 0) return { daysLeft: diff, dDayLabel: `${Math.abs(diff)}일 지남` };
  if (diff === 0) return { daysLeft: 0, dDayLabel: "D-Day" };
  return { daysLeft: diff, dDayLabel: `D-${diff}` };
}

/**
 * 빈 견적 상태에 노출할 추천 1건을 선정한다.
 *
 * 규칙:
 *   1) 필수업무(mandatory) 우선, 다음 법정/자체 점검(inspection_due), 다음 제안업무(suggested).
 *   2) 같은 등급 안에서는 dueDate 가 가장 임박한 항목.
 *   3) 제목 키워드로 RFQ 카테고리가 잡히고 행정/세무성 키워드가 아닐 때만 후보.
 *
 * 적합한 알림이 없으면 null — 이 경우 호출 측은 기존 빈 상태 UI 를 그대로 써야 한다.
 */
export function pickRfqSuggestionFromAlerts(
  alerts: ReadonlyArray<AlertLike> | null | undefined,
): SuggestedRfqCandidate | null {
  if (!alerts || alerts.length === 0) return null;

  const candidates: Array<{ alert: AlertLike; category: RfqSuggestionCategory }> = [];
  for (const a of alerts) {
    if (
      a.type !== "task_template_mandatory" &&
      a.type !== "task_template_suggested" &&
      a.type !== "inspection_due"
    ) {
      continue;
    }
    if (isExcludedTitle(a.title)) continue;
    const category = matchRfqCategory(a.title);
    if (!category) continue;
    candidates.push({ alert: a, category });
  }
  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    const ra = alertRank(a.alert);
    const rb = alertRank(b.alert);
    if (ra[0] !== rb[0]) return ra[0] - rb[0];
    if (ra[1] !== rb[1]) return ra[1] - rb[1];
    return ra[2].localeCompare(rb[2]);
  });

  const best = candidates[0];
  const { daysLeft, dDayLabel } = dDayInfo(best.alert.dueDate);
  return { alert: best.alert, category: best.category, daysLeft, dDayLabel };
}

/**
 * 추천 알림을 받아 RFQ 작성 다이얼로그가 자동 prefill 되는 URL 쿼리스트링을 만든다.
 * `/rfqs?prefill=1&...` 진입 시 `rfqs.tsx` 의 useEffect 가 다이얼로그를 열고 폼을 채운다.
 */
export function buildEmptyQuoteRfqPrefillQuery(candidate: SuggestedRfqCandidate): string {
  const today = new Date().toISOString().split("T")[0];
  const params = new URLSearchParams();
  params.set("prefill", "1");
  params.set("title", candidate.alert.title);
  params.set("category", candidate.category);
  // 원문/감지키워드는 prefill body 푸터에 들어가 매니저가 RFQ 본문에서 출처를 즉시 확인할 수 있게 한다.
  const bodyLines = [
    `[자동 추천] ${candidate.alert.title}`,
    "",
    candidate.dDayLabel === "기한미정"
      ? "곧 도래 예정"
      : candidate.daysLeft != null && candidate.daysLeft < 0
      ? `${candidate.dDayLabel} (이미 기한이 지났습니다)`
      : `예정일까지 ${candidate.dDayLabel}`,
  ];
  if (candidate.alert.message) {
    bodyLines.push("");
    bodyLines.push(candidate.alert.message);
  }
  params.set("body", bodyLines.join("\n"));
  params.set("sourceType", "alert_action");
  params.set("sourceId", String(candidate.alert.relatedId ?? candidate.alert.id));
  params.set("sourceDate", today);
  return params.toString();
}
