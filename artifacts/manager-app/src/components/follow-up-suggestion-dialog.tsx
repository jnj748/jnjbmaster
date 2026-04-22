// [Task #197] 업무 완료 시 후속 조치(기안서/RFQ) 제안 팝업.
// 5개 완료 흐름에서 공유하는 컴포넌트. 같은 출처에 대해 한 번 무시하면
// 세션 동안 다시 띄우지 않는다.
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { AlertCircle, FileText, ClipboardList, X, ClipboardCheck } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  type FollowUpDetection,
  type FollowUpSource,
  SOURCE_TYPE_LABEL,
} from "@/lib/follow-up-detection";
import { FollowUpScheduleTaskDialog } from "@/components/follow-up-schedule-task-dialog";

const dismissedSources = new Set<string>();

function sourceKey(source: FollowUpSource): string {
  return `${source.type}:${source.id}`;
}

export function isFollowUpDismissed(source: FollowUpSource): boolean {
  return dismissedSources.has(sourceKey(source));
}

export function dismissFollowUpSource(source: FollowUpSource): void {
  dismissedSources.add(sourceKey(source));
}

interface Props {
  open: boolean;
  source: FollowUpSource | null;
  detection: FollowUpDetection | null;
  onClose: () => void;
}

function buildPrefilledBody(source: FollowUpSource, detection: FollowUpDetection | null): string {
  const lines: string[] = [];
  lines.push(`[자동 제안] ${source.title}`);
  lines.push("");
  if (detection) {
    lines.push(`감지 키워드: ${detection.matched.map((m) => m.keyword).join(", ")}`);
    lines.push(`원문: ${detection.snippet}`);
    lines.push("");
  }
  lines.push(`출처: ${SOURCE_TYPE_LABEL[source.type]} #${source.id} (${source.occurredAt})`);
  lines.push("");
  lines.push("아래에 후속 조치 내용을 작성해주세요.");
  return lines.join("\n");
}

function buildPrefillQuery(
  source: FollowUpSource,
  detection: FollowUpDetection | null,
  target: "approval" | "rfq",
): string {
  const params = new URLSearchParams();
  params.set("prefill", "1");
  params.set("title", source.title);
  params.set("body", buildPrefilledBody(source, detection));
  if (detection) {
    params.set(
      "category",
      target === "approval" ? detection.recommendedApprovalCategory : detection.recommendedRfqCategory,
    );
    params.set("keywords", detection.matched.map((m) => m.keyword).join(","));
  }
  params.set("sourceType", source.type);
  params.set("sourceId", String(source.id));
  params.set("sourceDate", source.occurredAt);
  return params.toString();
}

export function FollowUpSuggestionDialog({ open, source, detection, onClose }: Props) {
  const [, navigate] = useLocation();
  const [scheduleOpen, setScheduleOpen] = useState(false);

  // 동일 출처 재표시 방지: 닫힐 때만 등록되도록 onClose 에서 처리.
  useEffect(() => {
    if (!open || !source) return;
    if (isFollowUpDismissed(source)) {
      onClose();
    }
  }, [open, source, onClose]);

  if (!source || !detection) {
    // CompletionNotice 가 열려 있는 동안에도 렌더가 유지되도록 별도 처리는 없다.
    return null;
  }

  function handleDismiss() {
    if (source) dismissFollowUpSource(source);
    onClose();
  }

  // [Task #220] 후속 조치 "기안서 작성" — 결재 작성 페이지로 prefill 진입.
  // 저장 후 approvals/create 가 "필수업무로 등록" 확인을 띄워준다.
  function handleApproval() {
    if (!source) return;
    dismissFollowUpSource(source);
    const qs = buildPrefillQuery(source, detection, "approval");
    onClose();
    navigate(`/approvals/create?${qs}`);
  }

  function handleRfq() {
    if (!source) return;
    dismissFollowUpSource(source);
    const qs = buildPrefillQuery(source, detection, "rfq");
    onClose();
    navigate(`/rfqs?${qs}`);
  }

  // [Task #220] 후속조치 다이얼로그에서 "필수업무로 보내두기" — 처리기간 선택
  // 다이얼로그를 띄우고, 등록 성공 시 dismiss 후 닫는다.
  function handleSendToTasks() {
    if (!source) return;
    setScheduleOpen(true);
  }

  return (
    <>
    <FollowUpScheduleTaskDialog
      open={scheduleOpen}
      onOpenChange={(o) => {
        setScheduleOpen(o);
      }}
      source={source}
      detection={detection}
      onCreated={() => {
        if (source) dismissFollowUpSource(source);
        onClose();
      }}
    />
    <Dialog open={open && !scheduleOpen} onOpenChange={(v) => !v && handleDismiss()}>
      <DialogContent className="max-w-md" data-testid="follow-up-suggestion-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-amber-600" />
            후속 조치가 필요해 보여요
          </DialogTitle>
          <DialogDescription className="text-xs">
            해당 업무는 후속조치가 필요해보여요. 기안하시거나 견적을 받아보시겠어요?
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="rounded-md border bg-muted/40 p-3 text-sm">
            <p className="text-xs text-muted-foreground mb-1">
              {SOURCE_TYPE_LABEL[source.type]} · {source.occurredAt}
            </p>
            <p className="font-medium line-clamp-2">{source.title}</p>
            <p className="text-xs text-muted-foreground mt-2 whitespace-pre-wrap">
              {detection.snippet}
            </p>
            <div className="flex flex-wrap gap-1 mt-2">
              {detection.matched.slice(0, 6).map((m) => (
                <Badge key={m.keyword} variant="outline" className="text-[10px]">
                  {m.keyword}
                </Badge>
              ))}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            아래 중 하나를 선택해 빠르게 시작할 수 있어요. 제목·본문·분류는 자동으로 채워집니다.
          </p>
        </div>
        <DialogFooter className="flex-col sm:flex-col gap-2 mt-2">
          <Button onClick={handleApproval} className="w-full" data-testid="follow-up-go-approval">
            <FileText className="w-4 h-4 mr-1" />
            기안서 작성
          </Button>
          <Button
            onClick={handleRfq}
            variant="outline"
            className="w-full"
            data-testid="follow-up-go-rfq"
          >
            <ClipboardList className="w-4 h-4 mr-1" />
            파트너사 견적 받기
          </Button>
          <Button
            onClick={handleSendToTasks}
            variant="outline"
            className="w-full"
            data-testid="follow-up-send-to-tasks"
          >
            <ClipboardCheck className="w-4 h-4 mr-1" />
            필수업무로 보내두기
          </Button>
          <Button
            onClick={handleDismiss}
            variant="ghost"
            className="w-full text-muted-foreground"
            data-testid="follow-up-dismiss"
          >
            <X className="w-4 h-4 mr-1" />
            다음에 하기
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
