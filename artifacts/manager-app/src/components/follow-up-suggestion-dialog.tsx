// [Task #197] 업무 완료 시 후속 조치(기안서/RFQ) 제안 팝업.
// 5개 완료 흐름에서 공유하는 컴포넌트. 같은 출처에 대해 한 번 무시하면
// 세션 동안 다시 띄우지 않는다.
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { AlertCircle, FileText, ClipboardList, X } from "lucide-react";
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
import { CompletionNotice } from "@/components/completion-notice";
import { useBuilding } from "@/contexts/building-context";
import { useAuth } from "@/contexts/auth-context";

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
  const { building } = useBuilding();
  const { user } = useAuth();
  const [draftOpen, setDraftOpen] = useState(false);

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

  // [변경] 후속 조치 "기안서 작성" — 전자결재 페이지가 아니라
  // 필수업무 프로세스와 동일한 자동 기안서 양식(이미지 저장/공유/인쇄 포함)을 띄운다.
  function handleApproval() {
    if (!source) return;
    dismissFollowUpSource(source);
    setDraftOpen(true);
  }

  function handleRfq() {
    if (!source) return;
    dismissFollowUpSource(source);
    const qs = buildPrefillQuery(source, detection, "rfq");
    onClose();
    navigate(`/rfqs?${qs}`);
  }

  return (
    <>
    <CompletionNotice
      open={draftOpen}
      onOpenChange={(o) => {
        setDraftOpen(o);
        if (!o) onClose();
      }}
      initialDocKind="draft"
      alertTitle={source.title}
      alertMessage={detection.snippet}
      completedDate={source.occurredAt}
      notes={null}
      buildingName={building?.name ?? "관리 건물"}
      authorName={user?.name ?? null}
    />
    <Dialog open={open && !draftOpen} onOpenChange={(v) => !v && handleDismiss()}>
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
