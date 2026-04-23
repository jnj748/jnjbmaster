// [Task #197] 후속 조치 키워드 감지 모듈.
// 기안서(결재요청)/RFQ(파트너사 견적) 제안 팝업의 단일 진실 공급원이다.
// 본사 관리자가 손쉽게 키워드를 추가/수정할 수 있도록 사전(dictionary)은
// 한 곳에 모아두고, 카테고리 추천 매핑도 같은 위치에서 관리한다.

export type FollowUpDomain = "facility" | "cleaning" | "complaint" | "safety" | "other";

export interface FollowUpKeywordEntry {
  keyword: string;
  domain: FollowUpDomain;
  rfqCategory: string;
  approvalCategory: "maintenance" | "facility" | "inspection" | "equipment" | "other";
}

// 본사 관리자가 손쉽게 추가/수정할 수 있도록 평문 배열로 둔다.
// (이번 단계는 코드 상수 + 확장 지점 마련. 추후 DB/관리 UI로 이전 가능.)
export const FOLLOW_UP_KEYWORDS: FollowUpKeywordEntry[] = [
  { keyword: "고장", domain: "facility", rfqCategory: "maintenance_repair", approvalCategory: "maintenance" },
  { keyword: "수리", domain: "facility", rfqCategory: "maintenance_repair", approvalCategory: "maintenance" },
  { keyword: "수선", domain: "facility", rfqCategory: "maintenance_repair", approvalCategory: "maintenance" },
  { keyword: "용역", domain: "facility", rfqCategory: "maintenance_repair", approvalCategory: "maintenance" },
  { keyword: "교체", domain: "facility", rfqCategory: "maintenance_repair", approvalCategory: "equipment" },
  { keyword: "교환", domain: "facility", rfqCategory: "maintenance_repair", approvalCategory: "equipment" },
  { keyword: "누수", domain: "facility", rfqCategory: "waterproofing", approvalCategory: "maintenance" },
  { keyword: "결함", domain: "facility", rfqCategory: "defect_diagnosis", approvalCategory: "maintenance" },
  { keyword: "하자", domain: "facility", rfqCategory: "defect_diagnosis", approvalCategory: "maintenance" },
  { keyword: "파손", domain: "facility", rfqCategory: "maintenance_repair", approvalCategory: "maintenance" },
  { keyword: "균열", domain: "facility", rfqCategory: "defect_diagnosis", approvalCategory: "maintenance" },
  { keyword: "점검불량", domain: "facility", rfqCategory: "maintenance_repair", approvalCategory: "inspection" },
  { keyword: "불량", domain: "facility", rfqCategory: "maintenance_repair", approvalCategory: "inspection" },
  { keyword: "노후", domain: "facility", rfqCategory: "maintenance_repair", approvalCategory: "maintenance" },
  { keyword: "보수", domain: "facility", rfqCategory: "maintenance_repair", approvalCategory: "maintenance" },
  { keyword: "정비", domain: "facility", rfqCategory: "maintenance_repair", approvalCategory: "maintenance" },
  { keyword: "방수", domain: "facility", rfqCategory: "waterproofing", approvalCategory: "maintenance" },
  { keyword: "청소", domain: "cleaning", rfqCategory: "cleaning", approvalCategory: "facility" },
  { keyword: "위생", domain: "cleaning", rfqCategory: "cleaning", approvalCategory: "facility" },
  { keyword: "방역", domain: "cleaning", rfqCategory: "cleaning", approvalCategory: "facility" },
  { keyword: "민원", domain: "complaint", rfqCategory: "other", approvalCategory: "other" },
  { keyword: "소음", domain: "complaint", rfqCategory: "other", approvalCategory: "other" },
];

export interface FollowUpDetection {
  matched: FollowUpKeywordEntry[];
  /** 사람이 읽기 좋은 핵심 문구 (앞뒤 문맥 포함). */
  snippet: string;
  /** 가장 빈도/우선순위가 높은 도메인. */
  primaryDomain: FollowUpDomain;
  /** RFQ 작성 시 사용할 카테고리 (vendor/rfq 카테고리 코드). */
  recommendedRfqCategory: string;
  /** 결재요청(기안서) 작성 시 사용할 카테고리. */
  recommendedApprovalCategory: "maintenance" | "facility" | "inspection" | "equipment" | "other";
}

