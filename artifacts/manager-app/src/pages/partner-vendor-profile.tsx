// [Task #661] 파트너 "내 정보" 페이지.
//   - 편집 가능 섹션: 프로필 사진 / 한줄 소개 / 담당자·연락처·이메일 / 주소 /
//     서비스가능지역 / 비고  → PATCH /me/vendor 로 즉시 저장.
//   - 잠금 섹션: 상호 / 사업자등록번호 / 대표자명 / 분야(카테고리)
//     · 직접 편집 불가, "변경 신청" 시트를 통해 본사 검토 후 반영.
//     · pending 신청이 있으면 다시 신청할 수 없고, 진행 상태/반려 사유를 표시.
//   - VendorAvatar 공용 컴포넌트로 사진/실루엣을 일관되게 노출.
import { useEffect, useMemo, useState } from "react";
import { AttachmentPickerSheet } from "@/components/attachment-picker-sheet";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Vendor, VendorCategory } from "@workspace/api-client-react";
import { ROLE_LABELS } from "@workspace/shared/role-labels";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/ui/phone-input";
import { BusinessNumberInput } from "@/components/ui/business-number-input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
  Lock,
  CheckCircle2,
  XCircle,
  Upload,
  FileText,
  Clock,
} from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";
import { sidoList, getSigunguList } from "@workspace/shared/korean-districts";
import { VendorAvatar } from "@/components/vendor-avatar";

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
const categoryLabel = (code: string) =>
  categoryOptions.find((c) => c.value === (code as VendorCategory))?.label ?? code;

const BASE = (import.meta.env.BASE_URL ?? "/") as string;
const API_BASE = `${BASE}api`;
const ME_VENDOR_QUERY_KEY = ["me", "vendor"] as const;
const ME_VENDOR_CHANGE_REQ_KEY = ["me", "vendor", "changeRequest"] as const;
const INTRO_MAX = 30;

// 변경 신청에서 다룰 잠금 항목 코드.
const LOCKED_FIELD_LABEL: Record<string, string> = {
  name: "상호 (업체명)",
  businessRegNumber: "사업자등록번호",
  representativeName: "대표자명",
  category: "분야",
};

interface ChangeRequestRecord {
  id: number;
  vendorId: number;
  status: "pending" | "approved" | "rejected";
  fields: Array<{ field: string; before: string | null; after: string | null }>;
  bizCertUrl: string;
  reason: string | null;
  decidedBy: number | null;
  decidedAt: string | null;
  decisionReason: string | null;
  createdAt: string;
}

