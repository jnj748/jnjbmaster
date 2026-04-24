export function todayKst(): string {
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60_000;
  const kst = new Date(utcMs + 9 * 3600 * 1000);
  return kst.toISOString().slice(0, 10);
}

export function formatKstDate(ymd: string): string {
  const [y, m, d] = ymd.split("-");
  return `${y}년 ${Number(m)}월 ${Number(d)}일`;
}

export function formatTime(ts: number | string): string {
  const dt = typeof ts === "number" ? new Date(ts) : new Date(ts);
  if (Number.isNaN(dt.getTime())) return "";
  const hh = String(dt.getHours()).padStart(2, "0");
  const mm = String(dt.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

export function formatKstFull(ts: number | string): string {
  const dt = typeof ts === "number" ? new Date(ts) : new Date(ts);
  if (Number.isNaN(dt.getTime())) return "";
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(
    dt.getDate(),
  ).padStart(2, "0")} ${String(dt.getHours()).padStart(2, "0")}:${String(
    dt.getMinutes(),
  ).padStart(2, "0")}`;
}

export const CATEGORY_LABEL: Record<string, string> = {
  facility: "시설",
  complaint: "민원",
  general: "일반",
};

export const SECTION_LABEL = {
  security: "보안",
  cleaning: "미화",
  facility: "시설",
  complaint: "민원",
} as const;

export type SectionKey = keyof typeof SECTION_LABEL;

export const SPECIAL_STATUS = "특이사항" as const;

export const STATUS_OPTIONS: Record<SectionKey, { value: string; label: string }[]> = {
  security: [
    { value: "정상순찰", label: "정상순찰" },
    { value: "이상발견", label: "이상발견" },
    { value: "외부인방문", label: "외부인방문" },
    { value: SPECIAL_STATUS, label: SPECIAL_STATUS },
    { value: "기타", label: "기타" },
  ],
  cleaning: [
    { value: "전체청소완료", label: "전체청소완료" },
    { value: "부분청소", label: "부분청소" },
    { value: "분리수거", label: "분리수거" },
    { value: SPECIAL_STATUS, label: SPECIAL_STATUS },
    { value: "기타", label: "기타" },
  ],
  facility: [
    { value: "정상가동", label: "정상가동" },
    { value: "점검완료", label: "점검완료" },
    { value: "수리필요", label: "수리필요" },
    { value: SPECIAL_STATUS, label: SPECIAL_STATUS },
    { value: "기타", label: "기타" },
  ],
  complaint: [
    { value: "민원없음", label: "민원없음" },
    { value: "접수처리", label: "접수처리" },
    { value: "조치중", label: "조치중" },
    { value: SPECIAL_STATUS, label: SPECIAL_STATUS },
    { value: "기타", label: "기타" },
  ],
};

export function isSpecial(status: string | null | undefined): boolean {
  return (status ?? "").trim() === SPECIAL_STATUS;
}
