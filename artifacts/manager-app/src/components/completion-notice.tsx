import { useRef, useState } from "react";
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
import {
  downloadElementAsPng,
  elementToDocxBlob,
  safeFilename,
  sharePdfFromElement,
} from "@/lib/document-export";
import { cn } from "@/lib/utils";

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

function buildingNameSizeClass(name: string): string {
  const len = name.length;
  if (len <= 8) return "text-xl";
  if (len <= 12) return "text-lg";
  if (len <= 16) return "text-base";
  if (len <= 22) return "text-sm";
  return "text-xs";
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
  officeContact?: string;
  logoUrl?: string | null;
  sealUrl?: string | null;
  authorName?: string | null;
  initialDocKind?: DocKind;
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
  buildingName = "OO아파트",
  officeContact = "관리사무소 ☎ 02-0000-0000",
  logoUrl = null,
  sealUrl = null,
  authorName = null,
  initialDocKind = "notice",
}: CompletionNoticeProps) {
  const { toast } = useToast();
  const documentRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<A4DocumentFrameHandle>(null);
  const [docKind, setDocKind] = useState<DocKind>(initialDocKind);
  const [editMode, setEditMode] = useState(false);
  const [noticeNo] = useState(getNoticeNumber());
  const [postingPeriod, setPostingPeriod] = useState("상시게재");
  const cleanAlertTitle = stripDday(alertTitle);
  const cleanAlertMessage = stripDday(alertMessage);
  const [title, setTitle] = useState(`${cleanAlertTitle} 처리 완료 안내`);
  const [body, setBody] = useState(
    `안녕하십니까, 입주민 여러분.\n\n금번 「${cleanAlertTitle}」 업무가 아래와 같이 완료되었음을 안내드립니다.\n${cleanAlertMessage}\n\n안전하고 쾌적한 주거환경 조성을 위해 최선을 다하겠습니다.\n주민 여러분의 양해와 협조에 깊이 감사드립니다.`
  );
  const [contact, setContact] = useState(officeContact);
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
    void withReadyDocument(() => {
      window.print();
    });
  }

  function buildPlainText(): string {
    const kindLabel = DOC_KIND_LABELS[docKind];
    return (
      `[${kindLabel}] ${title}\n\n` +
      `건물명: ${buildingName}\n` +
      `일자: ${getTodayShort()}\n` +
      (authorName ? `작성자: ${authorName}\n` : "") +
      `\n${body}\n\n` +
      `■ 처리 항목: ${alertTitle}\n` +
      `■ 완료 일자: ${formatNoticeDate(completedDate)}\n` +
      (notesText ? `■ 비고: ${notesText}\n` : "") +
      `\n${getTodayFormatted()}\n${buildingName} 관리사무소`
    );
  }

  async function handleShare() {
    if (!documentRef.current) return;
    setSharing(true);
    try {
      await withReadyDocument(async () => {
        if (!documentRef.current) return;
        const filename = safeFilename(
          `${buildingName}_${DOC_KIND_LABELS[docKind]}_${title}_${authorName ?? ""}_${getTodayShort()}`,
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
              `${buildingName}_${DOC_KIND_LABELS[docKind]}_${title}_${authorName ?? ""}_${getTodayShort()}`,
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
            `${buildingName}_${DOC_KIND_LABELS[docKind]}_${title}_${authorName ?? ""}_${getTodayShort()}`,
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

  const buildingNameClass = buildingNameSizeClass(buildingName);

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
                  <Input value={postingPeriod} onChange={(e) => setPostingPeriod(e.target.value)} />
                </div>
                <div>
                  <Label>관리사무소 연락처</Label>
                  <Input value={contact} onChange={(e) => setContact(e.target.value)} />
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
              <NoticeBody
                buildingName={buildingName}
                buildingNameClass={buildingNameClass}
                logoUrl={logoUrl}
                sealUrl={sealUrl}
                noticeNo={noticeNo}
                postingPeriod={postingPeriod}
                contact={contact}
                title={title}
                body={body}
                alertTitle={alertTitle}
                completedDate={completedDate}
                notesText={notesText}
                closeUpPhotoUrl={closeUpPhotoUrl}
                widePhotoUrl={widePhotoUrl}
              />
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
              className="w-full"
            >
              <Share2 className="w-4 h-4 mr-2" />
              {sharing ? "공유 중..." : "외부 공유"}
            </Button>
            <Button
              variant="outline"
              onClick={handleDownloadImage}
              disabled={exporting}
              data-testid="btn-save-image"
              className="w-full"
            >
              <Download className="w-4 h-4 mr-2" />
              {exporting ? "저장 중..." : "이미지 저장"}
            </Button>
            <Button
              variant="outline"
              onClick={handleDownloadDoc}
              disabled={exportingDoc}
              data-testid="btn-save-doc"
              className="w-full"
            >
              <FileText className="w-4 h-4 mr-2" />
              {exportingDoc ? "저장 중..." : "문서로 저장"}
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

function NoticeBody(props: {
  buildingName: string;
  buildingNameClass: string;
  logoUrl: string | null;
  sealUrl: string | null;
  noticeNo: string;
  postingPeriod: string;
  contact: string;
  title: string;
  body: string;
  alertTitle: string;
  completedDate: string;
  notesText: string;
  closeUpPhotoUrl?: string | null;
  widePhotoUrl?: string | null;
}) {
  const {
    buildingName,
    buildingNameClass,
    logoUrl,
    sealUrl,
    noticeNo,
    postingPeriod,
    contact,
    title,
    body,
    alertTitle,
    completedDate,
    notesText,
    closeUpPhotoUrl,
    widePhotoUrl,
  } = props;
  return (
    <>
      <div className="flex justify-end mb-3">
        <div className="border border-black text-xs">
          <div className="px-3 py-1 border-b border-black text-center font-medium">게시기간</div>
          <div className="px-3 py-1 text-center">{postingPeriod}</div>
        </div>
      </div>

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
        <h1 className="text-3xl font-bold tracking-[0.4em] text-center" style={{ whiteSpace: "nowrap" }}>
          공 고 문
        </h1>
        <div />
      </div>

      <table className="w-full text-xs border-collapse mt-3">
        <tbody>
          <tr>
            <td className="border border-gray-400 bg-gray-100 font-semibold text-center py-1.5 px-2 w-[15%]">공고NO</td>
            <td className="border border-gray-400 py-1.5 px-2 w-[20%]">{noticeNo}</td>
            <td className="border border-gray-400 bg-gray-100 font-semibold text-center py-1.5 px-2 w-[12%]">건물명</td>
            <td className="border border-gray-400 py-1.5 px-2" style={{ whiteSpace: "nowrap" }}>
              {buildingName}
            </td>
            <td className="border border-gray-400 bg-gray-100 font-semibold text-center py-1.5 px-2 w-[12%]">공고일</td>
            <td className="border border-gray-400 py-1.5 px-2 w-[14%]">{getTodayShort()}</td>
          </tr>
          <tr>
            <td className="border border-gray-400 bg-gray-100 font-semibold text-center py-1.5 px-2">연락처</td>
            <td className="border border-gray-400 py-1.5 px-2" colSpan={5}>
              {contact}
            </td>
          </tr>
        </tbody>
      </table>

      <div className="text-center my-8">
        <h2 className="text-xl font-bold border-b-2 border-black inline-block px-8 pb-2">{title}</h2>
      </div>

      <div className="text-[15px] leading-8 px-2">
        <p className="whitespace-pre-line">{body}</p>
      </div>

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
          <p className="whitespace-pre-line">{notesText}</p>
        </div>
      )}

      <PhotosBlock closeUpPhotoUrl={closeUpPhotoUrl} widePhotoUrl={widePhotoUrl} />

      <div className="text-center pt-12 mt-8 space-y-3">
        <p className="text-xl font-bold tracking-wider" style={{ whiteSpace: "nowrap" }}>
          {buildingName} 관리사무소
        </p>
        <div className="flex justify-center pt-2">
          {sealUrl ? (
            <AuthImage src={sealUrl} alt="직인" className="h-20 w-20 object-contain" />
          ) : (
            <div className="text-xs text-gray-500 border border-dashed border-gray-400 rounded-full w-20 h-20 flex items-center justify-center">
              (직인생략)
            </div>
          )}
        </div>
      </div>
    </>
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
          <tr>
            <td className="border border-gray-400 bg-gray-100 font-semibold p-2">대상</td>
            <td className="border border-gray-400 p-2" colSpan={3}>
              {buildingName}
            </td>
          </tr>
          <tr>
            <td className="border border-gray-400 bg-gray-100 font-semibold p-2">처리 항목</td>
            <td className="border border-gray-400 p-2">{alertTitle}</td>
            <td className="border border-gray-400 bg-gray-100 font-semibold p-2">완료 일자</td>
            <td className="border border-gray-400 p-2">{formatShortDate(completedDate)}</td>
          </tr>
        </tbody>
      </table>

      <p className="font-semibold mt-4 mb-2 text-[15px] border-l-4 border-gray-700 pl-2">1. 보고 내용</p>
      <div className="text-[15px] leading-7 whitespace-pre-line">{body}</div>

      {notesText && (
        <>
          <p className="font-semibold mt-4 mb-2 text-[15px] border-l-4 border-gray-700 pl-2">2. 특이사항 / 조치 의견</p>
          <div className="text-sm border border-gray-300 rounded p-3 whitespace-pre-line leading-6">{notesText}</div>
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
        <div className="flex col-span-2">
          <span className="font-semibold w-20">대상</span>
          <span>{buildingName}</span>
        </div>
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
      <div className="text-[15px] leading-7 whitespace-pre-line">{body}</div>

      {notesText && (
        <>
          <p className="font-semibold mt-4 mb-2 text-[15px] border-l-4 border-gray-700 pl-2">3. 특이사항</p>
          <div className="text-sm border border-gray-300 rounded p-3 whitespace-pre-line leading-6">{notesText}</div>
        </>
      )}

      <PhotosBlock closeUpPhotoUrl={closeUpPhotoUrl} widePhotoUrl={widePhotoUrl} />
    </div>
  );
}
