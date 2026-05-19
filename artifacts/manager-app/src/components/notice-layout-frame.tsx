// [Task #504] 공고문 공통 레이아웃 컴포넌트.
//   - 공지문 템플릿 미리보기와 알림 처리완료 모달의 "공고문" 탭이 동일한
//     양식(상단 머리글 + 메타표 + 제목 박스 + 본문 슬롯 + 푸터) 으로
//     렌더링되도록 한 곳에서 관리한다.
//   - 본문 영역은 children 으로 받아 호출자(템플릿 HTML / 처리완료 본문) 가
//     자유롭게 채울 수 있게 한다.
// [Task #608]
//   - 메타표 연락처 행과 푸터 토큰 치환에 건물 주소(addressFull) 토큰을 추가했다.
//   - photos prop 을 받아 사진이 1장 이상이면 본문 마지막에 2열 그리드로,
//     푸터(직인생략 줄) 위치에도 같은 사진을 함께 노출한다. 사진이 한 장도
//     없으면 빈 자리표시 박스를 일절 렌더하지 않는다.
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
  /** [Task #608] 메타표 연락처 행 기본값 — 건물 관리사무소 주소(addressFull). */
  addressFull?: string | null;
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
  /**
   * [Task #608] 첨부 사진 (data URL 또는 외부 URL). null/빈 값은 무시.
   *   - 1장 이상이면 children 다음에 2열 그리드로 렌더되고 푸터 영역에도 함께 표시.
   *   - 0장이면 빈 자리표시 박스를 일절 렌더하지 않는다 (자연 축소).
   */
  photos?: Array<string | null | undefined>;
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
    addressFull,
    logoUrl,
    sealUrl,
    noticeNo,
    noticeDate,
    postingPeriod,
    contact,
    title,
    children,
    photos,
  } = props;

  const tokens: Record<string, string | null | undefined> = {
    buildingName,
    addressFull,
    managementOfficePhone,
    feeInquiryPhone,
    facilitySafetyPhone,
  };
  const resolvedPostingPeriod = postingPeriod ?? settings.defaultPostingPeriod;
  const resolvedContact = contact ?? fillNoticeTemplate(settings.contactTemplate, tokens);
  const resolvedFooter = fillNoticeTemplate(settings.footerTemplate, tokens);
  const buildingNameClass = buildingNameSizeClass(buildingName);

  // [Task #608] 사진 정규화 — null/빈 문자열은 제거. 한 장도 없으면 어떤
  //   사진 영역도 렌더하지 않는다.
  const validPhotos = (photos ?? []).filter(
    (p): p is string => typeof p === "string" && p.trim() !== "",
  );

  // 메타표는 가시 행을 기준으로 column span 을 적응한다. 가장 단순한 방식은
  // 토글에 따라 cell 을 조건부 렌더하고, 연락처 행의 colSpan 을 동적으로 계산.
  // [Task #530] 공고NO(예: 2026-0428-0001) / 공고일(예: 2026-04-28) 처럼 짧은 값도
  //   좁은 칸 폭에서 두 줄로 잘리지 않도록 칸 폭을 살짝 넓히고, 라벨/값 모두
  //   whiteSpace:nowrap 을 적용한다(아래 td 렌더 참고).
  const topRowCells: Array<{ label: string; value: string; widthClass?: string }> = [];
  if (settings.showNoticeNoRow) {
    topRowCells.push({ label: "공고NO", value: noticeNo, widthClass: "w-[24%]" });
  }
  if (settings.showBuildingRow) {
    topRowCells.push({ label: "건물명", value: buildingName });
  }
  if (settings.showDateRow) {
    topRowCells.push({ label: "공고일", value: noticeDate, widthClass: "w-[18%]" });
  }
  // 연락처 행이 단독으로만 켜져 있는 경우(상단 행이 0개) 단순 1x2 표 로 표시.
  const showAnyMetaRow =
    topRowCells.length > 0 || settings.showContactRow;

  // [공지 양식 개편 D] 공통 공고문 레이아웃 통일.
  //   - 외곽: 1.5px solid #222 (한 장의 공고지 느낌)
  //   - 헤더(공고번호/게시기간): 하단 1px border, 배경 없음
  //   - 제목: 중앙 정렬, 굵게, 18px, 배경/색상 구분 없음
  //   - 본문: 좌우 패딩 18px, 줄간격 1.8
  //   - 푸터(서명): 우측 정렬, "날짜 + 건물명 관리사무소장" (resolvedFooter 그대로 사용)
  //   로고/직인/사진/메타표 행 토글 등 기존 기능은 그대로 보존하되 시각 톤만 통일한다.
  return (
    <div
      className="bg-white"
      style={{ border: "1.5px solid #222", padding: "16px" }}
      data-testid="notice-layout-frame"
    >
      <div
        className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 pb-3"
        style={{ borderBottom: "1px solid #222" }}
      >
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
          className="text-2xl font-bold tracking-[0.3em] text-center"
          style={{ whiteSpace: "nowrap", color: "#222" }}
          data-testid="notice-document-title"
        >
          {settings.documentTitle}
        </h1>
        <div className="flex items-center justify-end">
          <div className="text-xs" style={{ border: "1px solid #222" }}>
            <div
              className="px-3 py-1 text-center font-medium"
              style={{ borderBottom: "1px solid #222" }}
            >
              게시기간
            </div>
            <div className="px-3 py-1 text-center" data-testid="notice-posting-period">
              {resolvedPostingPeriod}
            </div>
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
                    className="font-semibold text-center py-1.5 px-2 w-[14%]"
                    style={{ whiteSpace: "nowrap", border: "1px solid #222" }}
                  >
                    {c.label}
                  </td>,
                  <td
                    key={`v-${i}`}
                    className={cn("py-1.5 px-2", c.widthClass)}
                    style={{ whiteSpace: "nowrap", border: "1px solid #222" }}
                  >
                    {c.value}
                  </td>,
                ])}
              </tr>
            )}
            {settings.showContactRow && (
              <tr>
                <td
                  className="font-semibold text-center py-1.5 px-2 w-[12%]"
                  style={{ border: "1px solid #222" }}
                >
                  연락처
                </td>
                <td
                  className="py-1.5 px-2"
                  colSpan={topRowCells.length > 0 ? topRowCells.length * 2 - 1 : 1}
                  data-testid="notice-contact"
                  style={{ border: "1px solid #222" }}
                >
                  {resolvedContact}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}

      {settings.showTitleBox && title ? (
        <div className="text-center my-6">
          <h2
            className="font-bold"
            style={{ fontSize: "18px", color: "#222" }}
            data-testid="notice-title-box"
          >
            {title}
          </h2>
        </div>
      ) : (
        <div className="my-4" />
      )}

      <div
        data-testid="notice-body-slot"
        style={{ padding: "0 18px", lineHeight: 1.8, fontSize: "15px" }}
      >
        {children}

        {/* [Task #608] 본문 마지막 사진 영역 — 1장 이상일 때만 2열 그리드로 노출.
              사진이 한 장도 없으면 자리표시 박스 자체를 렌더하지 않아 본문이
              자연 축소된다. */}
        {validPhotos.length > 0 && (
          <div
            className="mt-6 grid grid-cols-2 gap-3"
            data-testid="notice-body-photos"
            aria-label="첨부 사진"
          >
            {validPhotos.slice(0, 2).map((src, i) => (
              <div
                key={i}
                className="aspect-[4/3] bg-white border border-slate-200 overflow-hidden flex items-center justify-center"
                data-testid={`notice-body-photo-${i}`}
              >
                <img
                  src={src}
                  alt={`첨부 사진 ${i + 1}`}
                  className="max-w-full max-h-full object-contain"
                />
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="pt-12 mt-8 space-y-3">
        {/* [Task #608] 푸터(직인생략 줄) 위치에도 사진을 함께 노출.
              사진이 한 장도 없으면 기존 텍스트 줄만 그대로 보인다. */}
        {validPhotos.length > 0 && (
          <div
            className="mx-auto grid grid-cols-2 gap-3 max-w-md"
            data-testid="notice-footer-photos"
            aria-label="푸터 첨부 사진"
          >
            {validPhotos.slice(0, 2).map((src, i) => (
              <div
                key={i}
                className="aspect-[4/3] bg-white border border-slate-200 overflow-hidden flex items-center justify-center"
                data-testid={`notice-footer-photo-${i}`}
              >
                <img
                  src={src}
                  alt={`푸터 첨부 사진 ${i + 1}`}
                  className="max-w-full max-h-full object-contain"
                />
              </div>
            ))}
          </div>
        )}
        {/* [공지 양식 개편 D] 서명(직인) 줄 우측 정렬.
              날짜 + 건물명 관리사무소장(=resolvedFooter) 한 줄, 직인 이미지가 있으면 그 아래 함께 우측 정렬. */}
        <div className="text-right space-y-3">
          {sealUrl ? (
            <>
              <p className="text-xl font-bold tracking-wider" style={{ whiteSpace: "nowrap", color: "#222" }}>
                {resolvedFooter}
              </p>
              <div className="flex justify-end pt-2">
                <AuthImage src={sealUrl} alt="직인" className="h-20 w-20 object-contain" />
              </div>
            </>
          ) : (
            <p className="text-xl font-bold tracking-wider" style={{ whiteSpace: "nowrap", color: "#222" }}>
              {resolvedFooter} {settings.sealOmittedText}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
