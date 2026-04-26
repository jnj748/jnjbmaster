// [Task #416] 협력업체 주소록(Vendor Directory)
//
// 현재 건물에 매여 있는 협력업체와 그 계약을 한 화면에서 카드로 본다.
//   - 카드: 업체명·카테고리·사업자번호·대표자·연락처(tel: 링크)·계약기간·잔여일·자동연장·계약서 썸네일
//   - 인라인 편집 다이얼로그(권한자만): 업체 정보 + 계약 시작/종료/자동연장/계약서 교체
//   - 신규 등록 다이얼로그(권한자만):
//       (1) 기존 vendor 선택 + 신규 contract 만들기, 또는
//       (2) 신규 vendor + contract 동시 생성
//     계약서 첨부는 모바일에서 후면 카메라가 바로 뜨는 PhotoUploadField 사용
//   - 시설기사(facility_staff) 는 읽기 전용 + tel: 통화 가능. 편집/등록 버튼 숨김
//   - 상단에 "계약연장검토" 배너 — 만료 90~60일 윈도우(@workspace/shared/contract-renewal)
//     안에 들어온 활성 계약만 노출. 60일 이내로 진입하면 자동으로 사라진다.

import { useEffect, useMemo, useRef, useState } from "react";
import {
  useListVendors,
  useListContracts,
  useCreateContract,
  useUpdateContract,
  useCreateVendor,
  useUpdateVendor,
  useUploadContractDocument,
  useListContractDocuments,
  getListContractsQueryKey,
  getListVendorsQueryKey,
  getListContractDocumentsQueryKey,
  type Vendor,
  type Contract,
  type ContractDocument,
  type CreateVendorBody,
  type UpdateVendorBody,
  type CreateContractBody,
  type UpdateContractBody,
  type CreateVendorBodyCategory,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  RENEWAL_REVIEW_WINDOW_LABEL,
  RENEWAL_REVIEW_WINDOW_START_DAYS,
  daysUntilDate,
  isContractInRenewalReviewWindow,
  formatContractRenewalReviewMessage,
} from "@workspace/shared/contract-renewal";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/ui/phone-input";
import { BusinessNumberInput } from "@/components/ui/business-number-input";
import { formatPhoneNumber, formatBusinessNumber, phoneToTelHref } from "@/lib/format-korean";
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
} from "@/components/ui/responsive-dialog";
import { PhotoUploadField } from "@/components/photo-upload-field";
import { AuthImage } from "@/components/auth-image";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import { useBuilding } from "@/contexts/building-context";
import {
  Plus,
  Phone,
  Mail,
  AlertCircle,
  Building2,
  CalendarClock,
  Edit,
  FileText,
  Loader2,
  RefreshCw,
} from "lucide-react";

// 카테고리 옵션 — vendors 페이지와 동일한 enum (lib/api-zod CreateVendorBodyCategory).
// 다른 값을 보내면 /vendors POST 가 400 으로 떨어지므로 반드시 동기화한다.
const CATEGORY_OPTIONS: { value: string; label: string }[] = [
  { value: "elevator", label: "승강기" },
  { value: "water_tank", label: "저수조" },
  { value: "fire_safety", label: "소방" },
  { value: "electrical", label: "전기" },
  { value: "gas", label: "가스" },
  { value: "septic", label: "정화조" },
  { value: "cleaning", label: "청소" },
  { value: "security", label: "경비/보안" },
  { value: "waterproofing", label: "방수" },
  { value: "maintenance_repair", label: "영선/수선유지" },
  { value: "defect_diagnosis", label: "하자진단" },
  { value: "building_maintenance", label: "건물관리" },
  { value: "mechanical", label: "기계설비" },
  { value: "other", label: "기타" },
];

const CATEGORY_LABEL = (v: string | null | undefined) =>
  CATEGORY_OPTIONS.find((c) => c.value === v)?.label ?? v ?? "-";

// 권한: 편집 / 등록은 manager·accountant·platform_admin 만. facility_staff 는 읽기 전용.
const EDIT_ROLES = new Set(["manager", "accountant", "platform_admin"]);

function formatDate(d: string | null | undefined): string {
  if (!d) return "-";
  return d.length > 10 ? d.slice(0, 10) : d;
}