export interface DetectFollowUpContext {
  /** 컨텍스트 힌트: 호출 지점의 영역(시설/청소/민원 등). 없으면 자동 추정. */
  domainHint?: FollowUpDomain;
}

/**
 * 본문/메모/특이사항을 합친 텍스트에서 후속 조치 키워드를 감지한다.
 * 매칭이 없으면 null 을 반환한다.
 */
export function detectFollowUp(
  text: string | null | undefined,
  context: DetectFollowUpContext = {},
): FollowUpDetection | null {
  if (!text) return null;
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return null;

  const matched: FollowUpKeywordEntry[] = [];
  const seen = new Set<string>();
  for (const entry of FOLLOW_UP_KEYWORDS) {
    if (normalized.includes(entry.keyword) && !seen.has(entry.keyword)) {
      matched.push(entry);
      seen.add(entry.keyword);
    }
  }
  if (matched.length === 0) return null;

  // 가장 먼저 등장한 키워드 위치 기준으로 스니펫 생성.
  let firstIdx = Number.POSITIVE_INFINITY;
  let firstEntry = matched[0];
  for (const m of matched) {
    const idx = normalized.indexOf(m.keyword);
    if (idx >= 0 && idx < firstIdx) {
      firstIdx = idx;
      firstEntry = m;
    }
  }
  const start = Math.max(0, firstIdx - 30);
  const end = Math.min(normalized.length, firstIdx + 60);
  const snippet =
    (start > 0 ? "…" : "") + normalized.slice(start, end) + (end < normalized.length ? "…" : "");

  // 도메인 우선순위: hint > 가장 많이 매칭된 도메인 > 첫 매치 도메인.
  const domainCount = new Map<FollowUpDomain, number>();
  matched.forEach((m) => domainCount.set(m.domain, (domainCount.get(m.domain) ?? 0) + 1));
  const sortedDomains = Array.from(domainCount.entries()).sort((a, b) => b[1] - a[1]);
  const primaryDomain: FollowUpDomain =
    context.domainHint ?? sortedDomains[0]?.[0] ?? firstEntry.domain;

  // 추천 카테고리: primaryDomain 과 일치하는 첫 매치 우선, 없으면 firstEntry.
  const preferred =
    matched.find((m) => m.domain === primaryDomain) ?? firstEntry;

  return {
    matched,
    snippet,
    primaryDomain,
    recommendedRfqCategory: preferred.rfqCategory,
    recommendedApprovalCategory: preferred.approvalCategory,
  };
}

export interface FollowUpSource {
  /** 원본 업무 종류. */
  type:
    | "work_log_memo"
    | "daily_journal"
    | "weekly_journal"
    | "monthly_journal"
    | "inspection_legal_complete"
    | "inspection_suggested_complete"
    | "alert_action";
  /** 원본 ID (없으면 임시 키). */
  id: string | number;
  /** 사람이 읽기 좋은 제목/요약 (예: "3층 복도등 점등불량"). */
  title: string;
  /** 발생일 (ISO YYYY-MM-DD). */
  occurredAt: string;
}

export const SOURCE_TYPE_LABEL: Record<FollowUpSource["type"], string> = {
  work_log_memo: "일일업무메모",
  daily_journal: "일일업무일지",
  weekly_journal: "주간업무일지",
  monthly_journal: "월간업무리마인드",
  inspection_legal_complete: "법정점검 완료",
  inspection_suggested_complete: "권장점검 완료",
  alert_action: "알림 처리",
};

/**
 * 출처 메타를 사람이 읽고 시스템이 다시 파싱할 수 있는 문자열로 직렬화.
 * (스키마에 별도 컬럼이 없을 때 description/notes 끝에 덧붙여 저장한다.)
 */
export function formatSourceFooter(
  source: FollowUpSource,
  detection: FollowUpDetection | null,
): string {
  const lines: string[] = [];
  lines.push("");
  lines.push("──────────");
  lines.push(
    `[자동 제안] 출처: ${SOURCE_TYPE_LABEL[source.type]} #${source.id} (${source.occurredAt})`,
  );
  if (detection) {
    lines.push(`감지 키워드: ${detection.matched.map((m) => m.keyword).join(", ")}`);
    lines.push(`원문: ${detection.snippet}`);
  }
  return lines.join("\n");
}
