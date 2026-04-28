// [Task #504] 공고문 공통 레이아웃 컴포넌트.
//   - 공지문 템플릿 미리보기와 알림 처리완료 모달의 "공고문" 탭이 동일한
//     양식(상단 머리글 + 메타표 + 제목 박스 + 본문 슬롯 + 푸터) 으로
//     렌더링되도록 한 곳에서 관리한다.
//   - 본문 영역은 children 으로 받아 호출자(템플릿 HTML / 처리완료 본문) 가
//     자유롭게 채울 수 있게 한다.
import type { ReactElement, ReactNode } from "react";
import { AuthImage } from "@/components/auth-image";
import { cn } from "@/lib/utils";
import {
  DEFAULT_NOTICE_LAYOUT,
  fillNoticeTemplate,
  type NoticeLayoutSettings,
} from "@/lib/notice-layout";

function buildingNameSizeClass(name: string): string {
  const len = name.length;
  if (len <= 8) return "text-xl";
  if (len <= 12) return "text-lg";
  if (len <= 16) return "text-base";
  if (len <= 22) return "text-sm";
  return "text-xs";
}

export interface NoticeLayoutFrameProps {
  /** 시스템 기본값. 호출자가 useNoticeLayout() 으로 받은 값을 그대로 넘긴다. */
  settings?: NoticeLayoutSettings;
  /** 건물명 — 머리글/푸터/메타표/연락처 토큰에 사용. */
  buildingName: string;
  /** 메타표 연락처 행 토큰 치환용. settings.contactTemplate 의 {{managementOfficePhone}} 등에 매핑. */
  managementOfficePhone?: string | null;
  feeInquiryPhone?: string | null;
  facilitySafetyPhone?: string | null;
  /** 인증 필요한 building logo / 직인 이미지 URL. 호출자가 미리 가져와 넣는다. */
  logoUrl?: string | null;
  sealUrl?: string | null;
  /** 공고NO. 호출자가 채번 규칙에 따라 만든 값을 그대로 표시한다. */
  noticeNo: string;
  /** 메타표 공고일 칸. ISO 또는 표시용 문자열. */
  noticeDate: string;
  /**
   * 우측 게시기간 박스 문구. 호출자가 설정 기본값과 사용자 수정값을 합쳐 넘긴다.
   * 미지정 시 settings.defaultPostingPeriod 가 자동 적용된다.
   */
  postingPeriod?: string;
  /**
   * 메타표 연락처 행에 노출할 최종 문구.
   * 미지정 시 settings.contactTemplate 을 토큰 치환해 사용한다.
   */
  contact?: string;
  /** 본문 위 큰 제목 박스의 텍스트. 미지정 또는 settings.showTitleBox=false 면 박스 미표시. */
  title?: string;
  /** 본문 영역 (텍스트 / HTML / 추가 박스 등). */
  children?: ReactNode;
}

/**
 * 공고문 공통 레이아웃 컨테이너.
 *
 * 호출자는 outer wrapper(글꼴/A4 prepare 등)는 직접 잡고, 이 컴포넌트는
 * 단순히 머리글~푸터까지의 "공고문 양식" 자체만 렌더한다.
 */
