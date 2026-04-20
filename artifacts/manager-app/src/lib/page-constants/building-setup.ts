export const CATEGORY_LABELS: Record<string, string> = {
  fire_safety: "소방",
  electrical: "전기",
  elevator: "승강기",
  water_tank: "저수조",
  septic: "정화조",
  hygiene: "위생/환경",
  building_safety: "건축물 안전",
  safety_check: "안전점검",
  gas: "가스",
  playground: "놀이터",
  mechanical: "기계설비",
  telecom: "정보통신",
  disinfection: "소독/방역",
  administrative: "행정",
  waterproofing: "방수",
  maintenance_repair: "영선/수선유지",
  defect_diagnosis: "하자진단",
  building_maintenance: "건물관리",
};

export const FIELD_LABELS: Record<string, string> = {
  electrical: "전기안전관리자",
  fire_safety: "소방안전관리자",
  gas: "가스안전관리자",
  mechanical: "기계설비유지관리자",
  telecom: "정보통신 유지관리자",
  elevator: "승강기 안전관리자",
  disinfection: "소독(방역)",
};

export const INSPECTION_TYPE_LABELS: Record<string, string> = {
  legal: "법정",
  self_regular: "자체정기",
  biweekly: "격주",
  seasonal: "계절별",
  administrative: "행정",
};

export const SMART_DATE_HINTS: Record<string, string> = {
  "저수조 청소": "통상 3~4월 또는 8~9월 실시",
  "소방 법정점검 (작동+정밀)": "준공월 전후 실시 권장",
  "전기안전 법정점검": "설치일 기준 3년 주기",
  "승강기 법정 안전검사": "등록 연도 기준 매년 실시",
  "정화조 청소": "연 1회, 봄 또는 가을 실시 권장",
  "수질 검사": "연 1회 실시",
  "어린이 놀이터 법정 안전검사": "설치일 기준 2년 주기",
  "가스 안전점검": "가스 공급 개시일 기준 연 1회",
  "기계설비 성능점검": "사용승인일 기준 연 1회",
  "건축물 정기안전점검 (3년)": "사용승인일 기준 3년 주기",
  "의무소독 (하절기)": "4~9월 2개월 1회 실시",
  "의무소독 (동절기)": "10~3월 3개월 1회 실시",
};

export function formatCycle(months: number): string {
  if (months === 1) return "매월";
  if (months === 3) return "분기 1회";
  if (months === 6) return "반기 1회";
  if (months === 12) return "연 1회";
  if (months === 24) return "2년 1회";
  if (months === 36) return "3년 1회";
  return `${months}개월`;
}
