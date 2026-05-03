import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ChipSelect, type ChipOption } from "./chip-select";

/**
 * [Task #772 — 키보드 사절 7규칙] 환불·취소·정정 등 위험 작업에 쓰이는
 * 사유 칩 + 2단계 확인 다이얼로그.
 *  - 1단계: 사유(칩) 선택 + 선택 사항으로 추가 메모 입력
 *  - 2단계: 정말 진행할지 최종 확인
 */
export interface ReasonConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  reasonOptions: ChipOption[];
  /** 최종 확인 버튼 라벨 (기본: "확정") */
  confirmLabel?: string;
  /** 사용자가 사유 + 메모를 확정한 시점에 호출. */
  onConfirm: (payload: { reason: string; note?: string }) => void | Promise<void>;
  /** 칩 옵션 외 자유 메모 입력을 막을 때 false. 기본: true */
  allowNote?: boolean;
}

export function ReasonConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  reasonOptions,
  confirmLabel = "확정",
  onConfirm,
  allowNote = true,
}: ReasonConfirmDialogProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [reason, setReason] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setStep(1);
    setReason(null);
    setNote("");
    setSubmitting(false);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const handleFinalize = async () => {
    if (!reason) return;
    setSubmitting(true);
    try {
      await onConfirm({ reason, note: note.trim() || undefined });
      reset();
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent data-testid="accountant-reason-confirm-dialog">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? (
            <DialogDescription>{description}</DialogDescription>
          ) : null}
        </DialogHeader>

        {step === 1 ? (
          <div className="space-y-4 py-2">
            <ChipSelect
              label="사유 선택"
              options={reasonOptions}
              value={reason}
              onChange={(v) => setReason(v)}
            />
            {allowNote ? (
              <div className="space-y-2">
                <label className="text-sm font-medium">추가 메모 (선택)</label>
                <Textarea
                  rows={3}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="필요하면 한 줄 더 적어 주세요."
                />
              </div>
            ) : null}
          </div>
        ) : (
          <div className="space-y-3 py-2 text-sm">
            <p className="text-muted-foreground">아래 내용으로 진행할까요?</p>
            <div className="rounded-md bg-muted/50 p-3">
              <div>
                <span className="font-medium">사유: </span>
                <span>
                  {reasonOptions.find((o) => o.value === reason)?.label ?? reason}
                </span>
              </div>
              {note ? (
                <div className="mt-1">
                  <span className="font-medium">메모: </span>
                  <span>{note}</span>
                </div>
              ) : null}
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          {step === 1 ? (
            <>
              <Button variant="outline" onClick={() => handleOpenChange(false)}>
                취소
              </Button>
              <Button
                disabled={!reason}
                onClick={() => setStep(2)}
              >
                다음
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => setStep(1)}>
                뒤로
              </Button>
              <Button
                variant="destructive"
                disabled={submitting}
                onClick={handleFinalize}
              >
                {confirmLabel}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
