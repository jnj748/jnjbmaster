export const categoryOptions = [
  { value: "elevator", label: "승강기" },
  { value: "water_tank", label: "저수조" },
  { value: "fire_safety", label: "소방" },
  { value: "electrical", label: "전기" },
  { value: "gas", label: "가스" },
  { value: "septic", label: "정화조" },
  { value: "playground", label: "놀이터" },
  { value: "safety_check", label: "안전점검" },
  { value: "hygiene", label: "위생/환경" },
  { value: "building_safety", label: "건축물안전" },
  { value: "administrative", label: "행정" },
  { value: "other", label: "기타" },
];

export const INSPECTION_TYPE_LABELS: Record<string, string> = {
  legal: "법정",
  self_regular: "자체정기",
  biweekly: "격주",
  seasonal: "계절별",
  administrative: "행정",
};

export const INSPECTION_TYPE_COLORS: Record<string, string> = {
  legal: "text-red-600 bg-red-50 border-red-200",
  self_regular: "text-blue-600 bg-blue-50 border-blue-200",
  biweekly: "text-purple-600 bg-purple-50 border-purple-200",
  seasonal: "text-orange-600 bg-orange-50 border-orange-200",
  administrative: "text-gray-600 bg-gray-50 border-gray-200",
};

export const CATEGORY_GROUP_ORDER = [
  "fire_safety",
  "electrical",
  "elevator",
  "water_tank",
  "septic",
  "hygiene",
  "building_safety",
  "safety_check",
  "playground",
  "gas",
  "administrative",
];

export const statusOptions = [
  { value: "upcoming", label: "예정" },
  { value: "scheduled", label: "일정 확정" },
  { value: "completed", label: "완료" },
  { value: "overdue", label: "기한 초과" },
];

export const resultOptions = [
  { value: "good", label: "양호" },
  { value: "fair", label: "보통" },
  { value: "poor", label: "불량" },
];

export function calculateNextDueDate(lastDate: string, cycleMonths: number): string {
  const d = new Date(lastDate);
  d.setMonth(d.getMonth() + cycleMonths);
  return d.toISOString().split("T")[0];
}
