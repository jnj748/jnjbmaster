export const RFQ_SERVICE_TYPES = [
  "not_working",
  "replacement",
  "inspection",
  "installation",
  "other",
] as const;

export type RfqServiceType = (typeof RFQ_SERVICE_TYPES)[number];

export const RFQ_SERVICE_TYPE_LABELS: Record<RfqServiceType, string> = {
  not_working: "작동 안 함",
  replacement: "교체",
  inspection: "정기점검",
  installation: "신규 설치",
  other: "기타",
};

/** DB·레거시 payload에 남아 있을 수 있는 breakdown/defect → 통합 라벨. */
const LEGACY_SERVICE_TYPE_LABELS: Record<string, string> = {
  breakdown: "작동 안 함",
  defect: "작동 안 함",
};

export function rfqServiceTypeLabel(value: string | null | undefined): string {
  if (!value) return "";
  if (value in LEGACY_SERVICE_TYPE_LABELS) return LEGACY_SERVICE_TYPE_LABELS[value]!;
  return (RFQ_SERVICE_TYPE_LABELS as Record<string, string>)[value] ?? value;
}

export const RFQ_CATEGORY_LABELS: Record<string, string> = {
  elevator: "승강기",
  water_tank: "저수조",
  fire_safety: "소방",
  electrical: "전기",
  gas: "가스",
  septic: "정화조",
  cleaning: "청소",
  security: "보안",
  waterproofing: "방수",
  facility_maintenance: "영선/수선유지",
  // 레거시 폴백: 과거 RFQ 데이터의 maintenance_repair → facility_maintenance 와 동일 라벨.
  maintenance_repair: "영선/수선유지",
  defect_diagnosis: "하자진단",
  building_maintenance: "건물관리",
  mechanical: "기계설비",
  landscaping: "조경",
  hvac: "냉난방",
  water_leak: "누수",
  other: "기타",
};

// [Task #312] 런타임 오버라이드 레지스트리.
//   클라이언트 부트스트랩 시 GET /categories/labels 응답을 setRfqCategoryLabelOverrides()
//   로 주입하면, 모든 화면(헬퍼를 사용하는 한)이 즉시 DB 의 한글 표시명을 보게 된다.
//   서버 측에서는 호출되지 않으므로(RFQ_CATEGORY_LABELS 폴백) 안전하다.
let RFQ_CATEGORY_LABEL_OVERRIDES: Record<string, string> = {};

export function setRfqCategoryLabelOverrides(map: Record<string, string> | null | undefined): void {
  RFQ_CATEGORY_LABEL_OVERRIDES = { ...(map ?? {}) };
}

export function getRfqCategoryLabelOverrides(): Record<string, string> {
  return { ...RFQ_CATEGORY_LABEL_OVERRIDES };
}

export function rfqCategoryLabel(value: string | null | undefined): string {
  if (!value) return "";
  // 우선순위: DB 오버라이드 > 하드코딩 시드 > 코드 자체.
  return RFQ_CATEGORY_LABEL_OVERRIDES[value] ?? RFQ_CATEGORY_LABELS[value] ?? value;
}

export function buildRfqAutoTitle(
  category: string | null | undefined,
  serviceType: string | null | undefined,
): string {
  const cat = rfqCategoryLabel(category);
  const svc = rfqServiceTypeLabel(serviceType);
  if (cat && svc) return `${cat} - ${svc} 견적 요청`;
  if (cat) return `${cat} 견적 요청`;
  if (svc) return `${svc} 견적 요청`;
  return "견적 요청";
}
