import { useEffect, useState } from "react";
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
  useGetQuote,
  useGetRfqMatchedVendors,
  useListApprovals,
  listContracts,
  getListRfqsQueryKey,
  getListQuotesQueryKey,
  useListRfqMessages,
  usePostRfqMessage,
  useMarkRfqMessagesRead,
  useListRfqSiteVisits,
  useUpdateRfqSiteVisit,
  getListRfqMessagesQueryKey,
  getListRfqSiteVisitsQueryKey,
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
  XCircle,
  Trash2,
  BarChart3,
  MapPin,
  Expand,
  Printer,
  ChevronDown,
  ChevronUp,
  MessageSquare,
  CalendarDays,
  Send,
  MoreVertical,
  Users,
  AlertTriangle,
  ClipboardList,
  Receipt,
  HelpCircle,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
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
import { IntermediaryDisclaimerBanner, recordConsent } from "@/components/intermediary-disclaimer";
import { RfqMatchStatsCard } from "@/pages/settings";
import { VendorRatingInline } from "@/components/star-rating";

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

// [Task: RFQ 정합성] 관리자 분야 관리(vendor_categories) 순서·코드와 일치시킨다.
//   - facility_maintenance 가 SoT (legacy maintenance_repair 는 라벨 폴백만 유지).
const categoryOptions = [
  { value: "elevator", label: "승강기" },
  { value: "fire_safety", label: "소방" },
  { value: "electrical", label: "전기" },
  { value: "mechanical", label: "기계설비" },
  { value: "gas", label: "가스" },
  { value: "water_tank", label: "저수조" },
  { value: "septic", label: "정화조" },
  { value: "cleaning", label: "청소" },
  { value: "security", label: "보안" },
  { value: "waterproofing", label: "방수" },
  { value: "water_leak", label: "누수" },
  { value: "hvac", label: "냉난방" },
  { value: "facility_maintenance", label: "영선/수선유지" },
  { value: "defect_diagnosis", label: "하자진단" },
  { value: "building_maintenance", label: "건물관리" },
  { value: "landscaping", label: "조경" },
  { value: "other", label: "기타" },
];

