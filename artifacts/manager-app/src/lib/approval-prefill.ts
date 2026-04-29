// "기안서로 만들기" 표준 진입점. 모든 문서 카드/상세에서 동일한 헬퍼로
// 페이로드를 만들어 /approval-create?prefill=1&... 로 이동한다.

import type { DocumentKind } from "@workspace/api-client-react";

export interface ApprovalPrefillSource {
  /** documents 레지스트리 행. RecentDocumentsWidget 등에서 그대로 넘긴다. */
  id?: number;
  kind?: DocumentKind | string | null;
  sourceTable?: string | null;
  sourceId?: number | null;
  title?: string | null;
  subtitle?: string | null;
  authorId?: number | null;
  buildingId?: number | null;
  href?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface ApprovalPrefillPayload {
  /** approval-create 가 읽는 표준 쿼리스트링 키들. */
  prefill: "1";
  source_kind?: string;
  source_table?: string;
  source_id?: string;
  source_doc_id?: string;
  title?: string;
  category?: string;
  building_id?: string;
}

const KIND_TO_CATEGORY: Record<string, string> = {
  journal: "other",
  weekly_report: "other",
  monthly_report: "other",
  notice_output: "other",
  alert_action_output: "maintenance",
  external: "other",
  rfq: "facility",
  quote_bundle: "facility",
  quote: "facility",
};

/** 페이로드를 URLSearchParams 로 변환. 호출측이 캐스트 없이 사용한다. */
export function buildApprovalPrefillSearch(doc: ApprovalPrefillSource): URLSearchParams {
  const payload = buildApprovalPrefillPayload(doc);
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(payload)) {
    if (typeof v === "string") params.set(k, v);
  }
  return params;
}

export function buildApprovalPrefillPayload(doc: ApprovalPrefillSource): ApprovalPrefillPayload {
  const out: ApprovalPrefillPayload = { prefill: "1" };
  if (doc.kind) out.source_kind = String(doc.kind);
  if (doc.sourceTable) out.source_table = doc.sourceTable;
  if (doc.sourceId != null) out.source_id = String(doc.sourceId);
  if (doc.id != null) out.source_doc_id = String(doc.id);
  if (doc.title) out.title = doc.title;
  if (doc.kind && KIND_TO_CATEGORY[String(doc.kind)]) {
    out.category = KIND_TO_CATEGORY[String(doc.kind)];
  }
  const meta = doc.metadata as { category?: unknown } | null | undefined;
  if (meta && typeof meta.category === "string") out.category = meta.category;
  if (doc.buildingId != null) out.building_id = String(doc.buildingId);
  return out;
}

/** /approval-create 진입 URL 을 만든다. wouter setLocation 에 그대로 넘기면 된다. */
export function buildApprovalPrefillUrl(doc: ApprovalPrefillSource): string {
  const params = new URLSearchParams();
  const payload = buildApprovalPrefillPayload(doc);
  for (const [k, v] of Object.entries(payload)) {
    if (v != null) params.set(k, String(v));
  }
  return `/approval-create?${params.toString()}`;
}
