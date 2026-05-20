import { useEffect, useMemo, useState } from "react";
import { useLocation, useSearch } from "wouter";
import {
  useListRfqs,
  useCreateRfq,
  useUpdateRfq,
  useDeleteRfq,
  useListVendors,
  useListQuotes,
  useUpdateQuote,
  useExpandRfqScope,
  useListApprovals,
  getListRfqsQueryKey,
  getListQuotesQueryKey,
  type Vendor,
} from "@workspace/api-client-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
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
  ResponsiveDialogTrigger,
} from "@/components/ui/responsive-dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  Plus,
  FileText,
  CheckCircle,
  Trash2,
  Expand,
  Printer,
  ChevronDown,
  ChevronUp,
  MoreVertical,
  ClipboardList,
  Receipt,
  Send,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { buildApprovalPrefillUrl } from "@/lib/approval-prefill";
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/utils";
import {
  RFQ_SERVICE_TYPE_LABELS,
  rfqServiceTypeLabel,
  buildRfqAutoTitle,
  type RfqServiceType,
} from "@workspace/shared/rfq-service-types";
// [Task #475] 컨텍스트의 sido/sigungu 가 비어 있어도 addressFull/addressJibun
//   으로부터 도출해 RFQ 화면이 막다른 길이 되지 않도록 한다.
import { computeBuildingReady } from "@/lib/rfq-building-ready";
import { PhotoUploadField } from "@/components/photo-upload-field";
import { RfqRequestDocument, type RfqDocumentData } from "@/components/rfq-request-document";
// [Task #388] 견적 요청이 0건일 때, 곧 도래하는 필수/제안 업무를 활용한
//   비교 견적 유도 카드를 노출한다. 적합한 알림이 없으면 기존 빈 상태 폴백.
import EmptyQuoteRfqSuggestion from "@/components/dashboard-widgets/widgets/empty-quote-rfq-suggestion";
import { useAuth } from "@/contexts/auth-context";
import { useBuilding } from "@/contexts/building-context";
import { AuthImage } from "@/components/auth-image";
import { RfqMatchStatsCard } from "@/pages/settings";
import { VendorRatingInline } from "@/components/star-rating";
import { RFQ_CATEGORY_OPTIONS as categoryOptions } from "@/lib/rfq-category-options";
import {
  RfqQuickRequestWidget,
  type RfqQuickRequestPayload,
} from "@/components/dashboard-widgets/widgets/rfq-quick-request-widget";

// [Task #510] orval 이 만든 axios 기반 mutation 은 실패 시 AxiosError 를
//   throw 하고 서버 본문은 err.response.data 에 담긴다. catch 블록에서
//   `any` 캐스팅 없이도 안전하게 메시지를 뽑기 위한 작은 type guard 헬퍼.
function extractServerErrorMessage(err: unknown): string | null {
  if (err && typeof err === "object" && "response" in err) {
    const response = (err as { response?: unknown }).response;
    if (response && typeof response === "object" && "data" in response) {
      const data = (response as { data?: unknown }).data;
      if (typeof data === "string" && data.length > 0) return data;
      if (data && typeof data === "object") {
        const obj = data as { error?: unknown; message?: unknown };
        if (typeof obj.error === "string" && obj.error.length > 0) return obj.error;
        if (typeof obj.message === "string" && obj.message.length > 0) return obj.message;
      }
    }
  }
  if (err instanceof Error && err.message) return err.message;
  return null;
}

