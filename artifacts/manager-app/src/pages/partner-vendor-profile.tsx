import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Vendor, VendorCategory } from "@workspace/api-client-react";
import { ROLE_LABELS } from "@workspace/shared/role-labels";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Building2,
  AlertCircle,
  MapPin,
  Save,
  Camera,
  Loader2,
  X,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";
import { sidoList, getSigunguList } from "@workspace/shared/korean-districts";
import { AuthImage } from "@/components/auth-image";

const categoryOptions: { value: VendorCategory; label: string }[] = [
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

// [Task #328] 서비스가능지역은 시/도별 시/군/구 다중 선택을 JSON 으로 직렬화해
//   serviceArea 필드(텍스트)에 저장한다. 이전 단일 sido/sigungu 컬럼은 첫
//   선택값을 채워 기존 화면(목록/검색)과의 호환을 유지.
type ServiceAreaState = {
  nationwide: boolean;
  // sido -> Set of sigungu (빈 Set 이면 시/도 전체 선택)
  bySido: Record<string, string[]>;
};

function parseServiceArea(raw: string | null | undefined): ServiceAreaState {
  if (!raw) return { nationwide: false, bySido: {} };
  try {
    const v = JSON.parse(raw);
    if (v && typeof v === "object" && "bySido" in v) {
      return {
        nationwide: !!v.nationwide,
        bySido: v.bySido ?? {},
      };
    }
  } catch {
    // 구버전(메모 텍스트)은 무시 — 다시 입력 받음
  }
  return { nationwide: false, bySido: {} };
}

function serializeServiceArea(s: ServiceAreaState): string {
  return JSON.stringify({ nationwide: s.nationwide, bySido: s.bySido });
}

function summarizeServiceArea(s: ServiceAreaState): string {
  if (s.nationwide) return "전국";
  const parts: string[] = [];
  for (const sido of Object.keys(s.bySido)) {
    const sigungus = s.bySido[sido];
    if (!sigungus || sigungus.length === 0) {
      parts.push(`${sido} 전역`);
    } else {
      parts.push(`${sido} ${sigungus.length}개`);
    }
  }
  return parts.join(" · ") || "선택 없음";
}

// [Task #290/328] 파트너 전용 — 본인 소속 업체 한 건만 조회·편집한다.
//   풀 목록(/vendors)을 받지 않고 서버의 GET /api/me/vendor 를 호출하여
//   다른 업체 데이터가 클라이언트에 노출되지 않도록 한다(데이터 격리).
export default function PartnerVendorProfile() {
  const { user, token } = useAuth();
  const vendorId = user?.vendorId ?? null;
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const photoInputRef = useRef<HTMLInputElement>(null);

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
      toast({ title: "내 정보가 저장되었습니다" });
    },
    onError: (err) => {
      toast({ title: "저장 실패", description: err.message, variant: "destructive" });
    },
  });

  const me = meVendorQuery.data ?? null;

  // [Task #328] 분야: 다중 선택. 첫 항목이 대표 분야(category, notNull)로 저장됨.
  //   기존 데이터: category + subCategories(쉼표 구분)을 합쳐 초기화.
  const [selectedCategories, setSelectedCategories] = useState<VendorCategory[]>([]);

  const [serviceArea, setServiceArea] = useState<ServiceAreaState>({
    nationwide: false,
    bySido: {},
  });
  const [expandedSido, setExpandedSido] = useState<string | null>(null);

  const [profileImageUrl, setProfileImageUrl] = useState<string | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoError, setPhotoError] = useState<string>("");

  const [form, setForm] = useState<{
    name: string;
    contactName: string;
    phone: string;
    email: string;
    address: string;
    notes: string;
    businessRegNumber: string;
    representativeName: string;
  }>({
    name: "",
    contactName: "",
    phone: "",
    email: "",
    address: "",
    notes: "",
    businessRegNumber: "",
    representativeName: "",
  });

  useEffect(() => {
    if (!me) return;
    setForm({
      name: me.name ?? "",
      contactName: me.contactName ?? "",
      phone: me.phone ?? "",
      email: me.email ?? "",
      address: me.address ?? "",
      notes: me.notes ?? "",
      businessRegNumber: me.businessRegNumber ?? "",
      representativeName: me.representativeName ?? "",
    });
    // 분야 초기화: category(대표) + subCategories(CSV) → 중복 제거 + valid 만
    const validCodes = new Set(categoryOptions.map((c) => c.value));
    const cats: VendorCategory[] = [];
    if (me.category && validCodes.has(me.category as VendorCategory)) {
      cats.push(me.category as VendorCategory);
    }
    const sub = (me.subCategories ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    for (const s of sub) {
      if (validCodes.has(s as VendorCategory) && !cats.includes(s as VendorCategory)) {
        cats.push(s as VendorCategory);
      }
    }
    setSelectedCategories(cats);
    // 서비스 가능 지역 — JSON 우선, 그 외엔 sido/sigungu 단일 값으로 fallback
    const parsed = parseServiceArea(me.serviceArea);
    if (parsed.nationwide || Object.keys(parsed.bySido).length > 0) {
      setServiceArea(parsed);
    } else if (me.sido) {
      setServiceArea({
        nationwide: false,
        bySido: { [me.sido]: me.sigungu ? [me.sigungu] : [] },
      });
    } else {
      setServiceArea({ nationwide: false, bySido: {} });
    }
    setProfileImageUrl(me.profileImageUrl ?? null);
  }, [me]);

  if (!vendorId) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="py-12 text-center">
            <AlertCircle className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
            <h2 className="text-lg font-bold mb-2">업체 연결 필요</h2>
            <p className="text-muted-foreground text-sm">
              계정에 연결된 업체가 없습니다. {ROLE_LABELS.platform_admin}에게 문의해 주세요.
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
            <p className="text-muted-foreground">내 정보를 불러오지 못했습니다.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  function toggleCategory(code: VendorCategory) {
    setSelectedCategories((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code],
    );
  }

  function toggleSidoExpand(sido: string) {
    setExpandedSido((prev) => (prev === sido ? null : sido));
  }

  // 시/도 체크 = 시/군/구 비우고(전역) 등록 / 해제 = 제거
  function toggleSidoAll(sido: string) {
    setServiceArea((prev) => {
      const next = { ...prev, bySido: { ...prev.bySido } };
      if (sido in next.bySido) {
        delete next.bySido[sido];
      } else {
        next.bySido[sido] = [];
      }
      return next;
    });
  }

  function toggleSigungu(sido: string, sigungu: string) {
    setServiceArea((prev) => {
      const next = { ...prev, bySido: { ...prev.bySido } };
      const current = next.bySido[sido] ?? [];
      if (current.includes(sigungu)) {
        const filtered = current.filter((s) => s !== sigungu);
        if (filtered.length === 0) {
          // 전역으로 변환할지 vs 제거할지 — 사용자가 명시적으로 토글한 거라 제거.
          delete next.bySido[sido];
        } else {
          next.bySido[sido] = filtered;
        }
      } else {
        next.bySido[sido] = [...current, sigungu];
      }
      return next;
    });
  }

  function toggleNationwide() {
    setServiceArea((prev) => {
      if (prev.nationwide) return { nationwide: false, bySido: {} };
      return { nationwide: true, bySido: {} };
    });
  }

  async function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoError("");
    if (!/^image\//.test(file.type)) {
      setPhotoError("이미지 파일만 업로드할 수 있습니다");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setPhotoError("이미지 크기는 10MB 이하여야 합니다");
      return;
    }
    setPhotoUploading(true);
    try {
      const signRes = await fetch(`${API_BASE}/storage/uploads/request-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: file.name,
          size: file.size,
          contentType: file.type || "application/octet-stream",
        }),
      });
      if (!signRes.ok) throw new Error("업로드 URL 발급 실패");
      const { uploadURL, objectPath } = await signRes.json();
      const putRes = await fetch(uploadURL, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!putRes.ok) throw new Error("이미지 업로드 실패");
      await fetch(`${API_BASE}/storage/uploads/finalize`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ objectPath }),
      });
      setProfileImageUrl(objectPath);
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : "업로드 실패");
    } finally {
      setPhotoUploading(false);
      if (photoInputRef.current) photoInputRef.current.value = "";
    }
  }

  function removePhoto() {
    setProfileImageUrl(null);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!me) return;
    if (selectedCategories.length === 0) {
      toast({
        title: "분야를 선택해 주세요",
        description: "1개 이상의 분야를 선택해야 합니다.",
        variant: "destructive",
      });
      return;
    }
    const primary = selectedCategories[0];
    const subs = selectedCategories.slice(1).join(",");
    // sido/sigungu 단일 컬럼은 첫 선택값을 보존(기존 검색/목록 호환)
    const firstSido = serviceArea.nationwide
      ? null
      : Object.keys(serviceArea.bySido)[0] ?? null;
    const firstSigungu =
      firstSido && serviceArea.bySido[firstSido]?.length
        ? serviceArea.bySido[firstSido][0]
        : null;

    updateMutation.mutate({
      name: form.name,
      category: primary,
      contactName: form.contactName || null,
      phone: form.phone || null,
      email: form.email || null,
      address: form.address || null,
      notes: form.notes || null,
      businessRegNumber: form.businessRegNumber || null,
      representativeName: form.representativeName || null,
      serviceArea: serializeServiceArea(serviceArea),
      subCategories: subs || null,
      sido: firstSido,
      sigungu: firstSigungu,
      profileImageUrl: profileImageUrl,
    });
  }

  // 프로필 이미지 표시용 URL — 저장된 objectPath 는 private 라우트로 인증 fetch.
  //   /storage/objects/{path} 형태로 변환해 AuthImage 가 토큰 헤더로 가져오게 한다.
  const photoSrc = profileImageUrl
    ? `${API_BASE}/storage/objects/${profileImageUrl.replace(/^\/objects\//, "")}`
    : null;
  const initials = (form.name || "업").slice(0, 2);

  return (
    <div className="space-y-6" data-testid="page-partner-vendor-profile">
      <div className="flex items-center gap-3">
        <Building2 className="w-5 h-5 text-teal-500" />
        <div>
          <h1 className="text-2xl font-bold">내 정보</h1>
          <p className="text-muted-foreground text-sm">
            본인 업체 프로필을 확인·수정합니다.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">기본 정보</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* 프로필 사진 */}
            <div className="flex items-start gap-4">
              <div className="relative">
                <div
                  className="w-20 h-20 rounded-full overflow-hidden bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400 font-bold text-lg"
                  data-testid="vendor-photo-preview"
                >
                  {photoSrc ? (
                    <AuthImage
                      src={photoSrc}
                      alt="프로필 사진"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span>{initials}</span>
                  )}
                </div>
                {photoUploading && (
                  <div className="absolute inset-0 rounded-full bg-black/30 flex items-center justify-center">
                    <Loader2 className="w-5 h-5 text-white animate-spin" />
                  </div>
                )}
              </div>
              <div className="flex-1 space-y-2">
                <Label className="text-sm">프로필 사진</Label>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => photoInputRef.current?.click()}
                    disabled={photoUploading}
                    data-testid="button-vendor-photo-upload"
                  >
                    <Camera className="w-4 h-4 mr-1.5" />
                    {photoSrc ? "사진 변경" : "사진 첨부"}
                  </Button>
                  {photoSrc && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={removePhoto}
                      disabled={photoUploading}
                      data-testid="button-vendor-photo-remove"
                    >
                      <X className="w-4 h-4 mr-1.5" />
                      삭제
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">JPG/PNG/WebP, 10MB 이하</p>
                {photoError && (
                  <p className="text-xs text-red-600">{photoError}</p>
                )}
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handlePhotoSelect}
                  data-testid="input-vendor-photo"
                />
              </div>
            </div>

            <div>
              <Label>상호 (업체명)</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
                data-testid="input-vendor-name"
              />
            </div>

            {/* 분야 — 다중 체크 */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>분야 (복수 선택)</Label>
                <span className="text-[11px] text-muted-foreground">
                  선택됨 {selectedCategories.length}개
                  {selectedCategories.length > 0 && " · 첫 항목이 대표 분야"}
                </span>
              </div>
              <div
                className="grid grid-cols-2 sm:grid-cols-3 gap-2"
                data-testid="vendor-category-grid"
              >
                {categoryOptions.map((c) => {
                  const active = selectedCategories.includes(c.value);
                  const isPrimary = active && selectedCategories[0] === c.value;
                  return (
                    <button
                      key={c.value}
                      type="button"
                      role="checkbox"
                      aria-checked={active}
                      onClick={() => toggleCategory(c.value)}
                      data-testid={`vendor-category-${c.value}`}
                      className={`relative px-3 py-2 rounded-lg border text-sm transition-colors text-left ${
                        active
                          ? "border-teal-400 bg-teal-50 text-teal-700 font-medium"
                          : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                      }`}
                    >
                      <span className="flex items-center gap-1.5">
                        <span
                          className={`inline-block w-3.5 h-3.5 rounded border ${
                            active
                              ? "bg-teal-500 border-teal-500"
                              : "bg-white border-slate-300"
                          } shrink-0`}
                          aria-hidden
                        />
                        {c.label}
                      </span>
                      {isPrimary && (
                        <Badge
                          variant="secondary"
                          className="absolute -top-1.5 -right-1 text-[9px] h-4 px-1 bg-teal-100 text-teal-700"
                        >
                          대표
                        </Badge>
                      )}
                    </button>
                  );
                })}
              </div>
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

            {/* 서비스 가능 지역 — 시/도 체크 + 시/군/구 체크, 전국 옵션 */}
            <div className="border-t pt-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5" />
                  서비스 가능 지역
                </p>
                <span className="text-[11px] text-muted-foreground">
                  {summarizeServiceArea(serviceArea)}
                </span>
              </div>
              {/* 전국 토글 */}
              <button
                type="button"
                role="checkbox"
                aria-checked={serviceArea.nationwide}
                onClick={toggleNationwide}
                data-testid="vendor-area-nationwide"
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg border mb-3 text-sm font-medium ${
                  serviceArea.nationwide
                    ? "border-teal-400 bg-teal-50 text-teal-700"
                    : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                }`}
              >
                <span
                  className={`inline-block w-3.5 h-3.5 rounded border ${
                    serviceArea.nationwide
                      ? "bg-teal-500 border-teal-500"
                      : "bg-white border-slate-300"
                  }`}
                  aria-hidden
                />
                전국 서비스 가능
              </button>

              {/* 시/도 + 시/군/구 트리 (전국이면 비활성화) */}
              <div
                className={`space-y-1 ${serviceArea.nationwide ? "opacity-40 pointer-events-none" : ""}`}
                aria-disabled={serviceArea.nationwide}
                data-testid="vendor-area-tree"
              >
                {sidoList.map((sido) => {
                  const checked = sido in serviceArea.bySido;
                  const sigunguList = serviceArea.bySido[sido] ?? [];
                  const wholeArea = checked && sigunguList.length === 0;
                  const expanded = expandedSido === sido;
                  return (
                    <div
                      key={sido}
                      className="border border-slate-200 rounded-lg overflow-hidden"
                    >
                      <div className="flex items-center">
                        <button
                          type="button"
                          role="checkbox"
                          aria-checked={checked}
                          onClick={() => toggleSidoAll(sido)}
                          data-testid={`vendor-area-sido-${sido}`}
                          className="flex-1 flex items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50 text-left"
                        >
                          <span
                            className={`inline-block w-3.5 h-3.5 rounded border shrink-0 ${
                              checked
                                ? "bg-teal-500 border-teal-500"
                                : "bg-white border-slate-300"
                            }`}
                            aria-hidden
                          />
                          <span className={checked ? "font-medium text-teal-700" : ""}>
                            {sido}
                          </span>
                          {checked && (
                            <Badge
                              variant="secondary"
                              className="text-[9px] h-4 px-1 bg-teal-100 text-teal-700 ml-1"
                            >
                              {wholeArea ? "전역" : `${sigunguList.length}개`}
                            </Badge>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleSidoExpand(sido)}
                          aria-label={`${sido} 시/군/구 ${expanded ? "접기" : "펼치기"}`}
                          className="px-2 py-2 text-slate-400 hover:text-slate-700"
                          data-testid={`vendor-area-expand-${sido}`}
                        >
                          {expanded ? (
                            <ChevronDown className="w-4 h-4" />
                          ) : (
                            <ChevronRight className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                      {expanded && (
                        <div className="border-t border-slate-100 bg-slate-50 p-2">
                          <p className="text-[11px] text-muted-foreground mb-1.5 px-1">
                            전체 선택은 위의 시/도 체크박스를 사용하세요.
                          </p>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1">
                            {getSigunguList(sido).map((sg) => {
                              const sgChecked = sigunguList.includes(sg);
                              return (
                                <button
                                  key={sg}
                                  type="button"
                                  role="checkbox"
                                  aria-checked={sgChecked}
                                  onClick={() => toggleSigungu(sido, sg)}
                                  data-testid={`vendor-area-sigungu-${sido}-${sg}`}
                                  className={`flex items-center gap-1.5 px-2 py-1.5 rounded text-xs text-left ${
                                    sgChecked
                                      ? "bg-teal-100 text-teal-700 font-medium"
                                      : "bg-white text-slate-700 hover:bg-slate-100 border border-slate-200"
                                  }`}
                                >
                                  <span
                                    className={`inline-block w-3 h-3 rounded border shrink-0 ${
                                      sgChecked
                                        ? "bg-teal-500 border-teal-500"
                                        : "bg-white border-slate-300"
                                    }`}
                                    aria-hidden
                                  />
                                  {sg}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
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
