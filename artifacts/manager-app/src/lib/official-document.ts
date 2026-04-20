export type OfficialDocumentKind = "draft" | "notice" | "report";

export const OFFICIAL_DOC_KIND_LABELS: Record<OfficialDocumentKind, string> = {
  draft: "기안서",
  notice: "공고문",
  report: "보고서",
};

export interface OfficialDocSummaryItem {
  label: string;
  value: string;
}

export interface OfficialDocListItem {
  label: string;
  value?: string;
  meta?: string;
  status?: "good" | "caution" | "bad" | "info";
}

export interface OfficialDocumentInput {
  source: string;
  sourceLabel: string;
  title: string;
  date: string;
  authorName?: string;
  buildingName?: string;
  summary?: OfficialDocSummaryItem[];
  items?: OfficialDocListItem[];
  notes?: string;
  photos?: string[];
}

const STORAGE_KEY = "manager-app:official-document-input";

export function storeOfficialDocumentInput(input: OfficialDocumentInput): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(input));
  } catch {
    // ignore storage failures
  }
}

export function readOfficialDocumentInput(): OfficialDocumentInput | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as OfficialDocumentInput;
  } catch {
    return null;
  }
}

export function clearOfficialDocumentInput(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function formatKoreanDate(d: string | Date): string {
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return typeof d === "string" ? d : "";
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일`;
}

export async function shareDocument(opts: {
  title: string;
  text: string;
  url?: string;
}): Promise<"shared" | "copied" | "failed"> {
  const nav = typeof navigator !== "undefined" ? navigator : null;
  const url = opts.url ?? (typeof window !== "undefined" ? window.location.href : undefined);
  if (nav && typeof (nav as Navigator & { share?: (data: ShareData) => Promise<void> }).share === "function") {
    try {
      await (nav as Navigator & { share: (data: ShareData) => Promise<void> }).share({
        title: opts.title,
        text: opts.text,
        ...(url ? { url } : {}),
      });
      return "shared";
    } catch {
      // user cancelled or share failed; fall through to clipboard
    }
  }
  if (nav?.clipboard) {
    try {
      const payload = url
        ? `${opts.title}\n\n${opts.text}\n\n${url}`
        : `${opts.title}\n\n${opts.text}`;
      await nav.clipboard.writeText(payload);
      return "copied";
    } catch {
      return "failed";
    }
  }
  return "failed";
}
