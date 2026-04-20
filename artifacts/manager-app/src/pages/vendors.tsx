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
import { Plus, Trash2, Edit, Building2, Star, Phone, Mail, Briefcase, MapPin } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { koreanDistricts, sidoList, getSigunguList } from "@workspace/shared/korean-districts";

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

type VendorType = "contracted" | "platform";

export default function Vendors() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<VendorType>("contracted");
  const [filterCategory, setFilterCategory] = useState<string | undefined>();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const queryParams: any = { type: activeTab };
  if (filterCategory && filterCategory !== "all") {
    queryParams.category = filterCategory;
  }
  const { data: vendors, isLoading } = useListVendors(queryParams);
  const createMutation = useCreateVendor();
  const updateMutation = useUpdateVendor();
  const deleteMutation = useDeleteVendor();

  const [form, setForm] = useState({
    name: "",
    category: "elevator",
    contactName: "",
    phone: "",
    email: "",
    address: "",
    rating: "",
    isRecommended: false,
    notes: "",
    contractBuildingName: "",
    contractStartDate: "",
    contractEndDate: "",
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
      address: "", rating: "", isRecommended: false, notes: "",
      contractBuildingName: "", contractStartDate: "", contractEndDate: "",
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
      rating: item.rating?.toString() || "",
      isRecommended: item.isRecommended,
      notes: item.notes || "",
      contractBuildingName: item.contractBuildingName || "",
      contractStartDate: item.contractStartDate || "",
      contractEndDate: item.contractEndDate || "",
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
    const base: any = {
      name: form.name,
      category: form.category as any,
      type: activeTab,
      contactName: form.contactName || null,
      phone: form.phone || null,
      email: form.email || null,
      address: form.address || null,
      rating: form.rating ? parseFloat(form.rating) : null,
      isRecommended: form.isRecommended,
      notes: form.notes || null,
      subCategories: form.subCategories || null,
      sido: form.sido || null,
      sigungu: form.sigungu || null,
    };

    if (activeTab === "contracted") {
      base.contractBuildingName = form.contractBuildingName || null;
      base.contractStartDate = form.contractStartDate || null;
      base.contractEndDate = form.contractEndDate || null;
    } else {
      base.businessRegNumber = form.businessRegNumber || null;
      base.representativeName = form.representativeName || null;
      base.serviceArea = form.serviceArea || null;
    }

    if (editing) {
      await updateMutation.mutateAsync({ id: editing.id, data: base });
      toast({ title: "업체 정보가 수정되었습니다" });
    } else {
      await createMutation.mutateAsync({ data: base });
      toast({ title: "업체가 등록되었습니다" });
    }
    queryClient.invalidateQueries({ queryKey: getListVendorsQueryKey() });
    setDialogOpen(false);
    resetForm();
  }

  async function handleDelete(id: number) {
    await deleteMutation.mutateAsync({ id });
    queryClient.invalidateQueries({ queryKey: getListVendorsQueryKey() });
    toast({ title: "업체가 삭제되었습니다" });
  }

  const categoryLabel = (c: string) =>
    categoryOptions.find((o) => o.value === c)?.label || c;

  const sigunguOptions = form.sido ? getSigunguList(form.sido) : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">협력업체 관리</h1>
          <p className="text-muted-foreground text-sm mt-1">
            유지보수 협력업체를 등록하고 관리합니다
          </p>
        </div>
        <ResponsiveDialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) resetForm(); }}>
          <ResponsiveDialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              업체 등록
            </Button>
          </ResponsiveDialogTrigger>
          <ResponsiveDialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <ResponsiveDialogHeader>
              <ResponsiveDialogTitle>{editing ? "업체 수정" : "새 업체 등록"}</ResponsiveDialogTitle>
            </ResponsiveDialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>업체명</Label>
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
                  <Input type="tel" inputMode="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>이메일</Label>
                  <Input type="email" inputMode="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                </div>
                <div>
                  <Label>평점 (1-5)</Label>
                  <Input type="number" inputMode="decimal" min="1" max="5" step="0.1" value={form.rating} onChange={(e) => setForm({ ...form, rating: e.target.value })} />
                </div>
              </div>
              <div>
                <Label>주소</Label>
                <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
              </div>

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

              {activeTab === "contracted" && (
                <>
                  <div className="border-t pt-4">
                    <p className="text-sm font-medium text-muted-foreground mb-3">계약 정보</p>
                  </div>
                  <div>
                    <Label>계약 건물명</Label>
                    <Input value={form.contractBuildingName} onChange={(e) => setForm({ ...form, contractBuildingName: e.target.value })} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>계약 시작일</Label>
                      <Input type="date" value={form.contractStartDate} onChange={(e) => setForm({ ...form, contractStartDate: e.target.value })} />
                    </div>
                    <div>
                      <Label>계약 종료일</Label>
                      <Input type="date" value={form.contractEndDate} onChange={(e) => setForm({ ...form, contractEndDate: e.target.value })} />
                    </div>
                  </div>
                </>
              )}

              {activeTab === "platform" && (
                <>
                  <div className="border-t pt-4">
                    <p className="text-sm font-medium text-muted-foreground mb-3">플랫폼 업체 정보</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>사업자등록번호</Label>
                      <Input value={form.businessRegNumber} onChange={(e) => setForm({ ...form, businessRegNumber: e.target.value })} />
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
                </>
              )}

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.isRecommended}
                  onChange={(e) => setForm({ ...form, isRecommended: e.target.checked })}
                  className="w-4 h-4"
                />
                <Label>추천 업체로 등록</Label>
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

      <div className="flex gap-2 border-b">
        <button
          onClick={() => { setActiveTab("contracted"); setFilterCategory(undefined); }}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "contracted"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Building2 className="w-4 h-4 inline-block mr-1.5 -mt-0.5" />
          계약 업체
        </button>
        <button
          onClick={() => { setActiveTab("platform"); setFilterCategory(undefined); }}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "platform"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Briefcase className="w-4 h-4 inline-block mr-1.5 -mt-0.5" />
          플랫폼 업체
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        <Select value={filterCategory || "all"} onValueChange={(v) => setFilterCategory(v === "all" ? undefined : v)}>
          <SelectTrigger className="w-full sm:w-[160px] h-11"><SelectValue placeholder="분류" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 분류</SelectItem>
            {categoryOptions.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

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
                    <div className={`p-2 rounded-lg ${vendor.type === "platform" ? "bg-chart-3/10" : "bg-primary/10"}`}>
                      {vendor.type === "platform"
                        ? <Briefcase className="w-5 h-5 text-chart-3" />
                        : <Building2 className="w-5 h-5 text-primary" />
                      }
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
                      <Phone className="w-3 h-3" /> {vendor.phone}
                    </p>
                  )}
                  {vendor.email && (
                    <p className="flex items-center gap-1.5">
                      <Mail className="w-3 h-3" /> {vendor.email}
                    </p>
                  )}
                  {vendor.rating && (
                    <p className="flex items-center gap-1">
                      <Star className="w-3 h-3 text-chart-3" />
                      {vendor.rating.toFixed(1)}
                    </p>
                  )}
                  {(vendor.sido || vendor.sigungu) && (
                    <p className="flex items-center gap-1">
                      <MapPin className="w-3 h-3" />
                      {[vendor.sido, vendor.sigungu].filter(Boolean).join(" ")}
                    </p>
                  )}
                  {activeTab === "contracted" && vendor.contractBuildingName && (
                    <p className="text-xs mt-2">건물: {vendor.contractBuildingName}</p>
                  )}
                  {activeTab === "contracted" && vendor.contractStartDate && (
                    <p className="text-xs">계약: {vendor.contractStartDate} ~ {vendor.contractEndDate || "진행중"}</p>
                  )}
                  {activeTab === "platform" && vendor.businessRegNumber && (
                    <p className="text-xs mt-2">사업자번호: {vendor.businessRegNumber}</p>
                  )}
                  {activeTab === "platform" && vendor.serviceArea && (
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
            {activeTab === "contracted"
              ? <Building2 className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
              : <Briefcase className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
            }
            <p className="text-muted-foreground">
              {activeTab === "contracted" ? "등록된 계약 업체가 없습니다" : "등록된 플랫폼 업체가 없습니다"}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
