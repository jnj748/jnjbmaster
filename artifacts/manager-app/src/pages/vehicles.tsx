import { useState } from "react";
import {
  useListVehicles,
  useCreateVehicle,
  useUpdateVehicle,
  useDeleteVehicle,
  useListTenants,
  useCancelVehicle,
  useBatchCancelVehicles,
  useGetVehicleHistory,
  useRunVehicleInspection,
  getListVehiclesQueryKey,
} from "@workspace/api-client-react";
import type { Vehicle, CreateVehicleBody, ListVehiclesParams, CreateVehicleBodyOwnershipType, VehicleHistoryEntry } from "@workspace/api-client-react";
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
import { Plus, Trash2, Edit, Car, Search, Download, Eye, XCircle, History, ClipboardCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import jsPDF from "jspdf";

const ownershipOptions: { value: CreateVehicleBodyOwnershipType; label: string }[] = [
  { value: "owned", label: "자가" },
  { value: "leased", label: "리스" },
  { value: "rental", label: "렌탈" },
  { value: "other", label: "기타" },
];

const emptyForm = {
  unit: "",
  tenantId: "",
  tenantRelation: "",
  vehicleNumber: "",
  vehicleType: "",
  vehicleColor: "",
  ownerName: "",
  ownerContact: "",
  isPrimary: true,
  ownershipType: "owned" as CreateVehicleBodyOwnershipType,
  registrationDoc: false,
  insuranceDoc: false,
  leaseDoc: false,
  notes: "",
};

export default function Vehicles() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailDialog, setDetailDialog] = useState<Vehicle | null>(null);
  const [historyDialog, setHistoryDialog] = useState<Vehicle | null>(null);
  const [editing, setEditing] = useState<Vehicle | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<string | undefined>();
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const queryParams: ListVehiclesParams = {};
  if (searchTerm) queryParams.search = searchTerm;
  if (filterStatus && filterStatus !== "all") queryParams.status = filterStatus as ListVehiclesParams["status"];

  const { data: vehicles, isLoading } = useListVehicles(
    Object.keys(queryParams).length > 0 ? queryParams : undefined
  );
  const { data: tenants } = useListTenants({ status: "active" as ListVehiclesParams["search"] });

  function isUnverifiedTenant(tenantId?: number | null) {
    if (!tenantId || !tenants) return false;
    const t = tenants.find((t) => t.id === tenantId);
    return t && t.verificationStatus !== "verified";
  }

  const createMutation = useCreateVehicle();
  const updateMutation = useUpdateVehicle();
  const deleteMutation = useDeleteVehicle();
  const cancelMutation = useCancelVehicle();
  const batchCancelMutation = useBatchCancelVehicles();
  const inspectionMutation = useRunVehicleInspection();

  const { data: historyData } = useGetVehicleHistory(historyDialog?.id ?? 0, {
    query: { enabled: !!historyDialog },
  });

  const [form, setForm] = useState({ ...emptyForm });

  function resetForm() {
    setForm({ ...emptyForm });
    setEditing(null);
  }

  function openEdit(item: Vehicle) {
    setEditing(item);
    setForm({
      unit: item.unit,
      tenantId: item.tenantId ? String(item.tenantId) : "",
      tenantRelation: item.tenantRelation || "",
      vehicleNumber: item.vehicleNumber,
      vehicleType: item.vehicleType || "",
      vehicleColor: item.vehicleColor || "",
      ownerName: item.ownerName || "",
      ownerContact: item.ownerContact || "",
      isPrimary: item.isPrimary,
      ownershipType: item.ownershipType as CreateVehicleBodyOwnershipType,
      registrationDoc: item.registrationDoc,
      insuranceDoc: item.insuranceDoc,
      leaseDoc: item.leaseDoc,
      notes: item.notes || "",
    });
    setDialogOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const data: CreateVehicleBody = {
      unit: form.unit,
      tenantId: form.tenantId ? Number(form.tenantId) : undefined,
      tenantRelation: form.tenantRelation || null,
      vehicleNumber: form.vehicleNumber,
      vehicleType: form.vehicleType || null,
      vehicleColor: form.vehicleColor || null,
      ownerName: form.ownerName || null,
      ownerContact: form.ownerContact || null,
      isPrimary: form.isPrimary,
      ownershipType: form.ownershipType,
      registrationDoc: form.registrationDoc,
      insuranceDoc: form.insuranceDoc,
      leaseDoc: form.leaseDoc,
      notes: form.notes || null,
    };

    try {
      if (editing) {
        await updateMutation.mutateAsync({ id: editing.id, data });
        toast({ title: "차량 정보가 수정되었습니다" });
      } else {
        await createMutation.mutateAsync({ data });
        toast({ title: "차량이 등록되었습니다" });
      }
      queryClient.invalidateQueries({ queryKey: getListVehiclesQueryKey() });
      setDialogOpen(false);
      resetForm();
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "오류가 발생했습니다";
      toast({ title: "오류", description: errorMessage, variant: "destructive" });
    }
  }

  async function handleDelete(id: number) {
    await deleteMutation.mutateAsync({ id });
    queryClient.invalidateQueries({ queryKey: getListVehiclesQueryKey() });
    toast({ title: "차량이 삭제되었습니다" });
  }

  async function handleCancel(vehicle: Vehicle) {
    try {
      await cancelMutation.mutateAsync({ id: vehicle.id, data: { notes: "차량 말소 처리" } });
      queryClient.invalidateQueries({ queryKey: getListVehiclesQueryKey() });
      toast({ title: `${vehicle.vehicleNumber} 차량이 말소 처리되었습니다` });
    } catch {
      toast({ title: "오류", description: "말소 처리에 실패했습니다", variant: "destructive" });
    }
  }

  async function handleBatchCancel() {
    if (selectedIds.length === 0) return;
    try {
      const result = await batchCancelMutation.mutateAsync({ data: { ids: selectedIds, notes: "일괄 말소 처리" } });
      queryClient.invalidateQueries({ queryKey: getListVehiclesQueryKey() });
      setSelectedIds([]);
      toast({ title: `${result.cancelledCount}대의 차량이 일괄 말소 처리되었습니다` });
    } catch {
      toast({ title: "오류", description: "일괄 말소 처리에 실패했습니다", variant: "destructive" });
    }
  }

  async function handleInspection() {
    try {
      const result = await inspectionMutation.mutateAsync();
      if (result.notificationCreated) {
        toast({ title: "차량 점검 완료", description: `미등록 차량 ${result.unregisteredCount}건 알림이 발송되었습니다` });
      } else {
        toast({ title: "차량 점검 완료", description: "미등록 차량이 없습니다" });
      }
    } catch {
      toast({ title: "오류", description: "점검 실행에 실패했습니다", variant: "destructive" });
    }
  }

  function toggleSelect(id: number) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function toggleSelectAll() {
    if (!vehicles) return;
    const registeredVehicles = vehicles.filter((v) => v.status === "registered");
    if (selectedIds.length === registeredVehicles.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(registeredVehicles.map((v) => v.id));
    }
  }

  function getRequiredDocs(ownershipType: string) {
    switch (ownershipType) {
      case "owned":
        return ["차량등록증", "보험증서"];
      case "leased":
        return ["차량등록증", "보험증서", "리스계약서"];
      case "rental":
        return ["차량등록증", "보험증서", "렌탈계약서"];
      default:
        return ["차량등록증", "보험증서"];
    }
  }

  function exportVehicleCard(vehicle: Vehicle) {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text("차량등록카드", 20, 20);
    doc.setFontSize(10);
    const lines = [
      `입주호실: ${vehicle.unit}`,
      `입주자 관계: ${vehicle.tenantRelation || "-"}`,
      `차량번호: ${vehicle.vehicleNumber}`,
      `차종: ${vehicle.vehicleType || "-"}`,
      `색상: ${vehicle.vehicleColor || "-"}`,
      `소유자명: ${vehicle.ownerName || "-"}`,
      `연락처: ${vehicle.ownerContact || "-"}`,
      `구분: ${vehicle.isPrimary ? "기본차량" : "추가차량"}`,
      `소유형태: ${ownershipOptions.find((o) => o.value === vehicle.ownershipType)?.label || vehicle.ownershipType}`,
      `상태: ${vehicle.status === "registered" ? "등록" : "말소"}`,
      ``,
      `[필요서류]`,
      `차량등록증: ${vehicle.registrationDoc ? "O" : "X"}`,
      `보험증서: ${vehicle.insuranceDoc ? "O" : "X"}`,
      `리스/렌탈계약서: ${vehicle.leaseDoc ? "O" : "X"}`,
    ];
    lines.forEach((line, i) => {
      doc.text(line, 20, 35 + i * 7);
    });
    doc.save(`차량카드_${vehicle.unit}_${vehicle.vehicleNumber}.pdf`);
    toast({ title: "차량카드 PDF가 내보내기되었습니다" });
  }

  const ownershipLabel = (t: string) => ownershipOptions.find((o) => o.value === t)?.label || t;

  function handleTenantSelect(tenantId: string) {
    if (tenantId === "none") {
      setForm({ ...form, tenantId: "", unit: form.unit });
      return;
    }
    const selected = tenants?.find((t) => t.id === Number(tenantId));
    if (selected) {
      setForm({ ...form, tenantId, unit: selected.unit });
    }
  }

  function actionLabel(action: string): string {
    switch (action) {
      case "registered": return "등록";
      case "cancelled": return "말소";
      default: return action;
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">차량 관리</h1>
          <p className="text-muted-foreground text-sm mt-1">
            차량등록카드를 관리합니다 (기본차량 + 추가차량 최대 4대)
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleInspection} disabled={inspectionMutation.isPending}>
            <ClipboardCheck className="w-4 h-4 mr-2" />
            월별 점검 실행
          </Button>
          <ResponsiveDialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) resetForm(); }}>
            <ResponsiveDialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                차량 등록
              </Button>
            </ResponsiveDialogTrigger>
            <ResponsiveDialogContent className="max-w-lg">
              <ResponsiveDialogHeader>
                <ResponsiveDialogTitle>{editing ? "차량 수정" : "새 차량 등록"}</ResponsiveDialogTitle>
              </ResponsiveDialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label>입주자 선택</Label>
                  <Select value={form.tenantId || "none"} onValueChange={handleTenantSelect}>
                    <SelectTrigger><SelectValue placeholder="입주자 선택 (선택사항)" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">선택 안함</SelectItem>
                      {tenants?.map((t) => (
                        <SelectItem key={t.id} value={String(t.id)}>
                          {t.unit}호 - {t.tenantName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>입주호실 *</Label>
                    <Input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} required />
                  </div>
                  <div>
                    <Label>입주자 관계</Label>
                    <Input value={form.tenantRelation} onChange={(e) => setForm({ ...form, tenantRelation: e.target.value })} placeholder="본인, 배우자, 자녀 등" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>차량번호 *</Label>
                    <Input value={form.vehicleNumber} onChange={(e) => setForm({ ...form, vehicleNumber: e.target.value })} required placeholder="12가 3456" />
                  </div>
                  <div>
                    <Label>차종</Label>
                    <Input value={form.vehicleType} onChange={(e) => setForm({ ...form, vehicleType: e.target.value })} placeholder="소나타, K5 등" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>색상</Label>
                    <Input value={form.vehicleColor} onChange={(e) => setForm({ ...form, vehicleColor: e.target.value })} />
                  </div>
                  <div>
                    <Label>소유형태</Label>
                    <Select value={form.ownershipType} onValueChange={(v) => setForm({ ...form, ownershipType: v as CreateVehicleBodyOwnershipType })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {ownershipOptions.map((o) => (
                          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>소유자명</Label>
                    <Input value={form.ownerName} onChange={(e) => setForm({ ...form, ownerName: e.target.value })} />
                  </div>
                  <div>
                    <Label>연락처</Label>
                    <Input value={form.ownerContact} onChange={(e) => setForm({ ...form, ownerContact: e.target.value })} />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox checked={form.isPrimary} onCheckedChange={(v) => setForm({ ...form, isPrimary: !!v })} />
                  <Label>기본차량</Label>
                </div>

                <div className="border-t pt-4">
                  <p className="text-sm font-medium mb-2">필요서류 체크리스트</p>
                  <p className="text-xs text-muted-foreground mb-3">
                    소유형태: {ownershipLabel(form.ownershipType)} - 필요서류: {getRequiredDocs(form.ownershipType).join(", ")}
                  </p>
                  <div className="flex flex-wrap gap-4">
                    <div className="flex items-center gap-2">
                      <Checkbox checked={form.registrationDoc} onCheckedChange={(v) => setForm({ ...form, registrationDoc: !!v })} />
                      <Label>차량등록증</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox checked={form.insuranceDoc} onCheckedChange={(v) => setForm({ ...form, insuranceDoc: !!v })} />
                      <Label>보험증서</Label>
                    </div>
                    {(form.ownershipType === "leased" || form.ownershipType === "rental") && (
                      <div className="flex items-center gap-2">
                        <Checkbox checked={form.leaseDoc} onCheckedChange={(v) => setForm({ ...form, leaseDoc: !!v })} />
                        <Label>{form.ownershipType === "leased" ? "리스계약서" : "렌탈계약서"}</Label>
                      </div>
                    )}
                  </div>
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
      </div>

      <div className="flex gap-3 items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="차량번호, 호실, 소유자 검색..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filterStatus || "all"} onValueChange={(v) => setFilterStatus(v === "all" ? undefined : v)}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="상태" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체</SelectItem>
            <SelectItem value="registered">등록</SelectItem>
            <SelectItem value="cancelled">말소</SelectItem>
          </SelectContent>
        </Select>
        {selectedIds.length > 0 && (
          <Button variant="destructive" size="sm" onClick={handleBatchCancel} disabled={batchCancelMutation.isPending}>
            <XCircle className="w-4 h-4 mr-2" />
            {selectedIds.length}대 일괄 말소
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}
        </div>
      ) : vehicles && vehicles.length > 0 ? (
        <>
          <div className="hidden desktop:block">
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">
                        <Checkbox
                          checked={vehicles.filter((v) => v.status === "registered").length > 0 && selectedIds.length === vehicles.filter((v) => v.status === "registered").length}
                          onCheckedChange={toggleSelectAll}
                        />
                      </TableHead>
                      <TableHead>호실</TableHead>
                      <TableHead>차량번호</TableHead>
                      <TableHead>차종/색상</TableHead>
                      <TableHead>소유자</TableHead>
                      <TableHead>구분</TableHead>
                      <TableHead>상태</TableHead>
                      <TableHead>서류</TableHead>
                      <TableHead className="text-right">관리</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {vehicles.map((vehicle) => (
                      <TableRow key={vehicle.id} className={vehicle.status === "cancelled" ? "opacity-60" : ""}>
                        <TableCell>
                          {vehicle.status === "registered" && (
                            <Checkbox
                              checked={selectedIds.includes(vehicle.id)}
                              onCheckedChange={() => toggleSelect(vehicle.id)}
                            />
                          )}
                        </TableCell>
                        <TableCell className="font-medium">
                          <span>{vehicle.unit}</span>
                          {isUnverifiedTenant(vehicle.tenantId) && (
                            <Badge variant="secondary" className="ml-1 text-[9px] bg-orange-100 text-orange-700">미확인</Badge>
                          )}
                        </TableCell>
                        <TableCell className="font-medium">{vehicle.vehicleNumber}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {[vehicle.vehicleType, vehicle.vehicleColor].filter(Boolean).join(" / ") || "-"}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{vehicle.ownerName || "-"}</TableCell>
                        <TableCell>
                          <Badge variant={vehicle.isPrimary ? "default" : "outline"}>
                            {vehicle.isPrimary ? "기본" : "추가"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={vehicle.status === "registered" ? "default" : "destructive"}>
                            {vehicle.status === "registered" ? "등록" : "말소"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {vehicle.registrationDoc && <Badge variant="outline" className="text-xs">등록증</Badge>}
                            {vehicle.insuranceDoc && <Badge variant="outline" className="text-xs">보험</Badge>}
                            {vehicle.leaseDoc && <Badge variant="outline" className="text-xs">계약서</Badge>}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="sm" onClick={() => setDetailDialog(vehicle)}>
                              <Eye className="w-3.5 h-3.5" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => setHistoryDialog(vehicle)}>
                              <History className="w-3.5 h-3.5" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => exportVehicleCard(vehicle)}>
                              <Download className="w-3.5 h-3.5" />
                            </Button>
                            {vehicle.status === "registered" && (
                              <>
                                <Button variant="ghost" size="sm" onClick={() => openEdit(vehicle)}>
                                  <Edit className="w-3.5 h-3.5" />
                                </Button>
                                <Button variant="ghost" size="sm" onClick={() => handleCancel(vehicle)}>
                                  <XCircle className="w-3.5 h-3.5 text-orange-500" />
                                </Button>
                              </>
                            )}
                            <Button variant="ghost" size="sm" onClick={() => handleDelete(vehicle.id)}>
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
            {vehicles.map((vehicle) => (
              <Card key={vehicle.id} className={`cursor-pointer ${vehicle.status === "cancelled" ? "opacity-60" : ""}`} onClick={() => setDetailDialog(vehicle)}>
                <CardContent className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm">{vehicle.unit}호</span>
                        <span className="text-sm font-medium">{vehicle.vehicleNumber}</span>
                      </div>
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        <Badge variant={vehicle.status === "registered" ? "default" : "destructive"} className="text-[10px]">
                          {vehicle.status === "registered" ? "등록" : "말소"}
                        </Badge>
                        <Badge variant={vehicle.isPrimary ? "default" : "outline"} className="text-[10px]">
                          {vehicle.isPrimary ? "기본" : "추가"}
                        </Badge>
                        {vehicle.vehicleType && <span className="text-xs text-muted-foreground">{vehicle.vehicleType}</span>}
                        {isUnverifiedTenant(vehicle.tenantId) && (
                          <Badge variant="secondary" className="text-[9px] bg-orange-100 text-orange-700">입주자 미확인</Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      {vehicle.status === "registered" && (
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 min-h-0 min-w-0" onClick={(e) => { e.stopPropagation(); openEdit(vehicle); }}>
                          <Edit className="w-3.5 h-3.5" />
                        </Button>
                      )}
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
            <Car className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground">등록된 차량이 없습니다</p>
          </CardContent>
        </Card>
      )}

      <ResponsiveDialog open={!!detailDialog} onOpenChange={(o) => { if (!o) setDetailDialog(null); }}>
        <ResponsiveDialogContent className="max-w-lg">
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>차량등록카드 상세</ResponsiveDialogTitle>
          </ResponsiveDialogHeader>
          {detailDialog && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><span className="text-muted-foreground">입주호실:</span> <span className="font-medium">{detailDialog.unit}</span></div>
                <div><span className="text-muted-foreground">입주자 관계:</span> {detailDialog.tenantRelation || "-"}</div>
                <div><span className="text-muted-foreground">차량번호:</span> <span className="font-medium">{detailDialog.vehicleNumber}</span></div>
                <div><span className="text-muted-foreground">차종:</span> {detailDialog.vehicleType || "-"}</div>
                <div><span className="text-muted-foreground">색상:</span> {detailDialog.vehicleColor || "-"}</div>
                <div><span className="text-muted-foreground">소유자명:</span> {detailDialog.ownerName || "-"}</div>
                <div><span className="text-muted-foreground">연락처:</span> {detailDialog.ownerContact || "-"}</div>
                <div><span className="text-muted-foreground">구분:</span> {detailDialog.isPrimary ? "기본차량" : "추가차량"}</div>
                <div><span className="text-muted-foreground">소유형태:</span> {ownershipLabel(detailDialog.ownershipType)}</div>
                <div>
                  <span className="text-muted-foreground">상태:</span>{" "}
                  <Badge variant={detailDialog.status === "registered" ? "default" : "destructive"}>
                    {detailDialog.status === "registered" ? "등록" : "말소"}
                  </Badge>
                </div>
              </div>
              {detailDialog.cancelledAt && (
                <div className="bg-red-50 dark:bg-red-950/20 rounded-lg p-3">
                  <p className="text-sm text-red-600 dark:text-red-400">
                    말소 처리일: {new Date(detailDialog.cancelledAt).toLocaleString("ko-KR")}
                  </p>
                </div>
              )}
              <div className="border-t pt-3">
                <p className="text-sm font-medium mb-2">필요서류</p>
                <div className="flex gap-3 text-sm">
                  <span>{detailDialog.registrationDoc ? "O" : "X"} 차량등록증</span>
                  <span>{detailDialog.insuranceDoc ? "O" : "X"} 보험증서</span>
                  <span>{detailDialog.leaseDoc ? "O" : "X"} 리스/렌탈계약서</span>
                </div>
              </div>
              {detailDialog.notes && (
                <div className="border-t pt-3">
                  <p className="text-sm font-medium mb-1">비고</p>
                  <p className="text-sm text-muted-foreground">{detailDialog.notes}</p>
                </div>
              )}
              <Button variant="outline" className="w-full" onClick={() => exportVehicleCard(detailDialog)}>
                <Download className="w-4 h-4 mr-2" />
                차량카드 PDF 내보내기
              </Button>
            </div>
          )}
        </ResponsiveDialogContent>
      </ResponsiveDialog>

      <ResponsiveDialog open={!!historyDialog} onOpenChange={(o) => { if (!o) setHistoryDialog(null); }}>
        <ResponsiveDialogContent className="max-w-lg">
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>차량 이력 - {historyDialog?.vehicleNumber}</ResponsiveDialogTitle>
          </ResponsiveDialogHeader>
          {historyDialog && (
            <div className="space-y-4">
              {historyData && historyData.length > 0 ? (
                <div className="relative">
                  <div className="absolute left-4 top-0 bottom-0 w-px bg-border" />
                  <div className="space-y-4">
                    {historyData.map((entry: VehicleHistoryEntry) => (
                      <div key={entry.id} className="relative pl-10">
                        <div className={`absolute left-2.5 top-1.5 w-3 h-3 rounded-full border-2 ${
                          entry.action === "registered" ? "bg-green-500 border-green-300" : "bg-red-500 border-red-300"
                        }`} />
                        <div className="bg-muted/50 rounded-lg p-3">
                          <div className="flex items-center justify-between mb-1">
                            <Badge variant={entry.action === "registered" ? "default" : "destructive"}>
                              {actionLabel(entry.action)}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {new Date(entry.createdAt).toLocaleString("ko-KR")}
                            </span>
                          </div>
                          <p className="text-sm text-muted-foreground">{entry.unit}호 - {entry.vehicleNumber}</p>
                          {entry.notes && <p className="text-xs text-muted-foreground mt-1">{entry.notes}</p>}
                          <p className="text-xs text-muted-foreground mt-1">처리자: {entry.performedBy}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-center py-8">
                  <History className="w-8 h-8 mx-auto text-muted-foreground/30 mb-2" />
                  <p className="text-sm text-muted-foreground">이력이 없습니다</p>
                </div>
              )}
            </div>
          )}
        </ResponsiveDialogContent>
      </ResponsiveDialog>
    </div>
  );
}