export default function Rfqs() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string | undefined>();
  const [closeUpPhotoUrl, setCloseUpPhotoUrl] = useState<string | null>(null);
  const [widePhotoUrl, setWidePhotoUrl] = useState<string | null>(null);
  const [rfqDocRfq, setRfqDocRfq] = useState<RfqDocumentData | null>(null);
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const { token } = useAuth();
  const { building } = useBuilding();
  const queryClient = useQueryClient();

  const queryParams: any = {};
  if (filterStatus && filterStatus !== "all") {
    queryParams.status = filterStatus;
  }
  const { data: rfqs, isLoading } = useListRfqs(queryParams);
  const { data: vendors } = useListVendors();
  // 모든 견적을 한 번에 가져와 RFQ 카드 아래에 인라인으로 나열한다.
  //   (이전: compareRfqId 토글 시에만 fetch → 카드 펼침/접힘 UI)
  const { data: allQuotes } = useListQuotes(undefined, {
    query: { staleTime: 30_000 },
  });
  const createMutation = useCreateRfq();
  const updateMutation = useUpdateRfq();
  const deleteMutation = useDeleteRfq();
  const updateQuoteMutation = useUpdateQuote();
  const expandScopeMutation = useExpandRfqScope();

  // /rfqs?openQuote, /rfqs?openVisit 같은 딥링크는 더 이상 펼침/패널 토글이
  //   없으므로 URL 정리만 수행한다 (대시보드 알림은 invalidate).
  useEffect(() => {
    const url = new URL(window.location.href);
    let touched = false;
    if (url.searchParams.has("openQuote")) {
      url.searchParams.delete("openQuote");
      touched = true;
      queryClient.invalidateQueries({ queryKey: ["/dashboard/alerts"] });
    }
    if (url.searchParams.has("openVisit")) {
      url.searchParams.delete("openVisit");
      touched = true;
    }
    if (touched) window.history.replaceState({}, "", url.toString());
  }, [queryClient]);
  // /rfqs?new=1 — 대시보드 등에서 견적 요청 진입 시 작성 다이얼로그 자동 오픈.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("new") === "1") {
      setDialogOpen(true);
      url.searchParams.delete("new");
      window.history.replaceState({}, "", url.toString());
    }
  }, []);

  function getDefaultDeadline(): string {
    // 오늘 + 1일을 YYYY-MM-DD 로 반환.
    const d = new Date();
    d.setDate(d.getDate() + 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  const [form, setForm] = useState({
    title: "",
    titleManuallyEdited: false,
    category: "" as string,
    serviceType: "" as RfqServiceType | "",
    description: "",
    descriptionManuallyEdited: false,
    deadline: getDefaultDeadline(),
    requiresSiteVisit: false,
  });
  const [advancedOpen, setAdvancedOpen] = useState(false);
  // [Task #407] 후속조치 → 견적요청 진입 시 상세 설명을 "분야: X / 용역종류: Y" 한 줄로
  //   자동 채운다. 사용자가 분야·용역종류를 바꾸면 본문도 따라 갱신되도록 별도 플래그로 추적.
  //   직접 모달을 연 경우(prefill 아님)는 false → 빈 상태 그대로 둔다.
  const [autoDescribeFromMeta, setAutoDescribeFromMeta] = useState(false);

  // [Task #197] 후속 조치 제안 팝업에서 prefill=1 로 진입한 경우 작성 다이얼로그를 자동으로 연다.
  // [Task #388] 같은 /rfqs 페이지 안에서 빈 상태 추천 카드 → /rfqs?prefill=... 로
  //   navigate 한 경우에도 effect 가 다시 실행되도록 wouter 의 useSearch 를 의존성에
  //   포함시킨다. (페이지가 unmount/remount 되지 않으므로 [] 만으로는 트리거 안 됨)
  const search = useSearch();
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("prefill") !== "1") return;
    const validCategories = categoryOptions.map((c) => c.value);
    const incomingCategory = params.get("category") ?? "";
    // [Task #407] 후속조치 진입 시에도 출처/감지 키워드/원문/건물 정보 등은 더 이상
    //   본문에 노출하지 않는다. 본문은 분야/용역종류로부터 자동 한 줄만 채운다.
    setForm((prev) => ({
      ...prev,
      title: params.get("title") ?? prev.title,
      titleManuallyEdited: !!params.get("title"),
      description: "",
      descriptionManuallyEdited: false,
      category: categoryOptions.some((c) => c.value === incomingCategory)
        ? incomingCategory
        : prev.category,
    }));
    setAutoDescribeFromMeta(true);
    // [Task #407] 후속조치에서 끌고 온 근경/원경 사진 URL 을 미리 사진 칸에 채운다.
    //   있는 쪽만 채워지고 없는 쪽은 기존 업로드 UI 그대로 유지.
    const closePhoto = params.get("closeUpPhoto");
    const widePhoto = params.get("widePhoto");
    if (closePhoto) setCloseUpPhotoUrl(closePhoto);
    if (widePhoto) setWidePhotoUrl(widePhoto);
    // 후속조치로 진입 시 자동 채워진 본문이 사용자에게 보이도록 추가 옵션 영역을 펼친다.
    setAdvancedOpen(true);
    setDialogOpen(true);
    // 한 번만 적용되도록 쿼리 정리.
    const url = new URL(window.location.href);
    [
      "prefill",
      "title",
      "body",
      "category",
      "keywords",
      "sourceType",
      "sourceId",
      "sourceDate",
      "closeUpPhoto",
      "widePhoto",
    ].forEach((k) => url.searchParams.delete(k));
    window.history.replaceState({}, "", url.toString());
    // [Task #388] search 변경(같은 페이지 내 navigate) 도 트리거 — 한 번 실행 후
    //   위에서 prefill 파라미터를 history 에서 제거하므로 다음 렌더에서 바로 early-return.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  function resetForm() {
    setForm({
      title: "",
      titleManuallyEdited: false,
      category: "",
      serviceType: "",
      description: "",
      descriptionManuallyEdited: false,
      deadline: getDefaultDeadline(),
      requiresSiteVisit: false,
    });
    setCloseUpPhotoUrl(null);
    setWidePhotoUrl(null);
    setAdvancedOpen(false);
    setAutoDescribeFromMeta(false);
  }

  // 건물 컨텍스트의 주소가 매칭에 사용된다 (사용자에게는 노출하지 않음).
  // [Task #475] 컨텍스트에 sido/sigungu 가 비어 있더라도 addressFull/addressJibun
  //   텍스트로부터 도출 가능한 경우엔 RFQ 를 정상 진행시킨다.
  //   순수 분기는 computeBuildingReady 에 모아 단위 테스트로 회귀 보호한다.
  const { buildingName, buildingSido, buildingSigungu, buildingReady } = computeBuildingReady(building);

  // 자동 생성된 제목 (사용자가 직접 수정하지 않은 경우에만 사용).
  const autoTitle = buildRfqAutoTitle(form.category, form.serviceType || null);
  const effectiveTitle = form.titleManuallyEdited && form.title.trim().length > 0
    ? form.title
    : autoTitle;

  // [Task #407] 후속조치 진입 시 자동으로 채울 본문은 "분야: X / 용역종류: Y" 한 줄.
  //   분야/용역종류가 아직 비었으면 빈 문자열로 둔다 (placeholder 가 안내).
  const autoDescription = (() => {
    if (!autoDescribeFromMeta) return "";
    const catLabel = form.category
      ? categoryOptions.find((o) => o.value === form.category)?.label || form.category
      : "";
    const stLabel = form.serviceType ? RFQ_SERVICE_TYPE_LABELS[form.serviceType] : "";
    if (!catLabel && !stLabel) return "";
    return `분야: ${catLabel || "-"} / 용역종류: ${stLabel || "-"}`;
  })();
  const effectiveDescription = form.descriptionManuallyEdited
    ? form.description
    : autoDescription;

  const photosReady = !!closeUpPhotoUrl && !!widePhotoUrl;

  // [Task #449] 버튼이 잠겨 보이는 사유를 사용자가 즉시 알 수 있도록, 부족한
  //   필수 항목 목록을 만들어 버튼 상단에 한 줄로 안내하고, onClick 시점에도
  //   동일 목록을 토스트로 보여준다. 항목 순서는 폼 표시 순서를 따라간다.
  const missingItems: string[] = [];
  if (!buildingReady) missingItems.push("건물 정보");
  if (!form.category) missingItems.push("시설분야");
  if (!form.serviceType) missingItems.push("용역종류");
  if (!widePhotoUrl) missingItems.push("원경 사진");
  if (!closeUpPhotoUrl) missingItems.push("근경 사진");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // [Task #449] disabled 로 두면 onClick/submit 자체가 발화되지 않아 사용자가
    //   "왜 안 눌리지?" 라는 상태에 빠진다. 버튼은 항상 활성화된 상태로 두고,
    //   여기서 부족한 항목을 한 번에 토스트로 안내한다. (개별 항목별 early-return
    //   은 missingItems 가 모두 커버하므로 단일 검증 경로로 통일.)
    if (missingItems.length > 0) {
      toast({
        title: "아직 입력하지 않은 항목이 있어요",
        description: `${missingItems.join(", ")}을(를) 입력해주세요.`,
        variant: "destructive",
      });
      return;
    }

    const data: any = {
      title: effectiveTitle,
      category: form.category,
      serviceType: form.serviceType,
      description: effectiveDescription || null,
      buildingName,
      // [Task #407] 폼에서 희망일·추가 발송 업체 입력을 제거. 항상 null 로 보낸다.
      //   서버 스키마(`api-server/src/routes/rfqs.ts`)는 변경 없이 그대로 유지.
      desiredDate: null,
      deadline: form.deadline,
      vendorIds: null,
      sido: buildingSido || null,
      sigungu: buildingSigungu || null,
      geoScope: buildingSigungu ? "sigungu" : buildingSido ? "sido" : null,
      closeUpPhotoUrl,
      widePhotoUrl,
      requiresSiteVisit: form.requiresSiteVisit,
    };

    // [Task #510] 이전에는 mutateAsync 를 try/catch 없이 호출해, 서버/네트워크
    //   오류 시 promise rejection 만 나고 사용자에게는 아무 변화도 보이지 않는
    //   "버튼이 안 눌리는 것 같다" 상태가 되었다. 어떤 실패라도 destructive
    //   토스트로 노출하고, 성공 분기에서만 다이얼로그 닫기/리셋을 수행한다.
    try {
      await createMutation.mutateAsync({ data });
    } catch (err: unknown) {
      console.error("[rfqs] create RFQ failed:", err);
      // orval 이 만든 axios 기반 mutation 은 실패 시 AxiosError 를 throw 하며,
      //   서버에서 보낸 본문은 err.response.data 에 담긴다.
      //   가능한 한 서버 응답의 message/error 텍스트를 그대로 보여 주고,
      //   그렇지 않으면 일반 폴백 메시지를 사용한다.
      const serverMessage = extractServerErrorMessage(err);
      toast({
        title: "견적 요청 생성에 실패했습니다",
        description:
          serverMessage ||
          "잠시 후 다시 시도하거나, 입력값과 네트워크 상태를 확인해 주세요.",
        variant: "destructive",
      });
      return;
    }
    queryClient.invalidateQueries({ queryKey: getListRfqsQueryKey() });
    toast({ title: "견적 요청이 생성되었습니다" });
    setDialogOpen(false);
    resetForm();
  }

  async function submitQuickRequest(payload: RfqQuickRequestPayload) {
    if (!buildingReady) {
      toast({
        title: "건물 정보가 필요합니다",
        description: "건물 정보를 먼저 등록해 주세요.",
        variant: "destructive",
      });
      return;
    }
    const title = buildRfqAutoTitle(payload.category, "other");
    const data: Parameters<typeof createMutation.mutateAsync>[0]["data"] = {
      title,
      category: payload.category as (typeof categoryOptions)[number]["value"],
      serviceType: "other",
      description: payload.description,
      buildingName,
      desiredDate: null,
      deadline: getDefaultDeadline(),
      vendorIds: null,
      sido: buildingSido || null,
      sigungu: buildingSigungu || null,
      geoScope: buildingSigungu ? "sigungu" : buildingSido ? "sido" : null,
      closeUpPhotoUrl: payload.closeUpPhotoUrl,
      widePhotoUrl: payload.widePhotoUrl,
      requiresSiteVisit: false,
    };
    try {
      await createMutation.mutateAsync({ data });
    } catch (err: unknown) {
      console.error("[rfqs] create RFQ failed:", err);
      const serverMessage = extractServerErrorMessage(err);
      toast({
        title: "견적 요청 생성에 실패했습니다",
        description:
          serverMessage ||
          "잠시 후 다시 시도하거나, 입력값과 네트워크 상태를 확인해 주세요.",
        variant: "destructive",
      });
      return;
    }
    queryClient.invalidateQueries({ queryKey: getListRfqsQueryKey() });
    toast({ title: "견적 요청이 생성되었습니다" });
    setDialogOpen(false);
    resetForm();
  }

  async function handleDelete(id: number) {
    await deleteMutation.mutateAsync({ id });
    queryClient.invalidateQueries({ queryKey: getListRfqsQueryKey() });
    toast({ title: "견적 요청이 삭제되었습니다" });
  }

  async function handleCloseRfq(id: number) {
    await updateMutation.mutateAsync({ id, data: { status: "closed" } });
    queryClient.invalidateQueries({ queryKey: getListRfqsQueryKey() });
    toast({ title: "견적 요청이 마감되었습니다" });
  }

  async function handleExpandScope(id: number) {
    await expandScopeMutation.mutateAsync({ id });
    queryClient.invalidateQueries({ queryKey: getListRfqsQueryKey() });
    toast({ title: "견적 범위가 시/도 전체로 확대되었습니다" });
  }

  async function handleAcceptQuote(quote: any) {
    const vendorName = quote?.vendorName ?? "이 업체";
    if (!confirm(`파트너사 "${vendorName}"를 선택하시겠습니까?`)) return;
    try {
      await updateQuoteMutation.mutateAsync({ id: quote.id, data: { status: "accepted" } });
      queryClient.invalidateQueries({ queryKey: getListQuotesQueryKey() });

      // 계약 자동 생성/이동 없음. 채택 후 파트너 연락처를 토스트로 안내한다.
      const v = vendorById.get(quote.vendorId);
      const contactBits: string[] = [];
      if (v?.contactName) contactBits.push(`담당자 ${v.contactName}`);
      if (v?.phone) contactBits.push(`☎ ${v.phone}`);
      toast({
        title: `${vendorName} 선택 완료`,
        description:
          contactBits.length > 0
            ? `직접 연락: ${contactBits.join(" · ")}`
            : "파트너사 연락처가 등록되어 있지 않습니다.",
      });
    } catch {
      toast({
        title: "처리에 실패했습니다. 다시 시도해 주세요.",
        variant: "destructive",
      });
    }
  }

  const categoryLabel = (c: string) =>
    categoryOptions.find((o) => o.value === c)?.label || c;

  const statusLabel = (s: string) => {
    switch (s) {
      case "open": return "접수중";
      case "closed": return "마감";
      case "cancelled": return "취소";
      default: return s;
    }
  };

  const statusColor = (s: string) => {
    switch (s) {
      case "open": return "secondary";
      case "closed": return "outline";
      case "cancelled": return "destructive";
      default: return "outline";
    }
  };

  // RFQ 카드 아래 인라인 견적 카드에서 업체 메타(연락처/별점)를 빠르게 참조.
  const vendorById = useMemo(
    () => new Map<number, Vendor>((vendors || []).map((v) => [v.id, v])),
    [vendors],
  );

  // RFQ id → 해당 RFQ 에 들어온 견적 배열. 카드 아래 인라인 나열용.
  const quotesByRfqId = useMemo(() => {
    const map = new Map<number, any[]>();
    for (const q of (allQuotes ?? []) as any[]) {
      const list = map.get(q.rfqId) ?? [];
      list.push(q);
      map.set(q.rfqId, list);
    }
    // 최신 제출 순으로 정렬.
    for (const list of map.values()) {
      list.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    }
    return map;
  }, [allQuotes]);

  // [Task #682] 모든 결재를 한 번에 가져와 RFQ 별 파이프라인 배지에 사용한다.
  //   서버는 sourceEntityType/sourceEntityId 를 응답에 포함시키므로 (T001),
  //   카드 컴포넌트가 자기 RFQ 와 연결된 결재만 골라 배지를 그릴 수 있다.
  const { data: allApprovals } = useListApprovals();
  const approvalsByRfqId = new Map<number, any[]>();
  for (const ap of (allApprovals as any[] | undefined) ?? []) {
    if (ap?.sourceEntityType === "rfq" && ap.sourceEntityId != null) {
      const list = approvalsByRfqId.get(Number(ap.sourceEntityId)) ?? [];
      list.push(ap);
      approvalsByRfqId.set(Number(ap.sourceEntityId), list);
    }
  }
  // 결재 안에서 최신순으로 정렬해 두면 카드가 가장 최근 결재 1건 기준으로 배지를 그릴 수 있다.
  for (const list of approvalsByRfqId.values()) {
    list.sort((a, b) => Number(b.id ?? 0) - Number(a.id ?? 0));
  }

  // [Task #682 review-fix] 결재가 통과되어 자동 발행된 지출결의/입금요청을
  //   RFQ 카드에서 직접 보여 주고, "기안서 작성" 중복 트리거를 막기 위해 한 번에 가져온다.
  //   매니저 역할은 GET /api/expense-vouchers, GET /api/payment-requests 에 접근 권한이 있다.
  // [Task #682 review-fix #2] 백엔드는 Bearer 토큰 인증이라 fetch 에 Authorization 헤더가 반드시 필요.
  //   token 이 없을 때(로그인 직전 등)는 enabled=false 로 호출 자체를 보류한다.
  const { data: vouchers } = useQuery<any[]>({
    queryKey: ["/api/expense-vouchers", "for-rfqs", token ? "auth" : "anon"],
    enabled: !!token,
    queryFn: async () => {
      const res = await fetch("/api/expense-vouchers", {
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!res.ok) return [] as any[];
      return (await res.json()) as any[];
    },
    staleTime: 30_000,
  });
  const { data: paymentReqs } = useQuery<any[]>({
    queryKey: ["/api/payment-requests", "for-rfqs", token ? "auth" : "anon"],
    enabled: !!token,
    queryFn: async () => {
      const res = await fetch("/api/payment-requests", {
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!res.ok) return [] as any[];
      return (await res.json()) as any[];
    },
    staleTime: 30_000,
  });
  const vouchersByRfqId = new Map<number, any[]>();
  for (const v of (vouchers as any[] | undefined) ?? []) {
    if (v?.sourceEntityType === "rfq" && v.sourceEntityId != null) {
      const list = vouchersByRfqId.get(Number(v.sourceEntityId)) ?? [];
      list.push(v);
      vouchersByRfqId.set(Number(v.sourceEntityId), list);
    }
  }
  const paymentReqsByRfqId = new Map<number, any[]>();
  for (const p of (paymentReqs as any[] | undefined) ?? []) {
    if (p?.sourceEntityType === "rfq" && p.sourceEntityId != null) {
      const list = paymentReqsByRfqId.get(Number(p.sourceEntityId)) ?? [];
      list.push(p);
      paymentReqsByRfqId.set(Number(p.sourceEntityId), list);
    }
  }

  // [Task #682 review-fix] 인박스에서 "관련 RFQ" 백링크 클릭 → /rfqs?focus=N 로
  //   진입했을 때 해당 카드를 자동 스크롤한다. 카드가 그려진 직후를 보장하기 위해
  //   small timeout + retry. 한 번 동작하면 focus 파라미터는 URL 에서 제거.
  const focusParam = new URLSearchParams(search).get("focus");
  const focusRfqId = focusParam ? Number(focusParam) : null;
  useEffect(() => {
    if (!focusRfqId || !rfqs || rfqs.length === 0) return;
    let cancelled = false;
    let tries = 0;
    const tick = () => {
      if (cancelled) return;
      const el = document.querySelector(
        `[data-testid="rfq-card-${focusRfqId}"]`,
      ) as HTMLElement | null;
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        el.classList.add("ring-2", "ring-primary", "ring-offset-2");
        setTimeout(() => {
          el.classList.remove("ring-2", "ring-primary", "ring-offset-2");
        }, 2400);
        const url = new URL(window.location.href);
        url.searchParams.delete("focus");
        window.history.replaceState({}, "", url.toString());
      } else if (tries < 12) {
        tries += 1;
        setTimeout(tick, 150);
      }
    };
    tick();
    return () => {
      cancelled = true;
    };
  }, [focusRfqId, rfqs]);

  return (
    <div className="space-y-6">
      {/* [Task #226] HQ 어드민(본사 관리자/임원)에게는 RFQ 목록 위에 매칭/견적/크레딧 통계를 노출한다. */}
      <RfqMatchStatsCard />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">파트너사 견적받기</h1>
          <p className="text-muted-foreground text-sm mt-1">
            협력업체에 견적을 요청하고 비교합니다
          </p>
        </div>
        <ResponsiveDialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); resetForm(); }}>
          <ResponsiveDialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              견적 요청
            </Button>
          </ResponsiveDialogTrigger>
          <ResponsiveDialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <ResponsiveDialogHeader>
              {/* [Task #510] 모달 제목을 하단 제출 버튼 라벨과 동일한 "파트너사
                   비교견적받기" 로 통일해 사용자가 어떤 액션이 일어나는지
                   명확히 알 수 있도록 한다. 트리거 버튼(헤더의 "+ 견적 요청")
                   라벨은 그대로 유지. */}
              <ResponsiveDialogTitle>파트너사 견적받기</ResponsiveDialogTitle>
            </ResponsiveDialogHeader>
            <div className="space-y-4">
              {!buildingReady && (
                <div
                  className="rounded-xl border p-3 text-sm space-y-2"
                  style={{ borderColor: "var(--brand-border)", background: "var(--brand-light)" }}
                  data-testid="rfq-building-missing-warning"
                >
                  <p>건물 정보(이름·주소)를 먼저 등록해 주세요.</p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setDialogOpen(false);
                      setLocation("/settings/building#address-info");
                    }}
                    data-testid="rfq-go-to-building-setup"
                  >
                    건물 정보 설정으로 이동
                  </Button>
                </div>
              )}
              <RfqQuickRequestWidget
                buildingReady={buildingReady}
                isSubmitting={createMutation.isPending}
                onSubmit={submitQuickRequest}
              />
            </div>
          </ResponsiveDialogContent>
        </ResponsiveDialog>
      </div>

      <div className="flex gap-3">
        <Select value={filterStatus || "all"} onValueChange={(v) => setFilterStatus(v === "all" ? undefined : v)}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="상태" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체</SelectItem>
            <SelectItem value="open">접수중</SelectItem>
            <SelectItem value="closed">마감</SelectItem>
            <SelectItem value="cancelled">취소</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : rfqs && rfqs.length > 0 ? (
        <div className="space-y-3">
          {rfqs.map((rfq: any) => (
            <RfqCard
              key={rfq.id}
              rfq={rfq}
              quotes={quotesByRfqId.get(rfq.id) ?? []}
              relatedApprovals={approvalsByRfqId.get(rfq.id) ?? []}
              relatedVouchers={vouchersByRfqId.get(rfq.id) ?? []}
              relatedPaymentReqs={paymentReqsByRfqId.get(rfq.id) ?? []}
              onAcceptQuote={handleAcceptQuote}
              acceptPending={updateQuoteMutation.isPending}
              onOpenDoc={() =>
                setRfqDocRfq({
                  title: rfq.title,
                  category: rfq.category,
                  serviceType: rfq.serviceType,
                  description: rfq.description,
                  buildingName: rfq.buildingName,
                  desiredDate: rfq.desiredDate,
                  deadline: rfq.deadline,
                  sido: rfq.sido,
                  sigungu: rfq.sigungu,
                  closeUpPhotoUrl: rfq.closeUpPhotoUrl,
                  widePhotoUrl: rfq.widePhotoUrl,
                  createdAt: rfq.createdAt,
                })
              }
              onExpandScope={() => handleExpandScope(rfq.id)}
              onCloseRfq={() => handleCloseRfq(rfq.id)}
              onDelete={() => handleDelete(rfq.id)}
              onCreateApproval={() => {
                // [Task #682] RFQ → 기안 prefill. 카테고리는 RFQ 분류와 직접
                //   대응되지 않으므로 maintenance 로 시작(/approvals/create 에서 변경 가능).
                const url = buildApprovalPrefillUrl({
                  kind: "rfq",
                  sourceTable: "rfqs",
                  sourceId: rfq.id,
                  title: `[파트너사 견적] ${rfq.title}`,
                  buildingId: rfq.buildingId ?? null,
                  vendorName: null,
                  description: rfq.description ?? null,
                  sourceEntityType: "rfq",
                  sourceEntityId: rfq.id,
                  // [Task #682 review-fix #2] 결재 화면이 원본 RFQ 와 첨부 사진을
                  //   바로 보여 줄 수 있도록 함께 전달.
                  sourceUrl: `/rfqs?focus=${rfq.id}`,
                  photos: [rfq.closeUpPhotoUrl, rfq.widePhotoUrl],
                  metadata: { category: "maintenance" },
                });
                setLocation(url);
              }}
              statusLabel={statusLabel}
              statusColor={statusColor}
              categoryLabel={categoryLabel}
            />

          ))}
        </div>
      ) : (
        // [Task #388] 적합한 알림이 잡히면 비교 견적 유도 카드, 없으면 기존 빈 상태.
        // [Task #682 review-fix] 빈 상태일 때 "왜 RFQ 가 안 보이는지" 진단 — 공고를
        //   올렸는데도 협력사가 응답하지 않는 케이스와 그냥 한 건도 없는 케이스를 구분.
        <div className="space-y-3">
          <EmptyQuoteRfqSuggestion
            variant="rfqs-page"
            fallback={
              <Card>
                <CardContent className="py-12 text-center">
                  <FileText className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
                  <p className="text-muted-foreground">견적 요청이 없습니다</p>
                </CardContent>
              </Card>
            }
          />
          <Card
            className="border-slate-200 bg-slate-50/50"
            data-testid="rfqs-empty-diagnostic"
          >
            <CardContent className="p-4 space-y-2">
              <p className="font-medium text-sm">매칭은 어떻게 동작하나요?</p>
              <ul className="text-xs text-muted-foreground list-disc pl-5 space-y-1">
                <li>
                  견적 요청의 <strong>분야(category)</strong> 와{" "}
                  <strong>활동지역</strong> 두 가지가 모두 일치하는 협력사에게만
                  공고가 노출됩니다.
                </li>
                <li>
                  지역 옵션은 시·도 단위 또는 시·군·구 단위입니다. 시·군·구로
                  좁혀 두면 더 가까운 업체만 보지만, 매칭 수가 줄어듭니다.
                </li>
                <li>
                  매칭 수가 0 이라면 견적 요청 카드의 "범위 확대"로 시·도까지 넓히거나,
                  분야 설정을 다시 확인해 주세요.
                </li>
              </ul>
            </CardContent>
          </Card>
        </div>
      )}

      {rfqDocRfq && (
        <RfqRequestDocument
          open={!!rfqDocRfq}
          onOpenChange={(o) => { if (!o) setRfqDocRfq(null); }}
          rfq={rfqDocRfq}
          officeContact={building?.managementOfficePhone ? `관리사무소 ☎ ${building.managementOfficePhone}` : undefined}
          logoUrl={building?.logoUrl ?? null}
        />
      )}
    </div>
  );
}