export function NoticeLayoutFrame(props: NoticeLayoutFrameProps): ReactElement {
  const {
    settings = DEFAULT_NOTICE_LAYOUT,
    buildingName,
    managementOfficePhone,
    feeInquiryPhone,
    facilitySafetyPhone,
    logoUrl,
    sealUrl,
    noticeNo,
    noticeDate,
    postingPeriod,
    contact,
    title,
    children,
  } = props;

  const tokens: Record<string, string | null | undefined> = {
    buildingName,
    managementOfficePhone,
    feeInquiryPhone,
    facilitySafetyPhone,
  };
  const resolvedPostingPeriod = postingPeriod ?? settings.defaultPostingPeriod;
  const resolvedContact = contact ?? fillNoticeTemplate(settings.contactTemplate, tokens);
  const resolvedFooter = fillNoticeTemplate(settings.footerTemplate, tokens);
  const buildingNameClass = buildingNameSizeClass(buildingName);

  // 메타표는 가시 행을 기준으로 column span 을 적응한다. 가장 단순한 방식은
  // 토글에 따라 cell 을 조건부 렌더하고, 연락처 행의 colSpan 을 동적으로 계산.
  const topRowCells: Array<{ label: string; value: string; widthClass?: string }> = [];
  if (settings.showNoticeNoRow) {
    topRowCells.push({ label: "공고NO", value: noticeNo, widthClass: "w-[20%]" });
  }
  if (settings.showBuildingRow) {
    topRowCells.push({ label: "건물명", value: buildingName });
  }
  if (settings.showDateRow) {
    topRowCells.push({ label: "공고일", value: noticeDate, widthClass: "w-[14%]" });
  }
  // 연락처 행이 단독으로만 켜져 있는 경우(상단 행이 0개) 단순 1x2 표 로 표시.
  const showAnyMetaRow =
    topRowCells.length > 0 || settings.showContactRow;

  return (
    <>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 border-b-2 border-black pb-4">
        <div className="flex items-center justify-start">
          {logoUrl ? (
            <AuthImage src={logoUrl} alt={`${buildingName} 로고`} className="max-h-16 w-auto object-contain" />
          ) : (
            <span className={cn(buildingNameClass, "font-bold tracking-tight")} style={{ whiteSpace: "nowrap" }}>
              {buildingName}
            </span>
          )}
        </div>
        <h1
          className="text-3xl font-bold tracking-[0.4em] text-center"
          style={{ whiteSpace: "nowrap" }}
          data-testid="notice-document-title"
        >
          {settings.documentTitle}
        </h1>
        <div className="flex items-center justify-end">
          <div className="border border-black text-xs">
            <div className="px-3 py-1 border-b border-black text-center font-medium">게시기간</div>
            <div className="px-3 py-1 text-center" data-testid="notice-posting-period">{resolvedPostingPeriod}</div>
          </div>
        </div>
      </div>

      {showAnyMetaRow && (
        <table className="w-full text-xs border-collapse mt-3" data-testid="notice-meta-table">
          <tbody>
            {topRowCells.length > 0 && (
              <tr>
                {topRowCells.flatMap((c, i) => [
                  <td
                    key={`l-${i}`}
                    className="border border-gray-400 bg-gray-100 font-semibold text-center py-1.5 px-2 w-[12%]"
                  >
                    {c.label}
                  </td>,
                  <td
                    key={`v-${i}`}
                    className={cn(
                      "border border-gray-400 py-1.5 px-2",
                      c.widthClass,
                    )}
                    style={c.label === "건물명" ? { whiteSpace: "nowrap" } : undefined}
                  >
                    {c.value}
                  </td>,
                ])}
              </tr>
            )}
            {settings.showContactRow && (
              <tr>
                <td className="border border-gray-400 bg-gray-100 font-semibold text-center py-1.5 px-2 w-[12%]">
                  연락처
                </td>
                <td
                  className="border border-gray-400 py-1.5 px-2"
                  colSpan={topRowCells.length > 0 ? topRowCells.length * 2 - 1 : 1}
                  data-testid="notice-contact"
                >
                  {resolvedContact}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}

      {settings.showTitleBox && title ? (
        <div className="text-center my-8">
          <h2
            className="text-xl font-bold border-b-2 border-black inline-block px-8 pb-2"
            data-testid="notice-title-box"
          >
            {title}
          </h2>
        </div>
      ) : (
        <div className="my-4" />
      )}

      <div className="text-[15px] leading-8 px-2" data-testid="notice-body-slot">
        {children}
      </div>

      <div className="text-center pt-12 mt-8 space-y-3">
        {sealUrl ? (
          <>
            <p className="text-xl font-bold tracking-wider" style={{ whiteSpace: "nowrap" }}>
              {resolvedFooter}
            </p>
            <div className="flex justify-center pt-2">
              <AuthImage src={sealUrl} alt="직인" className="h-20 w-20 object-contain" />
            </div>
          </>
        ) : (
          <p className="text-xl font-bold tracking-wider" style={{ whiteSpace: "nowrap" }}>
            {resolvedFooter} {settings.sealOmittedText}
          </p>
        )}
      </div>
    </>
  );
}
