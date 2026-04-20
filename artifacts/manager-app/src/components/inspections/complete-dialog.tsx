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
import { Textarea } from "@/components/ui/textarea";
import { resultOptions } from "@/lib/page-constants/inspections";

export interface CompleteFormState {
  inspectionDate: string;
  result: string;
  memo: string;
  inspector: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  completeForm: CompleteFormState;
  setCompleteForm: (form: CompleteFormState) => void;
  onSubmit: (e: React.FormEvent) => void;
}

export function CompleteDialog({ open, onOpenChange, completeForm, setCompleteForm, onSubmit }: Props) {
  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent>
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>점검 완료 처리</ResponsiveDialogTitle>
        </ResponsiveDialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <Label>점검일</Label>
            <Input type="date" value={completeForm.inspectionDate} onChange={(e) => setCompleteForm({ ...completeForm, inspectionDate: e.target.value })} required />
          </div>
          <div>
            <Label>점검 결과</Label>
            <Select value={completeForm.result} onValueChange={(v) => setCompleteForm({ ...completeForm, result: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {resultOptions.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {completeForm.result === "poor" && (
              <p className="text-xs text-destructive mt-1">
                불량 판정 시 수선유지비 지출 기안이 자동 생성됩니다.
              </p>
            )}
          </div>
          <div>
            <Label>점검자</Label>
            <Input value={completeForm.inspector} onChange={(e) => setCompleteForm({ ...completeForm, inspector: e.target.value })} placeholder="점검 담당자명" />
          </div>
          <div>
            <Label>메모</Label>
            <Textarea value={completeForm.memo} onChange={(e) => setCompleteForm({ ...completeForm, memo: e.target.value })} placeholder="점검 결과 상세 내용" />
          </div>
          <Button type="submit" className="w-full">완료 처리</Button>
        </form>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
