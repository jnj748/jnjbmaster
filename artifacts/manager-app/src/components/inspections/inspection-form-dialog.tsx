import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogTrigger,
} from "@/components/ui/responsive-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Plus } from "lucide-react";
import type { InspectionPreset } from "@workspace/api-client-react";
import {
  categoryOptions,
  INSPECTION_TYPE_LABELS,
  INSPECTION_TYPE_COLORS,
  CATEGORY_GROUP_ORDER,
} from "@/lib/page-constants/inspections";

export interface InspectionFormState {
  name: string;
  category: string;
  frequencyPerYear: number;
  legalCycleMonths: number | null;
  lastInspectionDate: string;
  nextDueDate: string;
  notes: string;
  legalBasis: string;
  advanceAlertDays: number;
  inspectionType: string;
  intervalDays: number | null;
  fixedDay: number | null;
  recommendedMonths: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: boolean;
  form: InspectionFormState;
  setForm: (form: InspectionFormState) => void;
  presets: InspectionPreset[] | undefined;
  onSubmit: (e: React.FormEvent) => void;
  onPresetSelect: (presetId: string) => void;
  onCategoryChange: (v: string) => void;
  onLastDateChange: (lastDate: string) => void;
  getCycleLabel: (preset: InspectionPreset) => string;
}

export function InspectionFormDialog({
  open,
  onOpenChange,
  editing,
  form,
  setForm,
  presets,
  onSubmit,
  onPresetSelect,
  onCategoryChange,
  onLastDateChange,
  getCycleLabel,
}: Props) {
  function getGroupedPresets() {
    if (!presets) return [];
    const groups: Record<string, typeof presets> = {};
    for (const p of presets) {
      if (!groups[p.category]) groups[p.category] = [];
      groups[p.category].push(p);
    }
    return CATEGORY_GROUP_ORDER
      .filter((cat) => groups[cat])
      .map((cat) => ({
        category: cat,
        label: categoryOptions.find((o) => o.value === cat)?.label || cat,
        presets: groups[cat],
      }));
  }

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogTrigger asChild>
        <Button>
          <Plus className="w-4 h-4 mr-2" />
          점검 등록
        </Button>
      </ResponsiveDialogTrigger>
      <ResponsiveDialogContent className="max-w-lg">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>{editing ? "점검 수정" : "새 점검 등록"}</ResponsiveDialogTitle>
        </ResponsiveDialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          {!editing && presets && presets.length > 0 && (
            <div>
              <Label>법정 프리셋 선택</Label>
              <Select onValueChange={onPresetSelect}>
                <SelectTrigger><SelectValue placeholder="프리셋을 선택하면 자동으로 채워집니다" /></SelectTrigger>
                <SelectContent className="max-h-80">
                  {getGroupedPresets().map((group) => (
                    <div key={group.category}>
                      <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground bg-muted/50 sticky top-0">
                        {group.label}
                      </div>
                      {group.presets.map((p) => (
                        <SelectItem key={p.id} value={String(p.id)}>
                          <div className="flex items-center gap-2">
                            <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${INSPECTION_TYPE_COLORS[p.inspectionType] || INSPECTION_TYPE_COLORS.legal}`}>
                              {INSPECTION_TYPE_LABELS[p.inspectionType] || "법정"}
                            </span>
                            <span>{p.name}</span>
                            <span className="text-xs text-muted-foreground">({getCycleLabel(p)})</span>
                          </div>
                        </SelectItem>
                      ))}
                    </div>
                  ))}
                </SelectContent>
              </Select>
              {form.name && presets.find((p) => p.name === form.name) && (() => {
                const selectedPreset = presets.find((p) => p.name === form.name) as InspectionPreset;
                const subItems = selectedPreset?.subItems ? JSON.parse(selectedPreset.subItems) : [];
                const recMonths = selectedPreset?.recommendedMonths ? JSON.parse(selectedPreset.recommendedMonths) : [];
                const seasonalNote = selectedPreset?.seasonalNotes;
                return (subItems.length > 0 || recMonths.length > 0 || seasonalNote) ? (
                  <div className="mt-2 p-3 bg-muted/50 rounded-lg text-sm space-y-1.5">
                    {selectedPreset?.legalBasis && (
                      <p className="text-xs text-muted-foreground"><span className="font-medium">법적 근거:</span> {selectedPreset.legalBasis}</p>
                    )}
                    {subItems.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1">세부 점검 항목:</p>
                        <div className="flex flex-wrap gap-1">
                          {subItems.map((item: string, i: number) => (
                            <span key={i} className="text-xs bg-background px-2 py-0.5 rounded border">{item}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    {recMonths.length > 0 && (
                      <p className="text-xs text-muted-foreground"><span className="font-medium">추천 시행월:</span> {recMonths.map((m: number) => `${m}월`).join(", ")}</p>
                    )}
                    {seasonalNote && (
                      <p className="text-xs text-orange-600"><span className="font-medium">계절별 참고:</span> {seasonalNote}</p>
                    )}
                  </div>
                ) : null;
              })()}
            </div>
          )}
          <div>
            <Label>점검명</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="예: 승강기 정기검사" required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>분류</Label>
              <Select value={form.category} onValueChange={onCategoryChange}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {categoryOptions.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>법정 주기 (개월)</Label>
              <Input type="number" inputMode="numeric" min={1} value={form.legalCycleMonths ?? ""} onChange={(e) => setForm({ ...form, legalCycleMonths: e.target.value ? parseInt(e.target.value) : null })} placeholder="예: 6" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>연간 횟수</Label>
              <Input type="number" inputMode="numeric" min={1} value={form.frequencyPerYear} onChange={(e) => setForm({ ...form, frequencyPerYear: parseInt(e.target.value) || 1 })} />
            </div>
            <div>
              <Label>사전 알림 일수</Label>
              <Input type="number" inputMode="numeric" min={1} value={form.advanceAlertDays} onChange={(e) => setForm({ ...form, advanceAlertDays: parseInt(e.target.value) || 30 })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>최근 점검일</Label>
              <Input type="date" value={form.lastInspectionDate} onChange={(e) => onLastDateChange(e.target.value)} />
            </div>
            <div>
              <Label>다음 예정일 {form.legalCycleMonths && form.lastInspectionDate ? "(자동계산)" : ""}</Label>
              <Input type="date" value={form.nextDueDate} onChange={(e) => setForm({ ...form, nextDueDate: e.target.value })} required />
            </div>
          </div>
          <div>
            <Label>법정근거</Label>
            <Input value={form.legalBasis} onChange={(e) => setForm({ ...form, legalBasis: e.target.value })} placeholder="예: 승강기 안전관리법 제32조" />
          </div>
          <div>
            <Label>비고</Label>
            <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="점검 관련 메모" />
          </div>
          <Button type="submit" className="w-full">{editing ? "수정" : "등록"}</Button>
        </form>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
