import { useState, useRef } from "react";
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
import { Printer } from "lucide-react";

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
}: CompletionNoticeProps) {
  const [editMode, setEditMode] = useState(true);
  const [title, setTitle] = useState(`[${buildingName}] ${alertTitle} 처리완료 안내`);
  const [body, setBody] = useState(
    `안녕하세요, 입주민 여러분.\n\n아래와 같이 ${alertTitle} 업무가 완료되었음을 안내드립니다.\n${alertMessage}\n\n안전하고 쾌적한 주거환경을 위해 최선을 다하겠습니다.\n주민 여러분의 양해와 협조에 감사드립니다.`
  );
  const [contact, setContact] = useState(officeContact);
  const [notesText, setNotesText] = useState(notes || "");

  function handlePrint() {
    setEditMode(false);
    setTimeout(() => { window.print(); }, 100);
  }

  return (
    <ResponsiveDialog open={open} onOpenChange={(o) => { onOpenChange(o); if (o) setEditMode(true); }}>
      <ResponsiveDialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto print:max-w-none print:shadow-none print:border-none">
        <ResponsiveDialogHeader className="print:hidden">
          <ResponsiveDialogTitle>처리완료 공지문 미리보기</ResponsiveDialogTitle>
        </ResponsiveDialogHeader>

        {editMode && (
          <div className="space-y-3 border-b pb-4 mb-4 print:hidden">
            <div>
              <Label>제목</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div>
              <Label>안내 문구</Label>
              <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5} />
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

        <div className="inspection-notice-print bg-white text-black p-8 space-y-8" style={{ fontFamily: "'Noto Sans KR', 'Malgun Gothic', sans-serif" }}>
          <div className="text-center space-y-4">
            <h1 className="text-2xl font-bold tracking-wide border-b-2 border-black pb-4">
              {title}
            </h1>
          </div>

          <div className="space-y-4 text-base leading-relaxed">
            <div className="flex">
              <span className="font-semibold w-28 shrink-0">■ 처리 항목:</span>
              <span>{alertTitle}</span>
            </div>
            <div className="flex">
              <span className="font-semibold w-28 shrink-0">■ 완료 일자:</span>
              <span>{formatNoticeDate(completedDate)}</span>
            </div>
          </div>

          <div className="border-t border-gray-300 pt-4">
            <p className="whitespace-pre-line text-base leading-relaxed">{body}</p>
          </div>

          {notesText && (
            <div className="border-t border-gray-300 pt-4">
              <p className="font-semibold mb-1">■ 비고</p>
              <p className="whitespace-pre-line text-sm">{notesText}</p>
            </div>
          )}

          {(closeUpPhotoUrl || widePhotoUrl) && (
            <div className="border-t border-gray-300 pt-4">
              <p className="font-semibold mb-3">■ 현장 사진</p>
              <div className="grid grid-cols-2 gap-4">
                {closeUpPhotoUrl && (
                  <div>
                    <p className="text-sm text-gray-600 mb-1">근경 사진</p>
                    <img src={closeUpPhotoUrl} alt="근경" className="w-full border rounded" />
                  </div>
                )}
                {widePhotoUrl && (
                  <div>
                    <p className="text-sm text-gray-600 mb-1">원경 사진</p>
                    <img src={widePhotoUrl} alt="원경" className="w-full border rounded" />
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="text-center pt-8 space-y-2">
            <p className="text-base">{getTodayFormatted()}</p>
            <p className="text-lg font-semibold">{buildingName} 관리사무소</p>
            <p className="text-sm text-gray-600">{contact}</p>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-4 print:hidden">
          {!editMode && (
            <Button variant="outline" onClick={() => setEditMode(true)}>수정</Button>
          )}
          <Button onClick={handlePrint}>
            <Printer className="w-4 h-4 mr-2" />
            인쇄
          </Button>
        </div>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
