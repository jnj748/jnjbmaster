import { useEffect, useState } from "react";
import {
  useListRfqs,
  useCreateRfq,
  useUpdateRfq,
  useDeleteRfq,
  useListVendors,
  useListQuotes,
  useUpdateQuote,
  useExpandRfqScope,
  getListRfqsQueryKey,
  getListQuotesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
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
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/utils";
import {
  RFQ_SERVICE_TYPE_LABELS,
  rfqServiceTypeLabel,
  buildRfqAutoTitle,
  type RfqServiceType,
} from "@workspace/shared/rfq-service-types";
import { PhotoUploadField } from "@/components/photo-upload-field";
import { RfqRequestDocument, type RfqDocumentData } from "@/components/rfq-request-document";
import { useAuth } from "@/contexts/auth-context";
import { useBuilding } from "@/contexts/building-context";
import { AuthImage } from "@/components/auth-image";
import { IntermediaryDisclaimerBanner, recordConsent } from "@/components/intermediary-disclaimer";

const categoryOptions = [
  { value: "elevator", label: "승강기" },
  { value: "water_tank", label: "저수조" },
  { value: "fire_safety", label: "소방" },
  { value: "electrical", label: "전기" },
  { value: "gas", label: "가스" },
  { value: "septic", label: "정화조" },
  { value: "cleaning", label: "청소" },
  { value: "security", label: "보안" },
  { value: "waterproofing", label: "방수" },
  { value: "maintenance_repair", label: "영선/수선유지" },
  { value: "defect_diagnosis", label: "하자진단" },
  { value: "building_maintenance", label: "건물관리" },
  { value: "mechanical", label: "기계설비" },
  { value: "other", label: "기타" },
];

export default function Rfqs() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [compareRfqId, setCompareRfqId] = useState<number | null>(null);
  const [filterStatus, setFilterStatus] = useState<string | undefined>();
  const [closeUpPhotoUrl, setCloseUpPhotoUrl] = useState<string | null>(null);
  const [widePhotoUrl, setWidePhotoUrl] = useState<string | null>(null);
  const [rfqDocRfq, setRfqDocRfq] = useState<RfqDocumentData | null>(null);
  const { toast } = useToast();
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
    desiredDate: "",
    deadline: getDefaultDeadline(),
    vendorIds: [] as string[],
  });
  const [advancedOpen, setAdvancedOpen] = useState(false);

  // [Task #197] 후속 조치 제안 팝업에서 prefill=1 로 진입한 경우 작성 다이얼로그를 자동으로 연다.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("prefill") !== "1") return;
    const validCategories = categoryOptions.map((c) => c.value);
    const incomingCategory = params.get("category") ?? "";
    const sourceType = params.get("sourceType") ?? "";
    const sourceId = params.get("sourceId") ?? "";
    const sourceDate = params.get("sourceDate") ?? "";
    const keywords = params.get("keywords") ?? "";
    const body = params.get("body") ?? "";
    const footer = sourceType
      ? `\n\n──────────\n[자동 제안] 출처: ${sourceType} #${sourceId} (${sourceDate})` +
        (keywords ? `\n감지 키워드: ${keywords}` : "")
      : "";
    setForm((prev) => ({
      ...prev,
      title: params.get("title") ?? prev.title,
      titleManuallyEdited: !!params.get("title"),
      description: body + footer,
      category: validCategories.includes(incomingCategory) ? incomingCategory : prev.category,
    }));
    if (body || footer) setAdvancedOpen(true);
    setDialogOpen(true);
    // 한 번만 적용되도록 쿼리 정리.
    const url = new URL(window.location.href);
    ["prefill", "title", "body", "category", "keywords", "sourceType", "sourceId", "sourceDate"].forEach(
      (k) => url.searchParams.delete(k),
    );
    window.history.replaceState({}, "", url.toString());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function resetForm() {
    setForm({
      title: "",
      titleManuallyEdited: false,
      category: "",
      serviceType: "",
      description: "",
      desiredDate: "",
      deadline: getDefaultDeadline(),
      vendorIds: [],
    });
    setCloseUpPhotoUrl(null);
    setWidePhotoUrl(null);
    setAdvancedOpen(false);
  }

  // 건물 컨텍스트의 주소가 매칭에 사용된다 (사용자에게는 노출하지 않음).
  const buildingName = building?.name || "";
  const buildingSido = building?.sido || "";
  const buildingSigungu = building?.sigungu || "";
  const buildingReady = !!buildingName && (!!buildingSido || !!buildingSigungu);

  // 자동 생성된 제목 (사용자가 직접 수정하지 않은 경우에만 사용).
  const autoTitle = buildRfqAutoTitle(form.category, form.serviceType || null);
  const effectiveTitle = form.titleManuallyEdited && form.title.trim().length > 0
    ? form.title
    : autoTitle;

  const photosReady = !!closeUpPhotoUrl && !!widePhotoUrl;
  const canSubmit = !!form.category && !!form.serviceType && photosReady && buildingReady;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!buildingReady) {
      toast({
        title: "건물 정보가 필요합니다",
        description: "현재 선택된 건물의 주소가 비어 있어 견적을 요청할 수 없습니다. 건물 정보를 먼저 등록해주세요.",
        variant: "destructive",
      });
      return;
    }
    if (!form.category) {
      toast({ title: "시설분야를 선택하세요", variant: "destructive" });
      return;
    }
    if (!form.serviceType) {
      toast({ title: "용역종류를 선택하세요", variant: "destructive" });
      return;
    }
    if (!photosReady) {
      toast({ title: "근경/원경 사진은 필수입니다", variant: "destructive" });
      return;
    }

    const data: any = {
      title: effectiveTitle,
      category: form.category,
      serviceType: form.serviceType,
      description: form.description || null,
      buildingName,
      desiredDate: form.desiredDate || null,
      deadline: form.deadline,
      vendorIds: form.vendorIds.length > 0 ? form.vendorIds.join(",") : null,
      sido: buildingSido || null,
      sigungu: buildingSigungu || null,
      geoScope: buildingSigungu ? "sigungu" : buildingSido ? "sido" : null,
      closeUpPhotoUrl,
      widePhotoUrl,
    };

    await createMutation.mutateAsync({ data });
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

  const platformVendors = vendors?.filter((v) => v.type === "platform") || [];

  return (
    <div className="space-y-6">
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
              <ResponsiveDialogTitle>새 견적 요청</ResponsiveDialogTitle>
            </ResponsiveDialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              {!buildingReady && (
                <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                  현재 선택된 건물 정보가 비어 있어 견적 요청을 생성할 수 없습니다. 건물 정보(이름·주소)를 먼저 등록해주세요.
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
                <div className="grid grid-cols-2 gap-4">
                  <PhotoUploadField
                    label="근경 사진 *"
                    value={closeUpPhotoUrl}
                    onChange={setCloseUpPhotoUrl}
                    testId="rfq-photo-close-up"
                  />
                  <PhotoUploadField
                    label="원경 사진 *"
                    value={widePhotoUrl}
                    onChange={setWidePhotoUrl}
                    testId="rfq-photo-wide"
                  />
                </div>
                {!photosReady && (
                  <p className="text-xs text-destructive mt-2">근경/원경 사진은 필수입니다.</p>
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
                <button
                  type="button"
                  onClick={() => setAdvancedOpen((v) => !v)}
                  className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
                  data-testid="rfq-advanced-toggle"
                >
                  {advancedOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  추가 옵션 (제목 수정·상세 설명·희망일·마감일·발송 업체 추가)
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
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>희망일</Label>
                        <Input
                          type="date"
                          value={form.desiredDate}
                          onChange={(e) => setForm({ ...form, desiredDate: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label>마감일</Label>
                        <Input
                          type="date"
                          value={form.deadline}
                          onChange={(e) => setForm({ ...form, deadline: e.target.value })}
                        />
                      </div>
                    </div>
                    <div>
                      <Label>상세 설명</Label>
                      <Textarea
                        value={form.description}
                        onChange={(e) => setForm({ ...form, description: e.target.value })}
                        placeholder="작업 내용, 특이사항 등을 기재해주세요"
                      />
                    </div>
                    <div>
                      <Label>추가 발송 업체 (복수 선택 가능)</Label>
                      <div className="mt-2 max-h-40 overflow-y-auto border rounded-md p-2 space-y-1">
                        {platformVendors.length > 0 ? platformVendors.map((v) => (
                          <label key={v.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/50 p-1 rounded">
                            <input
                              type="checkbox"
                              checked={form.vendorIds.includes(v.id.toString())}
                              onChange={(e) => {
                                const vid = v.id.toString();
                                setForm({
                                  ...form,
                                  vendorIds: e.target.checked
                                    ? [...form.vendorIds, vid]
                                    : form.vendorIds.filter((id) => id !== vid),
                                });
                              }}
                              className="w-4 h-4"
                            />
                            {v.name} - {categoryLabel(v.category)}
                            {v.sido && <span className="text-xs text-muted-foreground ml-1">({v.sido})</span>}
                          </label>
                        )) : (
                          <p className="text-xs text-muted-foreground p-2">등록된 플랫폼 업체가 없습니다</p>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <Button type="submit" className="w-full" disabled={!canSubmit} data-testid="rfq-submit">
                견적 요청 생성
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
            <Card key={rfq.id}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <FileText className="w-4 h-4 text-primary" />
                      <h3 className="font-medium">{rfq.title}</h3>
                      <Badge variant={statusColor(rfq.status) as any}>
                        {statusLabel(rfq.status)}
                      </Badge>
                      {rfq.geoScope && (
                        <Badge variant="outline" className="text-xs">
                          <MapPin className="w-3 h-3 mr-0.5" />
                          {rfq.geoScope === "sigungu" ? `${rfq.sido} ${rfq.sigungu}` : rfq.sido}
                        </Badge>
                      )}
                    </div>
                    <div className="flex gap-4 text-sm text-muted-foreground mt-2 flex-wrap">
                      <span>건물: {rfq.buildingName}</span>
                      <span>분류: {categoryLabel(rfq.category)}</span>
                      {rfq.serviceType && <span>용역: {rfqServiceTypeLabel(rfq.serviceType)}</span>}
                      <span>마감: {formatDate(rfq.deadline)}</span>
                      {rfq.desiredDate && <span>희망일: {formatDate(rfq.desiredDate)}</span>}
                    </div>
                    {rfq.description && (
                      <p className="text-sm text-muted-foreground mt-2">{rfq.description}</p>
                    )}
                    {(rfq.closeUpPhotoUrl || rfq.widePhotoUrl) && (
                      <div className="flex gap-2 mt-2">
                        {rfq.closeUpPhotoUrl && (
                          <AuthImage src={rfq.closeUpPhotoUrl} alt="근경" className="w-16 h-16 rounded border object-cover" />
                        )}
                        {rfq.widePhotoUrl && (
                          <AuthImage src={rfq.widePhotoUrl} alt="원경" className="w-16 h-16 rounded border object-cover" />
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-1 flex-wrap justify-end">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCompareRfqId(compareRfqId === rfq.id ? null : rfq.id)}
                    >
                      <BarChart3 className="w-3.5 h-3.5 mr-1" />
                      견적 비교
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setRfqDocRfq({
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
                    })}>
                      <Printer className="w-3.5 h-3.5 mr-1" />
                      의뢰서
                    </Button>
                    {rfq.status === "open" && rfq.geoScope === "sigungu" && (
                      <Button variant="outline" size="sm" onClick={() => handleExpandScope(rfq.id)}>
                        <Expand className="w-3.5 h-3.5 mr-1" />
                        범위 확대
                      </Button>
                    )}
                    {rfq.status === "open" && (
                      <Button variant="outline" size="sm" onClick={() => handleCloseRfq(rfq.id)}>
                        <CheckCircle className="w-3.5 h-3.5 mr-1" />
                        마감
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(rfq.id)}>
                      <Trash2 className="w-3.5 h-3.5 text-destructive" />
                    </Button>
                  </div>
                </div>

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
                              <th className="text-right p-2 font-medium">견적 금액</th>
                              <th className="text-center p-2 font-medium">예상 소요일</th>
                              <th className="text-center p-2 font-medium">착수 가능일</th>
                              <th className="text-left p-2 font-medium">작업 범위</th>
                              <th className="text-center p-2 font-medium">상태</th>
                              <th className="text-center p-2 font-medium">관리</th>
                            </tr>
                          </thead>
                          <tbody>
                            {compareQuotes.map((q: any) => (
                              <tr key={q.id} className="border-b last:border-0">
                                <td className="p-2 font-medium">{q.vendorName}</td>
                                <td className="p-2 text-right font-medium">{q.totalAmount.toLocaleString()}원</td>
                                <td className="p-2 text-center">{q.estimatedDays ? `${q.estimatedDays}일` : "-"}</td>
                                <td className="p-2 text-center">{q.availableDate ? formatDate(q.availableDate) : "-"}</td>
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
                                    <div className="flex gap-1 justify-center">
                                      <Button size="sm" variant="outline" onClick={() => handleAcceptQuote(q.id)}>
                                        <CheckCircle className="w-3 h-3 mr-1" />
                                        채택
                                      </Button>
                                      <Button size="sm" variant="ghost" onClick={() => handleRejectQuote(q.id)}>
                                        <XCircle className="w-3 h-3" />
                                      </Button>
                                    </div>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        아직 제출된 견적이 없습니다
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground">견적 요청이 없습니다</p>
          </CardContent>
        </Card>
      )}

      <ResponsiveDialog open={compareRfqId !== null && false} onOpenChange={() => setCompareRfqId(null)}>
        <ResponsiveDialogContent className="max-w-4xl" />
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