function RemainingDaysBadge({ endDate }: { endDate: string | null | undefined }) {
  const d = daysUntilDate(endDate);
  if (d == null) return null;
  if (d < 0) {
    return (
      <Badge variant="outline" className="border-red-300 text-red-700">
        만료 D+{Math.abs(d)}
      </Badge>
    );
  }
  if (d <= 60) {
    return (
      <Badge variant="outline" className="border-red-300 text-red-700">
        만료 D-{d}
      </Badge>
    );
  }
  if (d <= 90) {
    return (
      <Badge variant="outline" className="border-amber-300 text-amber-700">
        만료 D-{d}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="border-emerald-300 text-emerald-700">
      만료 D-{d}
    </Badge>
  );
}

// 계약 1건의 등록된 계약서 문서 중 가장 최신본의 썸네일/링크. 권한 부족 등으로 실패하면 조용히 비운다.
function ContractDocumentThumb({ contractId }: { contractId: number }) {
  const { data, isLoading, isError } = useListContractDocuments(contractId, {
    query: { staleTime: 60 * 1000 },
  });
  if (isLoading) return <Skeleton className="w-20 h-20 rounded" />;
  if (isError || !data || data.length === 0) {
    return (
      <div
        className="w-20 h-20 rounded border border-dashed flex items-center justify-center text-[10px] text-muted-foreground text-center px-1"
        data-testid={`vendor-directory-doc-empty-${contractId}`}
      >
        계약서 없음
      </div>
    );
  }
  // contract 타입 우선, 그 외에는 가장 최신.
  const docs = [...data].sort((a, b) => b.id - a.id);
  const contractDoc = docs.find((d) => d.docType === "contract") ?? docs[0];
  const isImage = /\.(png|jpe?g|webp|heic|gif)(\?|$)/i.test(contractDoc.fileUrl);
  return (
    <a
      href={contractDoc.fileUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="block w-20 h-20 rounded border overflow-hidden hover-elevate"
      data-testid={`vendor-directory-doc-thumb-${contractId}`}
      onClick={(e) => e.stopPropagation()}
    >
      {isImage ? (
        <AuthImage
          src={contractDoc.fileUrl}
          alt={contractDoc.fileName}
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center text-[10px] text-muted-foreground">
          <FileText className="w-5 h-5 mb-1" />
          <span className="truncate w-full text-center px-1">
            {contractDoc.fileName}
          </span>
        </div>
      )}
    </a>
  );
}

type VendorWithContracts = {
  vendor: Vendor;
  contracts: Contract[];
};

export default function BuildingVendorDirectoryPage() {
  const { user } = useAuth();
  const { building } = useBuilding();
  const { toast } = useToast();
  const buildingId = building?.id ?? null;

  const canEdit = !!user && EDIT_ROLES.has(user.role);

  const { data: vendorsData, isLoading: vendorsLoading } = useListVendors(undefined, {
    query: { staleTime: 5 * 60 * 1000 },
  });
  const { data: contractsData, isLoading: contractsLoading } = useListContracts(
    buildingId ? { buildingId } : undefined,
    { query: { enabled: buildingId != null, staleTime: 60 * 1000 } },
  );

  const grouped = useMemo<VendorWithContracts[]>(() => {
    if (!buildingId) return [];
    const vendors = (vendorsData ?? []) as Vendor[];
    const contracts = (contractsData ?? []) as Contract[];
    const byVendor = new Map<number, Contract[]>();
    for (const c of contracts) {
      if (c.buildingId !== buildingId) continue;
      const arr = byVendor.get(c.vendorId) ?? [];
      arr.push(c);
      byVendor.set(c.vendorId, arr);
    }
    const result: VendorWithContracts[] = [];
    for (const [vendorId, list] of byVendor) {
      const vendor = vendors.find((v) => v.id === vendorId);
      if (!vendor) continue;
      // 활성 계약 우선 → 최신 endDate 우선.
      list.sort((a, b) => {
        const aActive = a.status === "active" || a.status === "in_progress" ? 1 : 0;
        const bActive = b.status === "active" || b.status === "in_progress" ? 1 : 0;
        if (aActive !== bActive) return bActive - aActive;
        return (b.endDate ?? "").localeCompare(a.endDate ?? "");
      });
      result.push({ vendor, contracts: list });
    }
    // 검토 윈도우 안에 들어온 업체를 상단으로.
    result.sort((a, b) => {
      const aReview = a.contracts.some(isContractInRenewalReviewWindow) ? 1 : 0;
      const bReview = b.contracts.some(isContractInRenewalReviewWindow) ? 1 : 0;
      if (aReview !== bReview) return bReview - aReview;
      return a.vendor.name.localeCompare(b.vendor.name, "ko");
    });
    return result;
  }, [vendorsData, contractsData, buildingId]);

  const renewalReview = useMemo(() => {
    const list: { vendor: Vendor; contract: Contract }[] = [];
    for (const g of grouped) {
      for (const c of g.contracts) {
        if (isContractInRenewalReviewWindow(c)) {
          list.push({ vendor: g.vendor, contract: c });
        }
      }
    }
    return list;
  }, [grouped]);

  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<VendorWithContracts | null>(null);
  // [Task #416] 검색·카테고리 필터 — 같은 건물에 협력업체가 누적되면 빠르게 좁힐 수 있도록.
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  const filteredGrouped = useMemo(() => {
    const q = search.trim().toLowerCase();
    return grouped.filter((g) => {
      if (categoryFilter !== "all" && g.vendor.category !== categoryFilter) return false;
      if (!q) return true;
      const haystack = [
        g.vendor.name,
        g.vendor.businessRegNumber,
        g.vendor.representativeName,
        g.vendor.phone,
        g.vendor.email,
        ...g.contracts.map((c) => c.title),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [grouped, search, categoryFilter]);

  const availableCategories = useMemo(() => {
    const set = new Set<string>();
    for (const g of grouped) if (g.vendor.category) set.add(g.vendor.category);
    return Array.from(set).sort();
  }, [grouped]);

  if (!buildingId) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">협력업체 주소록</h1>
        <Card>
          <CardContent className="p-6 flex items-center gap-2 text-sm text-muted-foreground">
            <AlertCircle className="w-4 h-4" />
            건물 정보가 아직 연결되지 않았습니다. 건물 설정을 먼저 마쳐주세요.
          </CardContent>
        </Card>
      </div>
    );
  }

  const isLoading = vendorsLoading || contractsLoading;

  return (
    <div className="space-y-5" data-testid="building-vendor-directory-page">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold">협력업체 주소록</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {building?.name ?? "현재 건물"} 과 계약 중인 협력업체를 한 곳에서 관리합니다.
          </p>
        </div>
        {canEdit && (
          <Button
            onClick={() => setAddOpen(true)}
            data-testid="button-add-vendor-contract"
          >
            <Plus className="w-4 h-4 mr-2" />
            업체·계약 등록
          </Button>
        )}
      </div>

      {/* [Task #416] 계약연장검토 배너 — 만료 90~60일 윈도우 안 활성 계약만 노출. */}
      {renewalReview.length > 0 && (
        <section
          className="space-y-2"
          data-testid="vendor-directory-renewal-review"
        >
          <div className="flex items-center gap-2">
            <CalendarClock className="w-4 h-4 text-amber-700" />
            <h2 className="text-sm font-semibold text-amber-900">
              계약연장검토 — {RENEWAL_REVIEW_WINDOW_LABEL} ({renewalReview.length}건)
            </h2>
          </div>
          <div className="grid gap-2">
            {renewalReview.map(({ vendor, contract }) => {
              const d = daysUntilDate(contract.endDate);
              return (
                <Card
                  key={contract.id}
                  className="border-amber-300 bg-amber-50/40"
                  data-testid={`vendor-directory-renewal-card-${contract.id}`}
                >
                  <CardContent className="p-3 flex items-start gap-3">
                    <AlertCircle className="w-4 h-4 text-amber-700 mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm">
                        {formatContractRenewalReviewMessage({
                          title: contract.title,
                          endDate: contract.endDate ?? "-",
                        })}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {vendor.name}
                        {d != null ? ` · D-${d}` : ""}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      )}

      {!isLoading && (
        <div className="flex items-center gap-2 flex-wrap">
          <Input
            placeholder="업체명·사업자번호·계약명 검색"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs"
            data-testid="input-vendor-search"
            disabled={grouped.length === 0}
          />
          <Select
            value={categoryFilter}
            onValueChange={setCategoryFilter}
            disabled={grouped.length === 0}
          >
            <SelectTrigger className="w-44" data-testid="select-category-filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 카테고리</SelectItem>
              {availableCategories.map((c) => (
                <SelectItem key={c} value={c}>
                  {CATEGORY_LABEL(c)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {grouped.length > 0 && (
            <span className="text-xs text-muted-foreground" data-testid="vendor-result-count">
              {filteredGrouped.length}/{grouped.length}
            </span>
          )}
        </div>
      )}

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-44 rounded-lg" />
          ))}
        </div>
      ) : grouped.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground space-y-2">
            <Building2 className="w-8 h-8 mx-auto text-muted-foreground" />
            <p>아직 등록된 협력업체 계약이 없습니다.</p>
            {canEdit && (
              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() => setAddOpen(true)}
                data-testid="button-add-vendor-contract-empty"
              >
                <Plus className="w-4 h-4 mr-1.5" /> 첫 협력업체 등록하기
              </Button>
            )}
          </CardContent>
        </Card>
      ) : filteredGrouped.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            검색 조건과 일치하는 협력업체가 없습니다.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {filteredGrouped.map((g) => (
            <VendorDirectoryCard
              key={g.vendor.id}
              entry={g}
              canEdit={canEdit}
              onEdit={() => setEditTarget(g)}
            />
          ))}
        </div>
      )}

      {addOpen && buildingId != null && (
        <AddVendorContractDialog
          open={addOpen}
          onOpenChange={setAddOpen}
          buildingId={buildingId}
          buildingName={building?.name ?? null}
          existingVendors={(vendorsData ?? []) as Vendor[]}
          onCreated={() => {
            toast({ title: "협력업체와 계약이 등록되었습니다" });
            setAddOpen(false);
          }}
        />
      )}

      {editTarget && (
        <EditVendorContractDialog
          open={!!editTarget}
          onOpenChange={(o) => {
            if (!o) setEditTarget(null);
          }}
          entry={editTarget}
          onSaved={() => {
            toast({ title: "수정되었습니다" });
            setEditTarget(null);
          }}
        />
      )}
    </div>
  );
}

function VendorDirectoryCard({
  entry,
  canEdit,
  onEdit,
}: {
  entry: VendorWithContracts;
  canEdit: boolean;
  onEdit: () => void;
}) {
  const { vendor, contracts } = entry;
  const primary = contracts[0]; // 활성 우선 정렬된 첫 항목.
  return (
    <Card data-testid={`vendor-directory-card-${vendor.id}`}>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold truncate" data-testid={`vendor-name-${vendor.id}`}>
                {vendor.name}
              </h3>
              <Badge variant="secondary" className="text-xs">
                {CATEGORY_LABEL(vendor.category)}
              </Badge>
              {primary?.isRecurring && (
                <Badge variant="outline" className="text-xs border-blue-300 text-blue-700">
                  <RefreshCw className="w-3 h-3 mr-0.5" /> 자동연장
                </Badge>
              )}
              {primary && isContractInRenewalReviewWindow(primary) && (
                <Badge
                  variant="outline"
                  className="text-xs border-amber-400 text-amber-700 bg-amber-50"
                  data-testid={`vendor-card-renewal-review-${vendor.id}`}
                >
                  <AlertCircle className="w-3 h-3 mr-0.5" /> {RENEWAL_REVIEW_WINDOW_LABEL}
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              사업자 {vendor.businessRegNumber ? formatBusinessNumber(vendor.businessRegNumber) : "-"} · 대표 {vendor.representativeName ?? "-"}
              {vendor.contactName && (
                <>
                  {" "}· 담당자{" "}
                  <span data-testid={`vendor-contact-name-${vendor.id}`}>
                    {vendor.contactName}
                  </span>
                </>
              )}
            </p>
          </div>
          {canEdit && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onEdit}
              data-testid={`button-edit-vendor-${vendor.id}`}
            >
              <Edit className="w-3.5 h-3.5 mr-1" /> 편집
            </Button>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap text-sm">
          {vendor.phone ? (
            <a
              href={phoneToTelHref(vendor.phone)}
              className="inline-flex items-center gap-1 px-2 py-1 rounded border hover-elevate text-primary"
              data-testid={`vendor-tel-${vendor.id}`}
            >
              <Phone className="w-3.5 h-3.5" />
              {formatPhoneNumber(vendor.phone)}
            </a>
          ) : (
            <span className="text-xs text-muted-foreground">연락처 없음</span>
          )}
          {vendor.email && (
            <a
              href={`mailto:${vendor.email}`}
              className="inline-flex items-center gap-1 px-2 py-1 rounded border hover-elevate text-primary"
              data-testid={`vendor-email-${vendor.id}`}
            >
              <Mail className="w-3.5 h-3.5" />
              <span className="text-xs">{vendor.email}</span>
            </a>
          )}
        </div>

        {primary && (
          <div className="border-t pt-3 flex items-start gap-3">
            <ContractDocumentThumb contractId={primary.id} />
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-sm font-medium truncate">{primary.title}</p>
              <p className="text-xs text-muted-foreground">
                {formatDate(primary.startDate)} ~ {formatDate(primary.endDate)}
              </p>
              <RemainingDaysBadge endDate={primary.endDate} />
              {contracts.length > 1 && (
                <p className="text-[11px] text-muted-foreground">
                  + 이전 계약 {contracts.length - 1}건
                </p>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Add dialog ────────────────────────────────────────────────────────────────

type AddFormState = {
  mode: "existing" | "new";
  vendorId: number | null;
  vendorName: string;
  category: string;
  businessRegNumber: string;
  representativeName: string;
  contactName: string;
  phone: string;
  email: string;
  contractTitle: string;
  startDate: string;
  endDate: string;
  isRecurring: boolean;
  documentUrl: string | null;
  notes: string;
};

const EMPTY_ADD: AddFormState = {
  mode: "existing",
  vendorId: null,
  vendorName: "",
  category: "building_maintenance",
  businessRegNumber: "",
  representativeName: "",
  contactName: "",
  phone: "",
  email: "",
  contractTitle: "",
  startDate: "",
  endDate: "",
  isRecurring: false,
  documentUrl: null,
  notes: "",
};

function AddVendorContractDialog({
  open,
  onOpenChange,
  buildingId,
  buildingName,
  existingVendors,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  buildingId: number;
  buildingName: string | null;
  existingVendors: Vendor[];
  onCreated: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<AddFormState>(EMPTY_ADD);
  const createVendor = useCreateVendor();
  const createContract = useCreateContract();
  const uploadDoc = useUploadContractDocument();

  useEffect(() => {
    if (!open) setForm(EMPTY_ADD);
  }, [open]);

  function setField<K extends keyof AddFormState>(k: K, v: AddFormState[K]) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  function pickExistingVendor(idStr: string) {
    const id = Number(idStr);
    const picked = existingVendors.find((v) => v.id === id);
    setForm((p) => ({
      ...p,
      vendorId: id,
      vendorName: picked?.name ?? "",
      category: picked?.category ?? p.category,
      businessRegNumber: picked?.businessRegNumber ?? "",
      representativeName: picked?.representativeName ?? "",
      contactName: picked?.contactName ?? "",
      phone: picked?.phone ?? "",
      email: picked?.email ?? "",
    }));
  }

  async function handleSave() {
    if (form.mode === "existing" && !form.vendorId) {
      toast({ title: "협력업체를 선택해주세요", variant: "destructive" });
      return;
    }
    if (form.mode === "new" && !form.vendorName.trim()) {
      toast({ title: "업체명을 입력해주세요", variant: "destructive" });
      return;
    }
    if (!form.contractTitle.trim()) {
      toast({ title: "계약 제목을 입력해주세요", variant: "destructive" });
      return;
    }
    if (!form.category) {
      toast({ title: "카테고리를 선택해주세요", variant: "destructive" });
      return;
    }

    try {
      let vendorId = form.vendorId;
      let vendorName = form.vendorName;

      if (form.mode === "new") {
        const newVendorBody: CreateVendorBody = {
          name: form.vendorName.trim(),
          category: form.category as CreateVendorBodyCategory,
          type: "contracted",
          contactName: form.contactName || form.representativeName || null,
          phone: form.phone || null,
          email: form.email || null,
          businessRegNumber: form.businessRegNumber || null,
          representativeName: form.representativeName || null,
          contractBuildingName: buildingName,
          contractStartDate: form.startDate || null,
          contractEndDate: form.endDate || null,
        };
        const created = await createVendor.mutateAsync({ data: newVendorBody });
        vendorId = created.id;
        vendorName = created.name;
      }

      const newContractBody: CreateContractBody = {
        vendorId: vendorId!,
        vendorName,
        buildingId,
        buildingName,
        category: form.category,
        title: form.contractTitle.trim(),
        startDate: form.startDate || null,
        endDate: form.endDate || null,
        isRecurring: form.isRecurring,
        status: "active",
        notes: form.notes.trim() || null,
      };
      const contract = await createContract.mutateAsync({ data: newContractBody });

      if (form.documentUrl) {
        try {
          await uploadDoc.mutateAsync({
            id: contract.id,
            data: {
              docType: "contract",
              fileName: "계약서",
              fileUrl: form.documentUrl,
              notes: "주소록 등록 시 첨부",
            },
          });
        } catch (e) {
          toast({
            title: "계약은 등록됐으나 계약서 첨부 실패",
            description: e instanceof Error ? e.message : "다시 시도해주세요",
            variant: "destructive",
          });
        }
      }

      queryClient.invalidateQueries({ queryKey: getListVendorsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getListContractsQueryKey() });
      onCreated();
    } catch (e) {
      toast({
        title: "등록 실패",
        description: e instanceof Error ? e.message : "오류",
        variant: "destructive",
      });
    }
  }

  const busy = createVendor.isPending || createContract.isPending || uploadDoc.isPending;

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>협력업체·계약 등록</ResponsiveDialogTitle>
        </ResponsiveDialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-3 text-sm">
            <label className="flex items-center gap-1.5">
              <input
                type="radio"
                checked={form.mode === "existing"}
                onChange={() => setField("mode", "existing")}
                data-testid="radio-mode-existing"
              />
              기존 업체에 계약 추가
            </label>
            <label className="flex items-center gap-1.5">
              <input
                type="radio"
                checked={form.mode === "new"}
                onChange={() => setField("mode", "new")}
                data-testid="radio-mode-new"
              />
              신규 업체 등록
            </label>
          </div>

          {form.mode === "existing" ? (
            <div>
              <Label>협력업체</Label>
              <Select
                value={form.vendorId != null ? String(form.vendorId) : ""}
                onValueChange={pickExistingVendor}
              >
                <SelectTrigger data-testid="select-existing-vendor">
                  <SelectValue placeholder="목록에서 선택" />
                </SelectTrigger>
                <SelectContent>
                  {existingVendors.map((v) => (
                    <SelectItem key={v.id} value={String(v.id)}>
                      {v.name}
                      {v.businessRegNumber ? ` (${v.businessRegNumber})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <Label>업체명*</Label>
                <Input
                  value={form.vendorName}
                  onChange={(e) => setField("vendorName", e.target.value)}
                  data-testid="input-new-vendor-name"
                />
              </div>
              <div>
                <Label>사업자번호</Label>
                <BusinessNumberInput
                  value={form.businessRegNumber}
                  onChange={(e) => setField("businessRegNumber", e.target.value)}
                  placeholder="123-45-67890"
                />
              </div>
              <div>
                <Label>대표자명</Label>
                <Input
                  value={form.representativeName}
                  onChange={(e) => setField("representativeName", e.target.value)}
                />
              </div>
              <div>
                <Label>담당자 이름</Label>
                <Input
                  value={form.contactName}
                  onChange={(e) => setField("contactName", e.target.value)}
                  placeholder="현장 담당자"
                  data-testid="input-new-contact-name"
                />
              </div>
              <div>
                <Label>연락처</Label>
                <PhoneInput
                  value={form.phone}
                  onChange={(e) => setField("phone", e.target.value)}
                  placeholder="02-1234-5678"
                />
              </div>
              <div>
                <Label>이메일</Label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setField("email", e.target.value)}
                />
              </div>
            </div>
          )}

          <div className="border-t pt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <Label>카테고리*</Label>
              <Select
                value={form.category}
                onValueChange={(v) => setField("category", v)}
              >
                <SelectTrigger data-testid="select-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORY_OPTIONS.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2">
              <Label>계약 제목*</Label>
              <Input
                value={form.contractTitle}
                onChange={(e) => setField("contractTitle", e.target.value)}
                placeholder="○○빌딩 청소용역 계약"
                data-testid="input-contract-title"
              />
            </div>
            <div>
              <Label>시작일</Label>
              <Input
                type="date"
                value={form.startDate}
                onChange={(e) => setField("startDate", e.target.value)}
                data-testid="input-start-date"
              />
            </div>
            <div>
              <Label>종료일</Label>
              <Input
                type="date"
                value={form.endDate}
                onChange={(e) => setField("endDate", e.target.value)}
                data-testid="input-end-date"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.isRecurring}
                  onChange={(e) => setField("isRecurring", e.target.checked)}
                  className="w-4 h-4"
                  data-testid="checkbox-is-recurring"
                />
                자동(자동연장) 갱신 조항이 있는 계약입니다
              </label>
            </div>
          </div>

          <div className="border-t pt-4 space-y-3">
            <div>
              <Label>메모(선택)</Label>
              <textarea
                value={form.notes}
                onChange={(e) => setField("notes", e.target.value)}
                rows={2}
                className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                placeholder="결제 조건, 비상 연락처 등 자유 메모"
                data-testid="textarea-contract-notes"
              />
            </div>
            <PhotoUploadField
              label="계약서 사진(선택) — 모바일에서 후면 카메라로 촬영"
              value={form.documentUrl}
              onChange={(v) => setField("documentUrl", v)}
              testId="contract-doc-upload"
            />
            <p className="text-[11px] text-muted-foreground">
              PDF/이미지가 있으면 첨부하세요. 등록 후에도 카드에서 교체할 수 있습니다.
            </p>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t">
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
              취소
            </Button>
            <Button onClick={handleSave} disabled={busy} data-testid="button-save-vendor-contract">
              {busy ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" /> 저장 중
                </>
              ) : (
                "저장"
              )}
            </Button>
          </div>
        </div>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}

// ─── Edit dialog ───────────────────────────────────────────────────────────────

type EditFormState = {
  vendorName: string;
  category: string;
  businessRegNumber: string;
  representativeName: string;
  contactName: string;
  phone: string;
  email: string;
  contractTitle: string;
  startDate: string;
  endDate: string;
  isRecurring: boolean;
  newDocumentUrl: string | null;
  notes: string;
};

function EditVendorContractDialog({
  open,
  onOpenChange,
  entry,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  entry: VendorWithContracts;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const updateVendor = useUpdateVendor();
  const updateContract = useUpdateContract();
  const uploadDoc = useUploadContractDocument();

  const primary = entry.contracts[0];

  const [form, setForm] = useState<EditFormState>(() => ({
    vendorName: entry.vendor.name,
    category: entry.vendor.category,
    businessRegNumber: entry.vendor.businessRegNumber ?? "",
    representativeName: entry.vendor.representativeName ?? "",
    contactName: entry.vendor.contactName ?? "",
    phone: entry.vendor.phone ?? "",
    email: entry.vendor.email ?? "",
    contractTitle: primary?.title ?? "",
    startDate: primary?.startDate ?? "",
    endDate: primary?.endDate ?? "",
    isRecurring: primary?.isRecurring ?? false,
    newDocumentUrl: null,
    notes: primary?.notes ?? "",
  }));

  function setField<K extends keyof EditFormState>(k: K, v: EditFormState[K]) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  async function handleSave() {
    try {
      const vendorPatch: UpdateVendorBody = {
        name: form.vendorName.trim() || entry.vendor.name,
        category: form.category as CreateVendorBodyCategory,
        businessRegNumber: form.businessRegNumber || null,
        representativeName: form.representativeName || null,
        contactName: form.contactName || null,
        phone: form.phone || null,
        email: form.email || null,
      };
      await updateVendor.mutateAsync({ id: entry.vendor.id, data: vendorPatch });

      if (primary) {
        const contractPatch: UpdateContractBody = {
          title: form.contractTitle.trim() || primary.title,
          startDate: form.startDate || null,
          endDate: form.endDate || null,
          isRecurring: form.isRecurring,
          notes: form.notes.trim() || null,
        };
        await updateContract.mutateAsync({ id: primary.id, data: contractPatch });

        if (form.newDocumentUrl) {
          try {
            await uploadDoc.mutateAsync({
              id: primary.id,
              data: {
                docType: "contract",
                fileName: "계약서(교체)",
                fileUrl: form.newDocumentUrl,
                notes: "주소록 편집 시 교체",
              },
            });
            queryClient.invalidateQueries({
              queryKey: getListContractDocumentsQueryKey(primary.id),
            });
          } catch (e) {
            toast({
              title: "계약은 수정됐으나 새 계약서 첨부 실패",
              description: e instanceof Error ? e.message : "다시 시도해주세요",
              variant: "destructive",
            });
          }
        }
      }

      queryClient.invalidateQueries({ queryKey: getListVendorsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getListContractsQueryKey() });
      onSaved();
    } catch (e) {
      toast({
        title: "수정 실패",
        description: e instanceof Error ? e.message : "오류",
        variant: "destructive",
      });
    }
  }

  const busy =
    updateVendor.isPending || updateContract.isPending || uploadDoc.isPending;

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>협력업체·계약 편집</ResponsiveDialogTitle>
        </ResponsiveDialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <Label>업체명</Label>
              <Input
                value={form.vendorName}
                onChange={(e) => setField("vendorName", e.target.value)}
                data-testid="edit-input-vendor-name"
              />
            </div>
            <div>
              <Label>카테고리</Label>
              <Select
                value={form.category}
                onValueChange={(v) => setField("category", v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORY_OPTIONS.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>사업자번호</Label>
              <BusinessNumberInput
                value={form.businessRegNumber}
                onChange={(e) => setField("businessRegNumber", e.target.value)}
              />
            </div>
            <div>
              <Label>대표자명</Label>
              <Input
                value={form.representativeName}
                onChange={(e) => setField("representativeName", e.target.value)}
              />
            </div>
            <div>
              <Label>담당자 이름</Label>
              <Input
                value={form.contactName}
                onChange={(e) => setField("contactName", e.target.value)}
                placeholder="현장 담당자"
                data-testid="edit-input-contact-name"
              />
            </div>
            <div>
              <Label>연락처</Label>
              <PhoneInput
                value={form.phone}
                onChange={(e) => setField("phone", e.target.value)}
                data-testid="edit-input-phone"
              />
            </div>
            <div>
              <Label>이메일</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setField("email", e.target.value)}
              />
            </div>
          </div>

          {primary && (
            <div className="border-t pt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <Label>계약 제목</Label>
                <Input
                  value={form.contractTitle}
                  onChange={(e) => setField("contractTitle", e.target.value)}
                />
              </div>
              <div>
                <Label>시작일</Label>
                <Input
                  type="date"
                  value={form.startDate}
                  onChange={(e) => setField("startDate", e.target.value)}
                  data-testid="edit-input-start-date"
                />
              </div>
              <div>
                <Label>종료일</Label>
                <Input
                  type="date"
                  value={form.endDate}
                  onChange={(e) => setField("endDate", e.target.value)}
                  data-testid="edit-input-end-date"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.isRecurring}
                    onChange={(e) => setField("isRecurring", e.target.checked)}
                    className="w-4 h-4"
                  />
                  자동(자동연장) 갱신 조항
                </label>
              </div>
              <div className="sm:col-span-2">
                <Label>메모</Label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setField("notes", e.target.value)}
                  rows={2}
                  className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  placeholder="결제 조건, 비상 연락처 등 자유 메모"
                  data-testid="edit-textarea-contract-notes"
                />
              </div>
              <div className="sm:col-span-2">
                <PhotoUploadField
                  label="계약서 교체(선택)"
                  value={form.newDocumentUrl}
                  onChange={(v) => setField("newDocumentUrl", v)}
                  testId="edit-contract-doc-upload"
                />
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2 border-t">
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
              취소
            </Button>
            <Button onClick={handleSave} disabled={busy} data-testid="button-save-edit">
              {busy ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" /> 저장 중
                </>
              ) : (
                "저장"
              )}
            </Button>
          </div>
        </div>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
