import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, AlertCircle, CalendarClock, CheckCircle2, type LucideIcon } from "lucide-react";
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
import { MemoInputFooter } from "@/components/memo-input-footer";
import { getCategoriesFor, useCurrentRole, CATEGORY_LABEL, type Category, type Role } from "@/pages/work-log/shared";

type Status = "occurred" | "planned" | "completed";

interface StatusOption {
  value: Status;
  label: string;
  icon: LucideIcon;
}

const STATUSES: StatusOption[] = [
  { value: "occurred", label: "발생", icon: AlertCircle },
  { value: "planned", label: "처리예정", icon: CalendarClock },
  { value: "completed", label: "처리완료", icon: CheckCircle2 },
];

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
  const role = useCurrentRole();
  const CATEGORIES = useMemo(() => getCategoriesFor(role), [role]);
  const defaultCategory = CATEGORIES[0].value as Category;
  const allowedCategoryValues = useMemo(
    () => new Set<Category>(CATEGORIES.map((c) => c.value)),
    [CATEGORIES],
  );
  // [Task #641] role 이 늦게 결정되는 회귀 가드.
  // useState 초기값은 첫 렌더의 defaultCategory (보통 user 미로딩 → "manager" 폴백 →
  // "facility") 로 굳는다. 두 가지 경우 모두 category 상태를 새 직책의 첫 카테고리로
  // 결정적으로 재설정한다:
  //   1) role 자체가 바뀐 직후 — 인증 응답이 돌아와 사용자의 실제 직책이 확정되거나
  //      dev 격자에서 셀별 사용자가 결정된 시점. 카테고리 키가 직책끼리 겹치는 경우
  //      (예: complaint 는 manager·accountant 양쪽에 있음) 에도 무조건 새 직책의
  //      기본값(receivable 등) 으로 리셋해 직책별 기본 선택을 보장한다.
  //   2) role 변동 없이도 어떤 경로로든 category 가 허용 집합 밖이면 보정.
  const [category, setCategory] = useState<Category>(defaultCategory);
  const prevRoleRef = useRef<Role>(role);
  useEffect(() => {
    if (prevRoleRef.current !== role) {
      prevRoleRef.current = role;
      setCategory(defaultCategory);
      return;
    }
    if (!allowedCategoryValues.has(category)) {
      setCategory(defaultCategory);
    }
  }, [role, allowedCategoryValues, defaultCategory, category]);
  const [status, setStatus] = useState<Status>("occurred");
  const [memo, setMemo] = useState("");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [widePhotoUrl, setWidePhotoUrl] = useState<string | null>(null);
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
    widePhotoUrl: string | null;
  } | null>(null);

  const BASE = import.meta.env.BASE_URL ?? "/";
  const apiBase = `${BASE}api`.replace(/\/+/g, "/");

  function reset() {
    setCategory(defaultCategory);
    setStatus("occurred");
    setMemo("");
    setPhotoUrl(null);
    setWidePhotoUrl(null);
  }

  /** 후속조치 도메인 힌트 — 새 직책별 카테고리도 facility/complaint 로 매핑. */
  const FACILITY_DOMAIN = new Set(["facility", "fire", "electric", "mechanical"]);
  const COMPLAINT_DOMAIN = new Set(["complaint"]);
  function followUpDomainHint(c: Category): "facility" | "complaint" | undefined {
    if (FACILITY_DOMAIN.has(c)) return "facility";
    if (COMPLAINT_DOMAIN.has(c)) return "complaint";
    return undefined;
  }

  async function submit() {
    if (!memo.trim()) {
      toast({ title: "메모를 입력해주세요", variant: "destructive" });
      return;
    }
    // [Task #641] 클라이언트 회귀 가드 — 직책에 허용되지 않은 카테고리가 들어가
    // 서버 화이트리스트에 막혀 400 이 떨어지는 일을 막는다. 어긋나 있으면 자동으로
    // 현재 직책의 첫 카테고리로 보정한 뒤 그 값으로 저장한다.
    let safeCategory: Category = category;
    if (!allowedCategoryValues.has(safeCategory)) {
      safeCategory = defaultCategory;
      setCategory(defaultCategory);
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
          category: safeCategory,
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
      const title = `[${CATEGORY_LABEL[safeCategory]}] ${trimmed.split("\n")[0].slice(0, 80)}`;

      if (status === "completed") {
        // 처리완료 → 공고문/보고서 작성으로 이어진다.
        setCompletionData({
          alertTitle: title,
          alertMessage: trimmed,
          completedDate: today,
          photoUrl: photoUrl ?? null,
          widePhotoUrl: widePhotoUrl ?? null,
        });
        setCompletionOpen(true);
      } else {
        // 발생 / 처리예정 → 후속조치 키워드 감지 시 기안/견적 제안.
        const detection = detectFollowUp(trimmed, {
          domainHint: followUpDomainHint(safeCategory),
        });
        if (detection) {
          setFollowUpSource({
            type: "work_log_memo",
            id: created.id ?? `tmp-${Date.now()}`,
            title: trimmed.slice(0, 80),
            occurredAt: today,
            // [Task #407] 후속조치 → "파트너사 견적 받기" 진입 시 RFQ 사진 칸에 자동 연동.
            closeUpPhotoUrl: photoUrl,
            widePhotoUrl: widePhotoUrl,
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
              <div className="text-sm font-medium mb-2">메모</div>
              <Textarea
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                placeholder="무슨 일이 있었나요? (예: 3층 복도등 1개 점등 불량 → 교체 완료)"
                rows={4}
                data-testid="fab-memo-input"
              />
              <MemoInputFooter
                testId="fab-memo"
                onInsert={(text) =>
                  setMemo((prev) => (prev ? `${prev}${prev.endsWith("\n") ? "" : "\n"}${text}` : text))
                }
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <PhotoUploadField
                label="근경 (선택)"
                value={photoUrl}
                onChange={setPhotoUrl}
                compact
                testId="fab-photo-close"
              />
              <PhotoUploadField
                label="원경 (선택)"
                value={widePhotoUrl}
                onChange={setWidePhotoUrl}
                compact
                testId="fab-photo-wide"
              />
            </div>

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
          widePhotoUrl={completionData.widePhotoUrl}
          buildingName={building?.name}
          managementOfficePhone={building?.managementOfficePhone ?? null}
          feeInquiryPhone={building?.feeInquiryPhone ?? null}
          facilitySafetyPhone={building?.facilitySafetyPhone ?? null}
          logoUrl={building?.logoUrl ?? null}
          authorName={user?.name ?? null}
          initialDocKind="notice"
        />
      )}
    </>
  );
}