export default function Rfqs() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [compareRfqId, setCompareRfqId] = useState<number | null>(null);
  // [Task #612] 카드별로 메시지/현장방문 패널을 토글한다 (한 번에 하나만 열림).
  const [commsRfqId, setCommsRfqId] = useState<number | null>(null);
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
  const { data: compareQuotes } = useListQuotes(
    compareRfqId ? { rfqId: compareRfqId } : undefined,
    { query: { enabled: !!compareRfqId } }
  );
  const createMutation = useCreateRfq();
  const updateMutation = useUpdateRfq();
  const deleteMutation = useDeleteRfq();
  const updateQuoteMutation = useUpdateQuote();
  const expandScopeMutation = useExpandRfqScope();

  // [Task #335] /rfqs?openQuote={id} 딥링크 처리.
  // 1) 견적 상세를 조회해 firstViewedAt 을 자동 세팅(서버측 quotes.ts:104) → 대시보드 알림 자동 소거.
  // 2) 해당 견적이 속한 RFQ 의 비교 패널을 열어 매니저가 바로 채택 결정을 내릴 수 있게 한다.
  const [openQuoteId, setOpenQuoteId] = useState<number | null>(null);
  useEffect(() => {
    const url = new URL(window.location.href);
    const q = url.searchParams.get("openQuote");
    if (q) {
      const id = Number(q);
      if (!Number.isNaN(id)) setOpenQuoteId(id);
      url.searchParams.delete("openQuote");
      window.history.replaceState({}, "", url.toString());
    }
  }, []);
  // /rfqs?new=1 — 대시보드 등에서 견적 요청 진입 시 작성 다이얼로그 자동 오픈 (URL 정리는 openQuote 와 동일 패턴).
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("new") === "1") {
      setDialogOpen(true);
      url.searchParams.delete("new");
      window.history.replaceState({}, "", url.toString());
    }
  }, []);
  // [Phase1 마무리 D] /rfqs?openVisit={rfqId} — 현장 방문 알림 카드에서
  //   진입 시 해당 RFQ 의 비교 패널을 자동으로 펼쳐서 매니저가 일정을 확인/
  //   확정/조정할 수 있게 한다. URL 정리는 openQuote/new 패턴과 동일.
  useEffect(() => {
    const url = new URL(window.location.href);
    const v = url.searchParams.get("openVisit");
    if (v) {
      const id = Number(v);
      if (!Number.isNaN(id) && id > 0) setCompareRfqId(id);
      url.searchParams.delete("openVisit");
      window.history.replaceState({}, "", url.toString());
    }
  }, []);
  const { data: openedQuote } = useGetQuote(openQuoteId ?? 0, {
    query: { enabled: openQuoteId !== null && openQuoteId > 0 },
  });
  useEffect(() => {
    if (openedQuote && openedQuote.rfqId) {
      setCompareRfqId(openedQuote.rfqId);
      // 대시보드 알림 카드 즉시 갱신을 위해 alerts 쿼리도 invalidate.
      queryClient.invalidateQueries({ queryKey: ["/dashboard/alerts"] });
      setOpenQuoteId(null);
    }
  }, [openedQuote, queryClient]);

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
      category: validCategories.includes(incomingCategory) ? incomingCategory : prev.category,
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

  async function handleAcceptQuote(quoteId: number) {
    if (!token) {
      toast({ title: "로그인이 필요합니다", variant: "destructive" });
      return;
    }
    if (!confirm("견적을 채택하면 관리단과 파트너사 간의 직접 계약이 성립됩니다.\n플랫폼 운영사는 통신판매중개자로서 계약의 당사자가 아니며, 계약 이행·하자에 대한 책임을 지지 않습니다.\n\n위 내용을 확인하고 채택을 진행하시겠습니까?")) return;
    try {
      await recordConsent(token, "contract_disclaimer", `quote_accept:${quoteId}`, { throwOnError: true });
    } catch {
      toast({ title: "동의 기록에 실패했습니다", variant: "destructive" });
      return;
    }
    await updateQuoteMutation.mutateAsync({ id: quoteId, data: { status: "accepted" } });
    queryClient.invalidateQueries({ queryKey: getListQuotesQueryKey() });

    // [Task #335] 채택 직후 자동 생성된 계약 초안 페이지로 이동해 결재선·계약 진행을 바로 이어간다.
    // listContracts 의 quoteId 필터로 단건 조회 (전체 스캔 회피).
    try {
      const contracts = await listContracts({ quoteId });
      const created = contracts[0];
      if (created) {
        toast({ title: "견적이 채택되었습니다", description: "자동 생성된 계약 초안으로 이동합니다." });
        setLocation(`/contracts?openContract=${created.id}`);
        return;
      }
    } catch {
      // 계약 목록 조회 실패 시 토스트만 띄우고 현재 화면 유지.
    }
    toast({ title: "견적이 채택되었습니다" });
  }

  async function handleRejectQuote(quoteId: number) {
    await updateQuoteMutation.mutateAsync({ id: quoteId, data: { status: "rejected" } });
    queryClient.invalidateQueries({ queryKey: getListQuotesQueryKey() });
    toast({ title: "견적이 반려되었습니다" });
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

  // [Task #339] 견적 비교에서 업체별 누적 별점·건수를 빠르게 조회하기 위한 맵.
  // [Task #407] 폼에서 "추가 발송 업체" 선택 목록이 제거되어 platformVendors 는 더 이상 사용되지 않음.
  const vendorById = new Map<number, Vendor>((vendors || []).map((v) => [v.id, v]));

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
          <h1 className="text-2xl font-bold">견적 요청 (RFQ)</h1>
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
              <ResponsiveDialogTitle>파트너사 비교견적받기</ResponsiveDialogTitle>
            </ResponsiveDialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              {!buildingReady && (
                <div
                  className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 space-y-2"
                  data-testid="rfq-building-missing-warning"
                >
                  <p>
                    현재 선택된 건물 정보가 비어 있어 견적 요청을 생성할 수 없습니다. 건물 정보(이름·주소)를 먼저 등록해주세요.
                  </p>
                  {/* [Task #475] 건물 설정으로 한 번에 이동할 수 있는 우회 동선.
                       주소 카드(#address-info) 로 즉시 스크롤되도록 hash 를 함께 보낸다.
                       [Task #485] 단독 페이지 분리 후 진입점은 /settings/building. */}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setDialogOpen(false);
                      setLocation("/settings/building#address-info");
                    }}
                    className="border-amber-400 text-amber-900 hover:bg-amber-100"
                    data-testid="rfq-go-to-building-setup"
                  >
                    건물 정보 설정으로 이동
                  </Button>
                </div>
              )}

              <div>
                <Label>
                  시설분야 <span className="text-destructive">*</span>
                </Label>
                <Select value={form.category || undefined} onValueChange={(v) => setForm({ ...form, category: v })}>
                  <SelectTrigger data-testid="rfq-category-trigger"><SelectValue placeholder="시설분야 선택" /></SelectTrigger>
                  <SelectContent>
                    {categoryOptions.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>
                  용역종류 <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={form.serviceType || undefined}
                  onValueChange={(v) => setForm({ ...form, serviceType: v as RfqServiceType })}
                >
                  <SelectTrigger data-testid="rfq-service-type-trigger"><SelectValue placeholder="용역종류 선택" /></SelectTrigger>
                  <SelectContent>
                    {(Object.entries(RFQ_SERVICE_TYPE_LABELS) as [RfqServiceType, string][]).map(([value, label]) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="border-t pt-4">
                <p className="text-sm font-medium mb-3">
                  현장 사진 <span className="text-destructive">*</span>
                </p>
                {/* [Task #407] 좌측 원경 → 우측 근경 순서로 표시 (이전: 근경-원경). */}
                <div className="grid grid-cols-2 gap-4">
                  <PhotoUploadField
                    label="원경 사진 *"
                    value={widePhotoUrl}
                    onChange={setWidePhotoUrl}
                    testId="rfq-photo-wide"
                  />
                  <PhotoUploadField
                    label="근경 사진 *"
                    value={closeUpPhotoUrl}
                    onChange={setCloseUpPhotoUrl}
                    testId="rfq-photo-close-up"
                  />
                </div>
                {!photosReady && (
                  <p className="text-xs text-destructive mt-2">원경/근경 사진은 필수입니다.</p>
                )}
              </div>

              {buildingReady && (
                <div className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground space-y-0.5">
                  <div className="flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    <span>{buildingName}</span>
                  </div>
                  <div>제목(자동): {effectiveTitle}</div>
                  <div>마감(기본): 오늘 + 1일</div>
                </div>
              )}

              <div className="border-t pt-3">
                {/* [Task #407] 추가 옵션은 제목 수정·상세 설명만 노출. 희망일·마감일·추가 발송 업체는 제거됨. */}
                <button
                  type="button"
                  onClick={() => setAdvancedOpen((v) => !v)}
                  className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
                  data-testid="rfq-advanced-toggle"
                >
                  {advancedOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  추가 옵션 (제목 수정·상세 설명)
                </button>

                {advancedOpen && (
                  <div className="mt-4 space-y-4">
                    <div>
                      <Label>제목 (자동 생성됨)</Label>
                      <Input
                        value={form.titleManuallyEdited ? form.title : autoTitle}
                        onChange={(e) =>
                          setForm({ ...form, title: e.target.value, titleManuallyEdited: true })
                        }
                        placeholder={autoTitle}
                      />
                    </div>
                    <div>
                      <Label>상세 설명</Label>
                      {/* [Task #407] 본문 영역 높이를 약 1.5배(60px → 90px)로 확대. */}
                      <Textarea
                        value={effectiveDescription}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            description: e.target.value,
                            descriptionManuallyEdited: true,
                          })
                        }
                        placeholder="작업 내용, 특이사항 등을 기재해주세요"
                        className="min-h-[90px]"
                        data-testid="rfq-description"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* [Task #612] 현장 확인이 꼭 필요한 견적이면 체크 — 파트너 화면에
                   "현장방문 필요" 배지가 노출되고, 견적 제출 전 방문 일정 협의를
                   유도한다. */}
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.requiresSiteVisit}
                  onChange={(e) =>
                    setForm({ ...form, requiresSiteVisit: e.target.checked })
                  }
                  data-testid="rfq-requires-site-visit"
                />
                <span>현장방문 견적 필요 (파트너에게 방문 일정 협의를 요청)</span>
              </label>

              {/* [Task #449] 버튼은 항상 활성화 상태로 두고, 부족한 항목은 onClick 시점에
                  토스트로 안내한다. 잠금 사유는 버튼 위에 한 줄 안내로도 노출. */}
              {missingItems.length > 0 && (
                <p
                  className="text-xs text-muted-foreground"
                  data-testid="rfq-missing-hint"
                >
                  남은 필수 항목: {missingItems.join(", ")}
                </p>
              )}
              {/* [Task #510] 제출 진행 중에는 버튼을 비활성화해 더블 클릭으로
                   인한 중복 생성과 "버튼이 안 눌리는 것 같다" 는 인상을 막는다.
                   누락 항목 검증은 onClick 시점 토스트로 별도로 안내한다. */}
              <Button
                type="submit"
                className="w-full"
                data-testid="rfq-submit"
                disabled={createMutation.isPending}
              >
                {createMutation.isPending ? "요청을 보내는 중..." : "파트너사 비교견적받기"}
              </Button>
            </form>
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
              relatedApprovals={approvalsByRfqId.get(rfq.id) ?? []}
              relatedVouchers={vouchersByRfqId.get(rfq.id) ?? []}
              relatedPaymentReqs={paymentReqsByRfqId.get(rfq.id) ?? []}
              vendors={vendors || []}
              compareOpen={compareRfqId === rfq.id}
              commsOpen={commsRfqId === rfq.id}
              onToggleCompare={() =>
                setCompareRfqId(compareRfqId === rfq.id ? null : rfq.id)
              }
              onToggleComms={() =>
                setCommsRfqId(commsRfqId === rfq.id ? null : rfq.id)
              }
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
                  title: `[비교견적] ${rfq.title}`,
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
            >
                {commsRfqId === rfq.id && (
                  <RfqCommsPanel rfq={rfq} vendors={vendors || []} />
                )}

                {compareRfqId === rfq.id && (
                  <div className="mt-4 border-t pt-4">
                    <h4 className="font-medium text-sm mb-3 flex items-center gap-2">
                      <BarChart3 className="w-4 h-4" />
                      견적서 비교
                    </h4>
                    <IntermediaryDisclaimerBanner className="mb-3" />
                    {compareQuotes && compareQuotes.length > 0 ? (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b bg-muted/50">
                              <th className="text-left p-2 font-medium">업체</th>
                              <th className="text-left p-2 font-medium">평가</th>
                              <th className="text-right p-2 font-medium">견적 금액</th>
                              <th className="text-center p-2 font-medium">예상 소요일</th>
                              <th className="text-center p-2 font-medium">착수 가능일</th>
                              <th className="text-center p-2 font-medium">유효기한</th>
                              <th className="text-left p-2 font-medium">작업 범위</th>
                              <th className="text-center p-2 font-medium">상태</th>
                              <th className="text-center p-2 font-medium">관리</th>
                            </tr>
                          </thead>
                          <tbody>
                            {compareQuotes.map((q: any) => {
                              // [Task #339] 업체별 누적 별점·건수 표시.
                              const v = vendorById.get(q.vendorId);
                              return (
                              <tr key={q.id} className="border-b last:border-0">
                                <td className="p-2 font-medium">{q.vendorName}</td>
                                <td className="p-2">
                                  <VendorRatingInline
                                    avgRating={v?.avgRating}
                                    reviewCount={v?.reviewCount}
                                  />
                                </td>
                                <td className="p-2 text-right font-medium">{q.totalAmount.toLocaleString()}원</td>
                                <td className="p-2 text-center">{q.estimatedDays ? `${q.estimatedDays}일` : "-"}</td>
                                <td className="p-2 text-center">{q.availableDate ? formatDate(q.availableDate) : "-"}</td>
                                <td className="p-2 text-center">{q.validUntil ? formatDate(q.validUntil) : "-"}</td>
                                <td className="p-2 text-sm">{q.scope || "-"}</td>
                                <td className="p-2 text-center">
                                  <Badge variant={
                                    q.status === "accepted" ? "default" :
                                    q.status === "rejected" ? "destructive" : "secondary"
                                  }>
                                    {q.status === "submitted" ? "제출" : q.status === "accepted" ? "채택" : "반려"}
                                  </Badge>
                                </td>
                                <td className="p-2 text-center">
                                  {q.status === "submitted" && (
                                    <div className="flex flex-wrap gap-1 justify-center">
                                      {/* [Task #335] 견적 채택은 곧바로 업체선정 품의·계약을 자동 생성하므로
                                          CTA 문구를 "수락하고 계약 진행" 으로 명시한다. */}
                                      <Button size="sm" variant="outline" onClick={() => handleAcceptQuote(q.id)}>
                                        <CheckCircle className="w-3 h-3 mr-1" />
                                        수락하고 계약 진행
                                      </Button>
                                      {/* [Task #682 review-fix] 채택 직전에 본부장/총괄 라인이 필요한 경우를 위해
                                          행 단위 "기안서 작성" 도 제공. 업체명/금액/예상 소요일을 prefill 한다. */}
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        data-testid={`quote-create-approval-${q.id}`}
                                        onClick={() => {
                                          const url = buildApprovalPrefillUrl({
                                            kind: "rfq",
                                            sourceTable: "rfqs",
                                            sourceId: rfq.id,
                                            title: `[비교견적] ${rfq.title} — ${q.vendorName}`,
                                            buildingId: rfq.buildingId ?? null,
                                            vendorName: q.vendorName ?? null,
                                            estimatedAmount: typeof q.totalAmount === "number" ? q.totalAmount : Number(q.totalAmount ?? 0) || null,
                                            description: [
                                              `RFQ #${rfq.id} ${rfq.title}`,
                                              `업체: ${q.vendorName} (견적 #${q.id})`,
                                              `금액: ${Number(q.totalAmount ?? 0).toLocaleString()}원`,
                                              q.estimatedDays ? `예상 소요: ${q.estimatedDays}일` : null,
                                              q.scope ? `범위: ${q.scope}` : null,
                                            ].filter(Boolean).join("\n"),
                                            sourceEntityType: "rfq",
                                            sourceEntityId: rfq.id,
                                            // [Task #682 review-fix #2] 원본 RFQ 링크 + 첨부 사진을 결재 화면에 전달.
                                            sourceUrl: `/rfqs?focus=${rfq.id}`,
                                            photos: [rfq.closeUpPhotoUrl, rfq.widePhotoUrl],
                                            metadata: { category: "maintenance" },
                                          });
                                          setLocation(url);
                                        }}
                                      >
                                        <ClipboardList className="w-3 h-3 mr-1" />
                                        기안서 작성
                                      </Button>
                                      <Button size="sm" variant="ghost" onClick={() => handleRejectQuote(q.id)}>
                                        <XCircle className="w-3 h-3" />
                                      </Button>
                                    </div>
                                  )}
                                </td>
                              </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      // [Task #388] 제출된 견적이 0건인 경우에도 비교 견적 유도 카드 노출.
                      <EmptyQuoteRfqSuggestion
                        variant="rfqs-page-submitted"
                        fallback={
                          <p className="text-sm text-muted-foreground text-center py-4">
                            아직 제출된 견적이 없습니다
                          </p>
                        }
                      />
                    )}
                  </div>
                )}
            </RfqCard>
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
              <p className="font-medium text-sm flex items-center gap-2">
                <HelpCircle className="w-4 h-4 text-slate-500" />
                매칭은 어떻게 동작하나요?
              </p>
              <ul className="text-xs text-muted-foreground list-disc pl-5 space-y-1">
                <li>
                  RFQ 의 <strong>분야(category)</strong> 와{" "}
                  <strong>활동지역</strong> 두 가지가 모두 일치하는 협력사에게만
                  공고가 노출됩니다.
                </li>
                <li>
                  지역 옵션은 시·도 단위 또는 시·군·구 단위입니다. 시·군·구로
                  좁혀 두면 더 가까운 업체만 보지만, 매칭 수가 줄어듭니다.
                </li>
                <li>
                  매칭 수가 0 이라면 RFQ 카드의 "범위 확대"로 시·도까지 넓히거나,
                  분야 설정을 다시 확인해 주세요.
                </li>
              </ul>
            </CardContent>
          </Card>
        </div>
      )}

      <ResponsiveDialog open={compareRfqId !== null && false} onOpenChange={() => setCompareRfqId(null)}>
        <ResponsiveDialogContent className="max-w-4xl">
          {/* 비교 패널은 별도 컴포넌트로 표시되므로 여기는 빈 컨테이너만 유지 */}
          <></>
        </ResponsiveDialogContent>
      </ResponsiveDialog>

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
  vendors,
  compareOpen,
  commsOpen,
  onToggleCompare,
  onToggleComms,
  onOpenDoc,
  onExpandScope,
  onCloseRfq,
  onDelete,
  onCreateApproval,
  statusLabel,
  statusColor,
  categoryLabel,
  children,
}: {
  rfq: any;
  relatedApprovals: any[];
  relatedVouchers: any[];
  relatedPaymentReqs: any[];
  vendors: Vendor[];
  compareOpen: boolean;
  commsOpen: boolean;
  onToggleCompare: () => void;
  onToggleComms: () => void;
  onOpenDoc: () => void;
  onExpandScope: () => void;
  onCloseRfq: () => void;
  onDelete: () => void;
  onCreateApproval: () => void;
  statusLabel: (s: string) => string;
  statusColor: (s: string) => string;
  categoryLabel: (c: string) => string;
  children?: React.ReactNode;
}) {
  // [Task #682] 매칭된 협력사 수를 RFQ 카드에서 직접 보여 주어 매니저가
  //   "공고가 누구에게 갔는지" 한눈에 파악하게 한다. 0건이면 경고 톤으로
  //   표시하고, 그 옆 dropdown menu 의 "범위 확대" 항목도 권장된다.
  const { data: matchedVendors, isLoading: matchedLoading } =
    useGetRfqMatchedVendors(rfq.id, {
      query: { enabled: rfq.status === "open" },
    });
  const matchedCount = matchedVendors?.length ?? 0;

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
              {rfq.geoScope && (
                <Badge variant="outline" className="text-xs">
                  <MapPin className="w-3 h-3 mr-0.5" />
                  {rfq.geoScope === "sigungu"
                    ? `${rfq.sido} ${rfq.sigungu}`
                    : rfq.sido}
                </Badge>
              )}
              {rfq.requiresSiteVisit && (
                <Badge className="bg-amber-100 text-amber-800 border border-amber-300">
                  <CalendarDays className="w-3 h-3 mr-0.5" />
                  현장방문 필요
                </Badge>
              )}
              {/* [Phase1 마무리 C] 마감 임박 — D-3 이하(과거는 여기 표시 안 함;
                  마감일 지난 RFQ 는 status 가 closed/cancelled 로 바뀌므로 별도 라벨). */}
              {(() => {
                if (rfq.status !== "open" || !rfq.deadline) return null;
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const dl = new Date(rfq.deadline);
                dl.setHours(0, 0, 0, 0);
                const days = Math.round(
                  (dl.getTime() - today.getTime()) / (24 * 60 * 60 * 1000),
                );
                if (days < 0 || days > 3) return null;
                return (
                  <Badge
                    className="bg-red-100 text-red-700 border border-red-300"
                    data-testid={`rfq-deadline-soon-${rfq.id}`}
                  >
                    마감 임박 D-{days}
                  </Badge>
                );
              })()}
              {/* [Phase1 마무리 C] 매칭 중 — 등록 후 24시간 이내 + 견적 0건 추정.
                  (RfqCard 단독에서 견적 카운트를 보장하기 어려우므로 createdAt 기반.) */}
              {(() => {
                if (rfq.status !== "open" || !rfq.createdAt) return null;
                const ageMs = Date.now() - new Date(rfq.createdAt).getTime();
                if (ageMs < 0 || ageMs > 24 * 60 * 60 * 1000) return null;
                return (
                  <Badge
                    variant="outline"
                    className="text-blue-700 border-blue-300 bg-blue-50"
                    data-testid={`rfq-matching-${rfq.id}`}
                  >
                    파트너 매칭 중
                  </Badge>
                );
              })()}
            </div>
            {/* [Phase1 마무리 C] 매칭 중 안내문 — 파트너에게 견적이 도착할 때까지
                기다려도 된다는 시그널을 매니저에게 분명히 전달. */}
            {rfq.status === "open" &&
              rfq.createdAt &&
              Date.now() - new Date(rfq.createdAt).getTime() <
                24 * 60 * 60 * 1000 && (
                <p className="text-xs text-blue-700 mt-1">
                  파트너사에서 견적을 준비하고 있어요
                </p>
              )}

            {/* [Task #682] 매칭/파이프라인 배지 행 — 카드 식별 정보 바로 아래 */}
            <div
              className="flex items-center gap-2 flex-wrap mt-1.5"
              data-testid={`rfq-pipeline-badges-${rfq.id}`}
            >
              {rfq.status === "open" ? (
                matchedLoading ? (
                  <Badge variant="outline" className="text-xs">
                    <Users className="w-3 h-3 mr-0.5" />
                    매칭 확인 중…
                  </Badge>
                ) : matchedCount > 0 ? (
                  // [Task #682 review-fix] 매칭 기준(분야 + 활동지역) 을 툴팁으로 설명.
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge
                        className="bg-sky-100 text-sky-800 border border-sky-300 cursor-help"
                        data-testid={`rfq-matched-badge-${rfq.id}`}
                      >
                        <Users className="w-3 h-3 mr-0.5" />
                        매칭된 협력사 {matchedCount}곳
                        <HelpCircle className="w-3 h-3 ml-1 opacity-60" />
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="max-w-xs">
                      <div className="space-y-1 text-xs">
                        <p className="font-medium">매칭 기준</p>
                        <p>분야: {categoryLabel(rfq.category)}</p>
                        {rfq.geoScope && (
                          <p>
                            활동지역:{" "}
                            {rfq.geoScope === "sigungu"
                              ? `${rfq.sido} ${rfq.sigungu}`
                              : rfq.sido}{" "}
                            ({rfq.geoScope === "sigungu" ? "시·군·구 일치" : "시·도 일치"})
                          </p>
                        )}
                        <p className="text-muted-foreground">
                          위 조건을 모두 만족하는 협력사에게 RFQ 가 노출됩니다.
                        </p>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                ) : (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge
                        variant="destructive"
                        className="cursor-help"
                        data-testid={`rfq-matched-empty-${rfq.id}`}
                      >
                        <AlertTriangle className="w-3 h-3 mr-0.5" />
                        매칭된 협력사 0곳 — 범위 확대 권장
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="max-w-xs">
                      <div className="space-y-1 text-xs">
                        <p className="font-medium">왜 0건일까요?</p>
                        <p>
                          분야 <strong>{categoryLabel(rfq.category)}</strong>
                          {rfq.geoScope &&
                            ` + 지역 ${
                              rfq.geoScope === "sigungu"
                                ? `${rfq.sido} ${rfq.sigungu}`
                                : rfq.sido
                            }`}{" "}
                          조건을 만족하는 등록 협력사가 없습니다.
                        </p>
                        <p className="text-muted-foreground">
                          오른쪽 메뉴의 "범위 확대"로 활동지역을 시·도까지 넓히면
                          매칭이 늘어날 수 있습니다.
                        </p>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                )
              ) : null}

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

            <div className="flex gap-4 text-sm text-muted-foreground mt-2 flex-wrap">
              <span>건물: {rfq.buildingName}</span>
              <span>분류: {categoryLabel(rfq.category)}</span>
              {rfq.serviceType && (
                <span>용역: {rfqServiceTypeLabel(rfq.serviceType)}</span>
              )}
              <span>마감: {formatDate(rfq.deadline)}</span>
              {rfq.desiredDate && <span>희망일: {formatDate(rfq.desiredDate)}</span>}
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

          {/* [Task #682] 액션 영역 — primary 2개 + kebab. */}
          <div className="flex gap-1 items-start shrink-0">
            <Button
              variant={compareOpen ? "default" : "outline"}
              size="sm"
              onClick={onToggleCompare}
              data-testid={`rfq-compare-toggle-${rfq.id}`}
            >
              <BarChart3 className="w-3.5 h-3.5 mr-1" />
              견적 비교
            </Button>
            <Button
              variant={commsOpen ? "default" : "outline"}
              size="sm"
              onClick={onToggleComms}
              data-testid={`rfq-comms-toggle-${rfq.id}`}
            >
              <MessageSquare className="w-3.5 h-3.5 mr-1" />
              소통/방문
            </Button>
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
                <DropdownMenuLabel>이 RFQ 작업</DropdownMenuLabel>
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

        {/* 부모가 주입하는 인라인 패널(견적 비교/소통/방문) */}
        {children}
      </CardContent>
    </Card>
  );
}

// [Task #612] 한 RFQ 안에서 매니저가 ① 응찰한 파트너를 골라 ② 메시지를 주고
//   받고 ③ 파트너가 제안한 현장방문 슬롯을 확정/취소할 수 있는 인라인 패널.
//   파트너별로 메시지 스레드와 site-visit 행이 분리되므로 vendor select 가 필수.
function RfqCommsPanel({
  rfq,
  vendors,
}: {
  rfq: { id: number; requiresSiteVisit?: boolean };
  vendors: Vendor[];
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  // 이 RFQ 에 견적을 낸 파트너만 후보로 노출 (전체 vendor 중 quote 가 있는 업체).
  const { data: rfqQuotes } = useListQuotes({ rfqId: rfq.id });
  const candidateVendorIds = Array.from(
    new Set((rfqQuotes || []).map((q: any) => q.vendorId)),
  );
  const candidates = vendors.filter((v) => candidateVendorIds.includes(v.id));
  const [selectedVendorId, setSelectedVendorId] = useState<number | null>(
    candidates[0]?.id ?? null,
  );
  useEffect(() => {
    if (selectedVendorId == null && candidates[0]) {
      setSelectedVendorId(candidates[0].id);
    }
  }, [candidates, selectedVendorId]);

  const { data: thread } = useListRfqMessages(
    rfq.id,
    selectedVendorId ? { vendorId: selectedVendorId } : undefined,
    { query: { enabled: !!selectedVendorId } },
  );
  const { data: visits } = useListRfqSiteVisits(rfq.id);
  const postMsg = usePostRfqMessage();
  const markRead = useMarkRfqMessagesRead();
  const updateVisit = useUpdateRfqSiteVisit();

  // 패널 진입 시 매니저 측 읽음 처리.
  useEffect(() => {
    if (!selectedVendorId || !thread) return;
    if (thread.messages.length === 0) return;
    if (thread.readByManagerAt) return;
    markRead.mutate(
      { id: rfq.id, data: { vendorId: selectedVendorId } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({
            queryKey: getListRfqMessagesQueryKey(rfq.id, { vendorId: selectedVendorId }),
          });
        },
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedVendorId, thread?.messages.length]);

  const [body, setBody] = useState("");
  async function handleSend() {
    if (!selectedVendorId || !body.trim()) return;
    try {
      await postMsg.mutateAsync({
        id: rfq.id,
        data: { vendorId: selectedVendorId, body: body.trim() },
      });
      setBody("");
      queryClient.invalidateQueries({
        queryKey: getListRfqMessagesQueryKey(rfq.id, { vendorId: selectedVendorId }),
      });
    } catch (err) {
      toast({ title: "메시지 전송 실패", variant: "destructive" });
    }
  }

  async function handleConfirmSlot(visitId: number, slot: string) {
    try {
      await updateVisit.mutateAsync({
        rfqId: rfq.id,
        id: visitId,
        data: { status: "confirmed", confirmedSlot: slot },
      });
      queryClient.invalidateQueries({
        queryKey: getListRfqSiteVisitsQueryKey(rfq.id),
      });
      toast({ title: "현장방문 일정이 확정되었습니다" });
    } catch {
      toast({ title: "확정 실패", variant: "destructive" });
    }
  }

  async function handleCancelVisit(visitId: number) {
    try {
      await updateVisit.mutateAsync({
        rfqId: rfq.id,
        id: visitId,
        data: { status: "cancelled" },
      });
      queryClient.invalidateQueries({
        queryKey: getListRfqSiteVisitsQueryKey(rfq.id),
      });
      toast({ title: "현장방문이 취소되었습니다" });
    } catch {
      toast({ title: "취소 실패", variant: "destructive" });
    }
  }

  const visitsForVendor = (visits || []).filter(
    (v: any) => v.vendorId === selectedVendorId,
  );

  return (
    <div className="mt-4 border-t pt-4 space-y-4">
      <h4 className="font-medium text-sm flex items-center gap-2">
        <MessageSquare className="w-4 h-4" />
        파트너 소통 / 현장방문
      </h4>
      {candidates.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          아직 응찰한 파트너가 없습니다. 견적이 들어오면 메시지를 주고받을 수 있습니다.
        </p>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <Label className="text-xs whitespace-nowrap">대화 상대</Label>
            <Select
              value={selectedVendorId ? String(selectedVendorId) : undefined}
              onValueChange={(v) => setSelectedVendorId(Number(v))}
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="파트너 선택" />
              </SelectTrigger>
              <SelectContent>
                {candidates.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 메시지 스레드 */}
          <div className="border rounded-md">
            <div className="max-h-60 overflow-y-auto p-3 space-y-2 bg-muted/20">
              {thread?.messages.length ? (
                thread.messages.map((m) => (
                  <div
                    key={m.id}
                    className={`flex flex-col text-sm ${
                      m.senderRole === "manager" || m.senderRole === "platform_admin" || m.senderRole === "hq_executive"
                        ? "items-end"
                        : "items-start"
                    }`}
                  >
                    <div
                      className={`max-w-[80%] rounded-md px-3 py-2 whitespace-pre-wrap ${
                        m.senderRole === "manager" || m.senderRole === "platform_admin" || m.senderRole === "hq_executive"
                          ? "bg-primary text-primary-foreground"
                          : "bg-card border"
                      }`}
                    >
                      {m.body}
                    </div>
                    <span className="text-[10px] text-muted-foreground mt-0.5">
                      {m.senderName || m.senderRole} · {new Date(m.createdAt).toLocaleString("ko-KR")}
                    </span>
                  </div>
                ))
              ) : (
                <p className="text-xs text-muted-foreground text-center py-6">
                  메시지가 없습니다. 첫 메시지를 보내보세요.
                </p>
              )}
            </div>
            <div className="border-t p-2 flex gap-2">
              <Textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="메시지를 입력하세요"
                className="min-h-[44px] text-sm"
              />
              <Button
                size="sm"
                onClick={handleSend}
                disabled={postMsg.isPending || !body.trim()}
              >
                <Send className="w-3.5 h-3.5 mr-1" />
                보내기
              </Button>
            </div>
          </div>

          {/* 현장방문 일정 */}
          {(rfq.requiresSiteVisit || visitsForVendor.length > 0) && (
            <div className="border rounded-md p-3 space-y-2">
              <h5 className="text-sm font-medium flex items-center gap-2">
                <CalendarDays className="w-4 h-4" />
                현장방문 일정
              </h5>
              {visitsForVendor.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  파트너가 아직 방문 일정을 제안하지 않았습니다.
                </p>
              ) : (
                <div className="space-y-2">
                  {visitsForVendor.map((v: any) => {
                    let slots: string[] = [];
                    try {
                      slots = JSON.parse(v.proposedSlots || "[]");
                    } catch {
                      slots = [];
                    }
                    return (
                      <div key={v.id} className="border rounded p-2 text-sm">
                        <div className="flex items-center justify-between mb-1">
                          <Badge
                            variant="outline"
                            className={
                              v.status === "confirmed"
                                ? "border-emerald-300 text-emerald-700"
                                : v.status === "cancelled"
                                ? "border-red-300 text-red-700"
                                : "border-amber-300 text-amber-700"
                            }
                          >
                            {v.status === "proposed"
                              ? "제안됨"
                              : v.status === "confirmed"
                              ? "확정"
                              : v.status === "cancelled"
                              ? "취소"
                              : "완료"}
                          </Badge>
                          {v.confirmedSlot && (
                            <span className="text-xs text-muted-foreground">
                              확정: {new Date(v.confirmedSlot).toLocaleString("ko-KR")}
                            </span>
                          )}
                        </div>
                        {v.notes && <p className="text-xs text-muted-foreground mb-1">{v.notes}</p>}
                        {v.status === "proposed" && (
                          <div className="space-y-1">
                            <p className="text-xs text-muted-foreground">제안된 슬롯</p>
                            {slots.map((s) => (
                              <div key={s} className="flex items-center justify-between gap-2">
                                <span className="text-sm">
                                  {new Date(s).toLocaleString("ko-KR")}
                                </span>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleConfirmSlot(v.id, s)}
                                  disabled={updateVisit.isPending}
                                >
                                  <CheckCircle className="w-3 h-3 mr-1" />
                                  이 시간으로 확정
                                </Button>
                              </div>
                            ))}
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleCancelVisit(v.id)}
                              className="text-destructive"
                            >
                              <XCircle className="w-3 h-3 mr-1" />
                              취소
                            </Button>
                          </div>
                        )}
                        {v.status === "confirmed" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleCancelVisit(v.id)}
                            className="text-destructive"
                          >
                            <XCircle className="w-3 h-3 mr-1" />
                            확정 취소
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
