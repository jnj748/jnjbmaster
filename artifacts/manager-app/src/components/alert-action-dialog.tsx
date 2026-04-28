// [Task #413] /dashboard/alerts 와 시설관리 "필수업무"/"제안업무" 페이지가 공유하는
//   알림 처리 다이얼로그(처리완료 / 연기 / 견적요청). 처리 후 결과로 띄우는
//   CompletionNotice / RfqRequestDocument 도 함께 캡슐화한다.
//
//   호출 측은 selectedAlert 상태와 onClose 만 관리하면 된다. onProcessed 로 자체
//   알림 목록 쿼리도 추가 invalidate 가능. 다른 페이지에서도 동일 동작을 보장하기
//   위해 dashboard-manager-legacy 의 인라인 구현을 그대로 옮겨왔다.

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  useCreateAlertAction,
  useCreateRfq,
  useListBuildingNoticeTemplates,
  type BuildingNoticeTemplate,
  getGetDashboardAlertsQueryKey,
  getListRfqsQueryKey,
  type CreateRfqBody,
  type CreateRfqBodyCategory,
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
  FileText,
} from "lucide-react";
import { PhotoUploadField } from "@/components/photo-upload-field";
import { MemoInputFooter } from "@/components/memo-input-footer";
import { CompletionNotice } from "@/components/completion-notice";
import { RfqRequestDocument, type RfqDocumentData } from "@/components/rfq-request-document";
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
  const [rfqTitle, setRfqTitle] = useState("");
  const [rfqDeadline, setRfqDeadline] = useState("");
  const [closeUpPhotoUrl, setCloseUpPhotoUrl] = useState<string | null>(null);
  const [widePhotoUrl, setWidePhotoUrl] = useState<string | null>(null);
  const [rfqCloseUpPhotoUrl, setRfqCloseUpPhotoUrl] = useState<string | null>(null);
  const [rfqWidePhotoUrl, setRfqWidePhotoUrl] = useState<string | null>(null);
  const [delayReason, setDelayReason] = useState("");
  const [delayReasonDetail, setDelayReasonDetail] = useState("");

  const [showCompletionNotice, setShowCompletionNotice] = useState(false);
  const [completionNoticeData, setCompletionNoticeData] = useState<{
    alertTitle: string;
    alertMessage: string;
    completedDate: string;
    notes: string | null;
    closeUpPhotoUrl: string | null;
    widePhotoUrl: string | null;
    templateBody?: string;
    initialDocKind?: "notice" | "report" | "draft";
  } | null>(null);
  const [showRfqDocument, setShowRfqDocument] = useState(false);
  const [rfqDocumentData, setRfqDocumentData] = useState<RfqDocumentData | null>(null);

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createActionMutation = useCreateAlertAction();
  const createRfqMutation = useCreateRfq();
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
    setRfqTitle(alert.title);
    const twoWeeks = new Date();
    twoWeeks.setDate(twoWeeks.getDate() + 14);
    setRfqDeadline(twoWeeks.toISOString().split("T")[0]);
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
    setRfqCloseUpPhotoUrl(null);
    setRfqWidePhotoUrl(null);
    setDelayReason("");
    setDelayReasonDetail("");
  }, [alert]);

  function invalidateAfterAction() {
    queryClient.invalidateQueries({ queryKey: getGetDashboardAlertsQueryKey() });
    onProcessed?.();
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

    let templateBody: string | undefined;
    let initialDocKind: "notice" | "report" | "draft" | undefined;
    if (alert.type === "notice_posting" && alert.relatedId) {
      const tpl = noticeTemplates.find((t) => t.id === alert.relatedId);
      if (tpl) {
        const replaced = tpl.bodyHtml
          .replace(/\{\{buildingName\}\}/g, building?.name ?? "")
          .replace(/\{\{addressFull\}\}/g, building?.addressFull ?? "")
          .replace(/\{\{managementOfficePhone\}\}/g, building?.managementOfficePhone ?? "")
          .replace(/\{\{feeInquiryPhone\}\}/g, building?.feeInquiryPhone ?? "")
          .replace(/\{\{facilitySafetyPhone\}\}/g, building?.facilitySafetyPhone ?? "")
          .replace(/\{\{date\}\}/g, completeDate)
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
        templateBody = text;
        initialDocKind = tpl.requiresReport ? "report" : "notice";
      }
    }
    setCompletionNoticeData({
      alertTitle: alert.title,
      alertMessage: alert.message,
      completedDate: completeDate,
      notes: actionNotes || null,
      closeUpPhotoUrl,
      widePhotoUrl,
      templateBody,
      initialDocKind,
    });
    onClose();
    setShowCompletionNotice(true);
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
    await createActionMutation.mutateAsync({
      data: {
        alertType: alert.type,
        relatedEntityType: getEntityType(alert.type),
        relatedEntityId: alert.relatedId!,
        actionType: "postponed",
        postponeDays: parseInt(postponeDays) || null,
        postponeReason: postponeReason || null,
        notes: actionNotes || null,
      },
    });
    invalidateAfterAction();
    toast({ title: "일정이 연기되었습니다" });
    onClose();
  }

  async function handleRfqRequest() {
    if (!alert) return;
    if (!rfqTitle.trim()) {
      toast({ title: "견적 요청 제목을 입력해주세요", variant: "destructive" });
      return;
    }
    if (!rfqDeadline) {
      toast({ title: "견적 마감일을 선택해주세요", variant: "destructive" });
      return;
    }
    const catMap: Record<string, string> = {
      inspection_due: "elevator",
    };
    const rfqData: CreateRfqBody = {
      title: rfqTitle,
      category: (catMap[alert.type] || "other") as CreateRfqBodyCategory,
      buildingName: building?.name || "관리 건물",
      deadline: rfqDeadline,
      description: `${alert.title} - ${alert.message}`,
      sido: building?.sido || null,
      sigungu: building?.sigungu || null,
      geoScope: building?.sido
        ? (building?.sigungu ? "sigungu" : "sido")
        : null,
      closeUpPhotoUrl: rfqCloseUpPhotoUrl || null,
      widePhotoUrl: rfqWidePhotoUrl || null,
    };
    const createdRfq = await createRfqMutation.mutateAsync({ data: rfqData });

    await createActionMutation.mutateAsync({
      data: {
        alertType: alert.type,
        relatedEntityType: getEntityType(alert.type),
        relatedEntityId: alert.relatedId!,
        actionType: "rfq_requested",
        rfqId: createdRfq?.id ?? null,
        notes: `견적 요청 생성: ${rfqTitle}`,
        closeUpPhotoUrl: rfqCloseUpPhotoUrl || null,
        widePhotoUrl: rfqWidePhotoUrl || null,
      },
    });
    invalidateAfterAction();
    queryClient.invalidateQueries({ queryKey: getListRfqsQueryKey() });
    toast({ title: "견적 요청이 생성되었습니다" });
    setRfqDocumentData({
      ...rfqData,
      title: rfqData.title ?? "",
      createdAt: new Date().toISOString(),
    });
    onClose();
    setShowRfqDocument(true);
  }

  return (
    <>
      <ResponsiveDialog open={!!alert} onOpenChange={(o) => { if (!o) onClose(); }}>
        <ResponsiveDialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>알림 처리</ResponsiveDialogTitle>
          </ResponsiveDialogHeader>

          {alert && (
            <div className="space-y-4">
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

              <div className="flex gap-1 border-b">
                {[
                  { key: "complete" as AlertActionTab, label: "처리완료", icon: CheckCircle },
                  { key: "postpone" as AlertActionTab, label: "연기", icon: CalendarClock },
                  ...(["inspection_due", "task_overdue", "warranty_expiry"].includes(alert.type) ? [{ key: "rfq" as AlertActionTab, label: "견적요청", icon: FileText }] : []),
                ].map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setActionTab(tab.key)}
                    className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
                      actionTab === tab.key
                        ? "border-primary text-primary"
                        : "border-transparent text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <tab.icon className="w-3.5 h-3.5" />
                    {tab.label}
                  </button>
                ))}
              </div>

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

              {actionTab === "rfq" && (
                <div className="space-y-3">
                  <div>
                    <Label>견적 요청 제목</Label>
                    <Input
                      value={rfqTitle}
                      onChange={(e) => setRfqTitle(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>견적 마감일</Label>
                    <Input
                      type="date"
                      value={rfqDeadline}
                      onChange={(e) => setRfqDeadline(e.target.value)}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <PhotoUploadField label="근경 사진" value={rfqCloseUpPhotoUrl} onChange={setRfqCloseUpPhotoUrl} />
                    <PhotoUploadField label="원경 사진" value={rfqWidePhotoUrl} onChange={setRfqWidePhotoUrl} />
                  </div>
                  <div>
                    <Label>메모</Label>
                    <Textarea
                      value={actionNotes}
                      onChange={(e) => setActionNotes(e.target.value)}
                      placeholder="견적 요청 시 참고사항"
                      data-testid="alert-rfq-memo"
                    />
                    <MemoInputFooter
                      testId="alert-rfq-memo"
                      onInsert={(text) =>
                        setActionNotes((prev) =>
                          prev ? `${prev}${prev.endsWith("\n") ? "" : "\n"}${text}` : text,
                        )
                      }
                    />
                  </div>
                  <Button className="w-full" variant="default" onClick={handleRfqRequest} disabled={createActionMutation.isPending || createRfqMutation.isPending}>
                    <FileText className="w-4 h-4 mr-2" />
                    {createActionMutation.isPending || createRfqMutation.isPending ? "처리 중..." : "견적 요청 생성"}
                  </Button>
                </div>
              )}
            </div>
          )}
        </ResponsiveDialogContent>
      </ResponsiveDialog>

      {completionNoticeData && (
        <CompletionNotice
          key={`cn:${completionNoticeData.alertTitle}:${completionNoticeData.initialDocKind ?? "notice"}`}
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
        />
      )}

      {rfqDocumentData && (
        <RfqRequestDocument
          open={showRfqDocument}
          onOpenChange={setShowRfqDocument}
          rfq={rfqDocumentData}
          officeContact={building?.managementOfficePhone ? `관리사무소 ☎ ${building.managementOfficePhone}` : undefined}
          logoUrl={building?.logoUrl ?? null}
        />
      )}
    </>
  );
}
