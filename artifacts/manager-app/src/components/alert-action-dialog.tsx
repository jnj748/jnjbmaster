// [Task #413] /dashboard/alerts 와 시설관리 "필수업무"/"제안업무" 페이지가 공유하는
//   알림 처리 다이얼로그. 처리 후 결과로 띄우는 CompletionNotice 도 함께 캡슐화한다.
//
//   [Task #511] 4개 탭 [처리완료, 처리예정, 연기, 비교견적] 을 알림 유형에 관계없이
//     동일하게 노출한다. 비교견적 탭은 인라인 RFQ 작성 폼을 제거하고 /rfqs?prefill=1
//     로 네비게이트하는 단일 버튼으로 대체했다. 처리예정 탭은 신규 추가된 액션으로,
//     예정일·메모를 저장하면 카드 우측에 노란/빨간 D-N 라벨이 표시되고 알림 자체는
//     유지된다(예정일이 지나면 자동으로 빨간 "예정일 N일 경과" 라벨로 전환).
//
//   호출 측은 selectedAlert 상태와 onClose 만 관리하면 된다. onProcessed 로 자체
//   알림 목록 쿼리도 추가 invalidate 가능. 다른 페이지에서도 동일 동작을 보장하기
//   위해 dashboard-manager-legacy 의 인라인 구현을 그대로 옮겨왔다.

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  useCreateAlertAction,
  useListBuildingNoticeTemplates,
  type BuildingNoticeTemplate,
  getGetDashboardAlertsQueryKey,
} from "@workspace/api-client-react";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@/components/ui/responsive-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertTriangle,
  CheckCircle,
  CalendarClock,
  CalendarDays,
  CalendarCheck,
  FileText,
} from "lucide-react";
import { PhotoUploadField } from "@/components/photo-upload-field";
import { MemoInputFooter } from "@/components/memo-input-footer";
import { CompletionNotice } from "@/components/completion-notice";
import { useToast } from "@/hooks/use-toast";
import {
  type DashboardAlert,
  type AlertActionTab,
  getDdayLabel,
  getEntityType,
} from "@/lib/alert-utils";

interface BuildingLike {
  name?: string | null;
  addressFull?: string | null;
  managementOfficePhone?: string | null;
  feeInquiryPhone?: string | null;
  facilitySafetyPhone?: string | null;
  logoUrl?: string | null;
  sido?: string | null;
  sigungu?: string | null;
}

interface UserLike {
  name?: string | null;
}

export interface AlertActionDialogProps {
  alert: DashboardAlert | null;
  onClose: () => void;
  building?: BuildingLike | null;
  user?: UserLike | null;
  // 처리 성공시 호출 — 호출측이 자체 알림 목록 쿼리(예: facility/mandatory-tasks)
  // 를 invalidate 할 수 있도록 콜백으로 노출. 대시보드 알림은 자동 invalidate.
  onProcessed?: () => void;
}

