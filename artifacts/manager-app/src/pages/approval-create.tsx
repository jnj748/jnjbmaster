import { useState, useEffect } from "react";
import {
  useListDocumentTemplates,
  useGetDocumentTemplate,
  useSaveApprovalDraft,
  useCreateApproval,
  getListApprovalsQueryKey,
  getGetApprovalStatsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/auth-context";
import { ROLE_LABELS } from "@workspace/shared/role-labels";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogFooter,
} from "@/components/ui/responsive-dialog";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { IngestionPicker, linkIngestionRef } from "@/components/documents/ingestion-picker";
import { IntermediaryDisclaimerBanner, recordConsent } from "@/components/intermediary-disclaimer";
import { FollowUpScheduleTaskDialog } from "@/components/follow-up-schedule-task-dialog";
import {
  Dialog as ConfirmDialog,
  DialogContent as ConfirmDialogContent,
  DialogDescription as ConfirmDialogDescription,
  DialogFooter as ConfirmDialogFooter,
  DialogHeader as ConfirmDialogHeader,
  DialogTitle as ConfirmDialogTitle,
} from "@/components/ui/dialog";
import type { FollowUpSource } from "@/lib/follow-up-detection";
import {
  FileText,
  Plus,
  Save,
  Send,
  Users,
  ArrowLeft,
  X,
  Zap,
  AlertCircle,
} from "lucide-react";

const categories = [
  { value: "maintenance", label: "유지보수" },
  { value: "inspection", label: "법정점검" },
  { value: "facility", label: "시설관리" },
  { value: "equipment", label: "장비" },
  { value: "other", label: "기타" },
];

const templateCategoryLabels: Record<string, string> = {
  general: "일반",
  certificate: "증명서",
  absence: "부재 일정",
  salary: "급여",
  maintenance: "유지보수",
};

interface UserRecord {
  id: number;
  name: string;
  email: string;
  role: string;
}

interface ApprovalStepInput {
  approverId: number;
  approverName: string;
  approverRole: string;
}

interface RecipientInput {
  userId: number;
  userName: string;
  type: "recipient" | "cc";
}

// 코드젠된 DocumentTemplateItem 을 단일 SoT 로 사용한다.
import type { DocumentTemplateItem as TemplateItem } from "@workspace/api-client-react";

