import { useMemo, useRef, useState } from "react";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@/components/ui/responsive-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Printer, Download, Share2, FileText } from "lucide-react";
import { AuthImage } from "@/components/auth-image";
import { useToast } from "@/hooks/use-toast";
import { A4DocumentFrame, type A4DocumentFrameHandle } from "@/components/a4-document-frame";
import { NoticeLayoutFrame } from "@/components/notice-layout-frame";
import { useNoticeLayout } from "@/hooks/use-notice-layout";
import { fillNoticeTemplate } from "@/lib/notice-layout";
import { printIsolatedNode } from "@/lib/print-isolate";
import {
  downloadElementAsPng,
  elementToDocxBlob,
  safeFilename,
  sharePdfFromElement,
} from "@/lib/document-export";

type DocKind = "notice" | "report" | "draft";
const DOC_KIND_LABELS: Record<DocKind, string> = {
  notice: "공고문",
  report: "보고서",
  draft: "기안서",
};

function formatNoticeDate(d: string | null | undefined): string {
  if (!d) return "";
  const dateStr = d.includes("T") ? d.split("T")[0] : d;
  const [y, m, day] = dateStr.split("-");
  return `${y}년 ${parseInt(m)}월 ${parseInt(day)}일`;
}

function formatShortDate(d: string | null | undefined): string {
  if (!d) return "";
  const dateStr = d.includes("T") ? d.split("T")[0] : d;
  const [y, m, day] = dateStr.split("-");
  return `${y}-${m}-${day}`;
}

function getTodayFormatted(): string {
  const now = new Date();
  return `${now.getFullYear()}년 ${now.getMonth() + 1}월 ${now.getDate()}일`;
}

