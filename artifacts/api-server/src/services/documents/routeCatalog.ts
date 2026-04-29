// [Task #610] 문서 산출 라우트 카탈로그 (4층 방어 중 3층).

import type { DocumentKind } from "@workspace/db";

export interface DocumentProducingRoute {
  method: "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  kind: DocumentKind;
  sourceTable: string;
  // 동일 source 의 자동 임시저장 → 상신을 같은 행으로 누적하는지(동일 source_id upsert).
  upsertSameSource: boolean;
  // 라우트가 정의된 파일 (artifacts/api-server/src/routes/ 기준 상대경로).
  //   회귀 테스트가 이 파일에서 `registerDocument(` 호출을 찾는다.
  routeFile: string;
  // 비고 — 미래 본문 자동 생성 / 결재선 추천 후속 태스크 진입점.
  note?: string;
}

export const DOCUMENT_PRODUCING_ROUTES: ReadonlyArray<DocumentProducingRoute> = [
  // 일일 업무일지 — autosave 도 같은 통로, 같은 (building, date, role) upsert.
  { method: "PUT", path: "/daily-journals/:date", kind: "journal", sourceTable: "daily_journals",
    upsertSameSource: true, routeFile: "workLogs.ts" },

  // 주보 / 월보 — 자동 생성/저장 시점이 산출 시점.
  //   reportSystem.ts 라우터에 마운트, 빌딩 라우터 prefix 없음.
  { method: "POST", path: "/weekly-summary-reports", kind: "weekly_report", sourceTable: "weekly_summary_reports",
    upsertSameSource: true, routeFile: "reportSystem.ts" },
  { method: "POST", path: "/monthly-summary-reports", kind: "monthly_report", sourceTable: "monthly_summary_reports",
    upsertSameSource: true, routeFile: "reportSystem.ts" },

  // 기안서 — 임시저장과 상신은 같은 source 의 state 만 다르게 갱신.
  //   임시저장 신규 생성은 POST /approvals/draft, 같은 행 갱신은 PUT /approvals/draft/:id.
  { method: "POST", path: "/approvals/draft", kind: "draft", sourceTable: "approvals", upsertSameSource: true,
    routeFile: "approvalSteps.ts",
    note: "[#611] autosave 도 같은 통로 — upsert 정책으로 단일 행 유지" },
  { method: "PUT", path: "/approvals/draft/:id", kind: "draft", sourceTable: "approvals", upsertSameSource: true,
    routeFile: "approvalSteps.ts",
    note: "임시저장 갱신(autosave) — 같은 source_id 의 documents 행 EXCLUDED 갱신" },
  { method: "POST", path: "/approvals/draft/:id/submit", kind: "approval", sourceTable: "approvals", upsertSameSource: true,
    routeFile: "approvalSteps.ts",
    note: "draft → 상신 transition. documents.kind 가 draft → approval 로 갱신" },
  { method: "POST", path: "/approvals", kind: "approval", sourceTable: "approvals", upsertSameSource: true,
    routeFile: "approvals.ts" },

  // 알림 처리 모달 산출물(공고문/보고서/기안서/RFQ 진입) 일괄.
  { method: "POST", path: "/alert-actions", kind: "alert_action_output", sourceTable: "alert_actions", upsertSameSource: false,
    routeFile: "alertActions.ts",
    note: "처리방식별 산출물(공고문/보고서/기안서/RFQ)이 같은 트랜잭션에서 모두 등록" },

  // 견적 채택 → 묶음 기안서 자동 생성.
  { method: "PATCH", path: "/quotes/:id", kind: "quote_bundle", sourceTable: "approvals", upsertSameSource: false,
    routeFile: "quotes.ts",
    note: "[#612] status=accepted commit 시 채택+미채택 견적을 묶은 업체선정 기안서 1건 자동 등록" },

  // 공고문 export 신규 엔드포인트.
  { method: "POST", path: "/notice-outputs", kind: "notice_output", sourceTable: "notice_outputs", upsertSameSource: true,
    routeFile: "noticeOutputs.ts",
    note: "같은 (template, building, date) 묶음은 formats 배열에 누적" },

  // 외부 업로드.
  { method: "POST", path: "/external-documents", kind: "external", sourceTable: "external_documents", upsertSameSource: false,
    routeFile: "externalDocuments.ts" },

  // RFQ.
  { method: "POST", path: "/rfqs", kind: "rfq", sourceTable: "rfqs", upsertSameSource: false,
    routeFile: "rfqs.ts" },

  // 견적(파트너 제출).
  { method: "POST", path: "/quotes", kind: "quote", sourceTable: "quotes", upsertSameSource: true,
    routeFile: "quotes.ts",
    note: "견적은 (rfq_id, vendor_id) 유니크 — 동일 source 갱신은 같은 행" },

  // 계약 수동 생성/갱신.
  { method: "POST", path: "/contracts", kind: "contract", sourceTable: "contracts", upsertSameSource: false,
    routeFile: "contracts.ts" },

  // 본사 공지(전사 범위 documents). 실제 마운트 경로는 /platform/announcements.
  { method: "POST", path: "/platform/announcements", kind: "announcement", sourceTable: "platform_announcements", upsertSameSource: false,
    routeFile: "platformAnnouncements.ts" },
];

/**
 * source_table 기준으로 등록된 라우트가 카탈로그에 존재하는지 확인.
 * 4층 회귀 테스트는 이 카탈로그를 reflection 으로 검증한다.
 */
export function isCatalogedSource(sourceTable: string): boolean {
  return DOCUMENT_PRODUCING_ROUTES.some((r) => r.sourceTable === sourceTable);
}
