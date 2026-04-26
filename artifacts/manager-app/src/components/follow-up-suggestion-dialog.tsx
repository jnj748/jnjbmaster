// [Task #197] 업무 완료 시 후속 조치(기안서/RFQ) 제안 팝업.
// 5개 완료 흐름에서 공유하는 컴포넌트. 같은 출처에 대해 한 번 무시하면
// 세션 동안 다시 띄우지 않는다.
// [Task #404] "기안서 작성" 버튼이 결재 작성 페이지로 이동해 화이트아웃되는
// 문제를 해결하기 위해, 첫 번째 메뉴를 "공고문 보고서 기안서 등 문서로
// 작성하기"로 바꾸고 필수업무 처리완료에서 쓰는 CompletionNotice 모달을
// 같은 다이얼로그 안에서 띄운다. (페이지 이동 없음)
import { useEffect, useMemo, useState } from "react";
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
import { buildPrefillQuery } from "@/lib/follow-up-prefill";
import { FollowUpScheduleTaskDialog } from "@/components/follow-up-schedule-task-dialog";
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

// [Task #404] 후속조치 → 문서 작성(공고문/보고서/기안서) 모달 진입 시,
//   각 양식 본문에 후속조치 맥락(출처·키워드·원문 요약)을 자연스럽게 채워
//   사용자가 곧바로 편집·내보내기 할 수 있도록 한다.
function buildFollowUpDocBodies(
  source: FollowUpSource,
  detection: FollowUpDetection | null,
  buildingName: string,
): { notice: string; report: string; draft: string } {
  const sourceLabel = SOURCE_TYPE_LABEL[source.type];
  const keywords = detection ? detection.matched.map((m) => m.keyword).join(", ") : "";
  const snippet = detection?.snippet ?? "";
  const sourceLine = `출처: ${sourceLabel} #${source.id} (${source.occurredAt})`;
  const keywordsLine = keywords ? `감지 키워드: ${keywords}` : "";
  const snippetLine = snippet ? `원문 요약: ${snippet}` : "";

  const notice = [
    `안녕하십니까 입주민 여러분 ${buildingName} 관리사무소 입니다.`,
    `최근 다음과 같이 후속 조치가 필요한 사안이 확인되어 안내드립니다.`,
    "",
    `- 사안: ${source.title}`,
    keywordsLine ? `- ${keywordsLine}` : "",
    snippetLine ? `- ${snippetLine}` : "",
    "",
    `관리사무소에서는 신속히 조치를 진행한 뒤 결과를 별도 안내드리겠습니다. 감사합니다.`,
  ]
    .filter((l) => l !== "")
    .join("\n");

  const report = [
    `${buildingName} 후속 조치 필요 사안에 대하여 아래와 같이 보고드립니다.`,
    "",
    `- 사안: ${source.title}`,
    `- ${sourceLine}`,
    keywordsLine ? `- ${keywordsLine}` : "",
    snippetLine ? `- ${snippetLine}` : "",
  ]
    .filter((l) => l !== "")
    .join("\n");

  const draft = [
    `처리 항목: ${source.title}`,
    sourceLine,
    keywordsLine,
    snippetLine,
    "",
    `요청 사항: 위 후속 조치 진행을 위해 결재를 요청드립니다.`,
  ]
    .filter((l) => l !== "")
    .join("\n");

  return { notice, report, draft };
}


export function FollowUpSuggestionDialog({ open, source, detection, onClose }: Props) {
  const [, navigate] = useLocation();
  const [scheduleOpen, setScheduleOpen] = useState(false);
  // [Task #404] 문서 작성 모달(CompletionNotice) 열림 상태.
  //   열려 있는 동안에는 후속조치 다이얼로그가 가려지도록 한다.
  const [docOpen, setDocOpen] = useState(false);
  const { building } = useBuilding();
  const { user } = useAuth();

  // 동일 출처 재표시 방지: 닫힐 때만 등록되도록 onClose 에서 처리.
  useEffect(() => {
    if (!open || !source) return;
    if (isFollowUpDismissed(source)) {
      onClose();
    }
  }, [open, source, onClose]);

  const docInitialBodies = useMemo(() => {
    if (!source) return undefined;
    return buildFollowUpDocBodies(source, detection, building?.name ?? "OO아파트");
  }, [source, detection, building?.name]);

  if (!source || !detection) {
    // CompletionNotice 가 열려 있는 동안에도 렌더가 유지되도록 별도 처리는 없다.
    return null;
  }

  function handleDismiss() {
    if (source) dismissFollowUpSource(source);
    onClose();
  }

  // [Task #404] 첫 번째 메뉴 — 공고문/보고서/기안서 통합 문서 작성 모달을 띄운다.
  //   기존처럼 /approvals/create 로 이동하지 않으므로 화이트아웃이 발생하지 않는다.
  function handleOpenDoc() {
    if (!source) return;
    setDocOpen(true);
  }

  // 문서 작성 모달이 닫히면 출처를 dismiss 하고 후속조치 팝업도 함께 닫는다.
  function handleDocClose() {
    setDocOpen(false);
    if (source) dismissFollowUpSource(source);
    onClose();
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
    {/* [Task #404] 필수/제안업무 처리완료에서 사용하는 동일한 문서 작성 모달.
        후속조치 출처 정보(제목, 발생일자, 사업장명, 작성자)를 그대로 매핑하고
        본문 템플릿(initialBodies)에 감지 키워드·원문 요약을 채워 보여준다. */}
    <CompletionNotice
      key={`followup-doc:${sourceKey(source)}`}
      open={docOpen}
      onOpenChange={(v) => {
        if (!v) handleDocClose();
        else setDocOpen(true);
      }}
      alertTitle={source.title}
      alertMessage={detection.snippet}
      completedDate={source.occurredAt}
      notes={null}
      buildingName={building?.name}
      officeContact={
        building?.managementOfficePhone
          ? `관리사무소 ☎ ${building.managementOfficePhone}`
          : undefined
      }
      logoUrl={building?.logoUrl ?? null}
      authorName={user?.name ?? null}
      initialDocKind="notice"
      initialBodies={docInitialBodies}
    />
    <Dialog open={open && !scheduleOpen && !docOpen} onOpenChange={(v) => !v && handleDismiss()}>
      <DialogContent className="max-w-md" data-testid="follow-up-suggestion-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-amber-600" />
            {source.type === "monthly_journal"
              ? "이번 달 후속 조치 리마인드"
              : "후속 조치가 필요해 보여요"}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {source.type === "monthly_journal"
              ? "이번 달 메모/일보/주보에서 아직 처리되지 않은 후속조치 키워드가 모였습니다. 지금 정리해보시겠어요?"
              : "해당 업무는 후속조치가 필요해보여요. 문서로 작성하시거나 견적을 받아보시겠어요?"}
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
          <Button onClick={handleOpenDoc} className="w-full" data-testid="follow-up-go-doc">
            <FileText className="w-4 h-4 mr-1" />
            공고문 보고서 기안서 등 문서로 작성하기
          </Button>
          <Button
            onClick={handleRfq}
            variant="outline"
            className="w-full"
            data-testid="follow-up-go-rfq"
          >
            <ClipboardList className="w-4 h-4 mr-1" />
            파트너사 비교견적받기
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
