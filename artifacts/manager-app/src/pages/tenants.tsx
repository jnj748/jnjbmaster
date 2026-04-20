import { useState, useEffect } from "react";
import {
  useListTenants,
  useCreateTenant,
  useUpdateTenant,
  useDeleteTenant,
  useListTenantCardTokens,
  useCreateTenantCardToken,
  useVerifyTenant,
  useListUnits,
  useGetManagementContractTemplate,
  useUpsertManagementContractTemplate,
  getListTenantsQueryKey,
  getListTenantCardTokensQueryKey,
  getGetManagementContractTemplateQueryKey,
} from "@workspace/api-client-react";
import type { Tenant, CreateTenantBody, ListTenantsParams } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useBuilding } from "@/contexts/building-context";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, CheckCircle, Settings } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ContractTemplateDialog } from "@/components/tenants/contract-template-dialog";
import { TokenDialog } from "@/components/tenants/token-dialog";
import { TenantFormDialog } from "@/components/tenants/tenant-form-dialog";
import { TenantToolbar } from "@/components/tenants/tenant-toolbar";
import { TenantTable } from "@/components/tenants/tenant-table";
import { TenantDetailDialog } from "@/components/tenants/tenant-detail-dialog";
import { TenantVerifyDialog } from "@/components/tenants/tenant-verify-dialog";

const emptyForm = {
  unit: "",
  tenantName: "",
  residentId: "",
  phone: "",
  emergencyContact: "",
  interiorStartDate: "",
  moveInDate: "",
  moveOutDate: "",
  email: "",
  companyName: "",
  businessNumber: "",
  hasTv: false,
  registeredAddress: "",
  notes: "",
  guarantorName: "",
  guarantorPhone: "",
  guarantorRelation: "",
  contractDoc: false,
  businessRegDoc: false,
  idDoc: false,
  privacyConsentDate: "",
};

