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
  contactTemplate: "관리사무소 {{managementOfficePhone}}",
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
