import { useState, useEffect } from "react";
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

const CATEGORY_LABELS: Record<string, string> = {
  elevator: "승강기",
  water_tank: "저수조",
  fire_safety: "소방",
  electrical: "전기",
  gas: "가스",
  septic: "정화조",
  cleaning: "청소/미화",
  security: "보안/경비",
  other: "기타",
};

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

interface RfqRequestDocumentProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rfq: {
    title: string;
    category: string;
    description?: string | null;
    buildingName: string;
    desiredDate?: string | null;
    deadline: string;
    sido?: string | null;
    sigungu?: string | null;
    closeUpPhotoUrl?: string | null;
    widePhotoUrl?: string | null;
    createdAt: string;
  };
  officeContact?: string;
}

export function RfqRequestDocument({
  open,
  onOpenChange,
  rfq,
  officeContact = "관리사무소 ☎ 02-0000-0000",
}: RfqRequestDocumentProps) {
  const [editMode, setEditMode] = useState(true);
  const [title, setTitle] = useState(`[${rfq.buildingName}] 업체의뢰서`);
  const [description, setDescription] = useState(rfq.description || "");
  const [contact, setContact] = useState(officeContact);

  useEffect(() => {
    setTitle(`[${rfq.buildingName}] 업체의뢰서`);
    setDescription(rfq.description || "");
    setEditMode(true);
  }, [rfq.title, rfq.buildingName, rfq.description]);

  function handlePrint() {
    setEditMode(false);
    setTimeout(() => { window.print(); }, 100);
  }

  return (
    <ResponsiveDialog open={open} onOpenChange={(o) => { onOpenChange(o); if (o) setEditMode(true); }}>
      <ResponsiveDialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto print:max-w-none print:shadow-none print:border-none">
        <ResponsiveDialogHeader className="print:hidden">
          <ResponsiveDialogTitle>업체의뢰서 미리보기</ResponsiveDialogTitle>
        </ResponsiveDialogHeader>

        {editMode && (
          <div className="space-y-3 border-b pb-4 mb-4 print:hidden">
            <div>
              <Label>제목</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div>
              <Label>현장 상황 설명</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} />
            </div>
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

          <div className="space-y-3 text-base leading-relaxed">
            <div className="flex">
              <span className="font-semibold w-32 shrink-0">■ 의뢰 건명:</span>
              <span>{rfq.title}</span>
            </div>
            <div className="flex">
              <span className="font-semibold w-32 shrink-0">■ 카테고리:</span>
              <span>{CATEGORY_LABELS[rfq.category] || rfq.category}</span>
            </div>
            <div className="flex">
              <span className="font-semibold w-32 shrink-0">■ 건물명:</span>
              <span>{rfq.buildingName}</span>
            </div>
            {(rfq.sido || rfq.sigungu) && (
              <div className="flex">
                <span className="font-semibold w-32 shrink-0">■ 소재지:</span>
                <span>{[rfq.sido, rfq.sigungu].filter(Boolean).join(" ")}</span>
              </div>
            )}
            <div className="flex">
              <span className="font-semibold w-32 shrink-0">■ 의뢰일:</span>
              <span>{formatNoticeDate(rfq.createdAt)}</span>
            </div>
            {rfq.desiredDate && (
              <div className="flex">
                <span className="font-semibold w-32 shrink-0">■ 희망 시공일:</span>
                <span>{formatNoticeDate(rfq.desiredDate)}</span>
              </div>
            )}
            <div className="flex">
              <span className="font-semibold w-32 shrink-0">■ 견적 마감일:</span>
              <span>{formatNoticeDate(rfq.deadline)}</span>
            </div>
          </div>

          {description && (
            <div className="border-t border-gray-300 pt-4">
              <p className="font-semibold mb-2">■ 현장 상황 및 요청 사항</p>
              <p className="whitespace-pre-line text-base leading-relaxed">{description}</p>
            </div>
          )}

          {(rfq.closeUpPhotoUrl || rfq.widePhotoUrl) && (
            <div className="border-t border-gray-300 pt-4">
              <p className="font-semibold mb-3">■ 현장 사진</p>
              <div className="grid grid-cols-2 gap-4">
                {rfq.closeUpPhotoUrl && (
                  <div>
                    <p className="text-sm text-gray-600 mb-1">근경 사진</p>
                    <img src={rfq.closeUpPhotoUrl} alt="근경" className="w-full border rounded" />
                  </div>
                )}
                {rfq.widePhotoUrl && (
                  <div>
                    <p className="text-sm text-gray-600 mb-1">원경 사진</p>
                    <img src={rfq.widePhotoUrl} alt="원경" className="w-full border rounded" />
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="border-t border-gray-300 pt-4 text-sm text-gray-600">
            <p>※ 견적서 제출 시 공사비 산출내역서, 사업자등록증 사본을 첨부해 주시기 바랍니다.</p>
            <p>※ 현장 답사 후 견적서를 제출해 주시면 감사하겠습니다.</p>
          </div>

          <div className="text-center pt-8 space-y-2">
            <p className="text-base">{getTodayFormatted()}</p>
            <p className="text-lg font-semibold">{rfq.buildingName} 관리사무소</p>
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
