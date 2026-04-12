import { useState } from "react";
import {
  useListOwners,
  useCreateOwner,
  useUpdateOwner,
  useDeleteOwner,
  getListOwnersQueryKey,
} from "@workspace/api-client-react";
import type { Owner, CreateOwnerBody, ListOwnersParams } from "@workspace/api-client-react";
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
import { Plus, Trash2, Edit, UserCheck, Search, Download, Eye, ShieldAlert } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import jsPDF from "jspdf";

const emptyForm = {
  unit: "",
  ownerName: "",
  birthDate: "",
  phone: "",
  interiorStartDate: "",
  moveInDate: "",
  moveOutDate: "",
  companyName: "",
  businessNumber: "",
  email: "",
  registeredAddress: "",
  vehicleNumber: "",
  vehicleType: "",
  hasTv: false,
  notes: "",
  businessRegDoc: false,
  idDoc: false,
  propertyDoc: false,
  privacyConsentDate: "",
};

export default function Owners() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailDialog, setDetailDialog] = useState<Owner | null>(null);
  const [editing, setEditing] = useState<Owner | null>(null);
  const [filterStatus, setFilterStatus] = useState<string | undefined>();
  const [searchTerm, setSearchTerm] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const queryParams: ListOwnersParams = {};
  if (filterStatus && filterStatus !== "all") queryParams.status = filterStatus as ListOwnersParams["status"];
  if (searchTerm) queryParams.search = searchTerm;

  const { data: owners, isLoading } = useListOwners(
    Object.keys(queryParams).length > 0 ? queryParams : undefined
  );
  const createMutation = useCreateOwner();
  const updateMutation = useUpdateOwner();
  const deleteMutation = useDeleteOwner();

  const [form, setForm] = useState({ ...emptyForm });

  function resetForm() {
    setForm({ ...emptyForm });
    setEditing(null);
  }

  function openEdit(item: Owner) {
    setEditing(item);
    setForm({
      unit: item.unit,
      ownerName: item.ownerName,
      birthDate: item.birthDate || "",
      phone: item.phone || "",
      interiorStartDate: item.interiorStartDate || "",
      moveInDate: item.moveInDate || "",
      moveOutDate: item.moveOutDate || "",
      companyName: item.companyName || "",
      businessNumber: item.businessNumber || "",
      email: item.email || "",
      registeredAddress: item.registeredAddress || "",
      vehicleNumber: item.vehicleNumber || "",
      vehicleType: item.vehicleType || "",
      hasTv: item.hasTv,
      notes: item.notes || "",
      businessRegDoc: item.businessRegDoc,
      idDoc: item.idDoc,
      propertyDoc: item.propertyDoc,
      privacyConsentDate: item.privacyConsentDate || "",
    });
    setDialogOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const data: CreateOwnerBody = {
      unit: form.unit,
      ownerName: form.ownerName,
      birthDate: form.birthDate || null,
      phone: form.phone || null,
      interiorStartDate: form.interiorStartDate || null,
      moveInDate: form.moveInDate || null,
      moveOutDate: form.moveOutDate || null,
      companyName: form.companyName || null,
      businessNumber: form.businessNumber || null,
      email: form.email || null,
      registeredAddress: form.registeredAddress || null,
      vehicleNumber: form.vehicleNumber || null,
      vehicleType: form.vehicleType || null,
      hasTv: form.hasTv,
      notes: form.notes || null,
      businessRegDoc: form.businessRegDoc,
      idDoc: form.idDoc,
      propertyDoc: form.propertyDoc,
      privacyConsentDate: form.privacyConsentDate ? new Date(form.privacyConsentDate).toISOString() : null,
    };

    if (editing) {
      await updateMutation.mutateAsync({ id: editing.id, data });
      toast({ title: "소유자 정보가 수정되었습니다" });
    } else {
      await createMutation.mutateAsync({ data });
      toast({ title: "소유자가 등록되었습니다" });
    }
    queryClient.invalidateQueries({ queryKey: getListOwnersQueryKey() });
    setDialogOpen(false);
    resetForm();
  }

  async function handleDelete(id: number) {
    await deleteMutation.mutateAsync({ id });
    queryClient.invalidateQueries({ queryKey: getListOwnersQueryKey() });
    toast({ title: "소유자가 삭제되었습니다" });
  }

  function exportOwnerCard(owner: Owner) {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text("소유자카드", 20, 20);
    doc.setFontSize(10);
    const lines = [
      `호실: ${owner.unit}`,
      `소유자명: ${owner.ownerName}`,
      `생년월일: ${owner.birthDate || "-"}`,
      `휴대폰: ${owner.phone || "-"}`,
      `인테리어 개시일: ${owner.interiorStartDate || "-"}`,
      `입주일: ${owner.moveInDate || "-"}`,
      `퇴거일: ${owner.moveOutDate || "-"}`,
      `상호명(법인): ${owner.companyName || "-"}`,
      `사업자등록번호: ${owner.businessNumber || "-"}`,
      `이메일: ${owner.email || "-"}`,
      `주민등록주소: ${owner.registeredAddress || "-"}`,
      `차량번호: ${owner.vehicleNumber || "-"}`,
      `차종: ${owner.vehicleType || "-"}`,
      `TV소유: ${owner.hasTv ? "예" : "아니오"}`,
      `기타사항: ${owner.notes || "-"}`,
      ``,
      `[제출서류]`,
      `사업자등록증: ${owner.businessRegDoc ? "O" : "X"}`,
      `신분증 사본: ${owner.idDoc ? "O" : "X"}`,
      `부동산등본: ${owner.propertyDoc ? "O" : "X"}`,
      ``,
      `개인정보 동의일시: ${owner.privacyConsentDate ? new Date(owner.privacyConsentDate).toLocaleString("ko-KR") : "-"}`,
    ];
    lines.forEach((line, i) => {
      doc.text(line, 20, 35 + i * 7);
    });
    doc.save(`소유자카드_${owner.unit}_${owner.ownerName}.pdf`);
    toast({ title: "소유자카드 PDF가 내보내기되었습니다" });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">소유자 관리</h1>
          <p className="text-muted-foreground text-sm mt-1">
            소유자카드를 등록하고 관리합니다
          </p>
        </div>
        <ResponsiveDialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) resetForm(); }}>
          <ResponsiveDialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              소유자 등록
            </Button>
          </ResponsiveDialogTrigger>
          <ResponsiveDialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <ResponsiveDialogHeader>
              <ResponsiveDialogTitle>{editing ? "소유자 수정" : "새 소유자 등록"}</ResponsiveDialogTitle>
            </ResponsiveDialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>호실 *</Label>
                  <Input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} required />
                </div>
                <div>
                  <Label>소유자명 *</Label>
                  <Input value={form.ownerName} onChange={(e) => setForm({ ...form, ownerName: e.target.value })} required />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>생년월일</Label>
                  <Input type="date" value={form.birthDate} onChange={(e) => setForm({ ...form, birthDate: e.target.value })} />
                </div>
                <div>
                  <Label>휴대폰</Label>
                  <Input type="tel" inputMode="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="010-0000-0000" />
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
                <Label>이메일</Label>
                <Input type="email" inputMode="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div>
                <Label>주민등록주소</Label>
                <Input value={form.registeredAddress} onChange={(e) => setForm({ ...form, registeredAddress: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>차량번호</Label>
                  <Input value={form.vehicleNumber} onChange={(e) => setForm({ ...form, vehicleNumber: e.target.value })} />
                </div>
                <div>
                  <Label>차종</Label>
                  <Input value={form.vehicleType} onChange={(e) => setForm({ ...form, vehicleType: e.target.value })} />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox checked={form.hasTv} onCheckedChange={(v) => setForm({ ...form, hasTv: !!v })} />
                <Label>TV 소유</Label>
              </div>

              <div className="border-t pt-4">
                <p className="text-sm font-medium mb-3">제출서류 체크리스트</p>
                <div className="flex flex-wrap gap-4">
                  <div className="flex items-center gap-2">
                    <Checkbox checked={form.businessRegDoc} onCheckedChange={(v) => setForm({ ...form, businessRegDoc: !!v })} />
                    <Label>사업자등록증</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox checked={form.idDoc} onCheckedChange={(v) => setForm({ ...form, idDoc: !!v })} />
                    <Label>신분증 사본</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox checked={form.propertyDoc} onCheckedChange={(v) => setForm({ ...form, propertyDoc: !!v })} />
                    <Label>부동산등본</Label>
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
          </ResponsiveDialogContent>
        </ResponsiveDialog>
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
      ) : owners && owners.length > 0 ? (
        <>
        <div className="hidden desktop:block">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>호실</TableHead>
                    <TableHead>소유자명</TableHead>
                    <TableHead>휴대폰</TableHead>
                    <TableHead>입주일</TableHead>
                    <TableHead>상태</TableHead>
                    <TableHead>서류</TableHead>
                    <TableHead className="text-right">관리</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {owners.map((owner) => (
                    <TableRow key={owner.id}>
                      <TableCell className="font-medium">{owner.unit}</TableCell>
                      <TableCell>{owner.ownerName}</TableCell>
                      <TableCell className="text-muted-foreground">{owner.phone || "-"}</TableCell>
                      <TableCell className="text-muted-foreground">{owner.moveInDate || "-"}</TableCell>
                      <TableCell>
                        <Badge variant={owner.status === "active" ? "default" : owner.status === "destroyed" ? "destructive" : "secondary"}>
                          {owner.status === "active" ? "입주중" : owner.status === "destroyed" ? "파기완료" : "퇴거"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {owner.businessRegDoc && <Badge variant="outline" className="text-xs">사업자</Badge>}
                          {owner.idDoc && <Badge variant="outline" className="text-xs">신분증</Badge>}
                          {owner.propertyDoc && <Badge variant="outline" className="text-xs">등본</Badge>}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => setDetailDialog(owner)}>
                            <Eye className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => exportOwnerCard(owner)}>
                            <Download className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => openEdit(owner)}>
                            <Edit className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => handleDelete(owner.id)}>
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
        <div className="desktop:hidden space-y-3">
          {owners.map((owner) => (
            <Card key={owner.id} className="active:bg-muted/50">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{owner.unit}호</span>
                    <span className="text-sm">{owner.ownerName}</span>
                  </div>
                  <Badge variant={owner.status === "active" ? "default" : owner.status === "destroyed" ? "destructive" : "secondary"} className="text-xs">
                    {owner.status === "active" ? "입주중" : owner.status === "destroyed" ? "파기완료" : "퇴거"}
                  </Badge>
                </div>
                <div className="text-sm text-muted-foreground space-y-0.5">
                  {owner.phone && <p>{owner.phone}</p>}
                  {owner.moveInDate && <p>입주일: {owner.moveInDate}</p>}
                </div>
                {(owner.businessRegDoc || owner.idDoc || owner.propertyDoc) && (
                  <div className="flex gap-1 mt-2">
                    {owner.businessRegDoc && <Badge variant="outline" className="text-xs">사업자</Badge>}
                    {owner.idDoc && <Badge variant="outline" className="text-xs">신분증</Badge>}
                    {owner.propertyDoc && <Badge variant="outline" className="text-xs">등본</Badge>}
                  </div>
                )}
                <div className="flex justify-end gap-1 mt-3 border-t pt-2">
                  <Button variant="ghost" size="sm" className="h-9 w-9 p-0" onClick={() => setDetailDialog(owner)}>
                    <Eye className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="sm" className="h-9 w-9 p-0" onClick={() => exportOwnerCard(owner)}>
                    <Download className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="sm" className="h-9 w-9 p-0" onClick={() => openEdit(owner)}>
                    <Edit className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="sm" className="h-9 w-9 p-0" onClick={() => handleDelete(owner.id)}>
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        </>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <UserCheck className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground">등록된 소유자가 없습니다</p>
          </CardContent>
        </Card>
      )}

      <ResponsiveDialog open={!!detailDialog} onOpenChange={(o) => { if (!o) setDetailDialog(null); }}>
        <ResponsiveDialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>소유자카드 상세</ResponsiveDialogTitle>
          </ResponsiveDialogHeader>
          {detailDialog && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><span className="text-muted-foreground">호실:</span> <span className="font-medium">{detailDialog.unit}</span></div>
                <div><span className="text-muted-foreground">소유자명:</span> <span className="font-medium">{detailDialog.ownerName}</span></div>
                <div><span className="text-muted-foreground">생년월일:</span> {detailDialog.birthDate || "-"}</div>
                <div><span className="text-muted-foreground">휴대폰:</span> {detailDialog.phone || "-"}</div>
                <div><span className="text-muted-foreground">인테리어 개시일:</span> {detailDialog.interiorStartDate || "-"}</div>
                <div><span className="text-muted-foreground">입주일:</span> {detailDialog.moveInDate || "-"}</div>
                <div><span className="text-muted-foreground">퇴거일:</span> {detailDialog.moveOutDate || "-"}</div>
                <div><span className="text-muted-foreground">상호명:</span> {detailDialog.companyName || "-"}</div>
                <div><span className="text-muted-foreground">사업자등록번호:</span> {detailDialog.businessNumber || "-"}</div>
                <div><span className="text-muted-foreground">이메일:</span> {detailDialog.email || "-"}</div>
                <div className="col-span-2"><span className="text-muted-foreground">주민등록주소:</span> {detailDialog.registeredAddress || "-"}</div>
                <div><span className="text-muted-foreground">차량번호:</span> {detailDialog.vehicleNumber || "-"}</div>
                <div><span className="text-muted-foreground">차종:</span> {detailDialog.vehicleType || "-"}</div>
                <div><span className="text-muted-foreground">TV소유:</span> {detailDialog.hasTv ? "예" : "아니오"}</div>
              </div>
              <div className="border-t pt-3">
                <p className="text-sm font-medium mb-2">제출서류</p>
                <div className="flex gap-3 text-sm">
                  <span>{detailDialog.businessRegDoc ? "O" : "X"} 사업자등록증</span>
                  <span>{detailDialog.idDoc ? "O" : "X"} 신분증 사본</span>
                  <span>{detailDialog.propertyDoc ? "O" : "X"} 부동산등본</span>
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
              <Button variant="outline" className="w-full" onClick={() => exportOwnerCard(detailDialog)}>
                <Download className="w-4 h-4 mr-2" />
                소유자카드 PDF 내보내기
              </Button>
            </div>
          )}
        </ResponsiveDialogContent>
      </ResponsiveDialog>
    </div>
  );
}
