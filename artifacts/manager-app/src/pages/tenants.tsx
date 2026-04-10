import { useState } from "react";
import {
  useListTenants,
  useCreateTenant,
  useUpdateTenant,
  useDeleteTenant,
  getListTenantsQueryKey,
} from "@workspace/api-client-react";
import type { Tenant, CreateTenantBody, ListTenantsParams } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Trash2, Edit, Users, Search, Download, Eye, ShieldAlert } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import jsPDF from "jspdf";

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
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const queryParams: ListTenantsParams = {};
  if (filterStatus && filterStatus !== "all") queryParams.status = filterStatus as ListTenantsParams["status"];
  if (searchTerm) queryParams.search = searchTerm;

  const { data: tenants, isLoading } = useListTenants(
    Object.keys(queryParams).length > 0 ? queryParams : undefined
  );
  const createMutation = useCreateTenant();
  const updateMutation = useUpdateTenant();
  const deleteMutation = useDeleteTenant();

  const [form, setForm] = useState({ ...emptyForm });

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

  function exportTenantCard(tenant: Tenant) {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text("입주자카드", 20, 20);
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
      `기타사항: ${tenant.notes || "-"}`,
      ``,
      `[법인 연대보증인]`,
      `보증인명: ${tenant.guarantorName || "-"}`,
      `보증인 연락처: ${tenant.guarantorPhone || "-"}`,
      `관계: ${tenant.guarantorRelation || "-"}`,
      ``,
      `[제출서류]`,
      `매매/임대차계약서: ${tenant.contractDoc ? "O" : "X"}`,
      `사업자등록증: ${tenant.businessRegDoc ? "O" : "X"}`,
      `신분증: ${tenant.idDoc ? "O" : "X"}`,
      ``,
      `개인정보 동의일시: ${tenant.privacyConsentDate ? new Date(tenant.privacyConsentDate).toLocaleString("ko-KR") : "-"}`,
    ];
    lines.forEach((line, i) => {
      doc.text(line, 20, 35 + i * 7);
    });
    doc.save(`입주자카드_${tenant.unit}_${tenant.tenantName}.pdf`);
    toast({ title: "입주자카드 PDF가 내보내기되었습니다" });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">입주민 관리</h1>
          <p className="text-muted-foreground text-sm mt-1">
            입주자카드를 등록하고 관리합니다
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) resetForm(); }}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              입주자 등록
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editing ? "입주자 수정" : "새 입주자 등록"}</DialogTitle>
            </DialogHeader>
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
                  <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="010-0000-0000" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>비상연락처</Label>
                  <Input value={form.emergencyContact} onChange={(e) => setForm({ ...form, emergencyContact: e.target.value })} />
                </div>
                <div>
                  <Label>이메일</Label>
                  <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
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
                <p className="text-xs text-muted-foreground mb-2">
                  건물 관리 목적으로 개인정보를 수집·이용하는 것에 동의합니다.
                </p>
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
          </DialogContent>
        </Dialog>
      </div>

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
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <Users className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground">등록된 입주자가 없습니다</p>
          </CardContent>
        </Card>
      )}

      <Dialog open={!!detailDialog} onOpenChange={(o) => { if (!o) setDetailDialog(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>입주자카드 상세</DialogTitle>
          </DialogHeader>
          {detailDialog && (
            <div className="space-y-4">
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
                <p className="text-sm font-medium mb-2">제출서류</p>
                <div className="flex gap-3 text-sm">
                  <span>{detailDialog.contractDoc ? "O" : "X"} 매매/임대차계약서</span>
                  <span>{detailDialog.businessRegDoc ? "O" : "X"} 사업자등록증</span>
                  <span>{detailDialog.idDoc ? "O" : "X"} 신분증 사본</span>
                </div>
              </div>
              <div className="border-t pt-3">
                <p className="text-sm font-medium mb-1">개인정보 동의일시</p>
                <p className="text-sm">{detailDialog.privacyConsentDate ? new Date(detailDialog.privacyConsentDate).toLocaleString("ko-KR") : "미동의"}</p>
              </div>
              {detailDialog.status === "moved_out" && detailDialog.dataDestructionDate && (
                <div className="border-t pt-3">
                  <div className="flex items-center gap-2 mb-2">
                    <ShieldAlert className="w-4 h-4 text-orange-500" />
                    <p className="text-sm font-medium">개인정보 파기 예정</p>
                  </div>
                  <div className="bg-orange-50 dark:bg-orange-950/20 rounded-lg p-3 space-y-1">
                    <p className="text-sm">
                      <span className="text-muted-foreground">퇴거일:</span> {detailDialog.moveOutDate}
                    </p>
                    <p className="text-sm">
                      <span className="text-muted-foreground">파기 예정일:</span>{" "}
                      <span className="font-medium text-orange-600 dark:text-orange-400">{detailDialog.dataDestructionDate}</span>
                    </p>
                    {(() => {
                      const daysLeft = Math.ceil(
                        (new Date(detailDialog.dataDestructionDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
                      );
                      return (
                        <p className="text-sm">
                          <span className="text-muted-foreground">남은 기간:</span>{" "}
                          <Badge variant={daysLeft <= 30 ? "destructive" : daysLeft <= 90 ? "secondary" : "outline"}>
                            {daysLeft <= 0 ? "파기 대상" : `${daysLeft}일 남음`}
                          </Badge>
                        </p>
                      );
                    })()}
                  </div>
                </div>
              )}
              {detailDialog.notes && (
                <div className="border-t pt-3">
                  <p className="text-sm font-medium mb-1">기타사항</p>
                  <p className="text-sm text-muted-foreground">{detailDialog.notes}</p>
                </div>
              )}
              <Button variant="outline" className="w-full" onClick={() => exportTenantCard(detailDialog)}>
                <Download className="w-4 h-4 mr-2" />
                입주자카드 PDF 내보내기
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
