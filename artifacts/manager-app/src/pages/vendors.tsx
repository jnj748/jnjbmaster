// [Task #726] 본부장(관리자)이 보는 /vendors 화면을 파트너사(=platform 유형) 전용으로
//   정리한다. 본부장 입장에서는 건물 단위로 관리되는 "계약 업체"(type=contracted)는
//   직접 다룰 일이 없고, 플랫폼에 가입한 파트너사만 보면 된다. 따라서 기존 "계약 업체 /
//   플랫폼 업체" 두 탭을 모두 제거하고 처음부터 type=platform 으로만 조회·등록한다.
//
//   계약 업체 데이터(type=contracted) 자체는 관리소장의 "협력업체 주소록"
//   (/building/vendor-directory) 과 건물 단위 계약 화면에서 계속 사용되므로 API 의
//   `type` 필터·DB 컬럼은 그대로 둔다. 본 화면은 본부장의 UX 정리만 담당한다.
import { useState } from "react";
import {
  useListVendors,
  useCreateVendor,
  useUpdateVendor,
  useDeleteVendor,
  getListVendorsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/ui/phone-input";
import { BusinessNumberInput } from "@/components/ui/business-number-input";
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
import { Plus, Trash2, Edit, Star, Phone, Mail, Briefcase, MapPin, MessageSquareText } from "lucide-react";
import { formatPhoneNumber, formatBusinessNumber } from "@/lib/format-korean";
import { MobileFilterSheet } from "@/components/mobile-filter-sheet";
import { useToast } from "@/hooks/use-toast";
import { sidoList, getSigunguList } from "@workspace/shared/korean-districts";
import { VendorRatingInline } from "@/components/star-rating";
import { VendorReviewsListDialog } from "@/components/vendor-reviews-list-dialog";

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

export default function Vendors() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [filterCategory, setFilterCategory] = useState<string | undefined>();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // [Task #726] 처음부터 파트너사(type=platform)만 조회. 탭 제거.
  const queryParams: any = { type: "platform" };
  if (filterCategory && filterCategory !== "all") {
    queryParams.category = filterCategory;
  }
  const { data: vendors, isLoading } = useListVendors(queryParams);
  const createMutation = useCreateVendor();
  const updateMutation = useUpdateVendor();
  const deleteMutation = useDeleteVendor();

  // [Task #339] 평가 목록 다이얼로그를 열 대상 vendor.
  const [reviewListVendor, setReviewListVendor] = useState<any>(null);

  // [Task #726] 계약 업체 전용 필드(contractBuildingName/contractStartDate/
  //   contractEndDate)는 폼 상태에서도 제거. 파트너사용 필드만 유지.
  const [form, setForm] = useState({
    name: "",
    category: "elevator",
    contactName: "",
    phone: "",
    email: "",
    address: "",
    isRecommended: false,
    notes: "",
    businessRegNumber: "",
    representativeName: "",
    serviceArea: "",
    subCategories: "",
    sido: "",
    sigungu: "",
  });

  function resetForm() {
    setForm({
      name: "", category: "elevator", contactName: "", phone: "", email: "",
      address: "", isRecommended: false, notes: "",
      businessRegNumber: "", representativeName: "", serviceArea: "",
      subCategories: "", sido: "", sigungu: "",
    });
    setEditing(null);
  }

  function openEdit(item: any) {
    setEditing(item);
    setForm({
      name: item.name,
      category: item.category,
      contactName: item.contactName || "",
      phone: item.phone || "",
      email: item.email || "",
      address: item.address || "",
      isRecommended: item.isRecommended,
      notes: item.notes || "",
      businessRegNumber: item.businessRegNumber || "",
      representativeName: item.representativeName || "",
      serviceArea: item.serviceArea || "",
      subCategories: item.subCategories || "",
      sido: item.sido || "",
      sigungu: item.sigungu || "",
    });
    setDialogOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // [Task #726] 신규 등록은 항상 type=platform. 계약 업체 전용 필드는 더 이상 보내지 않는다.
    const base: any = {
      name: form.name,
      category: form.category as any,
      type: "platform",
      contactName: form.contactName || null,
      phone: form.phone || null,
      email: form.email || null,
      address: form.address || null,
      // [Task #339] rating 은 평균값 캐시로만 사용되므로 입력 폼에서 보내지 않는다.
      isRecommended: form.isRecommended,
      notes: form.notes || null,
      subCategories: form.subCategories || null,
      sido: form.sido || null,
      sigungu: form.sigungu || null,
      businessRegNumber: form.businessRegNumber || null,
      representativeName: form.representativeName || null,
      serviceArea: form.serviceArea || null,
    };

    if (editing) {
      await updateMutation.mutateAsync({ id: editing.id, data: base });
      toast({ title: "파트너사 정보가 수정되었습니다" });
    } else {
      await createMutation.mutateAsync({ data: base });
      toast({ title: "파트너사가 등록되었습니다" });
    }
    queryClient.invalidateQueries({ queryKey: getListVendorsQueryKey() });
    setDialogOpen(false);
    resetForm();
  }

  async function handleDelete(id: number) {
    await deleteMutation.mutateAsync({ id });
    queryClient.invalidateQueries({ queryKey: getListVendorsQueryKey() });
    toast({ title: "파트너사가 삭제되었습니다" });
  }

  const categoryLabel = (c: string) =>
    categoryOptions.find((o) => o.value === c)?.label || c;

  const sigunguOptions = form.sido ? getSigunguList(form.sido) : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">파트너사 관리</h1>
          <p className="text-muted-foreground text-sm mt-1">
            플랫폼에 가입한 파트너사를 등록하고 관리합니다
          </p>
        </div>
        <ResponsiveDialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) resetForm(); }}>
          <ResponsiveDialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              파트너사 등록
            </Button>
          </ResponsiveDialogTrigger>
          <ResponsiveDialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <ResponsiveDialogHeader>
              <ResponsiveDialogTitle>{editing ? "파트너사 수정" : "새 파트너사 등록"}</ResponsiveDialogTitle>
            </ResponsiveDialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>상호</Label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
                </div>
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
              </div>
              <div>
                <Label>세부 전문분야 (쉼표로 구분)</Label>
                <Input
                  value={form.subCategories}
                  onChange={(e) => setForm({ ...form, subCategories: e.target.value })}
                  placeholder="예: 옥상방수, 외벽방수, 지하층방수"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>담당자</Label>
                  <Input value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} />
                </div>
                <div>
                  <Label>전화번호</Label>
                  <PhoneInput value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="010-0000-0000" />
                </div>
              </div>
              <div>
                <Label>이메일</Label>
                <Input type="email" inputMode="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div>
                <Label>주소</Label>
                <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
              </div>
              {editing && (
                <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm flex items-center justify-between">
                  <span className="text-muted-foreground">누적 평가 (자동 집계)</span>
                  <VendorRatingInline
                    avgRating={editing.avgRating}
                    reviewCount={editing.reviewCount}
                  />
                </div>
              )}

              <div className="border-t pt-4">
                <p className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5" />
                  서비스 지역
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>시/도</Label>
                    <Select value={form.sido || undefined} onValueChange={(v) => setForm({ ...form, sido: v, sigungu: "" })}>
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
                      value={form.sigungu || undefined}
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
              </div>

              <div className="border-t pt-4">
                <p className="text-sm font-medium text-muted-foreground mb-3">파트너사 정보</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>사업자등록번호</Label>
                  <BusinessNumberInput value={form.businessRegNumber} onChange={(e) => setForm({ ...form, businessRegNumber: e.target.value })} />
                </div>
                <div>
                  <Label>대표자명</Label>
                  <Input value={form.representativeName} onChange={(e) => setForm({ ...form, representativeName: e.target.value })} />
                </div>
              </div>
              <div>
                <Label>서비스 가능 지역 (텍스트)</Label>
                <Input value={form.serviceArea} onChange={(e) => setForm({ ...form, serviceArea: e.target.value })} placeholder="예: 서울, 경기 북부" />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.isRecommended}
                  onChange={(e) => setForm({ ...form, isRecommended: e.target.checked })}
                  className="w-4 h-4"
                />
                <Label>추천 파트너사로 등록</Label>
              </div>
              <div>
                <Label>비고</Label>
                <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
              <Button type="submit" className="w-full">{editing ? "수정" : "등록"}</Button>
            </form>
          </ResponsiveDialogContent>
        </ResponsiveDialog>
      </div>

      <div className="hidden desktop:flex gap-3">
        <Select value={filterCategory || "all"} onValueChange={(v) => setFilterCategory(v === "all" ? undefined : v)}>
          <SelectTrigger className="w-[160px] h-11"><SelectValue placeholder="분류" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 분류</SelectItem>
            {categoryOptions.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <MobileFilterSheet activeCount={filterCategory && filterCategory !== "all" ? 1 : 0}>
        <div>
          <Label className="mb-2 block">분류</Label>
          <Select value={filterCategory || "all"} onValueChange={(v) => setFilterCategory(v === "all" ? undefined : v)}>
            <SelectTrigger className="w-full h-11"><SelectValue placeholder="분류" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 분류</SelectItem>
              {categoryOptions.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </MobileFilterSheet>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-40" />)}
        </div>
      ) : vendors && vendors.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {vendors.map((vendor: any) => (
            <Card key={vendor.id}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-chart-3/10">
                      <Briefcase className="w-5 h-5 text-chart-3" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{vendor.name}</p>
                        {vendor.isRecommended && (
                          <Star className="w-3.5 h-3.5 text-chart-3 fill-chart-3" />
                        )}
                      </div>
                      <Badge variant="outline" className="text-xs mt-1">
                        {categoryLabel(vendor.category)}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(vendor)}>
                      <Edit className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(vendor.id)}>
                      <Trash2 className="w-3.5 h-3.5 text-destructive" />
                    </Button>
                  </div>
                </div>
                <div className="mt-3 space-y-1.5 text-sm text-muted-foreground">
                  {vendor.contactName && <p>{vendor.contactName}</p>}
                  {vendor.phone && (
                    <p className="flex items-center gap-1.5">
                      <Phone className="w-3 h-3" /> {formatPhoneNumber(vendor.phone)}
                    </p>
                  )}
                  {vendor.email && (
                    <p className="flex items-center gap-1.5">
                      <Mail className="w-3 h-3" /> {vendor.email}
                    </p>
                  )}
                  <div className="flex items-center justify-between gap-2 pt-1">
                    <VendorRatingInline
                      avgRating={vendor.avgRating}
                      reviewCount={vendor.reviewCount}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => setReviewListVendor(vendor)}
                      data-testid={`vendor-reviews-${vendor.id}`}
                    >
                      <MessageSquareText className="w-3 h-3 mr-1" />
                      평가 보기
                    </Button>
                  </div>
                  {(vendor.sido || vendor.sigungu) && (
                    <p className="flex items-center gap-1">
                      <MapPin className="w-3 h-3" />
                      {[vendor.sido, vendor.sigungu].filter(Boolean).join(" ")}
                    </p>
                  )}
                  {vendor.businessRegNumber && (
                    <p className="text-xs mt-2">사업자번호: {formatBusinessNumber(vendor.businessRegNumber)}</p>
                  )}
                  {vendor.serviceArea && (
                    <p className="text-xs">서비스 지역: {vendor.serviceArea}</p>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <Briefcase className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground">
              등록된 파트너사가 없습니다
            </p>
          </CardContent>
        </Card>
      )}

      <VendorReviewsListDialog
        open={reviewListVendor !== null}
        onOpenChange={(o) => { if (!o) setReviewListVendor(null); }}
        vendor={reviewListVendor}
      />
    </div>
  );
}
