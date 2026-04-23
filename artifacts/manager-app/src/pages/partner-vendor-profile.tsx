import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Vendor, VendorCategory } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Building2, AlertCircle, MapPin, Save } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";
import { sidoList, getSigunguList } from "@workspace/shared/korean-districts";

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

const BASE = (import.meta.env.BASE_URL ?? "/") as string;
const API_BASE = `${BASE}api`;
const ME_VENDOR_QUERY_KEY = ["me", "vendor"] as const;

// [Task #290] 파트너 전용 — 본인 소속 업체 한 건만 조회·편집한다.
//   풀 목록(/vendors)을 받지 않고 서버의 GET /api/me/vendor 를 호출하여
//   다른 업체 데이터가 클라이언트에 노출되지 않도록 한다(데이터 격리).
export default function PartnerVendorProfile() {
  const { user, token } = useAuth();
  const vendorId = user?.vendorId ?? null;
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const meVendorQuery = useQuery<Vendor | null>({
    queryKey: ME_VENDOR_QUERY_KEY,
    enabled: !!vendorId && !!token,
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/me/vendor`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`업체 정보를 불러오지 못했습니다 (${res.status})`);
      return (await res.json()) as Vendor;
    },
  });

  const updateMutation = useMutation<Vendor, Error, Partial<Vendor>>({
    mutationFn: async (payload) => {
      const res = await fetch(`${API_BASE}/me/vendor`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const msg = await res.text().catch(() => "");
        throw new Error(msg || `저장 실패 (${res.status})`);
      }
      return (await res.json()) as Vendor;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ME_VENDOR_QUERY_KEY });
      toast({ title: "업체 정보가 저장되었습니다" });
    },
    onError: (err) => {
      toast({ title: "저장 실패", description: err.message, variant: "destructive" });
    },
  });

  const me = meVendorQuery.data ?? null;

  const [form, setForm] = useState<{
    name: string;
    category: VendorCategory;
    contactName: string;
    phone: string;
    email: string;
    address: string;
    notes: string;
    businessRegNumber: string;
    representativeName: string;
    serviceArea: string;
    subCategories: string;
    sido: string;
    sigungu: string;
  }>({
    name: "",
    category: "elevator",
    contactName: "",
    phone: "",
    email: "",
    address: "",
    notes: "",
    businessRegNumber: "",
    representativeName: "",
    serviceArea: "",
    subCategories: "",
    sido: "",
    sigungu: "",
  });

  useEffect(() => {
    if (!me) return;
    setForm({
      name: me.name ?? "",
      category: me.category ?? "elevator",
      contactName: me.contactName ?? "",
      phone: me.phone ?? "",
      email: me.email ?? "",
      address: me.address ?? "",
      notes: me.notes ?? "",
      businessRegNumber: me.businessRegNumber ?? "",
      representativeName: me.representativeName ?? "",
      serviceArea: me.serviceArea ?? "",
      subCategories: me.subCategories ?? "",
      sido: me.sido ?? "",
      sigungu: me.sigungu ?? "",
    });
  }, [me]);

  if (!vendorId) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="py-12 text-center">
            <AlertCircle className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
            <h2 className="text-lg font-bold mb-2">업체 연결 필요</h2>
            <p className="text-muted-foreground text-sm">
              계정에 연결된 업체가 없습니다. 본사 관리자에게 문의해 주세요.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (meVendorQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!me) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="py-12 text-center">
            <AlertCircle className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground">업체 정보를 불러오지 못했습니다.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!me) return;
    updateMutation.mutate({
      name: form.name,
      category: form.category,
      contactName: form.contactName || null,
      phone: form.phone || null,
      email: form.email || null,
      address: form.address || null,
      notes: form.notes || null,
      businessRegNumber: form.businessRegNumber || null,
      representativeName: form.representativeName || null,
      serviceArea: form.serviceArea || null,
      subCategories: form.subCategories || null,
      sido: form.sido || null,
      sigungu: form.sigungu || null,
    });
  }

  const sigunguOptions = form.sido ? getSigunguList(form.sido) : [];

  return (
    <div className="space-y-6" data-testid="page-partner-vendor-profile">
      <div className="flex items-center gap-3">
        <Building2 className="w-5 h-5 text-teal-500" />
        <div>
          <h1 className="text-2xl font-bold">내 업체 정보</h1>
          <p className="text-muted-foreground text-sm">
            본인 소속 업체의 프로필을 확인·수정합니다.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">기본 정보</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>상호 (업체명)</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                  data-testid="input-vendor-name"
                />
              </div>
              <div>
                <Label>대표 분야</Label>
                <Select
                  value={form.category}
                  onValueChange={(v) => setForm({ ...form, category: v as VendorCategory })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {categoryOptions.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
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

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>담당자</Label>
                <Input
                  value={form.contactName}
                  onChange={(e) => setForm({ ...form, contactName: e.target.value })}
                />
              </div>
              <div>
                <Label>연락처</Label>
                <Input
                  type="tel"
                  inputMode="tel"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>이메일</Label>
                <Input
                  type="email"
                  inputMode="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>
              <div>
                <Label>주소</Label>
                <Input
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                />
              </div>
            </div>

            <div className="border-t pt-4">
              <p className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5" />
                서비스 가능 지역
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>시/도</Label>
                  <Select
                    value={form.sido || undefined}
                    onValueChange={(v) => setForm({ ...form, sido: v, sigungu: "" })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="시/도 선택" />
                    </SelectTrigger>
                    <SelectContent>
                      {sidoList.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
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
                    <SelectTrigger>
                      <SelectValue placeholder="시/군/구 선택" />
                    </SelectTrigger>
                    <SelectContent>
                      {sigunguOptions.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="mt-3">
                <Label>서비스 지역 메모</Label>
                <Input
                  value={form.serviceArea}
                  onChange={(e) => setForm({ ...form, serviceArea: e.target.value })}
                  placeholder="예: 서울 전역, 경기 북부"
                />
              </div>
            </div>

            <div className="border-t pt-4">
              <p className="text-sm font-medium text-muted-foreground mb-3">사업자 정보</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>사업자등록번호</Label>
                  <Input
                    value={form.businessRegNumber}
                    onChange={(e) => setForm({ ...form, businessRegNumber: e.target.value })}
                  />
                </div>
                <div>
                  <Label>대표자명</Label>
                  <Input
                    value={form.representativeName}
                    onChange={(e) => setForm({ ...form, representativeName: e.target.value })}
                  />
                </div>
              </div>
            </div>

            <div>
              <Label>비고</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>

            <Button
              type="submit"
              className="w-full md:w-auto"
              disabled={updateMutation.isPending}
              data-testid="button-vendor-save"
            >
              <Save className="w-4 h-4 mr-1.5" />
              저장
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