export function AlertActionDialog({
  alert,
  onClose,
  building,
  user,
  onProcessed,
}: AlertActionDialogProps) {
  const [actionTab, setActionTab] = useState<AlertActionTab>("complete");
  const [completeDate, setCompleteDate] = useState(
    new Date().toISOString().split("T")[0],
  );
  const [nextCycleDate, setNextCycleDate] = useState("");
  const [postponeDays, setPostponeDays] = useState("7");
  const [postponeReason, setPostponeReason] = useState("");
  const [actionNotes, setActionNotes] = useState("");
  // [Task #511] 처리예정 탭 전용 상태. scheduledDate 는 기본 today+3, scheduledNotes
  //   는 사용자가 입력한 메모. 같은 알림을 다시 열면 서버에 저장된 alert.scheduledDate /
  //   alert.scheduledNotes 로 prefill 한다.
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledNotes, setScheduledNotes] = useState("");
  const [closeUpPhotoUrl, setCloseUpPhotoUrl] = useState<string | null>(null);
  const [widePhotoUrl, setWidePhotoUrl] = useState<string | null>(null);
  const [delayReason, setDelayReason] = useState("");
  const [delayReasonDetail, setDelayReasonDetail] = useState("");
  // [Task #582] "날짜변경" 위저드 — 사용자가 "이 업무를 마지막으로 처리한 날짜" 를
  //   입력하면 그 날짜 + 주기 만큼 더한 시점이 다음 기일이 된다. 모달은 두 단계
  //   안내(이유 설명 → 날짜 입력)로 진행하지만 단일 화면에 함께 노출한다.
  const [dateCorrectionLastDate, setDateCorrectionLastDate] = useState("");
  const [dateCorrectionNotes, setDateCorrectionNotes] = useState("");

  const [showCompletionNotice, setShowCompletionNotice] = useState(false);
  const [completionNoticeData, setCompletionNoticeData] = useState<{
    alertTitle: string;
    alertMessage: string;
    // [Task #553] 액션 기준일. completed=완료일, scheduled=예정일, postponed=새 예정일.
    completedDate: string;
    notes: string | null;
    closeUpPhotoUrl: string | null;
    widePhotoUrl: string | null;
    templateBody?: string;
    initialDocKind?: "notice" | "report" | "draft";
    // [Task #553] 액션 컨텍스트 — 헤더 라벨/기본 본문/표 라벨에 반영된다.
    actionKind?: "completed" | "scheduled" | "postponed";
    scheduledMeta?: { notes?: string | null };
    postponedMeta?: { days?: number | null; reason?: string | null; notes?: string | null };
  } | null>(null);

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createActionMutation = useCreateAlertAction();
  const [, navigate] = useLocation();

  const { data: noticeTemplatesData } = useListBuildingNoticeTemplates();
  const noticeTemplates: BuildingNoticeTemplate[] = noticeTemplatesData?.templates ?? [];

  // 알림이 바뀔 때마다 폼 상태 초기화 — openAlertAction 의 resetting 동작.
  useEffect(() => {
    if (!alert) return;
    setActionTab("complete");
    const todayStr = new Date().toISOString().split("T")[0];
    setCompleteDate(todayStr);
    setPostponeDays("7");
    setPostponeReason("");
    setActionNotes("");
    // [Task #511] 같은 알림에 처리예정 액션이 이미 있으면 그 값을 prefill 한다.
    //   - alert.scheduledDate 가 있으면 그대로, 없으면 today+3.
    //   - alert.scheduledNotes 가 있으면 그대로, 없으면 빈 문자열.
    const defaultScheduled = new Date(todayStr);
    defaultScheduled.setDate(defaultScheduled.getDate() + 3);
    setScheduledDate(alert.scheduledDate ?? defaultScheduled.toISOString().split("T")[0]);
    setScheduledNotes(alert.scheduledNotes ?? "");
    let prefilledNextCycle = "";
    if (alert.type === "inspection_due") {
      const base = new Date(todayStr);
      if (alert.cycleMonths) {
        base.setMonth(base.getMonth() + alert.cycleMonths);
      } else if (alert.intervalDays) {
        base.setDate(base.getDate() + alert.intervalDays);
      } else {
        base.setMonth(base.getMonth() + 6);
      }
      prefilledNextCycle = base.toISOString().split("T")[0];
    }
    setNextCycleDate(prefilledNextCycle);
    setCloseUpPhotoUrl(null);
    setWidePhotoUrl(null);
    setDelayReason("");
    setDelayReasonDetail("");
    // [Task #582] 날짜변경 폼 초기화. 마지막 처리일 기본값은 비워 둠 — 사용자가
    //   실제로 처리한 날짜를 떠올려 입력해야 의미가 있으므로 자동 prefill 하지 않는다.
    setDateCorrectionLastDate("");
    setDateCorrectionNotes("");
  }, [alert]);

  function invalidateAfterAction() {
    queryClient.invalidateQueries({ queryKey: getGetDashboardAlertsQueryKey() });
    onProcessed?.();
  }

  // [Task #553] 공지 템플릿(`notice_posting`) 의 토큰 치환을 처리완료/처리예정/연기
  //   세 흐름에서 공통으로 사용. `referenceDate` 가 `{{date}}` 자리에 들어간다.
  //   알림이 공지 템플릿에 연결돼 있지 않으면 undefined 를 반환한다.
  function buildNoticeTemplatePrefill(
    a: DashboardAlert | null,
    referenceDate: string,
  ): { templateBody?: string; initialDocKind?: "notice" | "report" | "draft" } {
    if (!a || a.type !== "notice_posting" || !a.relatedId) return {};
    const tpl = noticeTemplates.find((t) => t.id === a.relatedId);
    if (!tpl) return {};
    const replaced = tpl.bodyHtml
      .replace(/\{\{buildingName\}\}/g, building?.name ?? "")
      .replace(/\{\{addressFull\}\}/g, building?.addressFull ?? "")
      .replace(/\{\{managementOfficePhone\}\}/g, building?.managementOfficePhone ?? "")
      .replace(/\{\{feeInquiryPhone\}\}/g, building?.feeInquiryPhone ?? "")
      .replace(/\{\{facilitySafetyPhone\}\}/g, building?.facilitySafetyPhone ?? "")
      .replace(/\{\{date\}\}/g, referenceDate)
      .replace(/\{\{customA\}\}/g, "")
      .replace(/\{\{customB\}\}/g, "")
      .replace(/\{\{customC\}\}/g, "");
    const text = replaced
      .replace(/<br\s*\/?\s*>/gi, "\n")
      .replace(/<\/p>/gi, "\n\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    return {
      templateBody: text,
      initialDocKind: tpl.requiresReport ? "report" : "notice",
    };
  }

  async function handleComplete() {
    if (!alert) return;
    if (!completeDate) {
      toast({ title: "완료일을 입력해주세요", variant: "destructive" });
      return;
    }
    const isOverdue = alert.dueDate && getDdayLabel(alert.dueDate).isOverdue;
    if (isOverdue && !delayReason) {
      toast({ title: "기한 초과 항목입니다. 지연 사유를 선택해주세요", variant: "destructive" });
      return;
    }
    if (isOverdue && delayReason === "기타" && !delayReasonDetail.trim()) {
      toast({ title: "지연 사유의 상세 내용을 입력해주세요", variant: "destructive" });
      return;
    }
    await createActionMutation.mutateAsync({
      data: {
        alertType: alert.type,
        relatedEntityType: getEntityType(alert.type),
        relatedEntityId: alert.relatedId!,
        actionType: "completed",
        completedDate: completeDate || null,
        nextCycleDate: nextCycleDate || null,
        notes: actionNotes || null,
        closeUpPhotoUrl: closeUpPhotoUrl || null,
        widePhotoUrl: widePhotoUrl || null,
        delayReason: isOverdue && delayReason ? delayReason : null,
        delayReasonDetail: isOverdue && delayReasonDetail ? delayReasonDetail : null,
      },
    });
    invalidateAfterAction();
    toast({ title: "처리 완료되었습니다" });

    const { templateBody, initialDocKind } = buildNoticeTemplatePrefill(alert, completeDate);
    setCompletionNoticeData({
      alertTitle: alert.title,
      alertMessage: alert.message,
      completedDate: completeDate,
      notes: actionNotes || null,
      closeUpPhotoUrl,
      widePhotoUrl,
      templateBody,
      initialDocKind,
      actionKind: "completed",
    });
    onClose();
    setShowCompletionNotice(true);
  }

  // [Task #553] 연기 일수만큼 더해 "변경 예정일" 을 계산. 기존 dueDate 가 있으면
  //   그 위에 더하고, 없으면 오늘 기준으로 더한다(YYYY-MM-DD 문자열 반환).
  function computePostponedReferenceDate(
    a: DashboardAlert,
    days: number,
  ): string {
    const base = a.dueDate
      ? new Date(a.dueDate)
      : new Date(new Date().toISOString().split("T")[0]);
    if (Number.isNaN(base.getTime())) {
      return new Date().toISOString().split("T")[0];
    }
    base.setDate(base.getDate() + days);
    return base.toISOString().split("T")[0];
  }

  async function handlePostpone() {
    if (!alert) return;
    if (!postponeDays) {
      toast({ title: "연기 일수를 선택해주세요", variant: "destructive" });
      return;
    }
    if (!postponeReason) {
      toast({ title: "연기 사유를 선택해주세요", variant: "destructive" });
      return;
    }
    const daysNum = parseInt(postponeDays) || 0;
    await createActionMutation.mutateAsync({
      data: {
        alertType: alert.type,
        relatedEntityType: getEntityType(alert.type),
        relatedEntityId: alert.relatedId!,
        actionType: "postponed",
        postponeDays: daysNum || null,
        postponeReason: postponeReason || null,
        notes: actionNotes || null,
      },
    });
    invalidateAfterAction();
    toast({ title: "일정이 연기되었습니다" });

    // [Task #553] 연기 액션도 처리완료와 동일하게 문서생성 모달을 띄운다.
    //   기준일 = dueDate(또는 오늘) + 연기 일수.
    const refDate = computePostponedReferenceDate(alert, daysNum);
    const { templateBody, initialDocKind } = buildNoticeTemplatePrefill(alert, refDate);
    setCompletionNoticeData({
      alertTitle: alert.title,
      alertMessage: alert.message,
      completedDate: refDate,
      notes: actionNotes || null,
      closeUpPhotoUrl: null,
      widePhotoUrl: null,
      templateBody,
      initialDocKind,
      actionKind: "postponed",
      postponedMeta: {
        days: daysNum || null,
        reason: postponeReason || null,
        notes: actionNotes || null,
      },
    });
    onClose();
    setShowCompletionNotice(true);
  }

  // [Task #511] 처리예정 액션 저장. 같은 알림에 대해 다시 누르면 새 액션이
  //   가장 최근 액션으로 덮어써져 D-N 라벨이 갱신된다(서버는 latest action 만 사용).
  async function handleScheduled() {
    if (!alert) return;
    if (!scheduledDate) {
      toast({ title: "예정일을 선택해주세요", variant: "destructive" });
      return;
    }
    await createActionMutation.mutateAsync({
      data: {
        alertType: alert.type,
        relatedEntityType: getEntityType(alert.type),
        relatedEntityId: alert.relatedId!,
        actionType: "scheduled",
        scheduledDate,
        notes: scheduledNotes || null,
      },
    });
    invalidateAfterAction();
    toast({ title: "처리예정이 등록되었습니다" });

    // [Task #553] 처리예정 액션도 처리완료와 동일하게 문서생성 모달을 띄운다.
    //   기준일 = 예정일, 본문/표/공지 템플릿 토큰 치환 모두 예정일 기준으로 동작.
    const { templateBody, initialDocKind } = buildNoticeTemplatePrefill(alert, scheduledDate);
    setCompletionNoticeData({
      alertTitle: alert.title,
      alertMessage: alert.message,
      completedDate: scheduledDate,
      notes: scheduledNotes || null,
      closeUpPhotoUrl: null,
      widePhotoUrl: null,
      templateBody,
      initialDocKind,
      actionKind: "scheduled",
      scheduledMeta: {
        notes: scheduledNotes || null,
      },
    });
    onClose();
    setShowCompletionNotice(true);
  }

  // [Task #582] "날짜변경" 액션 — 사용자가 입력한 "최근 처리한 날짜"를
  //   alert_actions.completedDate 자리에 baseline 으로 저장한다. 서버는
  //   actionType="date_corrected" 를 인식해 이 baseline 을 다음 회차 due 산출의
  //   기준점으로 사용한다(computeNextDueDateFromBaseline). UI 측에선 처리완료/연기와
  //   달리 후속 문서 생성 모달을 띄우지 않고 토스트로만 결과를 알린다.
  async function handleDateCorrection() {
    if (!alert) return;
    if (!dateCorrectionLastDate) {
      toast({ title: "최근 처리한 날짜를 입력해주세요", variant: "destructive" });
      return;
    }
    const todayStr = new Date().toISOString().split("T")[0];
    if (dateCorrectionLastDate > todayStr) {
      toast({ title: "오늘 이후 날짜는 입력할 수 없습니다", variant: "destructive" });
      return;
    }
    try {
      await createActionMutation.mutateAsync({
        data: {
          alertType: alert.type,
          relatedEntityType: getEntityType(alert.type),
          relatedEntityId: alert.relatedId!,
          actionType: "date_corrected",
          completedDate: dateCorrectionLastDate,
          notes: dateCorrectionNotes || null,
        },
      });
    } catch (err) {
      toast({
        title: "날짜 정정에 실패했습니다",
        description: err instanceof Error ? err.message : "잠시 후 다시 시도해주세요",
        variant: "destructive",
      });
      return;
    }
    invalidateAfterAction();
    toast({
      title: "다음 기일이 자동으로 재계산되었습니다",
      description: `최근 처리일(${dateCorrectionLastDate}) 기준으로 다음 회차 기일이 알림 카드에 반영됩니다.`,
    });
    onClose();
  }

  // [Task #511] 인라인 RFQ 작성 폼 대신 /rfqs?prefill=1 로 네비게이트한다.
  //   /rfqs 페이지의 prefill 효과가 모달을 자동으로 열고 카테고리·제목·사진을 채운다.
  //
  //   네비게이트 직전에 actionType="rfq_requested" 액션을 먼저 기록한다. 사용자가
  //   RFQ 작성을 중도 포기하더라도 알림은 "비교견적 진행 중" 상태로 전환되어
  //   대시보드에서 미처리 항목으로 다시 노출되지 않는다(과거 인라인 폼이 이 역할을
  //   했었다 — Task #511 에서 폼 자체를 제거하면서 동일 보장이 필요).
  async function handleOpenRfqPage() {
    if (!alert) return;
    try {
      await createActionMutation.mutateAsync({
        data: {
          alertType: alert.type,
          relatedEntityType: getEntityType(alert.type),
          relatedEntityId: alert.relatedId ?? alert.id,
          actionType: "rfq_requested",
          notes: null,
        },
      });
    } catch (err) {
      toast({
        title: "비교견적 요청 기록에 실패했습니다",
        description: err instanceof Error ? err.message : "잠시 후 다시 시도해주세요",
        variant: "destructive",
      });
      return;
    }
    invalidateAfterAction();
    const catMap: Record<string, string> = {
      inspection_due: "elevator",
    };
    const params = new URLSearchParams();
    params.set("prefill", "1");
    params.set("title", alert.title);
    params.set("category", catMap[alert.type] ?? "other");
    // [Task #511] 비교견적 사진 prefill 은 (1) 알림에 첨부된 사진(=가장 최근 액션의
    //   첨부) 을 우선하고, 없으면 (2) 모달의 처리완료 탭에서 사용자가 막 업로드한
    //   로컬 상태를 사용한다. 둘 다 없으면 사진 없이 이동.
    const prefillCloseUp = alert.closeUpPhotoUrl ?? closeUpPhotoUrl;
    const prefillWide = alert.widePhotoUrl ?? widePhotoUrl;
    if (prefillCloseUp) params.set("closeUpPhoto", prefillCloseUp);
    if (prefillWide) params.set("widePhoto", prefillWide);
    onClose();
    navigate(`/rfqs?${params.toString()}`);
  }

  return (
    <>
      <ResponsiveDialog open={!!alert} onOpenChange={(o) => { if (!o) onClose(); }}>
        <ResponsiveDialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>알림 처리</ResponsiveDialogTitle>
          </ResponsiveDialogHeader>

          {alert && (
            // [Task #606] min-w-0 + break-words 로 안내문/알림 메시지 등 긴 한국어
            // 문장이나 grid/flex 자식이 부모(DialogContent.max-w-lg) 폭을 강제로
            // 넘기지 않도록 한다. (DialogContent 의 overflow-x-hidden 과 함께 작동.)
            <div className="space-y-4 min-w-0 break-words">
              <div className="p-3 bg-muted rounded-lg text-sm space-y-1">
                <p className="font-medium">{alert.title}</p>
                <p className="text-muted-foreground text-xs">{alert.message}</p>
              </div>

              {(alert.type === "task_template_mandatory" ||
                alert.type === "task_template_suggested") &&
                alert.noticeTemplateId != null && (
                  <Button
                    type="button"
                    variant="secondary"
                    className="w-full"
                    data-testid="btn-open-notice-template"
                    onClick={() => {
                      const id = alert.noticeTemplateId;
                      onClose();
                      navigate(`/notices/templates?templateId=${id}`);
                    }}
                  >
                    <FileText className="w-4 h-4 mr-2" />
                    공고문 작성
                  </Button>
                )}

              {/* [Task #511] 알림 유형에 관계없이 항상 [처리완료, 처리예정, 연기, 비교견적]
                  4개 탭 순서로 노출. 비교견적 탭은 인라인 폼 대신 /rfqs 로 이동.
                  [Task #582] 필수업무·제안업무(task_template_*) 알림에서는 "날짜변경"
                  탭을 추가로 노출 — 시스템 제안 기일이 실제와 다를 때 정정용.
                  [Task #606] 5개 탭이 들어와도 가로 스크롤이 생기지 않도록 grid 로
                  균등 분할한다. 좁은 모바일(약 320px) 에서도 끼이지 않도록 아이콘 위·
                  라벨 아래로 세로 스택하고, sm 이상에서 아이콘 옆에 라벨을 둔다. */}
              {(() => {
                const visibleTabs = ([
                  { key: "complete" as AlertActionTab, label: "처리완료", icon: CheckCircle, testId: "tab-complete", show: true },
                  { key: "scheduled" as AlertActionTab, label: "처리예정", icon: CalendarDays, testId: "tab-scheduled", show: true },
                  { key: "postpone" as AlertActionTab, label: "연기", icon: CalendarClock, testId: "tab-postpone", show: true },
                  { key: "rfq" as AlertActionTab, label: "비교견적", icon: FileText, testId: "tab-rfq", show: true },
                  {
                    key: "date-correct" as AlertActionTab,
                    label: "날짜변경",
                    icon: CalendarCheck,
                    testId: "tab-date-correct",
                    show:
                      alert.type === "task_template_mandatory" ||
                      alert.type === "task_template_suggested",
                  },
                ] as const).filter((tab) => tab.show);
                // 정적 클래스 문자열을 사용해 Tailwind 가 안전하게 keep 하도록 한다.
                const gridColsClass =
                  visibleTabs.length === 5 ? "grid-cols-5" : "grid-cols-4";
                return (
                  <div className={`grid ${gridColsClass} border-b`}>
                    {visibleTabs.map((tab) => (
                      <button
                        key={tab.key}
                        onClick={() => setActionTab(tab.key)}
                        data-testid={tab.testId}
                        className={`min-w-0 flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1.5 px-1 sm:px-2 py-2 text-[11px] sm:text-sm font-medium border-b-2 transition-colors leading-tight ${
                          actionTab === tab.key
                            ? "border-primary text-primary"
                            : "border-transparent text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        <tab.icon className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate max-w-full">{tab.label}</span>
                      </button>
                    ))}
                  </div>
                );
              })()}

              {actionTab === "complete" && (() => {
                const isOverdue = alert.dueDate && getDdayLabel(alert.dueDate).isOverdue;
                return (
                <div className="space-y-3">
                  {isOverdue && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3 space-y-2">
                      <p className="text-sm font-semibold text-red-800 flex items-center gap-1.5">
                        <AlertTriangle className="w-4 h-4" />
                        기한 초과 항목 — 지연 사유를 기록해주세요
                      </p>
                      {alert.penaltyInfo && (
                        <p className="text-xs text-red-600">⚠ {alert.penaltyInfo}</p>
                      )}
                      <div>
                        <Label className="text-xs">지연 사유</Label>
                        <Select value={delayReason || undefined} onValueChange={setDelayReason}>
                          <SelectTrigger><SelectValue placeholder="사유 선택" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="업체 일정 미확보">업체 일정 미확보</SelectItem>
                            <SelectItem value="예산 미확보">예산 미확보</SelectItem>
                            <SelectItem value="우천/기상 악화">우천/기상 악화</SelectItem>
                            <SelectItem value="자재 미입고">자재 미입고</SelectItem>
                            <SelectItem value="관리주체 일정 미조율">관리주체 일정 미조율</SelectItem>
                            <SelectItem value="코로나/감염병 대응">코로나/감염병 대응</SelectItem>
                            <SelectItem value="인력 부족">인력 부족</SelectItem>
                            <SelectItem value="기타">기타</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {delayReason === "기타" && (
                        <div>
                          <Label className="text-xs">상세 사유</Label>
                          <Input
                            value={delayReasonDetail}
                            onChange={(e) => setDelayReasonDetail(e.target.value)}
                            placeholder="구체적인 지연 사유를 입력하세요"
                          />
                        </div>
                      )}
                    </div>
                  )}
                  <div>
                    <Label>완료일</Label>
                    <Input
                      type="date"
                      value={completeDate}
                      onChange={(e) => setCompleteDate(e.target.value)}
                    />
                  </div>
                  {alert.type === "inspection_due" && (
                    <div>
                      <Label>다음 점검 예정일</Label>
                      <Input
                        type="date"
                        value={nextCycleDate}
                        onChange={(e) => setNextCycleDate(e.target.value)}
                      />
                      <p className="text-xs mt-1">
                        다음 주기가 자동입력 되었습니다. <span className="text-blue-600 font-medium">입력</span>
                      </p>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    <PhotoUploadField label="근경 사진" value={closeUpPhotoUrl} onChange={setCloseUpPhotoUrl} />
                    <PhotoUploadField label="원경 사진" value={widePhotoUrl} onChange={setWidePhotoUrl} />
                  </div>
                  <div>
                    <Label>메모</Label>
                    <Textarea
                      value={actionNotes}
                      onChange={(e) => setActionNotes(e.target.value)}
                      placeholder="처리 내용을 기록하세요"
                      data-testid="alert-complete-memo"
                    />
                    <MemoInputFooter
                      testId="alert-complete-memo"
                      onInsert={(text) =>
                        setActionNotes((prev) =>
                          prev ? `${prev}${prev.endsWith("\n") ? "" : "\n"}${text}` : text,
                        )
                      }
                    />
                  </div>
                  <Button className="w-full" onClick={handleComplete} disabled={createActionMutation.isPending}>
                    <CheckCircle className="w-4 h-4 mr-2" />
                    {createActionMutation.isPending ? "처리 중..." : "처리완료"}
                  </Button>
                </div>
                );
              })()}

              {actionTab === "postpone" && (
                <div className="space-y-3">
                  <div>
                    <Label>연기 일수</Label>
                    <Select value={postponeDays} onValueChange={setPostponeDays}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="3">3일</SelectItem>
                        <SelectItem value="7">7일 (1주)</SelectItem>
                        <SelectItem value="14">14일 (2주)</SelectItem>
                        <SelectItem value="30">30일 (1개월)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>연기 사유</Label>
                    <Select value={postponeReason} onValueChange={setPostponeReason}>
                      <SelectTrigger><SelectValue placeholder="사유 선택" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="업체 일정 조율 중">업체 일정 조율 중</SelectItem>
                        <SelectItem value="예산 확보 대기">예산 확보 대기</SelectItem>
                        <SelectItem value="우천/기상 악화">우천/기상 악화</SelectItem>
                        <SelectItem value="자재 입고 대기">자재 입고 대기</SelectItem>
                        <SelectItem value="기타">기타</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>메모</Label>
                    <Textarea
                      value={actionNotes}
                      onChange={(e) => setActionNotes(e.target.value)}
                      placeholder="연기 관련 상세 내용"
                      data-testid="alert-postpone-memo"
                    />
                    <MemoInputFooter
                      testId="alert-postpone-memo"
                      onInsert={(text) =>
                        setActionNotes((prev) =>
                          prev ? `${prev}${prev.endsWith("\n") ? "" : "\n"}${text}` : text,
                        )
                      }
                    />
                  </div>
                  <Button className="w-full" variant="secondary" onClick={handlePostpone} disabled={createActionMutation.isPending}>
                    <CalendarClock className="w-4 h-4 mr-2" />
                    {createActionMutation.isPending ? "처리 중..." : "일정 연기"}
                  </Button>
                </div>
              )}

              {/* [Task #511] 처리예정 탭. 매니저가 정한 예정일을 저장하고 모달을 닫는다.
                  알림은 사라지지 않으며 카드 우측에 노란/빨간 D-N 라벨로 노출된다. */}
              {actionTab === "scheduled" && (
                <div className="space-y-3">
                  <div>
                    <Label>처리 예정일</Label>
                    <Input
                      type="date"
                      value={scheduledDate}
                      onChange={(e) => setScheduledDate(e.target.value)}
                      data-testid="alert-scheduled-date"
                    />
                    <p className="text-xs mt-1 text-muted-foreground">
                      이 날짜를 기준으로 카드에 D-N 라벨이 표시됩니다.
                    </p>
                  </div>
                  <div>
                    <Label>메모 (선택)</Label>
                    <Textarea
                      value={scheduledNotes}
                      onChange={(e) => setScheduledNotes(e.target.value)}
                      placeholder="언제·누가·어떻게 처리할 예정인지"
                      data-testid="alert-scheduled-memo"
                    />
                    <MemoInputFooter
                      testId="alert-scheduled-memo"
                      onInsert={(text) =>
                        setScheduledNotes((prev) =>
                          prev ? `${prev}${prev.endsWith("\n") ? "" : "\n"}${text}` : text,
                        )
                      }
                    />
                  </div>
                  <Button
                    className="w-full"
                    variant="default"
                    onClick={handleScheduled}
                    disabled={createActionMutation.isPending}
                    data-testid="btn-save-scheduled"
                  >
                    <CalendarDays className="w-4 h-4 mr-2" />
                    {createActionMutation.isPending ? "처리 중..." : "처리예정 등록"}
                  </Button>
                </div>
              )}

              {/* [Task #511] 비교견적 탭은 인라인 폼 대신 단일 버튼으로 단순화한다.
                  /rfqs 페이지에서 동일한 prefill 효과로 작성을 이어간다. */}
              {actionTab === "rfq" && (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    이 알림에서 비교견적을 요청하면 「견적의뢰」 페이지가 열리며
                    제목·카테고리가 자동으로 채워집니다.
                  </p>
                  <Button
                    className="w-full"
                    variant="default"
                    onClick={handleOpenRfqPage}
                    disabled={createActionMutation.isPending}
                    data-testid="btn-open-rfq-page"
                  >
                    <FileText className="w-4 h-4 mr-2" />
                    {createActionMutation.isPending ? "처리 중..." : "비교견적 요청하기"}
                  </Button>
                </div>
              )}

              {/* [Task #582] 날짜변경 탭 — 시스템이 제안한 법정/제안업무 기일이 실제와
                  다를 때 정정한다. "최근에 이 업무를 마지막으로 처리한 날짜" 를 입력하면
                  서버가 그 날짜 + 업무 주기 만큼 더한 시점을 다음 기일로 자동 산출한다.
                  안내 문구로 두 단계(이유 → 입력) 위저드 흐름을 보여주되 한 화면에서
                  완료하도록 구성. */}
              {actionTab === "date-correct" && (
                <div className="space-y-4">
                  <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 space-y-2 text-sm">
                    <p className="font-semibold text-blue-900 flex items-center gap-1.5">
                      <CalendarCheck className="w-4 h-4" />
                      시스템이 제안한 기일이 실제와 다른가요?
                    </p>
                    <p className="text-blue-800 text-xs leading-relaxed">
                      이 업무를 <span className="font-semibold">마지막으로 처리하신 날짜</span>를 알려주시면,
                      그 날짜를 기준으로 다음 회차 기일이 자동으로 다시 계산됩니다.
                      앞으로 이 카드는 정정된 기일로 표시됩니다.
                    </p>
                  </div>
                  <div>
                    <Label>최근 처리한 날짜</Label>
                    <Input
                      type="date"
                      value={dateCorrectionLastDate}
                      onChange={(e) => setDateCorrectionLastDate(e.target.value)}
                      max={new Date().toISOString().split("T")[0]}
                      data-testid="alert-date-correct-last"
                    />
                    <p className="text-xs mt-1 text-muted-foreground">
                      예: 작년 5월에 처리하셨다면 그 날짜를 선택해주세요.
                    </p>
                  </div>
                  <div>
                    <Label>메모 (선택)</Label>
                    <Textarea
                      value={dateCorrectionNotes}
                      onChange={(e) => setDateCorrectionNotes(e.target.value)}
                      placeholder="정정하시는 이유나 참고사항"
                      data-testid="alert-date-correct-memo"
                    />
                  </div>
                  <Button
                    className="w-full"
                    variant="default"
                    onClick={handleDateCorrection}
                    disabled={createActionMutation.isPending || !dateCorrectionLastDate}
                    data-testid="btn-save-date-correct"
                  >
                    <CalendarCheck className="w-4 h-4 mr-2" />
                    {createActionMutation.isPending ? "처리 중..." : "기일 자동 재계산"}
                  </Button>
                </div>
              )}
            </div>
          )}
        </ResponsiveDialogContent>
      </ResponsiveDialog>

      {completionNoticeData && (
        <CompletionNotice
          key={`cn:${completionNoticeData.actionKind ?? "completed"}:${completionNoticeData.alertTitle}:${completionNoticeData.initialDocKind ?? "notice"}`}
          open={showCompletionNotice}
          onOpenChange={setShowCompletionNotice}
          alertTitle={completionNoticeData.alertTitle}
          alertMessage={completionNoticeData.alertMessage}
          completedDate={completionNoticeData.completedDate}
          notes={completionNoticeData.notes}
          closeUpPhotoUrl={completionNoticeData.closeUpPhotoUrl}
          widePhotoUrl={completionNoticeData.widePhotoUrl}
          buildingName={building?.name ?? undefined}
          managementOfficePhone={building?.managementOfficePhone ?? null}
          feeInquiryPhone={building?.feeInquiryPhone ?? null}
          facilitySafetyPhone={building?.facilitySafetyPhone ?? null}
          logoUrl={building?.logoUrl ?? null}
          authorName={user?.name ?? null}
          initialDocKind={completionNoticeData.initialDocKind ?? "notice"}
          initialBodies={
            completionNoticeData.templateBody
              ? { [completionNoticeData.initialDocKind ?? "notice"]: completionNoticeData.templateBody }
              : undefined
          }
          actionKind={completionNoticeData.actionKind ?? "completed"}
          scheduledMeta={completionNoticeData.scheduledMeta}
          postponedMeta={completionNoticeData.postponedMeta}
        />
      )}

    </>
  );
}