export default function ApprovalCreate() {
  const { user, token } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const BASE = import.meta.env.BASE_URL ?? "/";
  const API_BASE = `${BASE}api`;

  const urlParams = new URLSearchParams(window.location.search);
  const draftId = urlParams.get("draftId");
  // [Task #197] 후속 조치 제안 팝업에서 prefill=1 로 진입한 경우 본문/제목/분류를 미리 채운다.
  // [Task #610] 표준 prefill 페이로드(source_kind/source_table/source_id/source_doc_id/building_id)
  const isPrefill = urlParams.get("prefill") === "1";
  const prefillTitle = urlParams.get("title") ?? "";
  const prefillBody = urlParams.get("body") ?? "";
  const prefillCategory = urlParams.get("category") ?? "";

  // [Task #610] 신규 표준 키 우선 — 없으면 구 #197 키로 폴백.
  const prefillSourceKind = urlParams.get("source_kind") ?? "";
  const prefillSourceTable = urlParams.get("source_table") ?? "";
  const prefillSourceIdNew = urlParams.get("source_id") ?? "";
  const prefillSourceDocId = urlParams.get("source_doc_id") ?? "";
  const prefillBuildingId = urlParams.get("building_id") ?? "";

  // [Task #682] RFQ 카드 등에서 추가로 채워 넣는 prefill 키.
  //   - vendor_name → 업체명, amount → 예상 금액, description → 본문 첫 문단.
  //   - source_entity_type / source_entity_id → approvals row 에 보존되어
  //     RFQ 카드의 "기안 결재 진행 중" 배지·중복 기안 방지에 쓰인다.
  const prefillVendorName = urlParams.get("vendor_name") ?? "";
  const prefillAmount = urlParams.get("amount") ?? "";
  const prefillDescription = urlParams.get("description") ?? "";
  const prefillSourceEntityType = urlParams.get("source_entity_type") ?? "";
  const prefillSourceEntityId = urlParams.get("source_entity_id") ?? "";
  // [Task #682 review-fix #2] 원본 RFQ 링크 + 첨부 사진 (JSON 직렬화 된 URL 배열).
  //   결재 화면 상단의 "원본" 패널에 표시한다.
  const prefillSourceUrl = urlParams.get("source_url") ?? "";
  const prefillSourcePhotosRaw = urlParams.get("source_photos") ?? "";
  let prefillSourcePhotos: string[] = [];
  if (prefillSourcePhotosRaw) {
    try {
      const parsed = JSON.parse(prefillSourcePhotosRaw);
      if (Array.isArray(parsed)) {
        prefillSourcePhotos = parsed.filter(
          (u): u is string => typeof u === "string" && u.length > 0,
        );
      }
    } catch {
      // 잘못된 직렬화는 조용히 무시(원본 패널만 빈 채로 표시).
    }
  }

  // FollowUpSource.type 으로 변환 (없으면 빈 문자열).
  const SOURCE_KIND_TO_FOLLOWUP_TYPE: Record<string, FollowUpSource["type"]> = {
    journal: "daily_journal",
    weekly_report: "weekly_journal",
    monthly_report: "monthly_journal",
    alert_action_output: "alert_action",
  };
  const mappedFollowUpType =
    SOURCE_KIND_TO_FOLLOWUP_TYPE[prefillSourceKind] ?? "";

  // 구 키 (Task #197) — 신규 키가 비어있을 때만 사용.
  const prefillSourceType = urlParams.get("sourceType") ?? mappedFollowUpType;
  const prefillSourceId =
    urlParams.get("sourceId") ?? prefillSourceIdNew ?? "";
  const prefillSourceDate = urlParams.get("sourceDate") ?? "";
  const prefillKeywords = urlParams.get("keywords") ?? "";

  const [title, setTitle] = useState(isPrefill ? prefillTitle : "");
  // [Task #610] 출처 표시는 두 명세 모두 지원.
  // [Task #682] sourceEntityType="rfq" 인 경우 사용자가 알아보기 쉬운 출처 라벨로 노출.
  const sourceLabel =
    prefillSourceEntityType === "rfq"
      ? `견적 #${prefillSourceEntityId}`
      : prefillSourceEntityType
        ? `${prefillSourceEntityType} #${prefillSourceEntityId}`
        : null;
  const sourceAnnotation =
    prefillSourceType
      ? `\n\n──────────\n[자동 제안] 출처: ${prefillSourceType} #${prefillSourceId} (${prefillSourceDate})` +
        (prefillKeywords ? `\n감지 키워드: ${prefillKeywords}` : "")
      : sourceLabel
        ? `\n\n──────────\n[기안서 작성] 출처: ${sourceLabel}`
        : prefillSourceKind
          ? `\n\n──────────\n[기안서 작성] 출처: ${prefillSourceKind}` +
            (prefillSourceTable ? `/${prefillSourceTable}` : "") +
            (prefillSourceIdNew ? `#${prefillSourceIdNew}` : "") +
            (prefillSourceDocId ? ` (doc#${prefillSourceDocId})` : "")
          : "";
  // [Task #682] description prefill 우선, 없으면 body 폴백.
  const initialDescription = isPrefill
    ? (prefillDescription || prefillBody) + sourceAnnotation
    : "";
  const [description, setDescription] = useState(initialDescription);
  const validApprovalCategories = ["maintenance", "inspection", "facility", "equipment", "other"];
  const [category, setCategory] = useState(
    isPrefill && validApprovalCategories.includes(prefillCategory) ? prefillCategory : "other",
  );
  // [Task #682] amount/vendor_name prefill — 빈 문자열이면 기본값 유지.
  const [estimatedAmount, setEstimatedAmount] = useState(
    isPrefill && prefillAmount ? prefillAmount : "",
  );
  // [Task #611] 본부장→관리인 자동 라인 사용 여부.
  //   기본값 ON — 안건 금액과 본부장 임계 금액에 따라 1·2단계가 자동으로 결정된다.
  const [useHqLine, setUseHqLine] = useState(true);
  const [urgentExecution, setUrgentExecution] = useState(false);
  const [urgentConsentMemo, setUrgentConsentMemo] = useState("");
  const [vendorName, setVendorName] = useState(
    isPrefill && prefillVendorName ? prefillVendorName : "",
  );
  const [vendorQuoteDetails, setVendorQuoteDetails] = useState("");
  // [Task #782] 보관함에서 가져오기 — 지출결의(=expense voucher) 작성 시 OCR 자료를
  //   기반으로 폼을 채우고, 결재 발행이 성공하면 ingestion.linkedRefs 에 approval id 를 저장.
  const [linkedIngestionId, setLinkedIngestionId] = useState<number | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);

  const [approvalSteps, setApprovalSteps] = useState<ApprovalStepInput[]>([]);
  const [selectedApproverId, setSelectedApproverId] = useState("");

  const [recipients, setRecipients] = useState<RecipientInput[]>([]);
  const [selectedRecipientId, setSelectedRecipientId] = useState("");
  const [newRecipientType, setNewRecipientType] = useState<"recipient" | "cc">("recipient");

  const [userList, setUserList] = useState<UserRecord[]>([]);

  // [Task #220] 후속조치에서 진입한 기안서일 경우, 저장 성공 후
  // "이 업무를 잊지 않도록 필수업무로 보내주겠습니까?"를 띄운다.
  const [followUpConfirmOpen, setFollowUpConfirmOpen] = useState(false);
  const [followUpScheduleOpen, setFollowUpScheduleOpen] = useState(false);
  const followUpSource: FollowUpSource | null =
    isPrefill && prefillSourceType && prefillSourceId && prefillSourceDate
      ? {
          type: prefillSourceType as FollowUpSource["type"],
          id: prefillSourceId,
          title: prefillTitle || "후속 조치",
          occurredAt: prefillSourceDate,
        }
      : null;

  const { data: templates } = useListDocumentTemplates();
  const { data: selectedTemplate } = useGetDocumentTemplate(
    selectedTemplateId ?? 0,
    { query: { enabled: selectedTemplateId !== null } }
  );

  const createMutation = useCreateApproval();
  const saveDraftMutation = useSaveApprovalDraft();

  useEffect(() => {
    async function fetchUsers() {
      try {
        const res = await fetch(`${API_BASE}/users`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data: UserRecord[] = await res.json();
          setUserList(data);
        }
      } catch {
      }
    }
    fetchUsers();
  }, [API_BASE, token]);

  useEffect(() => {
    if (!draftId || !token) return;
    async function loadDraft() {
      try {
        const res = await fetch(`${API_BASE}/approvals/${draftId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        setTitle(data.title || "");
        setDescription(data.description || "");
        setCategory(data.category || "other");
        setEstimatedAmount(data.estimatedAmount ? String(data.estimatedAmount) : "");
        setVendorName(data.vendorName || "");
        setVendorQuoteDetails(data.vendorQuoteDetails || "");
        if (data.templateId) setSelectedTemplateId(data.templateId);

        const stepsRes = await fetch(`${API_BASE}/approvals/${draftId}/steps`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (stepsRes.ok) {
          const stepsData = await stepsRes.json();
          setApprovalSteps(stepsData.map((s: { approverId: number; approverName: string; approverRole: string }) => ({
            approverId: s.approverId,
            approverName: s.approverName,
            approverRole: s.approverRole,
          })));
        }

        const recipientsRes = await fetch(`${API_BASE}/approvals/${draftId}/recipients`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (recipientsRes.ok) {
          const recipientsData = await recipientsRes.json();
          setRecipients(recipientsData.map((r: { userId: number; userName: string; type: "recipient" | "cc" }) => ({
            userId: r.userId,
            userName: r.userName,
            type: r.type,
          })));
        }
      } catch {
      }
    }
    loadDraft();
  }, [draftId, API_BASE, token]);

  useEffect(() => {
    if (selectedTemplate) {
      setTitle(selectedTemplate.name);
      setDescription(selectedTemplate.bodyTemplate);
    }
  }, [selectedTemplate]);

  function addStep() {
    const userId = Number(selectedApproverId);
    if (!userId) return;
    const selectedUser = userList.find((u) => u.id === userId);
    if (!selectedUser) return;
    if (approvalSteps.some((s) => s.approverId === userId)) {
      toast({ title: "이미 결재선에 추가된 사용자입니다", variant: "destructive" });
      return;
    }
    setApprovalSteps([
      ...approvalSteps,
      {
        approverId: selectedUser.id,
        approverName: selectedUser.name,
        approverRole: selectedUser.role,
      },
    ]);
    setSelectedApproverId("");
  }

  function removeStep(index: number) {
    setApprovalSteps(approvalSteps.filter((_, i) => i !== index));
  }

  function addRecipient() {
    const userId = Number(selectedRecipientId);
    if (!userId) return;
    const selectedUser = userList.find((u) => u.id === userId);
    if (!selectedUser) return;
    if (recipients.some((r) => r.userId === userId)) {
      toast({ title: "이미 수신자에 추가된 사용자입니다", variant: "destructive" });
      return;
    }
    setRecipients([
      ...recipients,
      {
        userId: selectedUser.id,
        userName: selectedUser.name,
        type: newRecipientType,
      },
    ]);
    setSelectedRecipientId("");
  }

  function removeRecipient(index: number) {
    setRecipients(recipients.filter((_, i) => i !== index));
  }

  function buildPayload() {
    // [Task #682] RFQ → 기안 사슬 보존: source_entity_type/id, building_id 를
    //   서버 payload 에 포함시켜 approvals row 에 저장한다. 사용자가 prefill 없이
    //   직접 진입한 경우엔 모두 비어 정상 동작.
    const sourceEntityIdNum = prefillSourceEntityId ? Number(prefillSourceEntityId) : null;
    const buildingIdNum = prefillBuildingId ? Number(prefillBuildingId) : null;
    return {
      title: title.trim(),
      description: description.trim(),
      category,
      templateId: selectedTemplateId,
      estimatedAmount: estimatedAmount ? Number(estimatedAmount) : null,
      vendorName: vendorName.trim() || null,
      vendorQuoteDetails: vendorQuoteDetails.trim() || null,
      approvalSteps: approvalSteps.length > 0 ? approvalSteps : undefined,
      recipients: recipients.length > 0 ? recipients : undefined,
      sourceEntityType: prefillSourceEntityType || undefined,
      sourceEntityId:
        sourceEntityIdNum != null && Number.isFinite(sourceEntityIdNum)
          ? sourceEntityIdNum
          : undefined,
      buildingId:
        buildingIdNum != null && Number.isFinite(buildingIdNum) ? buildingIdNum : undefined,
    };
  }

  async function handleSubmit() {
    if (!title.trim() || !description.trim()) {
      toast({ title: "제목과 내용을 입력해주세요", variant: "destructive" });
      return;
    }
    if (!token) {
      toast({ title: "로그인이 필요합니다", variant: "destructive" });
      return;
    }
    try {
      await recordConsent(token, "contract_disclaimer", `approval_submit:${draftId ?? "new"}`, { throwOnError: true });
    } catch {
      toast({ title: "동의 기록에 실패했습니다", variant: "destructive" });
      return;
    }

    // [Task #611] 긴급집행은 유선 동의 메모가 필수.
    if (useHqLine && urgentExecution && !urgentConsentMemo.trim()) {
      toast({
        title: "긴급집행은 유선 동의 메모가 필요합니다",
        description: "통화 일시·통화자·동의 요지를 짧게 적어주세요.",
        variant: "destructive",
      });
      return;
    }

    try {
      const payload = buildPayload();
      let approvalId: number | null = null;

      if (useHqLine) {
        // [Task #611] 본부장→관리인 자동 라인 — 항상 draft 로 만든 뒤
        //   /approvals/:id/submit-line 으로 임계 금액 기반 라인을 구성한다.
        const draftUrl = draftId
          ? `${API_BASE}/approvals/draft/${draftId}`
          : `${API_BASE}/approvals/draft`;
        const draftMethod = draftId ? "PUT" : "POST";
        const draftRes = await fetch(draftUrl, {
          method: draftMethod,
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            ...payload,
            // 라인은 서버 자동 결정 — 사용자 수동 단계는 무시한다.
            approvalSteps: undefined,
          }),
        });
        if (!draftRes.ok) {
          const err = await draftRes.json().catch(() => null);
          toast({ title: err?.error || "기안 저장에 실패했습니다", variant: "destructive" });
          return;
        }
        const draft = await draftRes.json();
        approvalId = draft?.id ?? null;
        if (!approvalId) {
          toast({ title: "기안 ID 를 받지 못했습니다", variant: "destructive" });
          return;
        }
        const lineRes = await fetch(`${API_BASE}/approvals/${approvalId}/submit-line`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            urgentExecution,
            urgentConsentMemo: urgentExecution ? urgentConsentMemo.trim() : undefined,
          }),
        });
        if (!lineRes.ok) {
          const err = await lineRes.json().catch(() => null);
          toast({
            title: err?.error || "결재 라인 구성에 실패했습니다",
            variant: "destructive",
          });
          return;
        }
      } else {
        const url = draftId ? `${API_BASE}/approvals/draft/${draftId}/submit` : `${API_BASE}/approvals`;
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => null);
          toast({ title: err?.error || "결재 요청 제출에 실패했습니다", variant: "destructive" });
          return;
        }
        // [Task #782] 비-HQ 경로에서도 결재 id 를 응답에서 회수해 linkedRefs 저장에 사용.
        const created = await res.json().catch(() => null);
        approvalId = created?.id ?? created?.approvalId ?? Number(draftId) ?? null;
      }

      queryClient.invalidateQueries({ queryKey: getListApprovalsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetApprovalStatsQueryKey() });
      // [Task #782] 보관함 자료에서 자동 채운 경우, 결재 발행 성공 시 ingestion.linkedRefs 에 결재 id 저장.
      //   approvalId 는 HQ 경로(draft + submit-line)와 비-HQ 경로(직접 /approvals 또는 draft/submit) 모두에서 회수된다.
      if (linkedIngestionId !== null && approvalId) {
        await linkIngestionRef(API_BASE, token, linkedIngestionId, { expenseApprovalId: approvalId });
      }
      toast({
        title: urgentExecution
          ? "긴급집행 라인이 발행되었습니다 — 사후결재(서명본) 첨부를 잊지 마세요"
          : "결재 요청이 제출되었습니다",
      });
      // [Task #220] 후속조치 prefill 진입이면 필수업무 등록 권유.
      if (followUpSource) {
        setFollowUpConfirmOpen(true);
        return;
      }
      setLocation("/approvals");
    } catch {
      toast({ title: "결재 요청 제출에 실패했습니다", variant: "destructive" });
    }
  }

  async function handleSaveDraft() {
    try {
      const payload = buildPayload();
      payload.title = payload.title || "임시 저장";
      const url = draftId ? `${API_BASE}/approvals/draft/${draftId}` : `${API_BASE}/approvals/draft`;
      const method = draftId ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        toast({ title: err?.error || "임시 저장에 실패했습니다", variant: "destructive" });
        return;
      }
      toast({ title: "임시 저장되었습니다" });
      // [Task #220] 임시저장도 후속조치에서 진입했다면 필수업무 등록 권유.
      if (followUpSource) {
        setFollowUpConfirmOpen(true);
        return;
      }
      setLocation("/approvals");
    } catch {
      toast({ title: "임시 저장에 실패했습니다", variant: "destructive" });
    }
  }

  // [역할 라벨 SoT] @workspace/shared/role-labels 의 ROLE_LABELS 사용.
  const roleLabels: Record<string, string> = ROLE_LABELS;

  // [Task #707] 경리(accountant)는 결재 결정권자가 아니다 — 결재선 후보에서 제외.
  //   서버에서도 동일 검증을 한다 (approvals.ts POST).
  const availableApprovers = userList.filter(
    (u) =>
      !approvalSteps.some((s) => s.approverId === u.id) &&
      u.id !== user?.id &&
      u.role !== "accountant"
  );

  const availableRecipients = userList.filter(
    (u) => !recipients.some((r) => r.userId === u.id)
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => setLocation("/approvals")}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">결재 문서 작성</h1>
          <p className="text-muted-foreground text-sm mt-1">
            서식을 선택하고 결재선을 설정하여 결재를 올리세요
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* [Task #682 review-fix #2] RFQ 등 원본에서 prefill 로 들어온 경우, 결재
              화면 상단에 "원본 RFQ 보러 가기" 링크와 첨부 사진 썸네일을 함께 노출.
              경리/본부장이 결재 본문 외에 사진/원본까지 한 번에 확인할 수 있도록. */}
          {(prefillSourceUrl || prefillSourcePhotos.length > 0) && (
            <Card data-testid="approval-source-context">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  원본
                  {sourceLabel ? (
                    <span className="text-xs text-muted-foreground font-normal">
                      {sourceLabel}
                    </span>
                  ) : null}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {prefillSourceUrl ? (
                  <a
                    href={prefillSourceUrl}
                    className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline"
                    data-testid="approval-source-link"
                  >
                    <FileText className="w-3 h-3" />
                    원본 문서로 이동
                  </a>
                ) : null}
                {prefillSourcePhotos.length > 0 ? (
                  <div className="grid grid-cols-2 gap-2">
                    {prefillSourcePhotos.map((url, idx) => (
                      <a
                        key={`${url}-${idx}`}
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="block overflow-hidden rounded border"
                        data-testid={`approval-source-photo-${idx}`}
                      >
                        <img
                          src={url}
                          alt={`원본 첨부 ${idx + 1}`}
                          className="h-24 w-full object-cover"
                        />
                      </a>
                    ))}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          )}
          {/* [Task #782] 보관함에서 가져오기 — 지출결의(영수증/세금계산서/계약서)를 폼에 자동 채움. */}
          <Card data-testid="approval-ingestion-card">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="w-4 h-4" />
                보관함 자료에서 자동 채우기
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-xs text-muted-foreground">
                업로드센터에서 확인한 영수증·세금계산서·계약서를 선택하면 업체명·금액·내용이 폼에 그대로 채워집니다.
              </p>
              <div className="flex items-center gap-2">
                <IngestionPicker
                  target="expense"
                  testId="approval-ingestion-picker"
                  description="영수증·세금계산서·계약서로부터 지출결의 폼을 자동 채웁니다."
                  onPick={(adapted, ingestionId) => {
                    setLinkedIngestionId(ingestionId);
                    if (adapted.vendor) setVendorName(adapted.vendor);
                    if (adapted.amount != null) setEstimatedAmount(String(adapted.amount));
                    if (adapted.description) {
                      setDescription(prev => prev?.trim() ? prev : adapted.description!);
                    }
                    if (!title.trim() && adapted.vendor) {
                      setTitle(`${adapted.vendor} 지출결의`);
                    }
                    toast({ title: "보관함 자료를 가져왔습니다", description: "값을 검토 후 결재 요청하세요." });
                  }}
                />
                {linkedIngestionId !== null && (
                  <Badge variant="secondary" data-testid="approval-ingestion-linked-badge">
                    보관함 #{linkedIngestionId} 연결됨
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="w-4 h-4" />
                서식 선택
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={() => setTemplateDialogOpen(true)}
              >
                {selectedTemplate
                  ? `${selectedTemplate.name} (${templateCategoryLabels[selectedTemplate.category] || selectedTemplate.category})`
                  : "서식을 선택하세요 (선택사항)"}
              </Button>
            </CardContent>
          </Card>

          <IntermediaryDisclaimerBanner variant="contract" />

          <Card>
            <CardHeader>
              <CardTitle className="text-base">문서 내용</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>제목 *</Label>
                <Input
                  placeholder="결재 문서 제목"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>
              <div>
                <Label>분류 *</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>내용 *</Label>
                <Textarea
                  placeholder="결재 내용을 상세히 작성하세요"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={10}
                  className="font-mono text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>예상 금액 (원)</Label>
                  <Input
                    type="number"
                    placeholder="0"
                    value={estimatedAmount}
                    onChange={(e) => setEstimatedAmount(e.target.value)}
                  />
                </div>
                <div>
                  <Label>업체명</Label>
                  <Input
                    placeholder="관련 업체명"
                    value={vendorName}
                    onChange={(e) => setVendorName(e.target.value)}
                  />
                </div>
              </div>
              <div>
                <Label>견적 상세</Label>
                <Textarea
                  placeholder="견적 비교 내역"
                  value={vendorQuoteDetails}
                  onChange={(e) => setVendorQuoteDetails(e.target.value)}
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          {/* [Task #611] 본부장→관리인 자동 라인 + 긴급집행 토글 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Zap className="w-4 h-4" />
                결재 라인 / 긴급집행
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <label className="flex items-start gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={useHqLine}
                  onChange={(e) => {
                    setUseHqLine(e.target.checked);
                    if (!e.target.checked) setUrgentExecution(false);
                  }}
                  className="mt-1"
                />
                <span>
                  <span className="font-medium">본부장 → 관리인 자동 라인 사용</span>
                  <span className="block text-xs text-muted-foreground">
                    예상 금액이 본부장 임계 금액 이상이면 본부장 결재가 자동으로 1단계에 들어갑니다.
                    그 외에는 관리인 결재 1단계로 구성됩니다.
                  </span>
                </span>
              </label>
              {useHqLine && (
                <label className="flex items-start gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={urgentExecution}
                    onChange={(e) => setUrgentExecution(e.target.checked)}
                    className="mt-1"
                  />
                  <span>
                    <span className="font-medium text-orange-700">긴급집행 (사후결재)</span>
                    <span className="block text-xs text-muted-foreground">
                      유선 동의를 받은 뒤 즉시 지출결의서·입금요청서를 발행합니다.
                      본부장/관리인 서명본은 사후에 첨부해야 하며, "사후결재 받기" 필수업무가 자동 등록됩니다.
                    </span>
                  </span>
                </label>
              )}
              {useHqLine && urgentExecution && (
                <div className="rounded-md border border-orange-200 bg-orange-50 p-3 space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium text-orange-800">
                    <AlertCircle className="w-4 h-4" />
                    유선 동의 메모 (필수)
                  </div>
                  <Textarea
                    placeholder="예) 2026-04-29 14:20 본부장 김철수 통화, 누수 보수 80만원 즉시 진행 동의"
                    value={urgentConsentMemo}
                    onChange={(e) => setUrgentConsentMemo(e.target.value)}
                    rows={3}
                    className="text-sm"
                  />
                  <p className="text-xs text-orange-700">
                    통화 일시 · 통화자 · 동의 요지를 한 줄에 적어주세요.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {!useHqLine && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="w-4 h-4" />
                결재선 설정
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">
                결재선을 추가하면 순차적으로 결재가 진행됩니다 (최대 5단계)
              </p>
              {approvalSteps.map((step, i) => (
                <div
                  key={step.approverId}
                  className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg"
                >
                  <Badge variant="outline" className="shrink-0">
                    {i + 1}단계
                  </Badge>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{step.approverName}</p>
                    <p className="text-xs text-muted-foreground">
                      {roleLabels[step.approverRole] || step.approverRole}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={() => removeStep(i)}
                  >
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              ))}
              {approvalSteps.length < 5 && (
                <div className="space-y-2 pt-2 border-t">
                  <Select value={selectedApproverId || undefined} onValueChange={setSelectedApproverId}>
                    <SelectTrigger className="text-sm">
                      <SelectValue placeholder="결재자를 선택하세요" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableApprovers.map((u) => (
                        <SelectItem key={u.id} value={String(u.id)}>
                          {u.name} ({roleLabels[u.role] || u.role})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    className="w-full"
                    onClick={addStep}
                    disabled={!selectedApproverId}
                  >
                    <Plus className="w-3 h-3 mr-1" />
                    결재자 추가
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">수신처 / 공유</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">
                결재 완료 후 문서가 공유될 대상을 지정합니다
              </p>
              {recipients.map((r, i) => (
                <div
                  key={r.userId}
                  className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg"
                >
                  <Badge
                    variant={r.type === "recipient" ? "default" : "secondary"}
                    className="shrink-0 text-xs"
                  >
                    {r.type === "recipient" ? "수신" : "참조"}
                  </Badge>
                  <span className="text-sm flex-1">{r.userName}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={() => removeRecipient(i)}
                  >
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              ))}
              <div className="space-y-2 pt-2 border-t">
                <Select value={selectedRecipientId || undefined} onValueChange={setSelectedRecipientId}>
                  <SelectTrigger className="text-sm">
                    <SelectValue placeholder="수신자를 선택하세요" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableRecipients.map((u) => (
                      <SelectItem key={u.id} value={String(u.id)}>
                        {u.name} ({roleLabels[u.role] || u.role})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex gap-2">
                  <Select
                    value={newRecipientType}
                    onValueChange={(v: string) => {
                      if (v === "recipient" || v === "cc") {
                        setNewRecipientType(v);
                      }
                    }}
                  >
                    <SelectTrigger className="text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="recipient">수신</SelectItem>
                      <SelectItem value="cc">참조(CC)</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    onClick={addRecipient}
                    disabled={!selectedRecipientId}
                  >
                    <Plus className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex flex-col gap-2">
            <Button onClick={handleSubmit} disabled={!title.trim() || !description.trim()}>
              <Send className="w-4 h-4 mr-2" />
              결재 요청 제출
            </Button>
            <Button variant="outline" onClick={handleSaveDraft}>
              <Save className="w-4 h-4 mr-2" />
              임시 저장
            </Button>
          </div>
        </div>
      </div>

      <ResponsiveDialog open={templateDialogOpen} onOpenChange={setTemplateDialogOpen}>
        <ResponsiveDialogContent className="max-w-lg">
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>서식 선택</ResponsiveDialogTitle>
          </ResponsiveDialogHeader>
          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            {templates?.map((t: TemplateItem) => (
              <div
                key={t.id}
                className="p-3 border rounded-lg cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => {
                  setSelectedTemplateId(t.id);
                  setTemplateDialogOpen(false);
                }}
              >
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{t.name}</span>
                  <Badge variant="outline" className="text-xs">
                    {templateCategoryLabels[t.category] || t.category}
                  </Badge>
                  {t.isSystem && (
                    <Badge variant="secondary" className="text-xs">
                      기본
                    </Badge>
                  )}
                </div>
                {t.description && (
                  <p className="text-xs text-muted-foreground mt-1">{t.description}</p>
                )}
              </div>
            ))}
            {(!templates || templates.length === 0) && (
              <p className="text-center text-muted-foreground py-4">
                등록된 서식이 없습니다
              </p>
            )}
          </div>
          <ResponsiveDialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setSelectedTemplateId(null);
                setTemplateDialogOpen(false);
              }}
            >
              서식 없이 작성
            </Button>
          </ResponsiveDialogFooter>
        </ResponsiveDialogContent>
      </ResponsiveDialog>

      {/* [Task #220] 후속조치 prefill로 진입한 기안서 저장 후 행동유도 */}
      <ConfirmDialog
        open={followUpConfirmOpen}
        onOpenChange={(o) => {
          setFollowUpConfirmOpen(o);
          if (!o) setLocation("/approvals");
        }}
      >
        <ConfirmDialogContent className="max-w-md" data-testid="approval-followup-confirm-dialog">
          <ConfirmDialogHeader>
            <ConfirmDialogTitle>이 업무, 잊지 않으시겠어요?</ConfirmDialogTitle>
            <ConfirmDialogDescription>
              방금 작성한 기안서 처리를 잊지 않도록 대시보드 필수업무현황에 1회성으로 등록해 둘 수 있습니다.
            </ConfirmDialogDescription>
          </ConfirmDialogHeader>
          <ConfirmDialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="ghost"
              className="w-full sm:w-auto"
              onClick={() => {
                setFollowUpConfirmOpen(false);
                setLocation("/approvals");
              }}
              data-testid="approval-followup-skip"
            >
              다음에
            </Button>
            <Button
              className="w-full sm:w-auto"
              onClick={() => {
                setFollowUpConfirmOpen(false);
                setFollowUpScheduleOpen(true);
              }}
              data-testid="approval-followup-accept"
            >
              필수업무로 등록
            </Button>
          </ConfirmDialogFooter>
        </ConfirmDialogContent>
      </ConfirmDialog>

      <FollowUpScheduleTaskDialog
        open={followUpScheduleOpen}
        onOpenChange={(o) => {
          setFollowUpScheduleOpen(o);
          if (!o) setLocation("/approvals");
        }}
        source={followUpSource}
        detection={null}
        extraNote="기안서 작성 후 등록된 1회성 필수업무"
        onCreated={() => {
          setFollowUpScheduleOpen(false);
          setLocation("/approvals");
        }}
      />
    </div>
  );
}
