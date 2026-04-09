import { useState, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Printer } from "lucide-react";

export const CATEGORY_LEGAL_BASIS: Record<string, string> = {
  elevator: "승강기 안전관리법 제32조 (정기검사)",
  water_tank: "수도법 제33조 (저수조 청소 및 위생점검)",
  fire_safety: "소방시설 설치 및 관리에 관한 법률 제25조 (자체점검)",
  electrical: "전기사업법 제63조 (전기설비 정기검사)",
  gas: "도시가스사업법 제17조 (정기검사)",
  septic: "하수도법 제39조 (개인하수처리시설 관리)",
  other: "",
};

export const CATEGORY_NOTICE_TEMPLATE: Record<string, string> = {
  elevator:
    "안녕하세요, 입주민 여러분.\n\n승강기 안전관리법에 따라 아래와 같이 승강기 정기검사를 실시합니다.\n점검 시간 동안 해당 승강기 이용이 제한될 수 있으니 양해 부탁드립니다.\n불편을 드려 죄송하며, 안전한 아파트 생활을 위한 필수 점검이오니 주민 여러분의 협조를 부탁드립니다.",
  water_tank:
    "안녕하세요, 입주민 여러분.\n\n수도법에 따라 아래와 같이 저수조 청소 및 위생점검을 실시합니다.\n점검 시간 동안 일시적으로 단수가 발생할 수 있으니 사전에 생활용수를 준비해 주시기 바랍니다.\n깨끗한 수돗물 공급을 위한 법정 점검이오니 주민 여러분의 협조를 부탁드립니다.",
  fire_safety:
    "안녕하세요, 입주민 여러분.\n\n소방시설법에 따라 아래와 같이 소방시설 자체점검을 실시합니다.\n점검 시간 동안 화재경보기 시험으로 경보음이 울릴 수 있으니 놀라지 마시기 바랍니다.\n주민 여러분의 안전을 위한 필수 점검이오니 협조를 부탁드립니다.",
  electrical:
    "안녕하세요, 입주민 여러분.\n\n전기사업법에 따라 아래와 같이 전기설비 정기검사를 실시합니다.\n점검 시간 동안 일시적으로 정전이 발생할 수 있으니 사전에 전자기기를 정리해 주시기 바랍니다.\n안전한 전기 사용을 위한 법정 점검이오니 주민 여러분의 협조를 부탁드립니다.",
  gas: "안녕하세요, 입주민 여러분.\n\n도시가스사업법에 따라 아래와 같이 가스시설 정기검사를 실시합니다.\n점검 시간 동안 일시적으로 가스 공급이 중단될 수 있으니 양해 부탁드립니다.\n가스 안전을 위한 필수 점검이오니 주민 여러분의 협조를 부탁드립니다.",
  septic:
    "안녕하세요, 입주민 여러분.\n\n하수도법에 따라 아래와 같이 정화조 점검을 실시합니다.\n점검 시간 동안 일시적으로 악취가 발생할 수 있으니 양해 부탁드립니다.\n쾌적한 주거환경을 위한 법정 점검이오니 주민 여러분의 협조를 부탁드립니다.",
  other:
    "안녕하세요, 입주민 여러분.\n\n아래와 같이 시설 점검을 실시합니다.\n점검 시간 동안 불편을 드릴 수 있으니 양해 부탁드립니다.\n안전한 주거환경을 위한 점검이오니 주민 여러분의 협조를 부탁드립니다.",
};

const CATEGORY_LABELS: Record<string, string> = {
  elevator: "승강기",
  water_tank: "저수조",
  fire_safety: "소방",
  electrical: "전기",
  gas: "가스",
  septic: "정화조",
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

interface InspectionNoticeProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  inspection: {
    name: string;
    category: string;
    nextDueDate: string;
    legalBasis?: string | null;
  };
  buildingName?: string;
  officeContact?: string;
}

export function InspectionNotice({
  open,
  onOpenChange,
  inspection,
  buildingName = "OO아파트",
  officeContact = "관리사무소 ☎ 02-0000-0000",
}: InspectionNoticeProps) {
  const [editMode, setEditMode] = useState(true);
  const printRef = useRef<HTMLDivElement>(null);

  const categoryLabel = CATEGORY_LABELS[inspection.category] || inspection.category;
  const defaultLegalBasis = inspection.legalBasis || CATEGORY_LEGAL_BASIS[inspection.category] || "";
  const defaultNoticeBody = CATEGORY_NOTICE_TEMPLATE[inspection.category] || CATEGORY_NOTICE_TEMPLATE.other;

  const [title, setTitle] = useState(`[${buildingName}] ${inspection.name} 점검 안내`);
  const [legalBasis, setLegalBasis] = useState(defaultLegalBasis);
  const [noticeBody, setNoticeBody] = useState(defaultNoticeBody);
  const [contact, setContact] = useState(officeContact);

  const inspectionDate = formatNoticeDate(inspection.nextDueDate);

  function handlePrint() {
    setEditMode(false);
    setTimeout(() => {
      window.print();
    }, 100);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (o) setEditMode(true); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto print:max-w-none print:shadow-none print:border-none">
        <DialogHeader className="print:hidden">
          <DialogTitle>점검 안내문 미리보기</DialogTitle>
        </DialogHeader>

        {editMode && (
          <div className="space-y-3 border-b pb-4 mb-4 print:hidden">
            <div>
              <Label>제목</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div>
              <Label>법정근거</Label>
              <Input value={legalBasis} onChange={(e) => setLegalBasis(e.target.value)} placeholder="예: 승강기 안전관리법 제32조" />
            </div>
            <div>
              <Label>안내 문구</Label>
              <Textarea value={noticeBody} onChange={(e) => setNoticeBody(e.target.value)} rows={6} />
            </div>
            <div>
              <Label>관리사무소 연락처</Label>
              <Input value={contact} onChange={(e) => setContact(e.target.value)} />
            </div>
          </div>
        )}

        <div ref={printRef} className="inspection-notice-print bg-white text-black p-8 space-y-8" style={{ fontFamily: "'Noto Sans KR', 'Malgun Gothic', sans-serif" }}>
          <div className="text-center space-y-4">
            <h1 className="text-2xl font-bold tracking-wide border-b-2 border-black pb-4">
              {title}
            </h1>
          </div>

          <div className="space-y-4 text-base leading-relaxed">
            <div className="flex">
              <span className="font-semibold w-28 shrink-0">■ 점검 항목:</span>
              <span>{inspection.name} ({categoryLabel})</span>
            </div>
            <div className="flex">
              <span className="font-semibold w-28 shrink-0">■ 점검 일시:</span>
              <span>{inspectionDate}</span>
            </div>
            {legalBasis && (
              <div className="flex">
                <span className="font-semibold w-28 shrink-0">■ 법정근거:</span>
                <span>{legalBasis}</span>
              </div>
            )}
          </div>

          <div className="border-t border-gray-300 pt-4">
            <p className="whitespace-pre-line text-base leading-relaxed">{noticeBody}</p>
          </div>

          <div className="text-center pt-8 space-y-2">
            <p className="text-base">{getTodayFormatted()}</p>
            <p className="text-lg font-semibold">{buildingName} 관리사무소</p>
            <p className="text-sm text-gray-600">{contact}</p>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-4 print:hidden">
          {!editMode && (
            <Button variant="outline" onClick={() => setEditMode(true)}>
              수정
            </Button>
          )}
          <Button onClick={handlePrint}>
            <Printer className="w-4 h-4 mr-2" />
            인쇄
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
