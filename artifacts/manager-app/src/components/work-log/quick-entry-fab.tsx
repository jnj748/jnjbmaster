import { useState } from "react";
import { Wrench, Receipt, MessageSquareWarning, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { PhotoUploadField } from "@/components/photo-upload-field";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";
import { detectFollowUp, type FollowUpDetection, type FollowUpSource } from "@/lib/follow-up-detection";
import { FollowUpSuggestionDialog } from "@/components/follow-up-suggestion-dialog";
import { VoiceInputButton } from "@/components/voice-input-dialog";

type Category = "facility" | "bill" | "complaint";

interface CategoryOption {
  value: Category;
  label: string;
  icon: typeof Wrench;
  hint: string;
}

const CATEGORIES: CategoryOption[] = [
  { value: "facility", label: "시설", icon: Wrench, hint: "엘리베이터·누수·전기 등" },
  { value: "bill", label: "관리비", icon: Receipt, hint: "검침·청구·납부 메모" },
  { value: "complaint", label: "민원", icon: MessageSquareWarning, hint: "주민 요청·소음·주차" },
];

export interface QuickEntryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
}

/**
 * 일일메모(업무 기록) 다이얼로그 — 외부에서 제어한다.
 * [Task #네비 정비] 우하단 플로팅 버튼은 제거되고, 하단 네비 가운데 + 버튼이 본 다이얼로그를 띄운다.
 */
export function QuickEntryDialog({ open, onOpenChange, onCreated }: QuickEntryDialogProps) {
  const { token } = useAuth();
  const { toast } = useToast();
  const [category, setCategory] = useState<Category>("facility");
  const [memo, setMemo] = useState("");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [followUpOpen, setFollowUpOpen] = useState(false);
  const [followUpDetection, setFollowUpDetection] = useState<FollowUpDetection | null>(null);
  const [followUpSource, setFollowUpSource] = useState<FollowUpSource | null>(null);

  const BASE = import.meta.env.BASE_URL ?? "/";
  const apiBase = `${BASE}api`.replace(/\/+/g, "/");

  function reset() {
    setCategory("facility");
    setMemo("");
    setPhotoUrl(null);
  }

  async function submit() {
    if (!memo.trim()) {
      toast({ title: "메모를 입력해주세요", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    let ok = false;
    try {
      const res = await fetch(`${apiBase}/work-logs`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ category, memo: memo.trim(), photoUrl }),
      });
      if (!res.ok) throw new Error(await res.text());
      const created: { id?: number } = await res.json().catch(() => ({}));
      ok = true;
      // [Task #197] 후속 조치 키워드가 감지되면 제안 팝업을 띄운다.
      const detection = detectFollowUp(memo.trim(), {
        domainHint:
          category === "facility" ? "facility" : category === "complaint" ? "complaint" : undefined,
      });
      if (detection) {
        const today = new Date().toISOString().slice(0, 10);
        setFollowUpSource({
          type: "work_log_memo",
          id: created.id ?? `tmp-${Date.now()}`,
          title: memo.trim().slice(0, 80),
          occurredAt: today,
        });
        setFollowUpDetection(detection);
        setFollowUpOpen(true);
      }
    } catch (err) {
      console.error("[QuickEntryDialog] submit failed", err);
      toast({ title: "저장 실패", description: String(err), variant: "destructive" });
    }
    setSubmitting(false);
    if (ok) {
      toast({ title: "기록되었습니다" });
      onCreated?.();
      onOpenChange(false);
      reset();
    }
  }

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (submitting) return;
          onOpenChange(v);
          if (!v) reset();
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>업무 기록</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2">
              {CATEGORIES.map((c) => {
                const active = c.value === category;
                const Icon = c.icon;
                return (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setCategory(c.value)}
                    data-testid={`fab-category-${c.value}`}
                    className={`flex flex-col items-center justify-center gap-1 py-3 rounded-lg border ${
                      active ? "bg-accent text-accent-foreground border-accent" : "bg-background"
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    <span className="text-xs font-medium">{c.label}</span>
                  </button>
                );
              })}
            </div>
            <div className="text-[11px] text-muted-foreground -mt-2">
              {CATEGORIES.find((c) => c.value === category)?.hint}
            </div>

            <div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">메모</span>
                <VoiceInputButton
                  title="메모 음성 입력"
                  ariaLabel="메모 음성 입력"
                  testId="fab-memo-voice"
                  onInsert={(text) =>
                    setMemo((prev) => (prev ? `${prev}${prev.endsWith("\n") ? "" : "\n"}${text}` : text))
                  }
                />
              </div>
              <Textarea
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                placeholder="무슨 일이 있었나요? (예: 3층 복도등 1개 점등 불량 → 교체 완료)"
                rows={4}
                data-testid="fab-memo-input"
              />
            </div>

            <PhotoUploadField label="사진 (선택)" value={photoUrl} onChange={setPhotoUrl} />

            <Button onClick={submit} disabled={submitting} className="w-full" data-testid="fab-submit">
              {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
              저장하기
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <FollowUpSuggestionDialog
        open={followUpOpen}
        source={followUpSource}
        detection={followUpDetection}
        onClose={() => setFollowUpOpen(false)}
      />
    </>
  );
}