// [Task #328] 서비스가능지역은 시/도별 시/군/구 다중 선택을 JSON 으로 직렬화해
//   serviceArea 필드(텍스트)에 저장한다. 이전 단일 sido/sigungu 컬럼은 첫
//   선택값을 채워 기존 화면(목록/검색)과의 호환을 유지.
type ServiceAreaState = {
  nationwide: boolean;
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

export default function PartnerVendorProfile() {
  const { user, token } = useAuth();
  const vendorId = user?.vendorId ?? null;
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [photoSheetOpen, setPhotoSheetOpen] = useState(false);
  const [changeRequestOpen, setChangeRequestOpen] = useState(false);

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

  // [Task #661] 가장 최근 변경 신청 1건 조회. pending 이면 잠금 섹션에 안내 노출,
  //   approved/rejected 면 결과 안내 띠 노출(닫기 버튼 없이 다음 신청 시 자동 갱신).
  const changeRequestQuery = useQuery<ChangeRequestRecord | null>({
    queryKey: ME_VENDOR_CHANGE_REQ_KEY,
    enabled: !!vendorId && !!token,
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/me/vendor/change-requests/active`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`변경 신청 정보를 불러오지 못했습니다 (${res.status})`);
      const data = await res.json();
      return (data?.request ?? null) as ChangeRequestRecord | null;
    },
  });

  const updateMutation = useMutation<Vendor, Error, Record<string, unknown>>({
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

  const [serviceArea, setServiceArea] = useState<ServiceAreaState>({
    nationwide: false,
    bySido: {},
  });
  const [expandedSido, setExpandedSido] = useState<string | null>(null);

  const [profileImageUrl, setProfileImageUrl] = useState<string | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoError, setPhotoError] = useState<string>("");

  const [form, setForm] = useState<{
    intro: string;
    contactName: string;
    phone: string;
    email: string;
    address: string;
    notes: string;
  }>({
    intro: "",
    contactName: "",
    phone: "",
    email: "",
    address: "",
    notes: "",
  });

  // 잠금 항목의 현재값(읽기전용 표시용). 변경 신청 시트에 before 로도 사용.
  const lockedView = useMemo(() => {
    const subs = (me?.subCategories ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const cats = me?.category ? [me.category, ...subs.filter((s) => s !== me.category)] : subs;
    return {
      name: me?.name ?? "",
      businessRegNumber: me?.businessRegNumber ?? "",
      representativeName: me?.representativeName ?? "",
      categories: cats,
    };
  }, [me]);

  useEffect(() => {
    if (!me) return;
    setForm({
      intro: me.intro ?? "",
      contactName: me.contactName ?? "",
      phone: me.phone ?? "",
      email: me.email ?? "",
      address: me.address ?? "",
      notes: me.notes ?? "",
    });
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

  function toggleSidoExpand(sido: string) {
    setExpandedSido((prev) => (prev === sido ? null : sido));
  }

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

  async function handlePhotoSelect(file: File) {
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
    }
  }

  function removePhoto() {
    setProfileImageUrl(null);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!me) return;
    const firstSido = serviceArea.nationwide
      ? null
      : Object.keys(serviceArea.bySido)[0] ?? null;
    const firstSigungu =
      firstSido && serviceArea.bySido[firstSido]?.length
        ? serviceArea.bySido[firstSido][0]
        : null;

    // [Task #661] 잠금 항목(name/businessRegNumber/representativeName/category/subCategories)
    //   은 PATCH 본문에 포함하지 않는다. 서버가 추가로 차단하지만 클라이언트에서도
    //   명시적으로 분리해 의도가 드러나도록 한다.
    updateMutation.mutate({
      intro: form.intro.trim().slice(0, INTRO_MAX) || null,
      contactName: form.contactName || null,
      phone: form.phone || null,
      email: form.email || null,
      address: form.address || null,
      notes: form.notes || null,
      serviceArea: serializeServiceArea(serviceArea),
      sido: firstSido,
      sigungu: firstSigungu,
      profileImageUrl: profileImageUrl,
    });
  }

  const activeRequest = changeRequestQuery.data ?? null;
  const hasPendingRequest = activeRequest?.status === "pending";

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

      {/* 결과 안내(가장 최근 신청이 결정된 상태일 때 결과를 알려준다) */}
      {activeRequest && activeRequest.status !== "pending" && (
        <div
          className={`rounded-lg border p-3 text-sm flex items-start gap-2 ${
            activeRequest.status === "approved"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-red-200 bg-red-50 text-red-800"
          }`}
          data-testid="vendor-change-request-result"
        >
          {activeRequest.status === "approved" ? (
            <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
          ) : (
            <XCircle className="w-4 h-4 mt-0.5 shrink-0" />
          )}
          <div className="flex-1">
            <p className="font-medium">
              {activeRequest.status === "approved"
                ? "최근 사업자정보 변경 신청이 승인되었습니다."
                : "최근 사업자정보 변경 신청이 반려되었습니다."}
            </p>
            {activeRequest.decisionReason && (
              <p className="mt-1 text-xs opacity-80">사유: {activeRequest.decisionReason}</p>
            )}
          </div>
        </div>
      )}

      {/* ───────── 편집 가능 영역 ───────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">기본 정보</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* 프로필 사진 + 한줄 소개 */}
            <div className="flex items-start gap-4">
              <div className="relative">
                <VendorAvatar
                  profileImageUrl={profileImageUrl}
                  alt={lockedView.name || "프로필"}
                  size="xl"
                  testId="vendor-photo-preview"
                />
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
                    onClick={() => setPhotoSheetOpen(true)}
                    disabled={photoUploading}
                    data-testid="button-vendor-photo-upload"
                  >
                    <Camera className="w-4 h-4 mr-1.5" />
                    {profileImageUrl ? "사진 변경" : "사진 첨부"}
                  </Button>
                  {profileImageUrl && (
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
                <AttachmentPickerSheet
                  open={photoSheetOpen}
                  onOpenChange={setPhotoSheetOpen}
                  title="프로필 사진"
                  onPick={handlePhotoSelect}
                  testId="vendor-photo"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <Label htmlFor="vendor-intro">한줄 소개</Label>
                <span className="text-[11px] text-muted-foreground">
                  {form.intro.length}/{INTRO_MAX}
                </span>
              </div>
              <Input
                id="vendor-intro"
                value={form.intro}
                maxLength={INTRO_MAX}
                onChange={(e) => setForm({ ...form, intro: e.target.value.slice(0, INTRO_MAX) })}
                placeholder="예) 강남권 응급 출동 30분 내 대응"
                data-testid="input-vendor-intro"
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                발주처 매칭 화면에 노출되는 1줄 소개 문구입니다.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>담당자</Label>
                <Input
                  value={form.contactName}
                  onChange={(e) => setForm({ ...form, contactName: e.target.value })}
                  data-testid="input-vendor-contact-name"
                />
              </div>
              <div>
                <Label>연락처</Label>
                <PhoneInput
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="010-0000-0000"
                  data-testid="input-vendor-phone"
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
                  data-testid="input-vendor-email"
                />
              </div>
              <div>
                <Label>주소</Label>
                <Input
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  data-testid="input-vendor-address"
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

            <div>
              <Label>비고</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                data-testid="input-vendor-notes"
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

      {/* ───────── 잠금 영역: 사업자 정보 ───────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Lock className="w-4 h-4 text-slate-500" />
            사업자 정보
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 mb-3 flex items-start gap-2">
            <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>
              이 항목은 본사 검토 후 변경됩니다. 변경이 필요하면 아래 "변경 신청" 버튼을 눌러
              새 사업자등록증과 함께 신청해 주세요.
            </span>
          </div>

          <dl className="space-y-3 text-sm" data-testid="vendor-locked-section">
            <LockedRow label="상호 (업체명)" value={lockedView.name} />
            <LockedRow label="사업자등록번호" value={lockedView.businessRegNumber} />
            <LockedRow label="대표자명" value={lockedView.representativeName} />
            <div>
              <dt className="text-xs text-muted-foreground mb-1">분야</dt>
              <dd>
                {lockedView.categories.length === 0 ? (
                  <span className="text-slate-400">미입력</span>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {lockedView.categories.map((c, i) => (
                      <Badge
                        key={c}
                        variant={i === 0 ? "default" : "secondary"}
                        className={i === 0 ? "bg-teal-600" : ""}
                      >
                        {categoryLabel(c)}
                        {i === 0 && <span className="ml-1 text-[9px]">대표</span>}
                      </Badge>
                    ))}
                  </div>
                )}
              </dd>
            </div>
          </dl>

          <div className="mt-4 flex items-center gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => setChangeRequestOpen(true)}
              disabled={hasPendingRequest}
              data-testid="button-open-change-request"
            >
              {hasPendingRequest ? (
                <>
                  <Clock className="w-4 h-4 mr-1.5" />
                  검토 중인 변경 신청
                </>
              ) : (
                "변경 신청"
              )}
            </Button>
            {hasPendingRequest && activeRequest && (
              <span className="text-xs text-muted-foreground">
                {new Date(activeRequest.createdAt).toLocaleString("ko-KR")} 접수 · 본사 검토 대기 중
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      <VendorChangeRequestSheet
        open={changeRequestOpen}
        onOpenChange={setChangeRequestOpen}
        token={token}
        currentValues={lockedView}
        onSubmitted={() => {
          setChangeRequestOpen(false);
          queryClient.invalidateQueries({ queryKey: ME_VENDOR_CHANGE_REQ_KEY });
          toast({ title: "변경 신청을 접수했습니다", description: "본사 검토 후 알림으로 안내드립니다." });
        }}
      />
    </div>
  );
}

// 잠금 정보 표시용 row.
function LockedRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground mb-0.5">{label}</dt>
      <dd className="text-slate-800">
        {value ? value : <span className="text-slate-400">미입력</span>}
      </dd>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// 변경 신청 시트
// ═════════════════════════════════════════════════════════════════════════════

interface ChangeRequestSheetProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  token: string | null | undefined;
  currentValues: {
    name: string;
    businessRegNumber: string;
    representativeName: string;
    categories: string[];
  };
  onSubmitted: () => void;
}

function VendorChangeRequestSheet({
  open,
  onOpenChange,
  token,
  currentValues,
  onSubmitted,
}: ChangeRequestSheetProps) {
  const [name, setName] = useState(currentValues.name);
  const [businessRegNumber, setBusinessRegNumber] = useState(currentValues.businessRegNumber);
  const [representativeName, setRepresentativeName] = useState(currentValues.representativeName);
  const [categories, setCategories] = useState<string[]>(currentValues.categories);
  const [reason, setReason] = useState("");
  const [bizCertUrl, setBizCertUrl] = useState<string | null>(null);
  const [bizCertName, setBizCertName] = useState<string | null>(null);
  const [bizCertSize, setBizCertSize] = useState<number | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // 시트가 열릴 때 currentValues 로 폼을 초기화하고, 닫힐 때 첨부/사유 초기화.
  useEffect(() => {
    if (open) {
      setName(currentValues.name);
      setBusinessRegNumber(currentValues.businessRegNumber);
      setRepresentativeName(currentValues.representativeName);
      setCategories(currentValues.categories);
      setReason("");
      setBizCertUrl(null);
      setBizCertName(null);
      setBizCertSize(null);
      setUploadError("");
      setSubmitError("");
    }
  }, [open, currentValues]);

  function toggleCategory(code: string) {
    setCategories((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code],
    );
  }

  async function handleUpload(file: File) {
    setUploadError("");
    if (!/^image\/|application\/pdf$/.test(file.type) && !/\.(pdf|jpg|jpeg|png|webp|heic)$/i.test(file.name)) {
      setUploadError("이미지(JPG/PNG/WebP) 또는 PDF 파일만 업로드 가능합니다");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setUploadError("파일 크기는 20MB 이하여야 합니다");
      return;
    }
    setUploading(true);
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
      if (!putRes.ok) throw new Error("파일 업로드 실패");
      await fetch(`${API_BASE}/storage/uploads/finalize`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ objectPath }),
      });
      setBizCertUrl(objectPath);
      setBizCertName(file.name);
      setBizCertSize(file.size);
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "업로드 중 오류가 발생했습니다");
    } finally {
      setUploading(false);
    }
  }

  // 사용자가 입력한 값과 현재값을 비교해 변경된 항목만 신청 본문에 담는다.
  function buildFields(): Array<{ field: string; after: string }> {
    const out: Array<{ field: string; after: string }> = [];
    if (name.trim() && name.trim() !== currentValues.name) {
      out.push({ field: "name", after: name.trim() });
    }
    if (businessRegNumber.trim() && businessRegNumber.trim() !== currentValues.businessRegNumber) {
      out.push({ field: "businessRegNumber", after: businessRegNumber.trim() });
    }
    if (representativeName.trim() && representativeName.trim() !== currentValues.representativeName) {
      out.push({ field: "representativeName", after: representativeName.trim() });
    }
    const before = currentValues.categories.join(",");
    const after = categories.join(",");
    if (after && after !== before) {
      out.push({ field: "category", after });
    }
    return out;
  }

  async function handleSubmit() {
    setSubmitError("");
    const fields = buildFields();
    if (fields.length === 0) {
      setSubmitError("변경된 항목이 없습니다");
      return;
    }
    if (!bizCertUrl) {
      setSubmitError("새 사업자등록증을 첨부해 주세요");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/me/vendor/change-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          fields,
          bizCertUrl,
          reason: reason.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d?.error || `신청 실패 (${res.status})`);
      }
      onSubmitted();
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "신청 중 오류가 발생했습니다");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>사업자정보 변경 신청</SheetTitle>
          <SheetDescription>
            변경할 항목만 수정한 뒤 새 사업자등록증을 첨부해 주세요. 본사 검토 후 반영됩니다.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-5 mt-4 pb-4" data-testid="change-request-form">
          <div>
            <Label>{LOCKED_FIELD_LABEL.name}</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              data-testid="change-request-name"
            />
          </div>
          <div>
            <Label>{LOCKED_FIELD_LABEL.businessRegNumber}</Label>
            <BusinessNumberInput
              value={businessRegNumber}
              onChange={(e) => setBusinessRegNumber(e.target.value)}
              data-testid="change-request-bizreg"
            />
          </div>
          <div>
            <Label>{LOCKED_FIELD_LABEL.representativeName}</Label>
            <Input
              value={representativeName}
              onChange={(e) => setRepresentativeName(e.target.value)}
              data-testid="change-request-representative"
            />
          </div>

          <div>
            <Label>{LOCKED_FIELD_LABEL.category} (복수 선택)</Label>
            <p className="text-[11px] text-muted-foreground mb-1.5">
              첫 번째로 선택한 분야가 대표 분야가 됩니다.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2" data-testid="change-request-categories">
              {categoryOptions.map((c) => {
                const active = categories.includes(c.value);
                const isPrimary = active && categories[0] === c.value;
                return (
                  <button
                    key={c.value}
                    type="button"
                    role="checkbox"
                    aria-checked={active}
                    onClick={() => toggleCategory(c.value)}
                    data-testid={`change-request-category-${c.value}`}
                    className={`relative px-3 py-2 rounded-lg border text-sm text-left ${
                      active
                        ? "border-teal-400 bg-teal-50 text-teal-700 font-medium"
                        : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                    }`}
                  >
                    <span className="flex items-center gap-1.5">
                      <span
                        className={`inline-block w-3.5 h-3.5 rounded border ${
                          active ? "bg-teal-500 border-teal-500" : "bg-white border-slate-300"
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

          <div>
            <Label>새 사업자등록증 (필수)</Label>
            {uploadError && (
              <div className="rounded-lg bg-red-50 text-red-700 p-2 text-xs my-1.5" role="alert">
                {uploadError}
              </div>
            )}
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              disabled={uploading}
              className="mt-1 w-full block border-2 border-dashed border-slate-300 rounded-xl p-4 text-center cursor-pointer hover:border-teal-400 hover:bg-teal-50/30 transition-colors disabled:cursor-default"
              data-testid="change-request-bizcert-button"
            >
              {uploading ? (
                <div className="flex items-center justify-center gap-2 text-sm text-slate-500">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  업로드 중...
                </div>
              ) : bizCertUrl ? (
                <div className="flex flex-col items-center gap-1 text-sm text-emerald-700">
                  <CheckCircle2 className="w-5 h-5" />
                  <span className="font-medium">{bizCertName}</span>
                  {bizCertSize != null && (
                    <span className="text-[11px] text-slate-500">
                      {(bizCertSize / 1024).toFixed(1)} KB · 다른 파일로 교체하려면 클릭
                    </span>
                  )}
                </div>
              ) : (
                <div className="text-sm text-slate-500">
                  <Upload className="w-5 h-5 mx-auto mb-1 text-slate-400" />
                  사업자등록증 첨부 (PDF · JPG · PNG · WebP, 최대 20MB)
                </div>
              )}
            </button>
            <AttachmentPickerSheet
              open={pickerOpen}
              onOpenChange={setPickerOpen}
              title="새 사업자등록증"
              description="JPG · PNG · WebP · PDF, 최대 20MB"
              onPick={handleUpload}
              fileOption={{
                accept: "application/pdf",
                label: "파일에서 선택",
                description: "PDF 사업자등록증",
              }}
              testId="change-request-bizcert-picker"
            />
          </div>

          <div>
            <Label>변경 사유 (선택)</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={1000}
              placeholder="예) 상호 변경 및 대표자 교체 (등기일 2026-04-01)"
              data-testid="change-request-reason"
            />
          </div>

          {submitError && (
            <div className="rounded-lg bg-red-50 text-red-700 p-2 text-xs" role="alert">
              {submitError}
            </div>
          )}
        </div>

        <SheetFooter className="flex-row gap-2">
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            onClick={() => onOpenChange(false)}
          >
            취소
          </Button>
          <Button
            type="button"
            className="flex-1"
            onClick={handleSubmit}
            disabled={submitting}
            data-testid="change-request-submit"
          >
            {submitting ? "신청 중..." : "신청"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
