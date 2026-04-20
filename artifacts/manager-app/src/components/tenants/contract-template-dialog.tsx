import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@/components/ui/responsive-dialog";

export function ContractTemplateDialog({
  open,
  onOpenChange,
  template,
  buildingId,
  onSave,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  template: { feeObligationClause: string; penaltyClause: string; specialFundClause: string; privacyRetentionClause: string } | null;
  buildingId: number;
  onSave: (data: Record<string, unknown>) => Promise<void>;
}) {
  const [fee, setFee] = useState("");
  const [penalty, setPenalty] = useState("");
  const [specialFund, setSpecialFund] = useState("");
  const [privacy, setPrivacy] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && template) {
      setFee(template.feeObligationClause || "");
      setPenalty(template.penaltyClause || "");
      setSpecialFund(template.specialFundClause || "");
      setPrivacy(template.privacyRetentionClause || "");
    }
    if (!open) {
      setFee("");
      setPenalty("");
      setSpecialFund("");
      setPrivacy("");
    }
  }, [open, template]);

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent className="max-w-2xl">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>관리계약서 양식 설정</ResponsiveDialogTitle>
        </ResponsiveDialogHeader>
        <div className="space-y-4 max-h-[70vh] overflow-y-auto">
          <p className="text-sm text-muted-foreground">
            입주자카드 제출 시 표시되는 관리계약 동의 조항을 편집할 수 있습니다.
          </p>
          <div>
            <Label className="text-sm font-medium">1. 관리비 납부 의무</Label>
            <Textarea value={fee} onChange={(e) => setFee(e.target.value)} rows={3} className="mt-1" />
          </div>
          <div>
            <Label className="text-sm font-medium">2. 체납 시 조치</Label>
            <Textarea value={penalty} onChange={(e) => setPenalty(e.target.value)} rows={3} className="mt-1" />
          </div>
          <div>
            <Label className="text-sm font-medium">3. 특별충당금</Label>
            <Textarea value={specialFund} onChange={(e) => setSpecialFund(e.target.value)} rows={3} className="mt-1" />
          </div>
          <div>
            <Label className="text-sm font-medium">4. 개인정보 수집·보관</Label>
            <Textarea value={privacy} onChange={(e) => setPrivacy(e.target.value)} rows={3} className="mt-1" />
          </div>
          <Button
            className="w-full"
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              try {
                await onSave({
                  buildingId,
                  feeObligationClause: fee,
                  penaltyClause: penalty,
                  specialFundClause: specialFund,
                  privacyRetentionClause: privacy,
                });
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? "저장 중..." : "저장"}
          </Button>
        </div>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
