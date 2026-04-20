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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Trash2, Edit, Users, Search, Download, Eye, ShieldAlert, Link2, CheckCircle, XCircle, Copy, FileText, Settings } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

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
  const [editing, setEditing] = useState<Tenant | null>(null);
  const [filterStatus, setFilterStatus] = useState<string | undefined>();
  const [searchTerm, setSearchTerm] = useState("");
  const [tokenDialog, setTokenDialog] = useState(false);
  const [verifyDialog, setVerifyDialog] = useState<Tenant | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [templateDialog, setTemplateDialog] = useState(false);
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
  }

  const unverifiedCount = tenants?.filter((t) => t.verificationStatus === "unverified" && t.signatureName).length || 0;

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
          <ResponsiveDialog open={tokenDialog} onOpenChange={setTokenDialog}>
            <ResponsiveDialogTrigger asChild>
              <Button variant="outline">
                <Link2 className="w-4 h-4 mr-2" />
                입주자카드 발송
              </Button>
            </ResponsiveDialogTrigger>
            <ResponsiveDialogContent className="max-w-md">
              <ResponsiveDialogHeader>
                <ResponsiveDialogTitle>입주자카드 링크 생성</ResponsiveDialogTitle>
              </ResponsiveDialogHeader>
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  입주민이 직접 입주자카드를 작성할 수 있는 링크를 생성합니다.
                  생성된 링크를 카카오톡 등으로 전달해 주세요.
                </p>
                <div>
                  <Label>호실 선택</Label>
                  <Select
                    value={tokenUnitId ? String(tokenUnitId) : ""}
                    onValueChange={(v) => {
                      const unit = units?.find((u) => u.id === Number(v));
                      if (unit) {
                        setTokenUnitId(unit.id);
                        setTokenUnitLabel(unit.unitNumber);
                      }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="호실을 선택하세요" />
                    </SelectTrigger>
                    <SelectContent>
                      {units?.map((u) => (
                        <SelectItem key={u.id} value={String(u.id)}>
                          {u.unitNumber}호
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button className="w-full" onClick={handleCreateToken} disabled={!tokenUnitId || !tokenUnitLabel}>
                  링크 생성 및 복사
                </Button>

                {tokens && tokens.length > 0 && (
                  <div className="border-t pt-4">
                    <p className="text-sm font-medium mb-2">생성된 토큰 목록</p>
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                      {tokens.map((t) => (
                        <div key={t.id} className="flex items-center justify-between text-sm p-2 border rounded">
                          <div>
                            <span className="font-medium">{t.unitLabel}호</span>
                            <Badge variant={t.status === "approved" ? "default" : t.status === "submitted" ? "secondary" : "outline"} className="ml-2 text-[10px]">
                              {t.status === "pending" ? "대기" : t.status === "submitted" ? "제출됨" : t.status === "approved" ? "승인" : "반려"}
                            </Badge>
                          </div>
                          <Button variant="ghost" size="sm" className="h-11" onClick={() => copyTokenLink(t.token)}>
                            <Copy className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </ResponsiveDialogContent>
          </ResponsiveDialog>
          <ResponsiveDialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) resetForm(); }}>
            <ResponsiveDialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                입주자 등록
              </Button>
            </ResponsiveDialogTrigger>
            <ResponsiveDialogContent className="max-w-2xl">
              <ResponsiveDialogHeader>
                <ResponsiveDialogTitle>{editing ? "입주자 수정" : "새 입주자 등록"}</ResponsiveDialogTitle>
              </ResponsiveDialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>호실 *</Label>
                    <Input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} required />
                  </div>
                  <div>
                    <Label>입주자명 *</Label>
                    <Input value={form.tenantName} onChange={(e) => setForm({ ...form, tenantName: e.target.value })} required />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>주민등록번호</Label>
                    <Input value={form.residentId} onChange={(e) => setForm({ ...form, residentId: e.target.value })} placeholder="000000-0000000" />
                  </div>
                  <div>
                    <Label>휴대폰</Label>
                    <Input type="tel" inputMode="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="010-0000-0000" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>비상연락처</Label>
                    <Input type="tel" inputMode="tel" value={form.emergencyContact} onChange={(e) => setForm({ ...form, emergencyContact: e.target.value })} />
                  </div>
                  <div>
                    <Label>이메일</Label>
                    <Input type="email" inputMode="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label>인테리어 개시일</Label>
                    <Input type="date" value={form.interiorStartDate} onChange={(e) => setForm({ ...form, interiorStartDate: e.target.value })} />
                  </div>
                  <div>
                    <Label>입주일</Label>
                    <Input type="date" value={form.moveInDate} onChange={(e) => setForm({ ...form, moveInDate: e.target.value })} />
                  </div>
                  <div>
                    <Label>퇴거일</Label>
                    <Input type="date" value={form.moveOutDate} onChange={(e) => setForm({ ...form, moveOutDate: e.target.value })} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>상호명 (법인)</Label>
                    <Input value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} />
                  </div>
                  <div>
                    <Label>사업자등록번호</Label>
                    <Input value={form.businessNumber} onChange={(e) => setForm({ ...form, businessNumber: e.target.value })} />
                  </div>
                </div>
                <div>
                  <Label>주민등록주소</Label>
                  <Input value={form.registeredAddress} onChange={(e) => setForm({ ...form, registeredAddress: e.target.value })} />
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox checked={form.hasTv} onCheckedChange={(v) => setForm({ ...form, hasTv: !!v })} />
                  <Label>TV 소유</Label>
                </div>
                <div className="border-t pt-4">
                  <p className="text-sm font-medium mb-3">법인 연대보증인 정보</p>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <Label>보증인명</Label>
                      <Input value={form.guarantorName} onChange={(e) => setForm({ ...form, guarantorName: e.target.value })} />
                    </div>
                    <div>
                      <Label>연락처</Label>
                      <Input value={form.guarantorPhone} onChange={(e) => setForm({ ...form, guarantorPhone: e.target.value })} />
                    </div>
                    <div>
                      <Label>관계</Label>
                      <Input value={form.guarantorRelation} onChange={(e) => setForm({ ...form, guarantorRelation: e.target.value })} />
                    </div>
                  </div>
                </div>
                <div className="border-t pt-4">
                  <p className="text-sm font-medium mb-3">제출서류 체크리스트</p>
                  <div className="flex flex-wrap gap-4">
                    <div className="flex items-center gap-2">
                      <Checkbox checked={form.contractDoc} onCheckedChange={(v) => setForm({ ...form, contractDoc: !!v })} />
                      <Label>매매/임대차계약서</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox checked={form.businessRegDoc} onCheckedChange={(v) => setForm({ ...form, businessRegDoc: !!v })} />
                      <Label>사업자등록증</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox checked={form.idDoc} onCheckedChange={(v) => setForm({ ...form, idDoc: !!v })} />
                      <Label>신분증 사본</Label>
                    </div>
                  </div>
                </div>
                <div className="border-t pt-4">
                  <p className="text-sm font-medium mb-3">개인정보 수집·이용 동의</p>
                  <div>
                    <Label>동의일시</Label>
                    <Input type="datetime-local" value={form.privacyConsentDate} onChange={(e) => setForm({ ...form, privacyConsentDate: e.target.value })} />
                  </div>
                </div>
                <div>
                  <Label>기타사항</Label>
                  <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                </div>
                <Button type="submit" className="w-full">{editing ? "수정" : "등록"}</Button>
              </form>
            </ResponsiveDialogContent>
          </ResponsiveDialog>
        </div>
      </div>

      {unverifiedCount > 0 && (
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-orange-600" />
            <span className="text-sm text-orange-800 font-medium">
              서류 확인이 필요한 입주자카드가 {unverifiedCount}건 있습니다
            </span>
          </div>
        </div>
      )}

      <div className="flex gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="이름, 호실, 전화번호 검색..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filterStatus || "all"} onValueChange={(v) => setFilterStatus(v === "all" ? undefined : v)}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="상태" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체</SelectItem>
            <SelectItem value="active">입주중</SelectItem>
            <SelectItem value="moved_out">퇴거</SelectItem>
            <SelectItem value="destroyed">파기완료</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}
        </div>
      ) : tenants && tenants.length > 0 ? (
        <>
          <div className="hidden desktop:block">
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>호실</TableHead>
                      <TableHead>입주자명</TableHead>
                      <TableHead>휴대폰</TableHead>
                      <TableHead>입주일</TableHead>
                      <TableHead>상태</TableHead>
                      <TableHead>확인</TableHead>
                      <TableHead>서류</TableHead>
                      <TableHead className="text-right">관리</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tenants.map((tenant) => (
                      <TableRow key={tenant.id}>
                        <TableCell className="font-medium">{tenant.unit}</TableCell>
                        <TableCell>{tenant.tenantName}</TableCell>
                        <TableCell className="text-muted-foreground">{tenant.phone || "-"}</TableCell>
                        <TableCell className="text-muted-foreground">{tenant.moveInDate || "-"}</TableCell>
                        <TableCell>
                          <Badge variant={tenant.status === "active" ? "default" : tenant.status === "destroyed" ? "destructive" : "secondary"}>
                            {tenant.status === "active" ? "입주중" : tenant.status === "destroyed" ? "파기완료" : "퇴거"}
                          </Badge>
                        </TableCell>
                        <TableCell>{getVerificationBadge(tenant.verificationStatus)}</TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {tenant.contractDoc && <Badge variant="outline" className="text-xs">계약서</Badge>}
                            {tenant.businessRegDoc && <Badge variant="outline" className="text-xs">사업자</Badge>}
                            {tenant.idDoc && <Badge variant="outline" className="text-xs">신분증</Badge>}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="sm" onClick={() => setDetailDialog(tenant)}>
                              <Eye className="w-3.5 h-3.5" />
                            </Button>
                            {tenant.verificationStatus === "unverified" && tenant.signatureName && (
                              <Button variant="ghost" size="sm" onClick={() => setVerifyDialog(tenant)} className="text-orange-600">
                                <CheckCircle className="w-3.5 h-3.5" />
                              </Button>
                            )}
                            <Button variant="ghost" size="sm" onClick={() => exportTenantCard(tenant)}>
                              <Download className="w-3.5 h-3.5" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => openEdit(tenant)}>
                              <Edit className="w-3.5 h-3.5" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => handleDelete(tenant.id)}>
                              <Trash2 className="w-3.5 h-3.5 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
          <div className="desktop:hidden space-y-2">
            {tenants.map((tenant) => (
              <Card key={tenant.id} className="cursor-pointer" onClick={() => setDetailDialog(tenant)}>
                <CardContent className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm">{tenant.unit}호</span>
                        <span className="text-sm">{tenant.tenantName}</span>
                        <Badge variant={tenant.status === "active" ? "default" : tenant.status === "destroyed" ? "destructive" : "secondary"} className="text-[10px]">
                          {tenant.status === "active" ? "입주중" : tenant.status === "destroyed" ? "파기완료" : "퇴거"}
                        </Badge>
                        {getVerificationBadge(tenant.verificationStatus)}
                      </div>
                      {tenant.phone && <p className="text-xs text-muted-foreground mt-1">{tenant.phone}</p>}
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button variant="ghost" size="icon" className="h-11 w-11" onClick={(e) => { e.stopPropagation(); openEdit(tenant); }}>
                        <Edit className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-11 w-11" onClick={(e) => { e.stopPropagation(); handleDelete(tenant.id); }}>
                        <Trash2 className="w-3.5 h-3.5 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <Users className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground">등록된 입주자가 없습니다</p>
          </CardContent>
        </Card>
      )}

      <ResponsiveDialog open={!!detailDialog} onOpenChange={(o) => { if (!o) setDetailDialog(null); }}>
        <ResponsiveDialogContent className="max-w-2xl">
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>입주자카드 상세</ResponsiveDialogTitle>
          </ResponsiveDialogHeader>
          {detailDialog && (
            <div className="space-y-4 max-h-[70vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><span className="text-muted-foreground">호실:</span> <span className="font-medium">{detailDialog.unit}</span></div>
                <div><span className="text-muted-foreground">입주자명:</span> <span className="font-medium">{detailDialog.tenantName}</span></div>
                <div><span className="text-muted-foreground">주민등록번호:</span> {detailDialog.residentId || "-"}</div>
                <div><span className="text-muted-foreground">휴대폰:</span> {detailDialog.phone || "-"}</div>
                <div><span className="text-muted-foreground">비상연락처:</span> {detailDialog.emergencyContact || "-"}</div>
                <div><span className="text-muted-foreground">이메일:</span> {detailDialog.email || "-"}</div>
                <div><span className="text-muted-foreground">인테리어 개시일:</span> {detailDialog.interiorStartDate || "-"}</div>
                <div><span className="text-muted-foreground">입주일:</span> {detailDialog.moveInDate || "-"}</div>
                <div><span className="text-muted-foreground">퇴거일:</span> {detailDialog.moveOutDate || "-"}</div>
                <div><span className="text-muted-foreground">관리비 부과 시작일:</span> <span className="font-medium text-primary">{detailDialog.billingStartDate || "-"}</span></div>
                <div><span className="text-muted-foreground">상호명:</span> {detailDialog.companyName || "-"}</div>
                <div><span className="text-muted-foreground">사업자등록번호:</span> {detailDialog.businessNumber || "-"}</div>
                <div><span className="text-muted-foreground">TV소유:</span> {detailDialog.hasTv ? "예" : "아니오"}</div>
                <div className="col-span-2"><span className="text-muted-foreground">주민등록주소:</span> {detailDialog.registeredAddress || "-"}</div>
              </div>
              <div className="border-t pt-3">
                <p className="text-sm font-medium mb-2">법인 연대보증인</p>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div><span className="text-muted-foreground">보증인명:</span> {detailDialog.guarantorName || "-"}</div>
                  <div><span className="text-muted-foreground">연락처:</span> {detailDialog.guarantorPhone || "-"}</div>
                  <div><span className="text-muted-foreground">관계:</span> {detailDialog.guarantorRelation || "-"}</div>
                </div>
              </div>
              <div className="border-t pt-3">
                <p className="text-sm font-medium mb-2">관리계약 동의 내역</p>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="flex items-center gap-2">
                    {detailDialog.feeObligationConsent ? <CheckCircle className="w-4 h-4 text-green-600" /> : <XCircle className="w-4 h-4 text-muted-foreground" />}
                    <span>관리비 납부 의무</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {detailDialog.penaltyConsent ? <CheckCircle className="w-4 h-4 text-green-600" /> : <XCircle className="w-4 h-4 text-muted-foreground" />}
                    <span>체납 시 조치</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {detailDialog.specialFundConsent ? <CheckCircle className="w-4 h-4 text-green-600" /> : <XCircle className="w-4 h-4 text-muted-foreground" />}
                    <span>특별충당금</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {detailDialog.privacyRetentionConsent ? <CheckCircle className="w-4 h-4 text-green-600" /> : <XCircle className="w-4 h-4 text-muted-foreground" />}
                    <span>개인정보 보관</span>
                  </div>
                </div>
              </div>
              <div className="border-t pt-3">
                <p className="text-sm font-medium mb-2">전자서명</p>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div><span className="text-muted-foreground">서명자:</span> <span className="font-medium">{detailDialog.signatureName || "-"}</span></div>
                  <div><span className="text-muted-foreground">서명일시:</span> {detailDialog.signatureDate ? new Date(detailDialog.signatureDate).toLocaleString("ko-KR") : "-"}</div>
                </div>
              </div>
              <div className="border-t pt-3">
                <p className="text-sm font-medium mb-2">첨부 서류</p>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <DocLink label="임대차계약서" url={detailDialog.contractDocUrl} hasFlag={detailDialog.contractDoc} />
                  <DocLink label="신분증" url={detailDialog.idDocUrl} hasFlag={detailDialog.idDoc} />
                  <DocLink label="사업자등록증" url={detailDialog.businessRegDocUrl} hasFlag={detailDialog.businessRegDoc} />
                  <DocLink label="자동차등록증" url={detailDialog.vehicleRegDocUrl} hasFlag={false} />
                </div>
              </div>
              <div className="border-t pt-3">
                <p className="text-sm font-medium mb-2">서류 확인 상태</p>
                <div className="flex items-center gap-2 text-sm">
                  {getVerificationBadge(detailDialog.verificationStatus)}
                  {detailDialog.verifiedBy && <span className="text-muted-foreground">확인자: {detailDialog.verifiedBy}</span>}
                  {detailDialog.verifiedAt && <span className="text-muted-foreground">({new Date(detailDialog.verifiedAt).toLocaleString("ko-KR")})</span>}
                </div>
              </div>
              {detailDialog.status === "moved_out" && detailDialog.dataDestructionDate && (
                <div className="border-t pt-3">
                  <div className="flex items-center gap-2 mb-2">
                    <ShieldAlert className="w-4 h-4 text-orange-500" />
                    <p className="text-sm font-medium">개인정보 파기 예정</p>
                  </div>
                  <div className="bg-orange-50 dark:bg-orange-950/20 rounded-lg p-3 space-y-1">
                    <p className="text-sm">
                      <span className="text-muted-foreground">파기 예정일:</span>{" "}
                      <span className="font-medium text-orange-600">{detailDialog.dataDestructionDate}</span>
                    </p>
                  </div>
                </div>
              )}
              {detailDialog.notes && (
                <div className="border-t pt-3">
                  <p className="text-sm font-medium mb-1">기타사항</p>
                  <p className="text-sm text-muted-foreground">{detailDialog.notes}</p>
                </div>
              )}
              <div className="flex gap-2">
                {detailDialog.verificationStatus === "unverified" && detailDialog.signatureName && (
                  <>
                    <Button
                      className="flex-1"
                      onClick={() => handleVerify(detailDialog.id, "approve")}
                    >
                      <CheckCircle className="w-4 h-4 mr-2" />
                      서류 확인 승인
                    </Button>
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => setVerifyDialog(detailDialog)}
                    >
                      <XCircle className="w-4 h-4 mr-2" />
                      반려
                    </Button>
                  </>
                )}
                <Button variant="outline" className={detailDialog.verificationStatus === "unverified" && detailDialog.signatureName ? "" : "w-full"} onClick={() => exportTenantCard(detailDialog)}>
                  <Download className="w-4 h-4 mr-2" />
                  PDF 내보내기
                </Button>
              </div>
            </div>
          )}
        </ResponsiveDialogContent>
      </ResponsiveDialog>

      <ResponsiveDialog open={!!verifyDialog} onOpenChange={(o) => { if (!o) { setVerifyDialog(null); setRejectionReason(""); } }}>
        <ResponsiveDialogContent className="max-w-md">
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>입주자카드 반려</ResponsiveDialogTitle>
          </ResponsiveDialogHeader>
          {verifyDialog && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {verifyDialog.unit}호 {verifyDialog.tenantName} 입주자카드를 반려합니다.
                사유를 입력해 주세요.
              </p>
              <div>
                <Label>반려 사유</Label>
                <Textarea
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="서류 불일치, 정보 오류 등"
                />
              </div>
              <Button
                variant="destructive"
                className="w-full"
                onClick={() => handleVerify(verifyDialog.id, "reject")}
              >
                반려 처리
              </Button>
            </div>
          )}
        </ResponsiveDialogContent>
      </ResponsiveDialog>

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

function ContractTemplateDialog({
  open,
  onOpenChange,
  template,
  buildingId,
  onSave,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  template: { feeObligationClause: string; penaltyClause: string; specialFundClause: string; privacyRetentionClause: string } | null;
  buildingId: number;
  onSave: (data: Record<string, unknown>) => Promise<void>;
}) {
  const [fee, setFee] = useState("");
  const [penalty, setPenalty] = useState("");
  const [specialFund, setSpecialFund] = useState("");
  const [privacy, setPrivacy] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && template) {
      setFee(template.feeObligationClause || "");
      setPenalty(template.penaltyClause || "");
      setSpecialFund(template.specialFundClause || "");
      setPrivacy(template.privacyRetentionClause || "");
    }
    if (!open) {
      setFee("");
      setPenalty("");
      setSpecialFund("");
      setPrivacy("");
    }
  }, [open, template]);

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent className="max-w-2xl">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>관리계약서 양식 설정</ResponsiveDialogTitle>
        </ResponsiveDialogHeader>
        <div className="space-y-4 max-h-[70vh] overflow-y-auto">
          <p className="text-sm text-muted-foreground">
            입주자카드 제출 시 표시되는 관리계약 동의 조항을 편집할 수 있습니다.
          </p>
          <div>
            <Label className="text-sm font-medium">1. 관리비 납부 의무</Label>
            <Textarea value={fee} onChange={(e) => setFee(e.target.value)} rows={3} className="mt-1" />
          </div>
          <div>
            <Label className="text-sm font-medium">2. 체납 시 조치</Label>
            <Textarea value={penalty} onChange={(e) => setPenalty(e.target.value)} rows={3} className="mt-1" />
          </div>
          <div>
            <Label className="text-sm font-medium">3. 특별충당금</Label>
            <Textarea value={specialFund} onChange={(e) => setSpecialFund(e.target.value)} rows={3} className="mt-1" />
          </div>
          <div>
            <Label className="text-sm font-medium">4. 개인정보 수집·보관</Label>
            <Textarea value={privacy} onChange={(e) => setPrivacy(e.target.value)} rows={3} className="mt-1" />
          </div>
          <Button
            className="w-full"
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              try {
                await onSave({
                  buildingId,
                  feeObligationClause: fee,
                  penaltyClause: penalty,
                  specialFundClause: specialFund,
                  privacyRetentionClause: privacy,
                });
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? "저장 중..." : "저장"}
          </Button>
        </div>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}

function DocLink({ label, url, hasFlag }: { label: string; url?: string | null; hasFlag: boolean }) {
  if (url) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-primary hover:underline">
        <CheckCircle className="w-3.5 h-3.5 text-green-600" />
        {label}
      </a>
    );
  }
  return (
    <div className="flex items-center gap-1 text-muted-foreground">
      {hasFlag ? <CheckCircle className="w-3.5 h-3.5 text-green-600" /> : <XCircle className="w-3.5 h-3.5" />}
      {label}
    </div>
  );
}
