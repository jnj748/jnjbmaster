// [Task #504] 공고문 레이아웃 시스템 기본값 조회 훅.
//   - 공지문 템플릿 미리보기 / 알림 처리완료 모달이 모두 동일한 키로 캐싱하여
//     본사 관리자가 값을 변경하면 다음 로딩에서 즉시 반영된다.
//   - 네트워크 오류 또는 진입 직후 미정의 기간에는 클라이언트 기본값을 사용한다.
import { useGetNoticeLayout } from "@workspace/api-client-react";
import { DEFAULT_NOTICE_LAYOUT, type NoticeLayoutSettings } from "@/lib/notice-layout";

export function useNoticeLayout(): { layout: NoticeLayoutSettings; isLoading: boolean } {
  const { data, isLoading } = useGetNoticeLayout({
    query: {
      // [Task #504 코드리뷰] 본사 관리자가 값을 바꾼 직후에도 다음 미리보기/모달
      // 진입 시 즉시 반영되도록 stale 즉시 처리하고, 마운트마다 재조회한다.
      // 자주 호출되는 데이터가 아니므로 비용이 거의 없다.
      staleTime: 0,
      refetchOnMount: "always",
      // 미인증 진입(공개 페이지) 등에서는 호출하지 않는다 — 호출자 컴포넌트 자체가
      // 인증 후에만 마운트되므로 별도 enabled 가드는 필요 없다.
    },
  });
  return {
    layout: (data ?? DEFAULT_NOTICE_LAYOUT) as NoticeLayoutSettings,
    isLoading,
  };
}
