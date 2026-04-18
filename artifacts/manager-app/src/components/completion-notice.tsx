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
import { Printer, Download, Mail } from "lucide-react";
import { AuthImage } from "@/components/auth-image";
import { useToast } from "@/hooks/use-toast";
import {
  downloadElementAsPng,
  openMailtoWithDocument,
  safeFilename,
} from "@/lib/document-export";

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
}: CompletionNoticeProps) {
  const { toast } = useToast();
  const documentRef = useRef<HTMLDivElement>(null);
  const [editMode, setEditMode] = useState(true);
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

  async function withReadyDocument<T>(fn: () => Promise<T> | T): Promise<T> {
    setEditMode(false);
    await new Promise((r) => setTimeout(r, 120));
    return await fn();
  }

  function handlePrint() {
    void withReadyDocument(() => {
      window.print();
    });
  }

  async function handleDownloadImage() {
    if (!documentRef.current) return;
    setExporting(true);
    try {
      await withReadyDocument(async () => {
        if (documentRef.current) {
          await downloadElementAsPng(
            documentRef.current,
            safeFilename(`${buildingName}_공고문_${title}_${getTodayShort()}`),
          );
          toast({ title: "이미지 저장 완료", description: "공고문이 PNG로 저장되었습니다." });
        }
      });
    } catch (e) {
      toast({ title: "이미지 저장 실패", description: String(e), variant: "destructive" });
    } finally {
      setExporting(false);
    }
  }

  function handleEmail() {
    const subject = `[${buildingName}] ${title}`;
    const plainBody =
      `[공 고 문]\n\n` +
      `공고NO: ${noticeNo}\n건물명: ${buildingName}\n공고일: ${getTodayShort()}\n게시기간: ${postingPeriod}\n연락처: ${contact}\n\n` +
      `■ 제목: ${title}\n\n${body}\n\n` +
      `■ 처리 항목: ${alertTitle}\n■ 완료 일자: ${formatNoticeDate(completedDate)}\n` +
      (notesText ? `■ 비고: ${notesText}\n` : "") +
      `\n${getTodayFormatted()}\n${buildingName} 관리사무소`;
    openMailtoWithDocument({ subject, body: plainBody });
  }

  const buildingNameClass = buildingNameSizeClass(buildingName);

  return (
    <ResponsiveDialog open={open} onOpenChange={(o) => { onOpenChange(o); if (o) setEditMode(true); }}>
      <ResponsiveDialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto print:max-w-none print:shadow-none print:border-none">
        <ResponsiveDialogHeader className="print:hidden">
          <ResponsiveDialogTitle>공고문 미리보기</ResponsiveDialogTitle>
        </ResponsiveDialogHeader>

        {editMode && (
          <div className="space-y-3 border-b pb-4 mb-4 print:hidden">
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
          </div>
        )}

        <div className="a4-document-frame">
        <div
          ref={documentRef}
          className="a4-document"
          style={{ fontFamily: "'Noto Sans KR', 'Malgun Gothic', sans-serif" }}
        >
          {/* 게시기간 박스 (우측 상단) */}
          <div className="flex justify-end mb-3">
            <div className="border border-black text-xs">
              <div className="px-3 py-1 border-b border-black text-center font-medium">게시기간</div>
              <div className="px-3 py-1 text-center">{postingPeriod}</div>
            </div>
          </div>

          {/* 헤더: 로고/건물명 좌측, 공고문 중앙 */}
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 border-b-2 border-black pb-4">
            <div className="flex items-center justify-start">
              {logoUrl ? (
                <AuthImage
                  src={logoUrl}
                  alt={`${buildingName} 로고`}
                  className="max-h-16 w-auto object-contain"
                />
              ) : (
                <span
                  className={`${buildingNameClass} font-bold tracking-tight`}
                  style={{ whiteSpace: "nowrap" }}
                >
                  {buildingName}
                </span>
              )}
            </div>
            <h1 className="text-3xl font-bold tracking-[0.4em] text-center" style={{ whiteSpace: "nowrap" }}>
              공 고 문
            </h1>
            <div />
          </div>

          {/* 정보 표: 공고NO | 건물명 | 날짜 | 연락처 */}
          <table className="w-full text-xs border-collapse mt-3">
            <tbody>
              <tr>
                <td className="border border-gray-400 bg-gray-100 font-semibold text-center py-1.5 px-2 w-[15%]">공고NO</td>
                <td className="border border-gray-400 py-1.5 px-2 w-[20%]">{noticeNo}</td>
                <td className="border border-gray-400 bg-gray-100 font-semibold text-center py-1.5 px-2 w-[12%]">건물명</td>
                <td className="border border-gray-400 py-1.5 px-2" style={{ whiteSpace: "nowrap" }}>{buildingName}</td>
                <td className="border border-gray-400 bg-gray-100 font-semibold text-center py-1.5 px-2 w-[12%]">공고일</td>
                <td className="border border-gray-400 py-1.5 px-2 w-[14%]">{getTodayShort()}</td>
              </tr>
              <tr>
                <td className="border border-gray-400 bg-gray-100 font-semibold text-center py-1.5 px-2">연락처</td>
                <td className="border border-gray-400 py-1.5 px-2" colSpan={5}>{contact}</td>
              </tr>
            </tbody>
          </table>

          {/* 제목 */}
          <div className="text-center my-8">
            <h2 className="text-xl font-bold border-b-2 border-black inline-block px-8 pb-2">{title}</h2>
          </div>

          {/* 본문 */}
          <div className="text-[15px] leading-8 px-2">
            <p className="whitespace-pre-line">{body}</p>
          </div>

          {/* 처리 정보 */}
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

          {(closeUpPhotoUrl || widePhotoUrl) && (
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
          )}

          {/* 푸터: 건물명 관리사무소 + 직인 */}
          <div className="text-center pt-12 mt-8 space-y-3">
            <p
              className="text-xl font-bold tracking-wider"
              style={{ whiteSpace: "nowrap" }}
            >
              {buildingName} 관리사무소
            </p>
            <div className="flex justify-center pt-2">
              {sealUrl ? (
                <AuthImage
                  src={sealUrl}
                  alt="직인"
                  className="h-20 w-20 object-contain"
                />
              ) : (
                <div className="text-xs text-gray-500 border border-dashed border-gray-400 rounded-full w-20 h-20 flex items-center justify-center">
                  (직인생략)
                </div>
              )}
            </div>
          </div>
        </div>
        </div>

        <div className="a4-document-actions flex flex-wrap justify-end gap-2 print:hidden">
          {!editMode && (
            <Button variant="outline" onClick={() => setEditMode(true)}>수정</Button>
          )}
          <Button variant="outline" onClick={handleEmail}>
            <Mail className="w-4 h-4 mr-2" />
            이메일
          </Button>
          <Button variant="outline" onClick={handleDownloadImage} disabled={exporting}>
            <Download className="w-4 h-4 mr-2" />
            {exporting ? "저장 중..." : "이미지 저장"}
          </Button>
          <Button onClick={handlePrint}>
            <Printer className="w-4 h-4 mr-2" />
            인쇄
          </Button>
        </div>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
