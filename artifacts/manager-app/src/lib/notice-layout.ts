// [Task #504] 공고문 레이아웃 시스템 기본값 공통 헬퍼.
//   - 공지문 템플릿 미리보기와 알림 처리완료 모달의 "공고문" 탭이
//     동일한 양식으로 렌더링되도록 한 곳에 모은다.
import type { NoticeLayoutSettings } from "@workspace/api-client-react";

export type { NoticeLayoutSettings };

// 서버가 기본값을 책임지지만 네트워크 오류/초기 진입에서도 미리보기가
// 깨지지 않도록 클라이언트에도 동일한 기본값을 둔다.
export const DEFAULT_NOTICE_LAYOUT: NoticeLayoutSettings = {
  documentTitle: "공 고 문",
  defaultPostingPeriod: "상시게재",
  // [Task #608] 메타표 연락처 칸은 건물의 관리사무소 주소(addressFull) 를 기본값으로 한다.
  contactTemplate: "{{addressFull}}",
  footerTemplate: "{{buildingName}} 관리사무소",
  sealOmittedText: "직인생략",
  showNoticeNoRow: true,
  showBuildingRow: true,
  showDateRow: true,
  showContactRow: true,
  showTitleBox: true,
};

// `{{token}}` 치환. vars 에 키가 없거나 빈 문자열이면 토큰을 빈 문자열로 치환한다.
export function fillNoticeTemplate(template: string, vars: Record<string, string | null | undefined>): string {
  return template.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_m, key) => {
    const v = vars[String(key)];
    return v != null ? String(v) : "";
  });
}

// [Task #530] 템플릿 본문 HTML 안의 `{{token}}` 을 안전하게 치환.
//   - 매니저 미리보기와 본사 관리자 편집 모달이 같은 결과를 보여주도록 한 곳에 둔다.
//   - HTML 본문 안에 들어가므로 값은 항상 escape 한다.
const NOTICE_BODY_TOKEN_RE = /{{\s*([a-zA-Z0-9_]+)\s*}}/g;

export function escapeNoticeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderNoticeBodyHtml(html: string, vars: Record<string, string>): string {
  return html.replace(NOTICE_BODY_TOKEN_RE, (_m, key) => {
    const v = vars[String(key)];
    return v != null && v !== "" ? escapeNoticeHtml(v) : "";
  });
}

// [Task #591] 위지윅 편집기에서 사용하는 공지문 변수(토큰) 단일 소스.
//   - 본사 관리자 / 관리소장 편집기가 동일한 변수 칩을 노출하도록 한 곳에서 정의한다.
//   - customA/B/C 의 라벨은 호출자(관리자가 정한 "사용자 입력칸 라벨")가 동적으로
//     주입하므로 여기서는 기본 라벨만 둔다.
//   - HQ 화면에서 칩 표시 / 매니저 화면에서 값 치환 모두 같은 토큰 키를 사용한다.
export interface NoticeTokenDef {
  /** `{{token}}` 의 token 값. */
  token: string;
  /** 변수 삽입 메뉴와 미치환 모드 칩에 노출되는 기본 라벨. */
  defaultLabel: string;
  /** 사용자 정의 라벨로 덮어쓸 수 있는 토큰인가. */
  isCustom?: boolean;
}

export const NOTICE_TOKEN_DEFS: ReadonlyArray<NoticeTokenDef> = [
  { token: "buildingName", defaultLabel: "건물명" },
  { token: "addressFull", defaultLabel: "주소" },
  { token: "managementOfficePhone", defaultLabel: "관리사무소 전화" },
  { token: "feeInquiryPhone", defaultLabel: "관리비 문의 전화" },
  { token: "facilitySafetyPhone", defaultLabel: "시설 방재실 전화" },
  { token: "date", defaultLabel: "날짜" },
  { token: "customA", defaultLabel: "사용자 입력 1", isCustom: true },
  { token: "customB", defaultLabel: "사용자 입력 2", isCustom: true },
  { token: "customC", defaultLabel: "사용자 입력 3", isCustom: true },
];

/** 관리자가 정의한 customA/B/C 라벨을 합쳐 토큰별 라벨 맵을 만든다. */
export function buildNoticeTokenLabels(customLabels: { a?: string; b?: string; c?: string } = {}): Record<string, string> {
  const labels: Record<string, string> = {};
  for (const def of NOTICE_TOKEN_DEFS) {
    labels[def.token] = def.defaultLabel;
  }
  if (customLabels.a && customLabels.a.trim()) labels.customA = customLabels.a.trim();
  if (customLabels.b && customLabels.b.trim()) labels.customB = customLabels.b.trim();
  if (customLabels.c && customLabels.c.trim()) labels.customC = customLabels.c.trim();
  return labels;
}

const KNOWN_TOKEN_SET = new Set(NOTICE_TOKEN_DEFS.map((d) => d.token));

/**
 * 저장 포맷(`{{token}}` 텍스트가 그대로 들어있는 HTML)을 편집기 입력용 HTML 로 변환.
 *   - `{{token}}` 텍스트를 `<span data-notice-token="token">{{token}}</span>` 칩으로 감싼다.
 *   - 기존에 이미 `<span data-notice-token>` 형태로 저장된 데이터도 그대로 통과한다.
 *   - 알 수 없는 토큰은 변환하지 않고 텍스트로 둔다(향후 토큰 추가/제거에 대한 안전장치).
 */
export function templateHtmlToEditorHtml(html: string): string {
  if (!html) return "";
  return html.replace(NOTICE_BODY_TOKEN_RE, (match, key) => {
    const token = String(key);
    if (!KNOWN_TOKEN_SET.has(token)) return match;
    return `<span data-notice-token="${token}">{{${token}}}</span>`;
  });
}

/**
 * 편집기 출력 HTML 을 저장 포맷으로 되돌린다.
 *   - 칩 노드는 `<span data-notice-token="token">…</span>` 으로 직렬화되므로
 *     이를 다시 `{{token}}` 평문으로 환원해 기존 저장 포맷과 동일하게 유지한다.
 *   - 칩 안의 텍스트는 무시하고 token 속성만 신뢰한다(편집기 토큰 모드 / 치환 모드
 *     무관 모두 동일한 결과).
 */
const EDITOR_CHIP_RE = /<span\b[^>]*\bdata-notice-token="([a-zA-Z0-9_]+)"[^>]*>[\s\S]*?<\/span>/g;

export function editorHtmlToTemplateHtml(html: string): string {
  if (!html) return "";
  return html.replace(EDITOR_CHIP_RE, (_m, token) => `{{${String(token)}}}`);
}
