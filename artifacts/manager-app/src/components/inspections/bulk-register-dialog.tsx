import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@/components/ui/responsive-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { InspectionPreset } from "@workspace/api-client-react";
import { categoryOptions } from "@/lib/page-constants/inspections";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bulkSelectedCategory: string;
  setBulkSelectedCategory: (v: string) => void;
  bulkBaseDate: string;
  setBulkBaseDate: (v: string) => void;
  bulkSelectedIds: number[];
  setBulkSelectedIds: (ids: number[]) => void;
  presets: InspectionPreset[] | undefined;
  isPending: boolean;
  onSubmit: () => void;
}

export function BulkRegisterDialog({
  open,
  onOpenChange,
  bulkSelectedCategory,
  setBulkSelectedCategory,
  bulkBaseDate,
  setBulkBaseDate,
  bulkSelectedIds,
  setBulkSelectedIds,
  presets,
  isPending,
  onSubmit,
}: Props) {
  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>법정 점검 일괄 등록</ResponsiveDialogTitle>
        </ResponsiveDialogHeader>
        <div className="space-y-4">
          <div>
            <Label>카테고리 선택</Label>
            <Select value={bulkSelectedCategory} onValueChange={(v) => { setBulkSelectedCategory(v); setBulkSelectedIds([]); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {categoryOptions.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>기준일 (최근 점검일)</Label>
            <Input type="date" value={bulkBaseDate} onChange={(e) => setBulkBaseDate(e.target.value)} />
          </div>
          <div>
            <Label>등록할 점검 항목 선택</Label>
            <div className="border rounded-md p-3 space-y-2 max-h-60 overflow-y-auto">
              {presets?.filter((p) => p.category === bulkSelectedCategory).map((preset) => (
                <label key={preset.id} className="flex items-start gap-2 cursor-pointer hover:bg-muted/50 p-1 rounded">
                  <input
                    type="checkbox"
                    checked={bulkSelectedIds.includes(preset.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setBulkSelectedIds([...bulkSelectedIds, preset.id]);
                      } else {
                        setBulkSelectedIds(bulkSelectedIds.filter((id) => id !== preset.id));
                      }
                    }}
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <div className="font-medium text-sm">{preset.name}</div>
                    {preset.legalBasis && <div className="text-xs text-muted-foreground">{preset.legalBasis}</div>}
                    {preset.inspectionType && (
                      <Badge variant="outline" className="text-xs mt-0.5">
                        {preset.inspectionType === "legal" ? "법정" : preset.inspectionType === "biweekly" ? "격주" : preset.inspectionType === "seasonal" ? "계절별" : preset.inspectionType === "administrative" ? "행정" : "자체정기"}
                      </Badge>
                    )}
                  </div>
                </label>
              ))}
              {presets?.filter((p) => p.category === bulkSelectedCategory).length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">해당 카테고리에 프리셋이 없습니다</p>
              )}
            </div>
            <div className="flex justify-between mt-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  const categoryPresets = presets?.filter((p) => p.category === bulkSelectedCategory) || [];
                  setBulkSelectedIds(categoryPresets.map((p) => p.id));
                }}
              >
                전체 선택
              </Button>
              <span className="text-sm text-muted-foreground self-center">
                {bulkSelectedIds.length}개 선택됨
              </span>
            </div>
          </div>
          <Button
            className="w-full"
            disabled={bulkSelectedIds.length === 0 || isPending}
            onClick={onSubmit}
          >
            {isPending ? "등록 중..." : `${bulkSelectedIds.length}개 일괄 등록`}
          </Button>
        </div>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
