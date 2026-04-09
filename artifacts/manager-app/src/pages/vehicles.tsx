import { useState } from "react";
import {
  useListVehicles,
  useCreateVehicle,
  useUpdateVehicle,
  useDeleteVehicle,
  useListTenants,
  getListVehiclesQueryKey,
} from "@workspace/api-client-react";
import type { Vehicle, CreateVehicleBody, ListVehiclesParams, CreateVehicleBodyOwnershipType } from "@workspace/api-client-react";
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
import { Plus, Trash2, Edit, Car, Search, Download, Eye } from "lucide-react";
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
  const [editing, setEditing] = useState<Vehicle | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const queryParams: ListVehiclesParams = {};
  if (searchTerm) queryParams.search = searchTerm;

  const { data: vehicles, isLoading } = useListVehicles(
    Object.keys(queryParams).length > 0 ? queryParams : undefined
  );
  const { data: tenants } = useListTenants({ status: "active" as ListVehiclesParams["search"] });
  const createMutation = useCreateVehicle();
  const updateMutation = useUpdateVehicle();
  const deleteMutation = useDeleteVehicle();

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">차량 관리</h1>
          <p className="text-muted-foreground text-sm mt-1">
            차량등록카드를 관리합니다 (기본차량 + 추가차량 최대 4대)
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) resetForm(); }}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              차량 등록
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editing ? "차량 수정" : "새 차량 등록"}</DialogTitle>
            </DialogHeader>
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
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="차량번호, 호실, 소유자 검색..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}
        </div>
      ) : vehicles && vehicles.length > 0 ? (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>호실</TableHead>
                  <TableHead>차량번호</TableHead>
                  <TableHead>차종/색상</TableHead>
                  <TableHead>소유자</TableHead>
                  <TableHead>구분</TableHead>
                  <TableHead>소유형태</TableHead>
                  <TableHead>서류</TableHead>
                  <TableHead className="text-right">관리</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {vehicles.map((vehicle) => (
                  <TableRow key={vehicle.id}>
                    <TableCell className="font-medium">{vehicle.unit}</TableCell>
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
                      <Badge variant="secondary">{ownershipLabel(vehicle.ownershipType)}</Badge>
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
                        <Button variant="ghost" size="sm" onClick={() => exportVehicleCard(vehicle)}>
                          <Download className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => openEdit(vehicle)}>
                          <Edit className="w-3.5 h-3.5" />
                        </Button>
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
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <Car className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground">등록된 차량이 없습니다</p>
          </CardContent>
        </Card>
      )}

      <Dialog open={!!detailDialog} onOpenChange={(o) => { if (!o) setDetailDialog(null); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>차량등록카드 상세</DialogTitle>
          </DialogHeader>
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
              </div>
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
        </DialogContent>
      </Dialog>
    </div>
  );
}