export default function Tenants() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailDialog, setDetailDialog] = useState<Tenant | null>(null);
  const [pendingOpenTenantId, setPendingOpenTenantId] = useState<number | null>(() => {
    if (typeof window === "undefined") return null;
    const v = new URLSearchParams(window.location.search).get("openTenant");
    const n = v ? parseInt(v, 10) : NaN;
    return Number.isFinite(n) ? n : null;
  });
  const [editing, setEditing] = useState<Tenant | null>(null);
  const [filterStatus, setFilterStatus] = useState<string | undefined>();
  const [searchTerm, setSearchTerm] = useState("");
  const [tokenDialog, setTokenDialog] = useState(false);
  const [verifyDialog, setVerifyDialog] = useState<Tenant | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [templateDialog, setTemplateDialog] = useState(false);
  const [exportingId, setExportingId] = useState<number | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { building } = useBuilding();

  const queryParams: ListTenantsParams = {};
  if (filterStatus && filterStatus !== "all") queryParams.status = filterStatus as ListTenantsParams["status"];
  if (searchTerm) queryParams.search = searchTerm;

  const { data: tenants, isLoading } = useListTenants(
    Object.keys(queryParams).length > 0 ? queryParams : undefined
  );
  const { data: tokens } = useListTenantCardTokens();
  const { data: units } = useListUnits();
  const { data: contractTemplate } = useGetManagementContractTemplate(
    { buildingId: building?.id ?? 0 },
    { query: { enabled: !!building?.id } }
  );
  const createMutation = useCreateTenant();
  const updateMutation = useUpdateTenant();
  const deleteMutation = useDeleteTenant();
  const createTokenMutation = useCreateTenantCardToken();
  const verifyMutation = useVerifyTenant();
  const upsertTemplateMutation = useUpsertManagementContractTemplate();

  const [form, setForm] = useState({ ...emptyForm });
  const [tokenUnitId, setTokenUnitId] = useState<number | null>(null);
  const [tokenUnitLabel, setTokenUnitLabel] = useState("");

  function resetForm() {
    setForm({ ...emptyForm });
    setEditing(null);
  }

  function openEdit(item: Tenant) {
    setEditing(item);
    setForm({
      unit: item.unit,
      tenantName: item.tenantName,
      residentId: item.residentId || "",
      phone: item.phone || "",
      emergencyContact: item.emergencyContact || "",
      interiorStartDate: item.interiorStartDate || "",
      moveInDate: item.moveInDate || "",
      moveOutDate: item.moveOutDate || "",
      email: item.email || "",
      companyName: item.companyName || "",
      businessNumber: item.businessNumber || "",
      hasTv: item.hasTv,
      registeredAddress: item.registeredAddress || "",
      notes: item.notes || "",
      guarantorName: item.guarantorName || "",
      guarantorPhone: item.guarantorPhone || "",
      guarantorRelation: item.guarantorRelation || "",
      contractDoc: item.contractDoc,
      businessRegDoc: item.businessRegDoc,
      idDoc: item.idDoc,
      privacyConsentDate: item.privacyConsentDate || "",
    });
    setDialogOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const data: CreateTenantBody = {
      unit: form.unit,
      tenantName: form.tenantName,
      residentId: form.residentId || null,
      phone: form.phone || null,
      emergencyContact: form.emergencyContact || null,
      interiorStartDate: form.interiorStartDate || null,
      moveInDate: form.moveInDate || null,
      moveOutDate: form.moveOutDate || null,
      email: form.email || null,
      companyName: form.companyName || null,
      businessNumber: form.businessNumber || null,
      hasTv: form.hasTv,
      registeredAddress: form.registeredAddress || null,
      notes: form.notes || null,
      guarantorName: form.guarantorName || null,
      guarantorPhone: form.guarantorPhone || null,
      guarantorRelation: form.guarantorRelation || null,
      contractDoc: form.contractDoc,
      businessRegDoc: form.businessRegDoc,
      idDoc: form.idDoc,
      privacyConsentDate: form.privacyConsentDate ? new Date(form.privacyConsentDate).toISOString() : null,
    };

    if (editing) {
      await updateMutation.mutateAsync({ id: editing.id, data });
      toast({ title: "입주자 정보가 수정되었습니다" });
    } else {
      await createMutation.mutateAsync({ data });
      toast({ title: "입주자가 등록되었습니다" });
    }
    queryClient.invalidateQueries({ queryKey: getListTenantsQueryKey() });
    setDialogOpen(false);
    resetForm();
  }

  async function handleDelete(id: number) {
    await deleteMutation.mutateAsync({ id });
    queryClient.invalidateQueries({ queryKey: getListTenantsQueryKey() });
    toast({ title: "입주자가 삭제되었습니다" });
  }

  async function handleCreateToken() {
    if (!tokenUnitId || !tokenUnitLabel) return;
    try {
      const result = await createTokenMutation.mutateAsync({
        data: { unitId: tokenUnitId, unitLabel: tokenUnitLabel },
      });
      queryClient.invalidateQueries({ queryKey: getListTenantCardTokensQueryKey() });
      const baseUrl = window.location.origin + (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
      const link = `${baseUrl}/tenant-card/${result.token}`;
      await navigator.clipboard.writeText(link).catch(() => {});
      toast({ title: "입주자카드 링크가 생성되었습니다", description: "링크가 클립보드에 복사되었습니다." });
      setTokenDialog(false);
      setTokenUnitId(null);
      setTokenUnitLabel("");
    } catch {
      toast({ title: "생성 실패", variant: "destructive" });
    }
  }

  function copyTokenLink(tokenValue: string) {
    const baseUrl = window.location.origin + (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
    const link = `${baseUrl}/tenant-card/${tokenValue}`;
    navigator.clipboard.writeText(link).catch(() => {});
    toast({ title: "링크가 복사되었습니다" });
  }

  async function handleVerify(tenantId: number, action: "approve" | "reject") {
    try {
      await verifyMutation.mutateAsync({
        id: tenantId,
        data: {
          action,
          rejectionReason: action === "reject" ? rejectionReason || null : null,
        },
      });
      queryClient.invalidateQueries({ queryKey: getListTenantsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getListTenantCardTokensQueryKey() });
      toast({ title: action === "approve" ? "승인 완료" : "반려 처리되었습니다" });
      setVerifyDialog(null);
      setDetailDialog(null);
      setRejectionReason("");
    } catch {
      toast({ title: "처리 실패", variant: "destructive" });
    }
  }

  function getVerificationBadge(status: string) {
    switch (status) {
      case "verified":
        return <Badge className="bg-green-100 text-green-800 text-[10px]">승인</Badge>;
      case "rejected":
        return <Badge variant="destructive" className="text-[10px]">반려</Badge>;
      default:
        return <Badge variant="secondary" className="text-[10px]">미확인</Badge>;
    }
  }

  async function exportTenantCard(tenant: Tenant) {
    if (exportingId !== null) return;
    setExportingId(tenant.id);
    try {
    const { default: jsPDF } = await import("jspdf");
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text("입주자카드 / 관리계약서", 20, 20);
    doc.setFontSize(10);
    const lines = [
      `호실: ${tenant.unit}`,
      `입주자명: ${tenant.tenantName}`,
      `주민등록번호: ${tenant.residentId || "-"}`,
      `휴대폰: ${tenant.phone || "-"}`,
      `비상연락처: ${tenant.emergencyContact || "-"}`,
      `인테리어 개시일: ${tenant.interiorStartDate || "-"}`,
      `입주일: ${tenant.moveInDate || "-"}`,
      `퇴거일: ${tenant.moveOutDate || "-"}`,
      `이메일: ${tenant.email || "-"}`,
      `상호명(법인): ${tenant.companyName || "-"}`,
      `사업자등록번호: ${tenant.businessNumber || "-"}`,
      `TV소유: ${tenant.hasTv ? "예" : "아니오"}`,
      `주민등록주소: ${tenant.registeredAddress || "-"}`,
      `관리비 부과 시작일: ${tenant.billingStartDate || "-"}`,
      ``,
      `[법인 연대보증인]`,
      `보증인명: ${tenant.guarantorName || "-"}`,
      `보증인 연락처: ${tenant.guarantorPhone || "-"}`,
      `관계: ${tenant.guarantorRelation || "-"}`,
      ``,
      `[관리계약 동의 내역]`,
      `관리비 납부 의무: ${tenant.feeObligationConsent ? "동의" : "미동의"}`,
      `체납 시 조치: ${tenant.penaltyConsent ? "동의" : "미동의"}`,
      `특별충당금: ${tenant.specialFundConsent ? "동의" : "미동의"}`,
      `개인정보 보관: ${tenant.privacyRetentionConsent ? "동의" : "미동의"}`,
      `연대보증: ${tenant.guaranteeConsent ? "동의" : "해당없음"}`,
      ``,
      `[전자서명]`,
      `서명자: ${tenant.signatureName || "-"}`,
      `서명일시: ${tenant.signatureDate ? new Date(tenant.signatureDate).toLocaleString("ko-KR") : "-"}`,
      ``,
      `[서류 확인 상태]`,
      `확인 상태: ${tenant.verificationStatus === "verified" ? "승인 완료" : tenant.verificationStatus === "rejected" ? "반려" : "미확인"}`,
      `확인자: ${tenant.verifiedBy || "-"}`,
      `확인일시: ${tenant.verifiedAt ? new Date(tenant.verifiedAt).toLocaleString("ko-KR") : "-"}`,
    ];
    lines.forEach((line, i) => {
      doc.text(line, 20, 35 + i * 7);
    });
    doc.save(`입주자카드_${tenant.unit}_${tenant.tenantName}.pdf`);
    toast({ title: "입주자카드 PDF가 내보내기되었습니다" });
    } catch (e) {
      toast({ title: "PDF 내보내기 실패", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setExportingId(null);
    }
  }

  const unverifiedCount = tenants?.filter((t) => t.verificationStatus === "unverified" && t.signatureName).length || 0;

  useEffect(() => {
    if (pendingOpenTenantId == null || !tenants) return;
    const target = tenants.find((t) => t.id === pendingOpenTenantId);
    if (target) {
      setDetailDialog(target);
      setPendingOpenTenantId(null);
      const url = new URL(window.location.href);
      url.searchParams.delete("openTenant");
      window.history.replaceState({}, "", url.toString());
    } else if (tenants.length > 0) {
      toast({ title: "해당 입주자를 찾을 수 없습니다", description: "이미 삭제되었거나 다른 건물 데이터일 수 있습니다." });
      setPendingOpenTenantId(null);
    }
  }, [pendingOpenTenantId, tenants, toast]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">입주민 관리</h1>
          <p className="text-muted-foreground text-sm mt-1">
            입주자카드를 등록하고 관리합니다
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" onClick={() => setTemplateDialog(true)} title="관리계약서 양식 설정">
            <Settings className="w-4 h-4" />
          </Button>
          <TokenDialog
            open={tokenDialog}
            onOpenChange={setTokenDialog}
            units={units}
            tokens={tokens}
            tokenUnitId={tokenUnitId}
            tokenUnitLabel={tokenUnitLabel}
            setTokenUnitId={setTokenUnitId}
            setTokenUnitLabel={setTokenUnitLabel}
            onCreate={handleCreateToken}
            onCopy={copyTokenLink}
          />
          <TenantFormDialog
              open={dialogOpen}
              onOpenChange={(o) => { setDialogOpen(o); if (!o) resetForm(); }}
              editing={!!editing}
              form={form}
              setForm={setForm}
              onSubmit={handleSubmit}
            />
        </div>
      </div>

      <TenantToolbar
        unverifiedCount={unverifiedCount}
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        filterStatus={filterStatus}
        setFilterStatus={setFilterStatus}
      />

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}
        </div>
      ) : tenants && tenants.length > 0 ? (
        <TenantTable
          tenants={tenants}
          exportingId={exportingId}
          getVerificationBadge={getVerificationBadge}
          onView={(t) => setDetailDialog(t)}
          onVerify={(t) => setVerifyDialog(t)}
          onExport={exportTenantCard}
          onEdit={openEdit}
          onDelete={handleDelete}
        />
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <Users className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground">등록된 입주자가 없습니다</p>
          </CardContent>
        </Card>
      )}

      <TenantDetailDialog
          tenant={detailDialog}
          exportingId={exportingId}
          getVerificationBadge={getVerificationBadge}
          onClose={() => setDetailDialog(null)}
          onApprove={(id) => handleVerify(id, "approve")}
          onReject={(t) => setVerifyDialog(t)}
          onExport={exportTenantCard}
        />

      <TenantVerifyDialog
          tenant={verifyDialog}
          rejectionReason={rejectionReason}
          setRejectionReason={setRejectionReason}
          onClose={() => { setVerifyDialog(null); setRejectionReason(""); }}
          onReject={(id) => handleVerify(id, "reject")}
        />

      <ContractTemplateDialog
        open={templateDialog}
        onOpenChange={setTemplateDialog}
        template={contractTemplate ?? null}
        buildingId={building?.id ?? 0}
        onSave={async (data) => {
          await upsertTemplateMutation.mutateAsync({ data });
          queryClient.invalidateQueries({ queryKey: getGetManagementContractTemplateQueryKey({ buildingId: building?.id ?? 0 }) });
          toast({ title: "관리계약서 양식이 저장되었습니다" });
          setTemplateDialog(false);
        }}
      />
    </div>
  );
}
