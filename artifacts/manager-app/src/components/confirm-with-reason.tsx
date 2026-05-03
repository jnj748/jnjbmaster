// [Task #773] 위험 액션 확인 다이얼로그 — 사유 칩(5~8개) + 직접 입력은 "기타"만.
//
// 위험 액션(매트릭스의 DESTRUCTIVE_ACTIONS) 호출 직전에 띄워서 한 번 더 동의를
// 받는다. 사유 텍스트는 서버로 전달돼 audit_logs.reason 컬럼에 박힌다.
//
//   <ConfirmWithReason
//     open={open} onOpenChange={setOpen}
//     title="마감 해제" description="..."
//     reasons={["오류 정정", "지급일 변경", "분개 누락", "기타"]}
//     destructive
//     onConfirm={async (reason) => { await fetch(..., { headers: { 'X-Audit-Reason': reason } }) }}
//   />

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const OTHER_REASON = "기타";

interface ConfirmWithReasonProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  reasons: string[]; // 5~8개 권장. 마지막에 "기타"가 없으면 자동 추가됨.
  destructive?: boolean;
  confirmText?: string;
  cancelText?: string;
  onConfirm: (reason: string) => Promise<void> | void;
}

export function ConfirmWithReason({
  open,
  onOpenChange,
  title,
  description,
  reasons,
  destructive = false,
  confirmText = "확인",
  cancelText = "취소",
  onConfirm,
}: ConfirmWithReasonProps) {
  const chips = reasons.includes(OTHER_REASON) ? reasons : [...reasons, OTHER_REASON];
  const [selected, setSelected] = useState<string | null>(null);
  const [otherText, setOtherText] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) {
      setSelected(null);
      setOtherText("");
      setBusy(false);
    }
  }, [open]);

  const finalReason = selected === OTHER_REASON ? otherText.trim() : selected ?? "";
  const canSubmit =
    selected != null && (selected !== OTHER_REASON || otherText.trim().length > 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-testid="confirm-with-reason">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>

        <div className="space-y-3">
          <div className="text-sm font-medium text-foreground">사유 선택</div>
          <div className="flex flex-wrap gap-2">
            {chips.map((r) => {
              const active = selected === r;
              return (
                <button
                  key={r}
                  type="button"
                  data-testid={`reason-chip-${r}`}
                  onClick={() => setSelected(r)}
                  className={[
                    "rounded-full border px-3 py-1.5 text-sm transition",
                    active
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-input bg-background text-foreground hover:bg-accent",
                  ].join(" ")}
                >
                  {r}
                </button>
              );
            })}
          </div>

          {selected === OTHER_REASON ? (
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">
                직접 입력 (필수, 최대 200자)
              </label>
              <Textarea
                data-testid="reason-other-input"
                value={otherText}
                onChange={(e) => setOtherText(e.target.value.slice(0, 200))}
                placeholder="사유를 구체적으로 적어주세요"
                rows={3}
              />
            </div>
          ) : null}
        </div>

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={busy}
            data-testid="confirm-cancel"
          >
            {cancelText}
          </Button>
          <Button
            type="button"
            data-testid="confirm-submit"
            disabled={!canSubmit || busy}
            onClick={async () => {
              if (!canSubmit) return;
              try {
                setBusy(true);
                await onConfirm(finalReason);
                onOpenChange(false);
              } finally {
                setBusy(false);
              }
            }}
            // [Task #773 spec] 위험 액션은 빨간 큰 버튼.
            className={
              destructive
                ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                : undefined
            }
          >
            {confirmText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default ConfirmWithReason;
