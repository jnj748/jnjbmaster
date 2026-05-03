// [Task #774] 후속 엔진 어댑터.
//   OCR 결과(StandardExtraction) → 각 도메인이 자동 채울 수 있는 형태로 변환.
//   라우트/프론트가 이 어댑터를 호출해 키보드 입력 없이 다음 화면으로 이어붙인다.

import type { StandardExtraction, DocumentIngestionKind } from "@workspace/db";

/**
 * 지출결의 자동 채움 — 영수증/세금계산서/계약서로부터.
 */
export function adaptToExpenseVoucher(ext: StandardExtraction): {
  vendor: string | null;
  amount: number | null;
  spentAt: string | null;
  description: string | null;
  categoryCandidates: string[];
} {
  return {
    vendor: ext.vendor,
    amount: ext.amount,
    spentAt: ext.date,
    description: ext.items.map((i) => i.name).filter(Boolean).join(", ") || (ext.rawText.slice(0, 80) || null),
    categoryCandidates: ext.categoryCandidates,
  };
}

/**
 * 부과엔진 자동 채움 — 청구서로부터.
 *   (T7 부과엔진이 monthlyBillSummaries.lineItems 형태로 받게 한다.)
 */
export function adaptToFeeBilling(ext: StandardExtraction): {
  billingMonth: string | null;
  totalAmount: number | null;
  lineItems: Record<string, number>;
  dueDate: string | null;
} {
  const ks = ext.kindSpecific as { billingMonth?: string; lineItems?: Record<string, number> };
  const lineItems = (ks.lineItems && typeof ks.lineItems === "object") ? ks.lineItems : {};
  return {
    billingMonth: ks.billingMonth ?? null,
    totalAmount: ext.amount,
    lineItems,
    dueDate: ext.date,
  };
}

/**
 * 수납엔진 자동 채움 — 통장내역으로부터.
 *   items 1행 = 거래 1건. 가상계좌/호실 매칭은 후속 엔진(T6 수납)이 담당.
 */
export function adaptToCollection(ext: StandardExtraction): Array<{
  date: string | null;
  vendor: string | null;
  amount: number | null;
}> {
  return ext.items.map((it) => ({
    date: ext.date,
    vendor: it.name,
    amount: it.amount,
  }));
}

/**
 * 회계엔진 자동 채움 — 거래처/금액/일자/계정과목 후보.
 *   T8 AI 추천이 categoryCandidates 와 vendor 를 받아 분개를 제안한다.
 */
export function adaptToJournalEntry(ext: StandardExtraction): {
  vendor: string | null;
  amount: number | null;
  date: string | null;
  accountCandidates: string[];
  memo: string | null;
} {
  return {
    vendor: ext.vendor,
    amount: ext.amount,
    date: ext.date,
    accountCandidates: ext.categoryCandidates,
    memo: ext.items.map((i) => i.name).filter(Boolean).join(", ") || null,
  };
}

/**
 * 계약/거래처 등록 자동 채움 — 사업자등록증·계약서로부터.
 */
export function adaptToVendorRegistration(ext: StandardExtraction): {
  vendorName: string | null;
  businessRegNumber: string | null;
  representativeName: string | null;
  address: string | null;
} {
  const ks = ext.kindSpecific as {
    businessRegNumber?: string | null;
    representativeName?: string | null;
    address?: string | null;
  };
  return {
    vendorName: ext.vendor,
    businessRegNumber: ks.businessRegNumber ?? null,
    representativeName: ks.representativeName ?? null,
    address: ks.address ?? null,
  };
}

export type AdapterTarget = "expense" | "billing" | "collection" | "journal" | "vendor";

/** 종류 → 적용 가능한 어댑터 목록(첫 항목이 기본).
 *  계약서는 거래처 등록과 지출결의(또는 분리부과) 양쪽 모두에 자동 채움이
 *  필요하므로 multi-target 으로 둔다. 세금계산서도 회계 분개 후보를 만들 수
 *  있으니 expense + journal 양쪽으로 노출한다. */
export const ADAPTERS_BY_KIND: Record<DocumentIngestionKind, AdapterTarget[]> = {
  receipt: ["expense", "journal"],
  tax_invoice: ["expense", "journal"],
  contract: ["expense", "vendor"],
  business_reg: ["vendor"],
  bill: ["billing", "journal"],
  bank_statement: ["collection", "journal"],
  resolution: ["journal"],
  memo: [],
  meter_photo: [],
  unknown: [],
};

/** 호환용 별칭 — 단일 기본 타깃만 필요할 때. */
export const ADAPTER_BY_KIND: Record<DocumentIngestionKind, AdapterTarget | "none"> = Object.fromEntries(
  Object.entries(ADAPTERS_BY_KIND).map(([k, v]) => [k, v[0] ?? "none"])
) as Record<DocumentIngestionKind, AdapterTarget | "none">;
