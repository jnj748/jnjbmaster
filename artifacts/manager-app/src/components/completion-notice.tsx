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

function getTodayFormatted(): string {
  const now = new Date();
  return `${now.getFullYear()}년 ${now.getMonth() + 1}월 ${now.getDate()}일`;
}

function getDocumentNumber(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const seq = String(now.getHours()).padStart(2, "0") + String(now.getMinutes()).padStart(2, "0");
  return `관리-${y}${m}${d}-${seq}`;
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
}: CompletionNoticeProps) {
  const { toast } = useToast();
  const documentRef = useRef<HTMLDivElement>(null);
  const [editMode, setEditMode] = useState(true);
  const [docNumber] = useState(getDocumentNumber());
  const [recipient, setRecipient] = useState("입주민 일동");
  const [title, setTitle] = useState(`${alertTitle} 처리 완료 안내`);
  const [body, setBody] = useState(
    `안녕하십니까, 입주민 여러분.\n\n금번 「${alertTitle}」 업무가 아래와 같이 완료되었음을 안내드립니다.\n${alertMessage}\n\n안전하고 쾌적한 주거환경 조성을 위해 최선을 다하겠습니다.\n주민 여러분의 양해와 협조에 깊이 감사드립니다.`
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
            safeFilename(`${buildingName}_${title}_${getTodayFormatted()}`),
          );
          toast({ title: "이미지 저장 완료", description: "공문이 PNG로 저장되었습니다." });
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
      `문서번호: ${docNumber}\n시행일자: ${getTodayFormatted()}\n수신: ${recipient}\n제목: ${title}\n\n` +
      `${body}\n\n` +
      `■ 처리 항목: ${alertTitle}\n` +
      `■ 완료 일자: ${formatNoticeDate(completedDate)}\n` +
      (notesText ? `■ 비고: ${notesText}\n` : "") +
      `\n${getTodayFormatted()}\n${buildingName} 관리사무소\n${contact}`;
    openMailtoWithDocument({ subject, body: plainBody });
  }

  return (
    <ResponsiveDialog open={open} onOpenChange={(o) => { onOpenChange(o); if (o) setEditMode(true); }}>
      <ResponsiveDialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto print:max-w-none print:shadow-none print:border-none">
        <ResponsiveDialogHeader className="print:hidden">
          <ResponsiveDialogTitle>처리완료 공문 미리보기</ResponsiveDialogTitle>
        </ResponsiveDialogHeader>

        {editMode && (
          <div className="space-y-3 border-b pb-4 mb-4 print:hidden">
            <div>
              <Label>수신</Label>
              <Input value={recipient} onChange={(e) => setRecipient(e.target.value)} />
            </div>
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
            <div>
              <Label>관리사무소 연락처</Label>
              <Input value={contact} onChange={(e) => setContact(e.target.value)} />
            </div>
          </div>
        )}

        <div
          ref={documentRef}
          className="a4-document space-y-6"
          style={{ fontFamily: "'Noto Sans KR', 'Malgun Gothic', sans-serif" }}
        >
          <div className="flex items-start justify-between gap-4 border-b border-gray-300 pb-3">
            <div className="text-xs text-gray-700 leading-6">
              <div>문서번호: <span className="font-medium text-black">{docNumber}</span></div>
              <div>시행일자: <span className="font-medium text-black">{getTodayFormatted()}</span></div>
            </div>
            {logoUrl && (
              <AuthImage
                src={logoUrl}
                alt={`${buildingName} 로고`}
                className="max-h-14 w-auto object-contain"
              />
            )}
          </div>

          <div className="space-y-1 text-sm">
            <div className="flex">
              <span className="font-semibold w-16 shrink-0">수신</span>
              <span>{recipient}</span>
            </div>
            <div className="flex">
              <span className="font-semibold w-16 shrink-0">발신</span>
              <span>{buildingName} 관리사무소</span>
            </div>
            <div className="flex">
              <span className="font-semibold w-16 shrink-0">제목</span>
              <span className="font-semibold">{title}</span>
            </div>
          </div>

          <div className="border-t-2 border-black pt-5">
            <p className="whitespace-pre-line text-[15px] leading-7">{body}</p>
          </div>

          <div className="rounded border border-gray-300 px-4 py-3 text-sm space-y-1.5 bg-gray-50">
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
            <div className="text-sm">
              <p className="font-semibold mb-1">■ 비고</p>
              <p className="whitespace-pre-line">{notesText}</p>
            </div>
          )}

          {(closeUpPhotoUrl || widePhotoUrl) && (
            <div className="text-sm">
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

          <div className="text-center pt-6 space-y-1">
            <p className="text-sm">{getTodayFormatted()}</p>
            <p className="text-lg font-bold tracking-wide">{buildingName} 관리사무소</p>
            <p className="text-xs text-gray-600">{contact}</p>
          </div>
        </div>

        <div className="flex flex-wrap justify-end gap-2 mt-4 print:hidden">
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
