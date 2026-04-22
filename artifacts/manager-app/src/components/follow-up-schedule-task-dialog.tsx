// [Task #220] 후속조치 → "필수업무로 보내두기" 처리기간 선택 다이얼로그.
// 후속조치 다이얼로그와 기안서 작성 후 행동유도 흐름에서 공유한다.
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  useCreateTask,
  getListTasksQueryKey,
  getGetDashboardAlertsQueryKey,
  getGetDashboardSummaryQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  type FollowUpDetection,
  type FollowUpSource,
  SOURCE_TYPE_LABEL,
} from "@/lib/follow-up-detection";

export type FollowUpPeriod = "urgent" | "week" | "month" | "open";

const PERIOD_OPTIONS: Array<{ value: FollowUpPeriod; label: string; hint: string }> = [
  { value: "urgent", label: "긴급", hint: "오늘 마감 · 우선순위 높음" },
  { value: "week", label: "일주일 후", hint: "오늘 + 7일 마감" },
  { value: "month", label: "한달 후", hint: "오늘 + 30일 마감" },
  { value: "open", label: "기간미정", hint: "마감 없음(기한없음 라벨)" },
];

function todayKstISO(): string {
  const ms = Date.now() + 9 * 60 * 60 * 1000;
  return new Date(ms).toISOString().split("T")[0];
}

function addDaysISO(days: number): string {
  const ms = Date.now() + 9 * 60 * 60 * 1000 + days * 24 * 60 * 60 * 1000;
  return new Date(ms).toISOString().split("T")[0];
}

export function periodToTaskFields(period: FollowUpPeriod): {
  dueDate: string | null;
  priority: "high" | "medium" | "low";
} {
  switch (period) {
    case "urgent":
      return { dueDate: todayKstISO(), priority: "high" };
    case "week":
      return { dueDate: addDaysISO(7), priority: "medium" };
    case "month":
      return { dueDate: addDaysISO(30), priority: "medium" };
    case "open":
    default:
      return { dueDate: null, priority: "medium" };
  }
}

/** description 끝에 붙여 동일 출처를 식별/중복 방지에 활용한다. */
export function buildFollowUpSourceMarker(source: FollowUpSource): string {
  return `__followup_source:type=${source.type}&id=${source.id}&date=${source.occurredAt}`;
}

export function buildTaskBody(
  source: FollowUpSource,
  detection: FollowUpDetection | null,
  extraNote?: string,
): { title: string; description: string } {
  const title = `[후속조치] ${source.title}`;
  const lines: string[] = [];
  lines.push(`출처: ${SOURCE_TYPE_LABEL[source.type]} #${source.id} (${source.occurredAt})`);
  if (detection) {
    lines.push(`감지 키워드: ${detection.matched.map((m) => m.keyword).join(", ")}`);
    lines.push(`원문: ${detection.snippet}`);
  }
  if (extraNote) {
    lines.push("");
    lines.push(extraNote);
  }
  lines.push("");
  lines.push(buildFollowUpSourceMarker(source));
  return { title, description: lines.join("\n") };
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  source: FollowUpSource | null;
  detection: FollowUpDetection | null;
  /** 기안서/RFQ 등 후속 흐름에서 호출될 때 본문에 추가로 남길 메모. */
  extraNote?: string;
  onCreated?: () => void;
}

export function FollowUpScheduleTaskDialog({
  open,
  onOpenChange,
  source,
  detection,
  extraNote,
  onCreated,
}: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createTaskMutation = useCreateTask();
  const [submitting, setSubmitting] = useState<FollowUpPeriod | null>(null);

  async function handleSelect(period: FollowUpPeriod) {
    if (!source) return;
    if (submitting) return;
    setSubmitting(period);
    try {
      const { dueDate, priority } = periodToTaskFields(period);
      const { title, description } = buildTaskBody(source, detection, extraNote);
      await createTaskMutation.mutateAsync({
        data: {
          title,
          description,
          category: "other",
          priority,
          dueDate: dueDate ?? null,
        },
      });
      queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetDashboardAlertsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
      toast({ title: "필수업무로 등록되었습니다" });
      onCreated?.();
      onOpenChange(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "필수업무 등록에 실패했습니다";
      toast({ title: "등록 실패", description: msg, variant: "destructive" });
    } finally {
      setSubmitting(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-testid="follow-up-schedule-dialog">
        <DialogHeader>
          <DialogTitle>처리 기간 선택</DialogTitle>
          <DialogDescription className="text-xs">
            언제까지 처리할지 선택하면, 대시보드 필수업무현황에 1회성으로 등록됩니다.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-2">
          {PERIOD_OPTIONS.map((opt) => (
            <Button
              key={opt.value}
              variant="outline"
              disabled={!!submitting}
              onClick={() => handleSelect(opt.value)}
              className="h-auto py-3 flex flex-col items-start gap-0.5"
              data-testid={`follow-up-period-${opt.value}`}
            >
              <span className="font-semibold text-sm">{opt.label}</span>
              <span className="text-xs text-muted-foreground">{opt.hint}</span>
            </Button>
          ))}
        </div>
        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={!!submitting}
            data-testid="follow-up-period-cancel"
          >
            닫기
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
