// [Task #495] manager-main-widget 에서 추가 분리. 개인정보 파기 대상 알림
//   배너 + 처리 다이얼로그 한 묶음. analytics 데이터에 의존하므로 부모가
//   props 로 주입한다. dataDestructionCount === 0 일 때는 자체적으로 null 반환.
//
//   원본 출처: dashboard-manager-legacy.tsx 의 "개인정보 파기 대상" 섹션
//   (Task #142 에서 카드 영역과 다이얼로그를 함께 도입).

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@/components/ui/responsive-dialog";
import { Trash2 } from "lucide-react";

export interface DataDestructionTarget {
  type: "tenant" | "owner" | string;
  id: number | string;
  name: string;
  unit: string;
  moveOutDate?: string | null;
  destructionDate?: string | null;
}

export interface DataDestructionSectionProps {
  count: number;
  targets: DataDestructionTarget[] | null | undefined;
}

export function DataDestructionSection({ count, targets }: DataDestructionSectionProps) {
  const [open, setOpen] = useState(false);
  if (!count || count <= 0) return null;
  return (
    <>
      <div className="bg-card border border-red-200 rounded-lg p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Trash2 className="w-4 h-4 text-red-600" />
            <span className="text-sm text-red-800 font-medium">
              개인정보 파기 대상: {count}건
            </span>
            <Badge variant="destructive" className="text-[10px] h-5">{count}</Badge>
          </div>
          <button
            onClick={() => setOpen(true)}
            className="text-sm text-red-600 hover:underline font-medium"
          >
            처리하기 →
          </button>
        </div>
        <p className="text-xs text-red-700 ml-6 mt-1">
          퇴거 후 개인정보 보유기간이 만료된 데이터가 있습니다. 개인정보보호법에 따라 즉시 파기 절차를 진행해 주세요.
        </p>
      </div>

      <ResponsiveDialog open={open} onOpenChange={setOpen}>
        <ResponsiveDialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle className="flex items-center gap-2">
              <Trash2 className="w-5 h-5 text-red-600" />
              개인정보 파기 대상 목록
            </ResponsiveDialogTitle>
          </ResponsiveDialogHeader>
          <div className="space-y-3">
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-800 space-y-1">
              <p className="font-medium">파기 절차 안내</p>
              <p>1. 아래 대상자의 개인정보 파기 여부를 확인합니다.</p>
              <p>2. 관리규약 및 개인정보보호법에 따라 파기 대장을 작성합니다.</p>
              <p>3. 전자적 파일은 복구 불가능하게 삭제하고, 종이 서류는 파쇄 처리합니다.</p>
              <p>4. 파기 완료 후 파기 기록을 남기고 관리사무소장 확인을 받습니다.</p>
            </div>
            {targets?.map((target) => (
              <div key={`${target.type}-${target.id}`} className="flex items-center justify-between p-3 border rounded-lg">
                <div>
                  <p className="text-sm font-medium">{target.name} ({target.unit}호)</p>
                  <p className="text-xs text-muted-foreground">
                    {target.type === "tenant" ? "임차인" : "소유자"} · 퇴거일: {target.moveOutDate || "-"} · 파기기한: {target.destructionDate}
                  </p>
                </div>
                <Badge variant="destructive" className="text-[10px]">파기 필요</Badge>
              </div>
            ))}
            {(!targets || targets.length === 0) && (
              <p className="text-sm text-muted-foreground text-center py-4">파기 대상이 없습니다</p>
            )}
          </div>
        </ResponsiveDialogContent>
      </ResponsiveDialog>
    </>
  );
}