function getTodayShort(): string {
  const now = new Date();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${m}-${d}`;
}

function getNoticeNumber(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const seq = String(now.getHours()).padStart(2, "0") + String(now.getMinutes()).padStart(2, "0");
  return `${y}-${m}${d}-${seq}`;
}

function stripDday(s: string): string {
  if (!s) return s;
  return s
    .replace(/\s*\[\s*D\s*[-+]?\s*\w+\s*\]\s*/gi, " ")
    .replace(/\s*\[\s*D-?Day\s*\]\s*/gi, " ")
    .replace(/\s*\[\s*기한[^\]]*\]\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

interface CompletionNoticeProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  alertTitle: string;
  alertMessage: string;
  completedDate: string;
  notes?: string | null;
  closeUpPhotoUrl?: string | null;
  widePhotoUrl?: string | null;
  buildingName?: string;
  /**
   * @deprecated [Task #504] 시스템 공고문 레이아웃(`/platform/notice-templates`)의
   * `contactTemplate` 가 단일 진실 공급원이다. 이 prop 은 호환성을 위해 남아 있지만,
   * 호출자는 대신 `managementOfficePhone`/`feeInquiryPhone`/`facilitySafetyPhone` 만
   * 넘겨 시스템 템플릿 토큰이 치환되도록 해야 한다. 본 컴포넌트는 이 값을 더
   * 이상 연락처 출처로 사용하지 않는다.
   */
  officeContact?: string;
  /** [Task #504] 시스템 레이아웃의 연락처 템플릿 토큰 치환에 사용. */
  managementOfficePhone?: string | null;
  feeInquiryPhone?: string | null;
  facilitySafetyPhone?: string | null;
  logoUrl?: string | null;
  sealUrl?: string | null;
  authorName?: string | null;
  initialDocKind?: DocKind;
  // [Task #389] 공지문 템플릿 본문(plaintext) 으로 기본 양식 본문을 덮어쓴다.
  //   notice/report/draft 키별로 부분 지정 가능. 키가 비면 기본 본문을 그대로 사용.
  initialBodies?: Partial<Record<DocKind, string>>;
}

export function CompletionNotice({
  open,
  onOpenChange,
  alertTitle,
  alertMessage,
  completedDate,
  notes,
  closeUpPhotoUrl,
  widePhotoUrl,
  // [Task #545] 호출자가 buildingName 을 넘기지 않거나 BuildingContext 가
  //   아직 로딩 중이어서 undefined 가 들어올 수 있다. 임시 자리표시자
  //   "OO아파트" 를 박아두면 인쇄/저장에 그대로 출력돼 사용자 자산에 박히므로,
  //   기본값을 빈 문자열로 둔다. 미리보기/인쇄/공유에서 건물명이 비면 해당
  //   "대상" 행은 빈칸 또는 숨김으로 처리한다.
  buildingName: rawBuildingName,
  // [Task #504] officeContact 는 deprecated — 더 이상 읽지 않는다(인터페이스만 유지).
  managementOfficePhone = null,
  feeInquiryPhone = null,
  facilitySafetyPhone = null,
  logoUrl = null,
  sealUrl = null,
  authorName = null,
  initialDocKind = "notice",
  initialBodies,
}: CompletionNoticeProps) {
  // [Task #545] 빈/공백만 있는 건물명을 일관되게 "비어 있음" 으로 정규화.
  const buildingName = (rawBuildingName ?? "").trim();
  const hasBuildingName = buildingName.length > 0;
  const { toast } = useToast();
  const { layout: noticeLayout } = useNoticeLayout();
  const documentRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<A4DocumentFrameHandle>(null);
  const [docKind, setDocKind] = useState<DocKind>(initialDocKind);
  const [editMode, setEditMode] = useState(false);
  const [noticeNo] = useState(getNoticeNumber());
  // [Task #504] postingPeriod / contact 는 시스템 레이아웃 기본값을 우선 사용하고,
  //   사용자가 모달에서 수정할 때만 override 값을 들고 있는다(시스템 설정에는 영향 X).
  const [postingPeriodOverride, setPostingPeriodOverride] = useState<string | null>(null);
  const cleanAlertTitle = stripDday(alertTitle);
  const cleanAlertMessage = stripDday(alertMessage);
  const [title, setTitle] = useState(`${cleanAlertTitle} 처리 완료 안내`);
  const defaultBodies = useMemo<Record<DocKind, string>>(
    () => {
      // [Task #545] 건물명이 비면 "OO아파트" 같은 자리표시자 대신 행/접두를
      //   생략하고, 호출자가 채워야 할 자리는 자연스러운 한글 표현으로 대체.
      const noticePrefix = hasBuildingName
        ? `안녕하십니까 입주민 여러분 ${buildingName} 관리사무소 입니다.\n`
        : `안녕하십니까 입주민 여러분 관리사무소 입니다.\n`;
      const reportPrefix = hasBuildingName ? `${buildingName} ` : "";
      return {
        notice:
          initialBodies?.notice ??
          (noticePrefix +
            `금번 ${cleanAlertTitle}에 대하여 아래와 같이 완료되었음을 공지드립니다.\n` +
            `${cleanAlertMessage}\n\n` +
            `앞으로도 관리사무소에서는 안전하고 쾌적한 건물이 되도록 항상 최선을 다하겠습니다. 감사합니다.`),
        report:
          initialBodies?.report ??
          (`${reportPrefix}${cleanAlertTitle}에 대하여 아래와 같이 보고드립니다.\n` +
            `${cleanAlertMessage}`),
        draft:
          initialBodies?.draft ??
          (`처리 항목: ${cleanAlertTitle}\n` +
            `완료 일자: ${formatNoticeDate(completedDate)}\n` +
            `업무 결과: ${cleanAlertMessage}`),
      };
    },
    [buildingName, hasBuildingName, cleanAlertTitle, cleanAlertMessage, completedDate, initialBodies],
  );
  const [editedBodies, setEditedBodies] = useState<Partial<Record<DocKind, string>>>({});
  const body = editedBodies[docKind] ?? defaultBodies[docKind];
  const setBody = (value: string) =>
    setEditedBodies((prev) => ({ ...prev, [docKind]: value }));
  // [Task #504] contactOverride: 사용자가 모달에서 직접 수정한 값.
  //   초기값(null) 일 때는 NoticeLayoutFrame 이 시스템 레이아웃의 contactTemplate
  //   를 토큰(managementOfficePhone 등) 으로 치환해 자동 사용한다. 레거시
  //   `officeContact` prop 은 더 이상 출처로 사용하지 않는다 — 모든 호출자가
  //   `managementOfficePhone` 등을 직접 넘기도록 일원화했다(Task #504 코드리뷰).
  const [contactOverride, setContactOverride] = useState<string | null>(null);
  const [notesText, setNotesText] = useState(notes || "");
  const [exporting, setExporting] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [exportingDoc, setExportingDoc] = useState(false);

  async function withReadyDocument<T>(fn: () => Promise<T> | T): Promise<T> {
    setEditMode(false);
    await new Promise((r) => setTimeout(r, 120));
    if (frameRef.current) {
      return await frameRef.current.withFullScale(fn);
    }
    return await fn();
  }

  function handlePrint() {
    // [Task #554] withReadyDocument 가 편집 모드를 닫고 frame 의 transform 을
    //   풀어준 뒤, printIsolatedNode 가 .a4-document 노드를 `<body>` 직속
    //   격리 컨테이너로 deep-clone 해 인쇄한다. 모달/드로어 wrapper 의
    //   positioning 영향을 완전히 우회하므로 좌·우 정렬 + 다중 페이지 자연
    //   흐름이 동시에 보장된다(이전 #543~#545 의 position:fixed 회귀 해결).
    void withReadyDocument(() => {
      printIsolatedNode(documentRef.current);
    });
  }

  function buildPlainText(): string {
    const kindLabel = DOC_KIND_LABELS[docKind];
    // [Task #545] 건물명이 비면 자리표시자 대신 해당 행 자체를 생략한다.
    return (
      `[${kindLabel}] ${title}\n\n` +
      (hasBuildingName ? `건물명: ${buildingName}\n` : "") +
      `일자: ${getTodayShort()}\n` +
      (authorName ? `작성자: ${authorName}\n` : "") +
      `\n${body}\n\n` +
      `■ 처리 항목: ${alertTitle}\n` +
      `■ 완료 일자: ${formatNoticeDate(completedDate)}\n` +
      (notesText ? `■ 비고: ${notesText}\n` : "") +
      `\n${getTodayFormatted()}\n${hasBuildingName ? `${buildingName} 관리사무소` : "관리사무소"}`
    );
  }

  async function handleShare() {
    if (!documentRef.current) return;
    setSharing(true);
    try {
      await withReadyDocument(async () => {
        if (!documentRef.current) return;
        // [Task #545] 건물명이 비면 파일명 머리에 자리표시자 대신 "공문" 을 붙인다.
        const filename = safeFilename(
          `${hasBuildingName ? buildingName : "공문"}_${DOC_KIND_LABELS[docKind]}_${title}_${authorName ?? ""}_${getTodayShort()}`,
        );
        const result = await sharePdfFromElement(
          documentRef.current,
          filename,
          `[${DOC_KIND_LABELS[docKind]}] ${title}`,
        );
        if (result === "shared") {
          toast({
            title: "PDF 공유가 시작되었습니다",
            description: "카카오톡, 이메일 등 원하는 앱을 선택해주세요.",
          });
        } else if (result === "downloaded") {
          toast({
            title: "PDF가 저장되었습니다",
            description: "기기에 저장된 PDF를 원하는 앱으로 직접 첨부해주세요.",
          });
        } else {
          toast({ title: "PDF 공유에 실패했습니다", variant: "destructive" });
        }
      });
    } finally {
      setSharing(false);
    }
  }

  async function handleDownloadImage() {
    if (!documentRef.current) return;
    setExporting(true);
    try {
      await withReadyDocument(async () => {
        if (documentRef.current) {
          await downloadElementAsPng(
            documentRef.current,
            safeFilename(
              `${hasBuildingName ? buildingName : "공문"}_${DOC_KIND_LABELS[docKind]}_${title}_${authorName ?? ""}_${getTodayShort()}`,
            ),
          );
          toast({ title: "이미지 저장 완료", description: `${DOC_KIND_LABELS[docKind]}이(가) PNG로 저장되었습니다.` });
        }
      });
    } catch (e) {
      toast({ title: "이미지 저장 실패", description: String(e), variant: "destructive" });
    } finally {
      setExporting(false);
    }
  }

  async function handleDownloadDoc() {
    if (!documentRef.current) return;
    setExportingDoc(true);
    try {
      await withReadyDocument(async () => {
        if (!documentRef.current) return;
        const blob = await elementToDocxBlob(documentRef.current, title);
        const filename =
          safeFilename(
            `${hasBuildingName ? buildingName : "공문"}_${DOC_KIND_LABELS[docKind]}_${title}_${authorName ?? ""}_${getTodayShort()}`,
          ) + ".docx";
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast({
          title: "문서 저장 완료",
          description: "Word(.docx) 파일로 저장되었습니다. 워드/한글/구글문서에서 열어 수정할 수 있습니다.",
        });
      });
    } catch (e) {
      toast({ title: "문서 저장 실패", description: String(e), variant: "destructive" });
    } finally {
      setExportingDoc(false);
    }
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (o) setEditMode(false);
      }}
    >
      <ResponsiveDialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto print:max-w-none print:shadow-none print:border-none">
        <ResponsiveDialogHeader className="print:hidden">
          <ResponsiveDialogTitle>{DOC_KIND_LABELS[docKind]} 미리보기</ResponsiveDialogTitle>
        </ResponsiveDialogHeader>

        {/* 양식 선택 탭 */}
        <div className="grid grid-cols-3 gap-2 print:hidden" data-testid="doc-kind-selector">
          {(Object.keys(DOC_KIND_LABELS) as DocKind[]).map((k) => (
            <Button
              key={k}
              type="button"
              size="sm"
              variant={docKind === k ? "default" : "outline"}
              onClick={() => setDocKind(k)}
              data-testid={`doc-kind-${k}`}
              className="w-full"
            >
              {DOC_KIND_LABELS[k]}
            </Button>
          ))}
        </div>

        {editMode && (
          <div className="space-y-3 border-b pb-4 mb-2 print:hidden">
            <div>
              <Label>제목</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div>
              <Label>본문</Label>
              <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={6} />
            </div>
            {notesText && (
              <div>
                <Label>비고</Label>
                <Textarea value={notesText} onChange={(e) => setNotesText(e.target.value)} rows={2} />
              </div>
            )}
            {docKind === "notice" && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>게시기간</Label>
                  <Input
                    value={postingPeriodOverride ?? noticeLayout.defaultPostingPeriod}
                    onChange={(e) => setPostingPeriodOverride(e.target.value)}
                    data-testid="input-posting-period"
                  />
                </div>
                <div>
                  <Label>관리사무소 연락처</Label>
                  <Input
                    value={
                      contactOverride
                      // [Task #504 코드리뷰] 토큰 치환은 lib 의 fillNoticeTemplate 으로 일원화 —
                      // 본문 렌더링과 동일한 토큰 집합({{buildingName}} 등 포함)을 인식한다.
                      ?? fillNoticeTemplate(noticeLayout.contactTemplate, {
                        buildingName,
                        managementOfficePhone,
                        feeInquiryPhone,
                        facilitySafetyPhone,
                      })
                    }
                    onChange={(e) => setContactOverride(e.target.value)}
                    data-testid="input-contact"
                  />
                </div>
              </div>
            )}
          </div>
        )}

        <A4DocumentFrame ref={frameRef}>
          <div
            ref={documentRef}
            className="a4-document"
            style={{ fontFamily: "'Noto Sans KR', 'Malgun Gothic', sans-serif" }}
          >
            {docKind === "notice" && (
              <NoticeLayoutFrame
                // [Task #545] 건물명이 비어 있으면 메타표의 "건물명" 행을 숨겨,
                //   "OO아파트" 같은 자리표시자가 그 자리에 박히지 않게 한다.
                //   다른 토글(공고NO/공고일/연락처)은 시스템 설정 그대로 유지.
                settings={
                  hasBuildingName
                    ? noticeLayout
                    : { ...noticeLayout, showBuildingRow: false }
                }
                buildingName={buildingName}
                managementOfficePhone={managementOfficePhone}
                feeInquiryPhone={feeInquiryPhone}
                facilitySafetyPhone={facilitySafetyPhone}
                logoUrl={logoUrl}
                sealUrl={sealUrl}
                noticeNo={noticeNo}
                noticeDate={getTodayShort()}
                postingPeriod={postingPeriodOverride ?? undefined}
                contact={contactOverride ?? undefined}
                title={title}
              >
                <p
                  className="whitespace-pre-line text-justify"
                  style={{ textJustify: "inter-word" }}
                >
                  {body}
                </p>
                <div className="mt-6 rounded border border-gray-300 px-4 py-3 text-sm space-y-1.5 bg-gray-50">
                  <div className="flex">
                    <span className="font-semibold w-24 shrink-0">■ 처리 항목</span>
                    <span>{alertTitle}</span>
                  </div>
                  <div className="flex">
                    <span className="font-semibold w-24 shrink-0">■ 완료 일자</span>
                    <span>{formatNoticeDate(completedDate)}</span>
                  </div>
                </div>
                {notesText && (
                  <div className="mt-4 text-sm">
                    <p className="font-semibold mb-1">■ 비고</p>
                    <p
                      className="whitespace-pre-line text-justify"
                      style={{ textJustify: "inter-word" }}
                    >
                      {notesText}
                    </p>
                  </div>
                )}
                <PhotosBlock closeUpPhotoUrl={closeUpPhotoUrl} widePhotoUrl={widePhotoUrl} />
              </NoticeLayoutFrame>
            )}
            {docKind === "report" && (
              <ReportBody
                buildingName={buildingName}
                title={title}
                body={body}
                alertTitle={alertTitle}
                completedDate={completedDate}
                notesText={notesText}
                authorName={authorName}
                closeUpPhotoUrl={closeUpPhotoUrl}
                widePhotoUrl={widePhotoUrl}
              />
            )}
            {docKind === "draft" && (
              <DraftBody
                buildingName={buildingName}
                title={title}
                body={body}
                alertTitle={alertTitle}
                completedDate={completedDate}
                notesText={notesText}
                authorName={authorName}
                closeUpPhotoUrl={closeUpPhotoUrl}
                widePhotoUrl={widePhotoUrl}
              />
            )}
          </div>
        </A4DocumentFrame>

        <div className="a4-document-actions space-y-2 print:hidden">
          {(!editMode || true) && (
            <div className="flex justify-end gap-2">
              {!editMode && (
                <Button variant="ghost" size="sm" onClick={() => setEditMode(true)}>
                  수정
                </Button>
              )}
              <Button
                size="sm"
                onClick={handlePrint}
                data-testid="btn-print"
                className="hidden md:inline-flex"
              >
                <Printer className="w-4 h-4 mr-2" />
                인쇄
              </Button>
            </div>
          )}
          <div className="grid grid-cols-3 gap-2">
            <Button
              variant="outline"
              onClick={handleShare}
              disabled={sharing}
              data-testid="btn-share"
              className="h-auto w-full min-w-0 flex-col gap-1 px-1 py-2 text-[11px] leading-tight [&_svg]:size-4 sm:h-9 sm:flex-row sm:gap-2 sm:px-4 sm:py-2 sm:text-sm"
            >
              <Share2 />
              <span className="min-w-0 truncate">
                {sharing ? "공유 중..." : "외부 공유"}
              </span>
            </Button>
            <Button
              variant="outline"
              onClick={handleDownloadImage}
              disabled={exporting}
              data-testid="btn-save-image"
              className="h-auto w-full min-w-0 flex-col gap-1 px-1 py-2 text-[11px] leading-tight [&_svg]:size-4 sm:h-9 sm:flex-row sm:gap-2 sm:px-4 sm:py-2 sm:text-sm"
            >
              <Download />
              <span className="min-w-0 truncate">
                {exporting ? "저장 중..." : "이미지 저장"}
              </span>
            </Button>
            <Button
              variant="outline"
              onClick={handleDownloadDoc}
              disabled={exportingDoc}
              data-testid="btn-save-doc"
              className="h-auto w-full min-w-0 flex-col gap-1 px-1 py-2 text-[11px] leading-tight [&_svg]:size-4 sm:h-9 sm:flex-row sm:gap-2 sm:px-4 sm:py-2 sm:text-sm"
            >
              <FileText />
              <span className="min-w-0 truncate">
                {exportingDoc ? "저장 중..." : "문서로 저장"}
              </span>
            </Button>
          </div>
        </div>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}

function PhotosBlock({
  closeUpPhotoUrl,
  widePhotoUrl,
}: {
  closeUpPhotoUrl?: string | null;
  widePhotoUrl?: string | null;
}) {
  if (!closeUpPhotoUrl && !widePhotoUrl) return null;
  return (
    <div className="mt-4 text-sm">
      <p className="font-semibold mb-2">■ 현장 사진</p>
      <div className="grid grid-cols-2 gap-3">
        {closeUpPhotoUrl && (
          <div>
            <p className="text-xs text-gray-600 mb-1">근경</p>
            <AuthImage src={closeUpPhotoUrl} alt="근경" className="w-full border rounded" />
          </div>
        )}
        {widePhotoUrl && (
          <div>
            <p className="text-xs text-gray-600 mb-1">원경</p>
            <AuthImage src={widePhotoUrl} alt="원경" className="w-full border rounded" />
          </div>
        )}
      </div>
    </div>
  );
}


function ReportBody(props: {
  buildingName: string;
  title: string;
  body: string;
  alertTitle: string;
  completedDate: string;
  notesText: string;
  authorName: string | null;
  closeUpPhotoUrl?: string | null;
  widePhotoUrl?: string | null;
}) {
  const { buildingName, title, body, alertTitle, completedDate, notesText, authorName, closeUpPhotoUrl, widePhotoUrl } = props;
  return (
    <div className="space-y-3">
      <h2 className="text-2xl font-bold text-center border-b-2 border-black pb-3">업 무 보 고 서</h2>
      <table className="w-full text-sm border-collapse mt-2">
        <tbody>
          <tr>
            <td className="border border-gray-400 bg-gray-100 font-semibold w-24 p-2">제목</td>
            <td className="border border-gray-400 p-2" colSpan={3}>
              {title}
            </td>
          </tr>
          <tr>
            <td className="border border-gray-400 bg-gray-100 font-semibold p-2">보고일</td>
            <td className="border border-gray-400 p-2">{getTodayShort()}</td>
            <td className="border border-gray-400 bg-gray-100 font-semibold w-24 p-2">보고자</td>
            <td className="border border-gray-400 p-2">{authorName ?? ""}</td>
          </tr>
          {/* [Task #545] 건물명이 비어 있으면 자리표시자("OO아파트") 대신 행 자체를 숨긴다. */}
          {buildingName && (
            <tr>
              <td className="border border-gray-400 bg-gray-100 font-semibold p-2">대상</td>
              <td className="border border-gray-400 p-2" colSpan={3}>
                {buildingName}
              </td>
            </tr>
          )}
          <tr>
            <td className="border border-gray-400 bg-gray-100 font-semibold p-2">처리 항목</td>
            <td className="border border-gray-400 p-2">{alertTitle}</td>
            <td className="border border-gray-400 bg-gray-100 font-semibold p-2">완료 일자</td>
            <td className="border border-gray-400 p-2">{formatShortDate(completedDate)}</td>
          </tr>
        </tbody>
      </table>

      <p className="font-semibold mt-4 mb-2 text-[15px] border-l-4 border-gray-700 pl-2">1. 보고 내용</p>
      <div className="text-[15px] leading-7 whitespace-pre-line text-justify" style={{ textJustify: "inter-word" }}>{body}</div>

      {notesText && (
        <>
          <p className="font-semibold mt-4 mb-2 text-[15px] border-l-4 border-gray-700 pl-2">2. 특이사항 / 조치 의견</p>
          <div className="text-sm border border-gray-300 rounded p-3 whitespace-pre-line leading-6 text-justify" style={{ textJustify: "inter-word" }}>{notesText}</div>
        </>
      )}

      <PhotosBlock closeUpPhotoUrl={closeUpPhotoUrl} widePhotoUrl={widePhotoUrl} />
    </div>
  );
}

function DraftBody(props: {
  buildingName: string;
  title: string;
  body: string;
  alertTitle: string;
  completedDate: string;
  notesText: string;
  authorName: string | null;
  closeUpPhotoUrl?: string | null;
  widePhotoUrl?: string | null;
}) {
  const { buildingName, title, body, alertTitle, completedDate, notesText, authorName, closeUpPhotoUrl, widePhotoUrl } = props;
  return (
    <div className="space-y-3">
      <h2 className="text-2xl font-bold tracking-wide text-center border-b-2 border-black pb-3">기 안 서</h2>

      <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm pt-2">
        <div className="flex">
          <span className="font-semibold w-20">기안일</span>
          <span>{getTodayShort()}</span>
        </div>
        <div className="flex">
          <span className="font-semibold w-20">기안자</span>
          <span>{authorName ?? ""}</span>
        </div>
        {/* [Task #545] 건물명이 비어 있으면 자리표시자 대신 "대상" 행 자체를 숨긴다. */}
        {buildingName && (
          <div className="flex col-span-2">
            <span className="font-semibold w-20">대상</span>
            <span>{buildingName}</span>
          </div>
        )}
        <div className="flex col-span-2">
          <span className="font-semibold w-20">제목</span>
          <span className="font-semibold">{title}</span>
        </div>
      </div>

      <table className="w-full border border-gray-500 text-center text-xs mt-2">
        <thead>
          <tr>
            <th className="border border-gray-500 bg-gray-100 w-20 py-1">결재</th>
            <th className="border border-gray-500 py-1">담당</th>
            <th className="border border-gray-500 py-1">검토</th>
            <th className="border border-gray-500 py-1">승인</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="border border-gray-500 py-6 bg-gray-50">서명</td>
            <td className="border border-gray-500 py-6"></td>
            <td className="border border-gray-500 py-6"></td>
            <td className="border border-gray-500 py-6"></td>
          </tr>
        </tbody>
      </table>

      <p className="font-semibold mt-4 mb-2 text-[15px] border-l-4 border-gray-700 pl-2">1. 기안 사유</p>
      <p className="text-sm leading-7">
        아래와 같이 「{alertTitle}」 업무가 {formatNoticeDate(completedDate)} 자로 완료되었음을 보고드리며, 결재를 요청드립니다.
      </p>

      <p className="font-semibold mt-4 mb-2 text-[15px] border-l-4 border-gray-700 pl-2">2. 주요 내용</p>
      <div className="text-[15px] leading-7 whitespace-pre-line text-justify" style={{ textJustify: "inter-word" }}>{body}</div>

      {notesText && (
        <>
          <p className="font-semibold mt-4 mb-2 text-[15px] border-l-4 border-gray-700 pl-2">3. 특이사항</p>
          <div className="text-sm border border-gray-300 rounded p-3 whitespace-pre-line leading-6 text-justify" style={{ textJustify: "inter-word" }}>{notesText}</div>
        </>
      )}

      <PhotosBlock closeUpPhotoUrl={closeUpPhotoUrl} widePhotoUrl={widePhotoUrl} />
    </div>
  );
}
