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

const USAGE_OPTIONS = ["주거", "사무실", "상가", "기타"] as const;

export interface UnitFormState {
  unitNumber: string;
  floor: string;
  exclusiveArea: string;
  commonArea: string;
  usage: string;
  notes: string;
  status: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: boolean;
  form: UnitFormState;
  setForm: (form: UnitFormState) => void;
  onSubmit: (e: React.FormEvent) => void;
}

export function UnitFormDialog({ open, onOpenChange, editing, form, setForm, onSubmit }: Props) {
  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogTrigger asChild>
        <Button size="sm">
          <Plus className="w-4 h-4 mr-1" />
          <span className="hidden desktop:inline">호실 추가</span>
        </Button>
      </ResponsiveDialogTrigger>
      <ResponsiveDialogContent>
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>{editing ? "호실 수정" : "새 호실 등록"}</ResponsiveDialogTitle>
        </ResponsiveDialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>호실번호 *</Label>
              <Input value={form.unitNumber} onChange={(e) => setForm({ ...form, unitNumber: e.target.value })} placeholder="예: 101" required />
            </div>
            <div>
              <Label>층 *</Label>
              <Input value={form.floor} onChange={(e) => setForm({ ...form, floor: e.target.value })} placeholder="예: 1, B1, B2" required />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>전용면적 (m²)</Label>
              <Input type="number" step="0.01" value={form.exclusiveArea} onChange={(e) => setForm({ ...form, exclusiveArea: e.target.value })} />
            </div>
            <div>
              <Label>공용면적 (m²)</Label>
              <Input type="number" step="0.01" value={form.commonArea} onChange={(e) => setForm({ ...form, commonArea: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>용도</Label>
              <Select value={form.usage} onValueChange={(v) => setForm({ ...form, usage: v })}>
                <SelectTrigger><SelectValue placeholder="용도 선택" /></SelectTrigger>
                <SelectContent>
                  {USAGE_OPTIONS.map((opt) => (
                    <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>상태</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="vacant">공실</SelectItem>
                  <SelectItem value="occupied">입주</SelectItem>
                  <SelectItem value="maintenance">정비중</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>비고</Label>
            <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          <Button type="submit" className="w-full">{editing ? "수정" : "등록"}</Button>
        </form>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
