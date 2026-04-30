// "기안서로 만들기" 표준 진입점. 모든 문서 카드/상세에서 동일한 헬퍼로
// 페이로드를 만들어 /approvals/create?prefill=1&... 로 이동한다.

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
  // [Task #682] RFQ 카드 등에서 직접 채워 넣는 부가 정보.
  //   - vendorName: 결재 본문의 "업체명" 칸을 미리 채운다.
  //   - estimatedAmount: "예상 금액" 칸 prefill (원 단위 정수).
  //   - description: 본문 첫 문단(자동 안내 위에 추가).
  //   - sourceEntityType / sourceEntityId: approvals 테이블에 보존되는 출처 키.
  //     `rfq` / `quote` / `voucher` / `payment` 등.
  vendorName?: string | null;
  estimatedAmount?: number | null;
  description?: string | null;
  sourceEntityType?: string | null;
  sourceEntityId?: number | null;
  // [Task #682 review-fix #2] 원본 RFQ 와 첨부 사진을 결재 화면에서 함께 보여주기 위한 prefill.
  //   - sourceUrl: 원본 RFQ 등으로 돌아가는 절대/상대 경로. 결재 작성 화면 상단에 노출.
  //   - photos: RFQ 의 근경/원경 사진 등. 결재 작성 화면에 썸네일로 미리 보여 준다.
  sourceUrl?: string | null;
  photos?: Array<string | null | undefined> | null;
}

export interface ApprovalPrefillPayload {
  /** /approvals/create 페이지가 읽는 표준 쿼리스트링 키들. */
  prefill: "1";
  source_kind?: string;
  source_table?: string;
  source_id?: string;
  source_doc_id?: string;
  title?: string;
  category?: string;
  building_id?: string;
  // [Task #682] 신규 키 — RFQ → 기안 사슬 보존 + UI prefill.
  vendor_name?: string;
  amount?: string;
  description?: string;
  source_entity_type?: string;
  source_entity_id?: string;
  // [Task #682 review-fix #2] 결재 화면 상단의 "원본" 패널을 위한 키.
  source_url?: string;
  source_photos?: string;
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
  // [Task #682] 추가 prefill 키.
  if (doc.vendorName) out.vendor_name = doc.vendorName;
  if (doc.estimatedAmount != null && Number.isFinite(doc.estimatedAmount)) {
    out.amount = String(Math.round(doc.estimatedAmount));
  }
  if (doc.description) out.description = doc.description;
  if (doc.sourceEntityType) out.source_entity_type = doc.sourceEntityType;
  if (doc.sourceEntityId != null) out.source_entity_id = String(doc.sourceEntityId);
  if (doc.sourceUrl) out.source_url = doc.sourceUrl;
  if (doc.photos && Array.isArray(doc.photos)) {
    const cleaned = doc.photos
      .filter((u): u is string => typeof u === "string" && u.length > 0);
    if (cleaned.length > 0) {
      // 다수 URL 을 한 키에 안전하게 담기 위해 JSON 으로 직렬화.
      out.source_photos = JSON.stringify(cleaned);
    }
  }
  return out;
}

/** /approvals/create 진입 URL 을 만든다. wouter setLocation 에 그대로 넘기면 된다. */
export function buildApprovalPrefillUrl(doc: ApprovalPrefillSource): string {
  const params = new URLSearchParams();
  const payload = buildApprovalPrefillPayload(doc);
  for (const [k, v] of Object.entries(payload)) {
    if (v != null) params.set(k, String(v));
  }
  return `/approvals/create?${params.toString()}`;
}