// [Task #682] RFQ 카드 — 헤더/메타/액션을 한 컴포넌트로 묶어 부모 페이지의
//   if-체인을 단순화하고, 카드 자체가 매칭 협력사 수와 파이프라인 상태 배지를
//   계산해 노출한다. 부모는 비교/소통 패널을 children 으로 주입한다.
function RfqCard({
  rfq,
  relatedApprovals,
  relatedVouchers,
  relatedPaymentReqs,
  quotes,
  onAcceptQuote,
  acceptPending,
  onOpenDoc,
  onExpandScope,
  onCloseRfq,
  onDelete,
  onCreateApproval,
  statusLabel,
  statusColor,
  categoryLabel,
}: {
  rfq: any;
  relatedApprovals: any[];
  relatedVouchers: any[];
  relatedPaymentReqs: any[];
  quotes: any[];
  onAcceptQuote: (quote: any) => void | Promise<void>;
  acceptPending: boolean;
  onOpenDoc: () => void;
  onExpandScope: () => void;
  onCloseRfq: () => void;
  onDelete: () => void;
  onCreateApproval: () => void;
  statusLabel: (s: string) => string;
  statusColor: (s: string) => string;
  categoryLabel: (c: string) => string;
}) {
  // [Task #682 review-fix] 결재 파이프라인 상태 — 최근 결재 1건 + 후속 발행물.
  //   배지 1개로 끝내지 않고 "기안 → 지출결의 → 입금요청 → 출납기록/송금완료" 까지
  //   진행 단계를 모두 보여 주어 중복 진입을 막는다.
  const latestApproval = relatedApprovals.length > 0 ? relatedApprovals[0] : null;
  const inProgressApproval = relatedApprovals.find(
    (a) => {
      const s = String(a.status ?? "");
      return s !== "approved" && s !== "rejected" && s !== "cancelled";
    },
  );
  let approvalBadge: { label: string; className: string } | null = null;
  if (latestApproval) {
    const apStatus = String(latestApproval.status ?? "");
    if (apStatus === "approved") {
      approvalBadge = {
        label: `기안 승인 #${latestApproval.id}`,
        className: "bg-emerald-100 text-emerald-800 border border-emerald-300",
      };
    } else if (apStatus === "rejected") {
      approvalBadge = {
        label: `기안 반려 #${latestApproval.id}`,
        className: "bg-red-100 text-red-700 border border-red-300",
      };
    } else {
      approvalBadge = {
        label: `기안 진행중 #${latestApproval.id}`,
        className: "bg-blue-100 text-blue-700 border border-blue-300",
      };
    }
  }
  const issuedVoucher = relatedVouchers[0] ?? null;
  const issuedPayment = relatedPaymentReqs[0] ?? null;
  const voucherBadge = issuedVoucher
    ? issuedVoucher.status === "recorded"
      ? {
          label: `출납등록 완료 #${issuedVoucher.id}`,
          className: "bg-emerald-100 text-emerald-800 border border-emerald-300",
        }
      : {
          label: `지출결의 발행됨 #${issuedVoucher.id}`,
          className: "bg-violet-100 text-violet-800 border border-violet-300",
        }
    : null;
  const paymentBadge = issuedPayment
    ? issuedPayment.status === "remitted"
      ? {
          label: `송금완료 #${issuedPayment.id}`,
          className: "bg-emerald-100 text-emerald-800 border border-emerald-300",
        }
      : {
          label: `입금요청 발행됨 #${issuedPayment.id}`,
          className: "bg-amber-100 text-amber-800 border border-amber-300",
        }
    : null;

  return (
    <Card data-testid={`rfq-card-${rfq.id}`}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <FileText className="w-4 h-4 text-primary shrink-0" />
              <h3 className="font-medium">{rfq.title}</h3>
              <Badge variant={statusColor(rfq.status) as any}>
                {statusLabel(rfq.status)}
              </Badge>
            </div>

            {/* 결재/지출/입금 파이프라인 배지 — 매칭/마감/방문 배지는 단순화로 제거됨 */}
            <div
              className="flex items-center gap-2 flex-wrap mt-1.5"
              data-testid={`rfq-pipeline-badges-${rfq.id}`}
            >
              {approvalBadge && (
                <Badge
                  className={approvalBadge.className}
                  data-testid={`rfq-approval-badge-${rfq.id}`}
                >
                  <ClipboardList className="w-3 h-3 mr-0.5" />
                  {approvalBadge.label}
                </Badge>
              )}
              {voucherBadge && (
                <Badge
                  className={voucherBadge.className}
                  data-testid={`rfq-voucher-badge-${rfq.id}`}
                >
                  <Receipt className="w-3 h-3 mr-0.5" />
                  {voucherBadge.label}
                </Badge>
              )}
              {paymentBadge && (
                <Badge
                  className={paymentBadge.className}
                  data-testid={`rfq-payment-badge-${rfq.id}`}
                >
                  <Send className="w-3 h-3 mr-0.5" />
                  {paymentBadge.label}
                </Badge>
              )}
            </div>

            {/* 카드 메타 — 건물명/분류/마감일만 텍스트로 단순 표기 (희망일·용역 라벨 제거). */}
            <div className="flex gap-4 text-sm text-muted-foreground mt-2 flex-wrap">
              <span>건물: {rfq.buildingName}</span>
              <span>분류: {categoryLabel(rfq.category)}</span>
              <span>마감: {formatDate(rfq.deadline)}</span>
            </div>
            {rfq.description && (
              <p className="text-sm text-muted-foreground mt-2">
                {rfq.description}
              </p>
            )}
            {(rfq.closeUpPhotoUrl || rfq.widePhotoUrl) && (
              <div className="flex gap-2 mt-2">
                {rfq.closeUpPhotoUrl && (
                  <AuthImage
                    src={rfq.closeUpPhotoUrl}
                    alt="근경"
                    className="w-16 h-16 rounded border object-cover"
                  />
                )}
                {rfq.widePhotoUrl && (
                  <AuthImage
                    src={rfq.widePhotoUrl}
                    alt="원경"
                    className="w-16 h-16 rounded border object-cover"
                  />
                )}
              </div>
            )}
          </div>

          {/* 액션 영역 — kebab 만 유지 (견적 비교/소통/방문 버튼 제거). */}
          <div className="flex gap-1 items-start shrink-0">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  data-testid={`rfq-kebab-${rfq.id}`}
                  aria-label="더 보기"
                >
                  <MoreVertical className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>이 견적 요청 작업</DropdownMenuLabel>
                {/* [Task #682 review-fix] 같은 RFQ 의 결재가 이미 진행중이면
                    중복 기안 가능성을 사용자에게 경고한 뒤 진행한다. */}
                <DropdownMenuItem
                  onClick={(e) => {
                    if (inProgressApproval) {
                      const ok = window.confirm(
                        `이미 진행중인 기안이 있습니다 (#${inProgressApproval.id}). 그래도 새 기안을 작성하시겠어요?`,
                      );
                      if (!ok) {
                        e.preventDefault();
                        return;
                      }
                    }
                    onCreateApproval();
                  }}
                  data-testid={`rfq-create-approval-${rfq.id}`}
                >
                  <ClipboardList className="w-4 h-4 mr-2" />
                  기안서 작성
                  {inProgressApproval && (
                    <span className="ml-auto text-[10px] text-amber-600">진행중</span>
                  )}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onOpenDoc}>
                  <Printer className="w-4 h-4 mr-2" />
                  의뢰서 출력
                </DropdownMenuItem>
                {rfq.status === "open" && rfq.geoScope === "sigungu" && (
                  <DropdownMenuItem onClick={onExpandScope}>
                    <Expand className="w-4 h-4 mr-2" />
                    범위 확대(시·도)
                  </DropdownMenuItem>
                )}
                {rfq.status === "open" && (
                  <DropdownMenuItem onClick={onCloseRfq}>
                    <CheckCircle className="w-4 h-4 mr-2" />
                    마감 처리
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={onDelete}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  삭제
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* 들어온 견적 — 카드 형태로 나란히 나열, 카드당 "선택하기" 버튼 1개. */}
        {quotes.length > 0 && (
          <div
            className="mt-4 border-t pt-4"
            data-testid={`rfq-quotes-${rfq.id}`}
          >
            <h4 className="font-medium text-sm mb-3">받은 견적 {quotes.length}건</h4>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {quotes.map((q) => {
                const isAccepted = q.status === "accepted";
                const isRejected = q.status === "rejected";
                return (
                  <div
                    key={q.id}
                    className={`rounded-lg border p-4 flex flex-col gap-2 ${
                      isAccepted
                        ? "border-primary bg-primary/5"
                        : "bg-card"
                    }`}
                    data-testid={`rfq-quote-card-${q.id}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-sm truncate">
                        {q.vendorName}
                      </span>
                      {isAccepted && (
                        <Badge className="bg-primary text-primary-foreground text-[10px]">
                          선택됨
                        </Badge>
                      )}
                      {isRejected && (
                        <Badge variant="outline" className="text-[10px]">
                          반려
                        </Badge>
                      )}
                    </div>
                    <div className="text-2xl font-bold tabular-nums">
                      {Number(q.totalAmount ?? 0).toLocaleString()}
                      <span className="text-sm font-medium text-muted-foreground ml-1">
                        원
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      제출일 {formatDate(q.createdAt)}
                    </div>
                    {q.status === "submitted" && (
                      <Button
                        size="sm"
                        className="mt-1 w-full"
                        onClick={() => onAcceptQuote(q)}
                        disabled={acceptPending}
                        data-testid={`rfq-quote-accept-${q.id}`}
                      >
                        <CheckCircle className="w-3.5 h-3.5 mr-1" />
                        선택하기
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

