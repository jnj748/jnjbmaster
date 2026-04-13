import { useState } from "react";
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
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/utils";
import { sidoList, getSigunguList } from "@workspace/shared/korean-districts";
import { PhotoUploadField } from "@/components/photo-upload-field";
import { RfqRequestDocument } from "@/components/rfq-request-document";
import { useAuth } from "@/contexts/auth-context";
import { authedImageUrl } from "@/lib/authed-image-url";

const categoryOptions = [
  { value: "elevator", label: "승강기" },
  { value: "water_tank", label: "저수조" },
  { value: "fire_safety", label: "소방" },
  { value: "electrical", label: "전기" },
  { value: "gas", label: "가스" },
  { value: "septic", label: "정화조" },
  { value: "cleaning", label: "청소" },
  { value: "security", label: "보안" },
  { value: "other", label: "기타" },
];

export default function Rfqs() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [compareRfqId, setCompareRfqId] = useState<number | null>(null);
  const [filterStatus, setFilterStatus] = useState<string | undefined>();
  const [closeUpPhotoUrl, setCloseUpPhotoUrl] = useState<string | null>(null);
  const [widePhotoUrl, setWidePhotoUrl] = useState<string | null>(null);
  const [rfqDocRfq, setRfqDocRfq] = useState<any>(null);
  const { toast } = useToast();
  const { token } = useAuth();
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

  const [form, setForm] = useState({
    title: "",
    category: "elevator",
    description: "",
    buildingName: "",
    desiredDate: "",
    deadline: "",
    vendorIds: [] as string[],
    sido: "",
    sigungu: "",
  });

  function resetForm() {
    setForm({
      title: "",
      category: "elevator",
      description: "",
      buildingName: "",
      desiredDate: "",
      deadline: "",
      vendorIds: [],
      sido: "",
      sigungu: "",
    });
    setCloseUpPhotoUrl(null);
    setWidePhotoUrl(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const data: any = {
      title: form.title,
      category: form.category,
      description: form.description || null,
      buildingName: form.buildingName,
      desiredDate: form.desiredDate || null,
      deadline: form.deadline,
      vendorIds: form.vendorIds.length > 0 ? form.vendorIds.join(",") : null,
      sido: form.sido || null,
      sigungu: form.sigungu || null,
      geoScope: form.sigungu ? "sigungu" : form.sido ? "sido" : null,
      closeUpPhotoUrl: closeUpPhotoUrl || null,
      widePhotoUrl: widePhotoUrl || null,
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
  const sigunguOptions = form.sido ? getSigunguList(form.sido) : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">견적 요청 (RFQ)</h1>
          <p className="text-muted-foreground text-sm mt-1">
            협력업체에 견적을 요청하고 비교합니다
          </p>
        </div>
        <ResponsiveDialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) resetForm(); }}>
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
              <div>
                <Label>제목</Label>
                <Input
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="예: 저수조 청소 견적 요청"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>분류</Label>
                  <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {categoryOptions.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>건물명</Label>
                  <Input
                    value={form.buildingName}
                    onChange={(e) => setForm({ ...form, buildingName: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="border-t pt-4">
                <p className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5" />
                  지역 기반 업체 매칭
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>시/도</Label>
                    <Select value={form.sido} onValueChange={(v) => setForm({ ...form, sido: v, sigungu: "" })}>
                      <SelectTrigger><SelectValue placeholder="시/도 선택" /></SelectTrigger>
                      <SelectContent>
                        {sidoList.map((s) => (
                          <SelectItem key={s} value={s}>{s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>시/군/구</Label>
                    <Select
                      value={form.sigungu}
                      onValueChange={(v) => setForm({ ...form, sigungu: v })}
                      disabled={!form.sido}
                    >
                      <SelectTrigger><SelectValue placeholder="시/군/구 선택" /></SelectTrigger>
                      <SelectContent>
                        {sigunguOptions.map((s) => (
                          <SelectItem key={s} value={s}>{s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  지역을 선택하면 해당 지역 업체에 자동 매칭됩니다
                </p>
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
                    required
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
              <div className="border-t pt-4">
                <p className="text-sm font-medium text-muted-foreground mb-3">현장 사진 (선택)</p>
                <div className="grid grid-cols-2 gap-4">
                  <PhotoUploadField
                    label="근경 사진"
                    value={closeUpPhotoUrl}
                    onChange={setCloseUpPhotoUrl}
                  />
                  <PhotoUploadField
                    label="원경 사진"
                    value={widePhotoUrl}
                    onChange={setWidePhotoUrl}
                  />
                </div>
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
              <Button type="submit" className="w-full">견적 요청 생성</Button>
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
                      <span>마감: {formatDate(rfq.deadline)}</span>
                      {rfq.desiredDate && <span>희망일: {formatDate(rfq.desiredDate)}</span>}
                    </div>
                    {rfq.description && (
                      <p className="text-sm text-muted-foreground mt-2">{rfq.description}</p>
                    )}
                    {(rfq.closeUpPhotoUrl || rfq.widePhotoUrl) && (
                      <div className="flex gap-2 mt-2">
                        {rfq.closeUpPhotoUrl && (
                          <img src={authedImageUrl(rfq.closeUpPhotoUrl, token)} alt="근경" className="w-16 h-16 rounded border object-cover" />
                        )}
                        {rfq.widePhotoUrl && (
                          <img src={authedImageUrl(rfq.widePhotoUrl, token)} alt="원경" className="w-16 h-16 rounded border object-cover" />
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
                    <Button variant="outline" size="sm" onClick={() => setRfqDocRfq(rfq)}>
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
        />
      )}
    </div>
  );
}
