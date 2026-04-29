// [Task #610] 문서 명명 규칙 단일 유틸 (SoT).
//   - 종류·역할·기간·건물명·작성자·카테고리를 받아 { title, fileName(safe) } 를 반환한다.
//   - 흩어진 명명 규칙(daily-tab.tsx, lib/document-export.ts, manager-notice-templates.tsx)
//     을 모두 이 모듈로 일괄 교체한다.
//   - 본 태스크는 구조까지만 — 본문 자동 생성은 후속 태스크.

export type DocumentNamingKind =
  | "journal"
  | "weekly_report"
  | "monthly_report"
  | "draft"
  | "approval"
  | "alert_action_output"
  | "quote_bundle"
  | "notice_output"
  | "external"
  | "rfq"
  | "quote"
  | "contract"
  | "announcement";

export interface DocumentNamingInput {
  kind: DocumentNamingKind;
  date?: Date | string | null;
  buildingName?: string | null;
  authorName?: string | null;
  category?: string | null;
  title?: string | null;
  // 알림 처리 산출물에서 사용: '공고문' | '보고서' | '기안서'
  alertOutputKind?: "공고문" | "보고서" | "기안서" | null;
  // 견적 확정 묶음에서 사용
  selectedVendorName?: string | null;
  // 외부 업로드 원본 파일명
  originalName?: string | null;
}

export interface DocumentNamingResult {
  title: string;
  fileName: string;
}

const PAD = (n: number) => n.toString().padStart(2, "0");

function toDate(input?: Date | string | null): Date {
  if (input instanceof Date) return input;
  if (typeof input === "string" && input) {
    const d = new Date(input);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date();
}
function ymd(d: Date) {
  return `${d.getFullYear()}-${PAD(d.getMonth() + 1)}-${PAD(d.getDate())}`;
}
function ym(d: Date) {
  return `${d.getFullYear()}-${PAD(d.getMonth() + 1)}`;
}
// ISO 8601 week
function isoWeek(d: Date): string {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${PAD(week)}`;
}

// 파일 시스템 안전 문자만 남긴다. 괄호/공백은 _ 로 통일.
//   - Windows 금지문자: \ / : * ? " < > |
//   - 주변 공백/점 제거.
export function safeFileName(s: string): string {
  return s
    .replace(/[\\/:*?"<>|]+/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[.\s]+|[.\s]+$/g, "")
    .slice(0, 200);
}

function joinParts(parts: Array<string | null | undefined>): string {
  return parts.filter((p): p is string => Boolean(p && p.length)).join("_");
}

export function buildDocumentName(input: DocumentNamingInput): DocumentNamingResult {
  const d = toDate(input.date);
  const building = input.buildingName?.trim() || "건물미지정";
  const author = input.authorName?.trim() || "";
  const cat = input.category?.trim() || "";

  let title: string;
  switch (input.kind) {
    case "journal":
      // 일일 = 일일업무보고서_{건물명}_{YYYY-MM-DD}_{작성자}
      title = joinParts(["일일업무보고서", building, ymd(d), author]);
      break;
    case "weekly_report":
      // 주간 = 주간업무보고서_{건물명}_{YYYY-Wxx}
      title = joinParts(["주간업무보고서", building, isoWeek(d)]);
      break;
    case "monthly_report":
      // 월간 = 월간업무보고서_{건물명}_{YYYY-MM}
      title = joinParts(["월간업무보고서", building, ym(d)]);
      break;
    case "draft":
    case "approval":
      // 기안 = 기안서_{카테고리}_{제목}_{YYYY-MM-DD}
      title = joinParts(["기안서", cat || null, input.title?.trim() || null, ymd(d)]);
      break;
    case "alert_action_output": {
      // 알림처리 산출물 = {공고문|보고서|기안서}_{알림제목}_{YYYY-MM-DD}_{건물명}
      const head = input.alertOutputKind || "기안서";
      title = joinParts([head, input.title?.trim() || null, ymd(d), building]);
      break;
    }
    case "quote_bundle":
      // 견적확정 산출물 = 업체선정기안서_{공고제목}_{YYYY-MM-DD}_{선정업체}
      title = joinParts([
        "업체선정기안서",
        input.title?.trim() || null,
        ymd(d),
        input.selectedVendorName?.trim() || null,
      ]);
      break;
    case "notice_output":
      // 공고문 = 공고문_{템플릿명}_{건물명}_{YYYY-MM-DD}
      title = joinParts(["공고문", input.title?.trim() || null, building, ymd(d)]);
      break;
    case "external":
      // 외부 = 외부문서_{원본명}_{YYYY-MM-DD}
      title = joinParts(["외부문서", input.originalName?.trim() || input.title?.trim() || null, ymd(d)]);
      break;
    case "rfq":
      // RFQ = 견적요청_{제목}_{건물명}_{YYYY-MM-DD}
      title = joinParts(["견적요청", input.title?.trim() || null, building, ymd(d)]);
      break;
    case "quote":
      // 견적 = 견적서_{제목}_{선정업체|작성자}_{YYYY-MM-DD}
      title = joinParts(["견적서", input.title?.trim() || null, input.selectedVendorName?.trim() || author || null, ymd(d)]);
      break;
    case "contract":
      // 계약 = 계약서_{제목}_{선정업체}_{YYYY-MM-DD}
      title = joinParts(["계약서", input.title?.trim() || null, input.selectedVendorName?.trim() || null, ymd(d)]);
      break;
    case "announcement":
      // 본사 공지 = 본사공지_{제목}_{YYYY-MM-DD}
      title = joinParts(["본사공지", input.title?.trim() || null, ymd(d)]);
      break;
    default: {
      const _exhaustive: never = input.kind;
      title = joinParts(["문서", input.title?.trim() || null, ymd(d)]);
      void _exhaustive;
    }
  }

  return { title, fileName: safeFileName(title) };
}
