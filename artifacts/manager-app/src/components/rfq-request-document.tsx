import { useEffect, useRef, useState } from "react";
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

function getDocumentNumber(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const seq = String(now.getHours()).padStart(2, "0") + String(now.getMinutes()).padStart(2, "0");
  return `의뢰-${y}${m}${d}-${seq}`;
}

export interface RfqDocumentData {
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
}

interface RfqRequestDocumentProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rfq: RfqDocumentData;
  officeContact?: string;
  logoUrl?: string | null;
}

export function RfqRequestDocument({
  open,
  onOpenChange,
  rfq,
  officeContact = "관리사무소 ☎ 02-0000-0000",
  logoUrl = null,
}: RfqRequestDocumentProps) {
  const { toast } = useToast();
  const documentRef = useRef<HTMLDivElement>(null);
  const [editMode, setEditMode] = useState(true);
  const [docNumber] = useState(getDocumentNumber());
  const [recipient, setRecipient] = useState("협력 업체 귀중");
  const [title, setTitle] = useState(`${rfq.title} 견적 의뢰의 건`);
  const [description, setDescription] = useState(rfq.description || "");
  const [contact, setContact] = useState(officeContact);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    setTitle(`${rfq.title} 견적 의뢰의 건`);
    setDescription(rfq.description || "");
    setEditMode(true);
  }, [rfq.title, rfq.buildingName, rfq.description]);

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
            safeFilename(`${rfq.buildingName}_${title}_${getTodayFormatted()}`),
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
    const subject = `[${rfq.buildingName}] ${title}`;
    const plainBody =
      `문서번호: ${docNumber}\n시행일자: ${getTodayFormatted()}\n수신: ${recipient}\n제목: ${title}\n\n` +
      `■ 의뢰 건명: ${rfq.title}\n` +
      `■ 카테고리: ${CATEGORY_LABELS[rfq.category] || rfq.category}\n` +
      `■ 건물명: ${rfq.buildingName}\n` +
      ((rfq.sido || rfq.sigungu) ? `■ 소재지: ${[rfq.sido, rfq.sigungu].filter(Boolean).join(" ")}\n` : "") +
      `■ 의뢰일: ${formatNoticeDate(rfq.createdAt)}\n` +
      (rfq.desiredDate ? `■ 희망 시공일: ${formatNoticeDate(rfq.desiredDate)}\n` : "") +
      `■ 견적 마감일: ${formatNoticeDate(rfq.deadline)}\n` +
      (description ? `\n■ 현장 상황 및 요청 사항\n${description}\n` : "") +
      `\n※ 견적서 제출 시 공사비 산출내역서, 사업자등록증 사본을 첨부해 주시기 바랍니다.\n` +
      `※ 현장 답사 후 견적서를 제출해 주시면 감사하겠습니다.\n\n` +
      `${getTodayFormatted()}\n${rfq.buildingName} 관리사무소\n${contact}`;
    openMailtoWithDocument({ subject, body: plainBody });
  }

  return (
    <ResponsiveDialog open={open} onOpenChange={(o) => { onOpenChange(o); if (o) setEditMode(true); }}>
      <ResponsiveDialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto print:max-w-none print:shadow-none print:border-none">
        <ResponsiveDialogHeader className="print:hidden">
          <ResponsiveDialogTitle>업체 의뢰 공문 미리보기</ResponsiveDialogTitle>
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
              <Label>현장 상황 설명</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} />
            </div>
            <div>
              <Label>관리사무소 연락처</Label>
              <Input value={contact} onChange={(e) => setContact(e.target.value)} />
            </div>
          </div>
        )}

        <div className="a4-document-frame">
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
                alt={`${rfq.buildingName} 로고`}
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
              <span>{rfq.buildingName} 관리사무소</span>
            </div>
            <div className="flex">
              <span className="font-semibold w-16 shrink-0">제목</span>
              <span className="font-semibold">{title}</span>
            </div>
          </div>

          <div className="border-t-2 border-black pt-5 text-[15px] leading-7">
            <p>
              안녕하십니까. {rfq.buildingName} 관리사무소입니다.
              <br />
              아래와 같이 견적을 의뢰드리오니, 검토 후 회신하여 주시기 바랍니다.
            </p>
          </div>

          <div className="rounded border border-gray-300 px-4 py-3 text-sm space-y-1.5 bg-gray-50">
            <div className="flex">
              <span className="font-semibold w-28 shrink-0">■ 의뢰 건명</span>
              <span>{rfq.title}</span>
            </div>
            <div className="flex">
              <span className="font-semibold w-28 shrink-0">■ 카테고리</span>
              <span>{CATEGORY_LABELS[rfq.category] || rfq.category}</span>
            </div>
            <div className="flex">
              <span className="font-semibold w-28 shrink-0">■ 건물명</span>
              <span>{rfq.buildingName}</span>
            </div>
            {(rfq.sido || rfq.sigungu) && (
              <div className="flex">
                <span className="font-semibold w-28 shrink-0">■ 소재지</span>
                <span>{[rfq.sido, rfq.sigungu].filter(Boolean).join(" ")}</span>
              </div>
            )}
            <div className="flex">
              <span className="font-semibold w-28 shrink-0">■ 의뢰일</span>
              <span>{formatNoticeDate(rfq.createdAt)}</span>
            </div>
            {rfq.desiredDate && (
              <div className="flex">
                <span className="font-semibold w-28 shrink-0">■ 희망 시공일</span>
                <span>{formatNoticeDate(rfq.desiredDate)}</span>
              </div>
            )}
            <div className="flex">
              <span className="font-semibold w-28 shrink-0">■ 견적 마감일</span>
              <span className="font-semibold">{formatNoticeDate(rfq.deadline)}</span>
            </div>
          </div>

          {description && (
            <div className="text-sm">
              <p className="font-semibold mb-1">■ 현장 상황 및 요청 사항</p>
              <p className="whitespace-pre-line leading-7">{description}</p>
            </div>
          )}

          {(rfq.closeUpPhotoUrl || rfq.widePhotoUrl) && (
            <div className="text-sm">
              <p className="font-semibold mb-2">■ 현장 사진</p>
              <div className="grid grid-cols-2 gap-3">
                {rfq.closeUpPhotoUrl && (
                  <div>
                    <p className="text-xs text-gray-600 mb-1">근경</p>
                    <AuthImage src={rfq.closeUpPhotoUrl} alt="근경" className="w-full border rounded" />
                  </div>
                )}
                {rfq.widePhotoUrl && (
                  <div>
                    <p className="text-xs text-gray-600 mb-1">원경</p>
                    <AuthImage src={rfq.widePhotoUrl} alt="원경" className="w-full border rounded" />
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="text-xs text-gray-700 border-t border-gray-300 pt-3 space-y-1">
            <p>※ 견적서 제출 시 공사비 산출내역서, 사업자등록증 사본을 첨부해 주시기 바랍니다.</p>
            <p>※ 현장 답사 후 견적서를 제출해 주시면 감사하겠습니다.</p>
          </div>

          <div className="text-center pt-6 space-y-1">
            <p className="text-sm">{getTodayFormatted()}</p>
            <p className="text-lg font-bold tracking-wide">{rfq.buildingName} 관리사무소</p>
            <p className="text-xs text-gray-600">{contact}</p>
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
