import { useState } from "react";
import { Wrench, Receipt, MessageSquareWarning, Loader2, AlertCircle, CalendarClock, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { PhotoUploadField } from "@/components/photo-upload-field";
import { useAuth } from "@/contexts/auth-context";
import { useBuilding } from "@/contexts/building-context";
import { useToast } from "@/hooks/use-toast";
import { detectFollowUp, type FollowUpDetection, type FollowUpSource } from "@/lib/follow-up-detection";
import { FollowUpSuggestionDialog } from "@/components/follow-up-suggestion-dialog";
import { CompletionNotice } from "@/components/completion-notice";
import { VoiceInputButton } from "@/components/voice-input-dialog";

type Category = "facility" | "bill" | "complaint";
type Status = "occurred" | "planned" | "completed";

interface CategoryOption {
  value: Category;
  label: string;
  icon: typeof Wrench;
  hint: string;
}

interface StatusOption {
  value: Status;
  label: string;
  icon: typeof AlertCircle;
}

const CATEGORIES: CategoryOption[] = [
  { value: "facility", label: "시설", icon: Wrench, hint: "엘리베이터·누수·전기 등" },
  { value: "bill", label: "관리비", icon: Receipt, hint: "검침·청구·납부 메모" },
  { value: "complaint", label: "민원", icon: MessageSquareWarning, hint: "주민 요청·소음·주차" },
];

const STATUSES: StatusOption[] = [
  { value: "occurred", label: "발생", icon: AlertCircle },
  { value: "planned", label: "처리예정", icon: CalendarClock },
  { value: "completed", label: "처리완료", icon: CheckCircle2 },
];

const CATEGORY_LABEL: Record<Category, string> = {
  facility: "시설",
  bill: "관리비",
  complaint: "민원",
};

const STATUS_LABEL: Record<Status, string> = {
  occurred: "발생",
  planned: "처리예정",
  completed: "처리완료",
};

export interface QuickEntryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
}

/**
 * 업무기록(QuickEntry) 다이얼로그 — 외부에서 제어한다.
 * [네비 정비] 우하단 플로팅 버튼은 제거되고, 하단 네비 가운데 + 버튼이 본 다이얼로그를 띄운다.
 *
 * 상태 흐름:
 *   - 발생 / 처리예정 → 저장 후 후속조치 키워드 감지 시 기안/견적 제안 다이얼로그.
 *   - 처리완료 → 저장 후 공고문/보고서 작성 다이얼로그(CompletionNotice).
 */
export function QuickEntryDialog({ open, onOpenChange, onCreated }: QuickEntryDialogProps) {
  const { token, user } = useAuth();
  const { building } = useBuilding();
  const { toast } = useToast();
  const [category, setCategory] = useState<Category>("facility");
  const [status, setStatus] = useState<Status>("occurred");
  const [memo, setMemo] = useState("");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [followUpOpen, setFollowUpOpen] = useState(false);
  const [followUpDetection, setFollowUpDetection] = useState<FollowUpDetection | null>(null);
  const [followUpSource, setFollowUpSource] = useState<FollowUpSource | null>(null);
  const [completionOpen, setCompletionOpen] = useState(false);
  const [completionData, setCompletionData] = useState<{
    alertTitle: string;
    alertMessage: string;
    completedDate: string;
    photoUrl: string | null;
  } | null>(null);

  const BASE = import.meta.env.BASE_URL ?? "/";
  const apiBase = `${BASE}api`.replace(/\/+/g, "/");

  function reset() {
    setCategory("facility");
    setStatus("occurred");
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
        body: JSON.stringify({
          category,
          memo: memo.trim(),
          photoUrl,
          status,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const created: { id?: number } = await res.json().catch(() => ({}));
      ok = true;

      const today = new Date().toISOString().slice(0, 10);
      const trimmed = memo.trim();
      const title = `[${CATEGORY_LABEL[category]}] ${trimmed.split("\n")[0].slice(0, 80)}`;

      if (status === "completed") {
        // 처리완료 → 공고문/보고서 작성으로 이어진다.
        setCompletionData({
          alertTitle: title,
          alertMessage: trimmed,
          completedDate: today,
          photoUrl: photoUrl ?? null,
        });
        setCompletionOpen(true);
      } else {
        // 발생 / 처리예정 → 후속조치 키워드 감지 시 기안/견적 제안.
        const detection = detectFollowUp(trimmed, {
          domainHint:
            category === "facility" ? "facility" : category === "complaint" ? "complaint" : undefined,
        });
        if (detection) {
          setFollowUpSource({
            type: "work_log_memo",
            id: created.id ?? `tmp-${Date.now()}`,
            title: trimmed.slice(0, 80),
            occurredAt: today,
          });
          setFollowUpDetection(detection);
          setFollowUpOpen(true);
        }
      }
    } catch (err) {
      console.error("[QuickEntryDialog] submit failed", err);
      toast({ title: "저장 실패", description: String(err), variant: "destructive" });
    }
    setSubmitting(false);
    if (ok) {
      toast({ title: `${STATUS_LABEL[status]}(으)로 기록되었습니다` });
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
            <DialogTitle>업무기록</DialogTitle>
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
              <div className="text-sm font-medium mb-2">처리 상태</div>
              <div className="grid grid-cols-3 gap-2">
                {STATUSES.map((s) => {
                  const active = s.value === status;
                  const Icon = s.icon;
                  return (
                    <button
                      key={s.value}
                      type="button"
                      onClick={() => setStatus(s.value)}
                      data-testid={`fab-status-${s.value}`}
                      className={`flex flex-col items-center justify-center gap-1 py-2.5 rounded-lg border ${
                        active ? "bg-accent text-accent-foreground border-accent" : "bg-background"
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      <span className="text-xs font-medium">{s.label}</span>
                    </button>
                  );
                })}
              </div>
              <div className="text-[11px] text-muted-foreground mt-1">
                {status === "completed"
                  ? "저장 후 공고문/보고서 작성으로 이어집니다."
                  : "후속조치가 필요하면 저장 후 기안서/견적 받기를 제안합니다."}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">메모</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500">음성으로 메모할 수도 있어요</span>
                  <VoiceInputButton
                    className="h-10 w-10 text-blue-600 hover:text-blue-700"
                    iconClassName="w-6 h-6"
                    title="메모 음성 입력"
                    ariaLabel="메모 음성 입력"
                    testId="fab-memo-voice"
                    onInsert={(text) =>
                      setMemo((prev) => (prev ? `${prev}${prev.endsWith("\n") ? "" : "\n"}${text}` : text))
                    }
                  />
                </div>
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

      {completionData && (
        <CompletionNotice
          open={completionOpen}
          onOpenChange={(v) => {
            setCompletionOpen(v);
            if (!v) setCompletionData(null);
          }}
          alertTitle={completionData.alertTitle}
          alertMessage={completionData.alertMessage}
          completedDate={completionData.completedDate}
          notes={null}
          closeUpPhotoUrl={completionData.photoUrl}
          widePhotoUrl={null}
          buildingName={building?.name}
          officeContact={
            building?.managementOfficePhone
              ? `관리사무소 ☎ ${building.managementOfficePhone}`
              : undefined
          }
          logoUrl={building?.logoUrl ?? null}
          authorName={user?.name ?? null}
          initialDocKind="notice"
        />
      )}
    </>
  );
}
