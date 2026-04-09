import { useState } from "react";
import {
  useListVendors,
  useCreateVendor,
  useUpdateVendor,
  useDeleteVendor,
  useGetRecommendedVendors,
  getListVendorsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2, Edit, Building2, Star, Phone, Mail } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const categoryOptions = [
  { value: "elevator", label: "승강기" },
  { value: "water_tank", label: "저수조" },
  { value: "fire_safety", label: "소방" },
  { value: "electrical", label: "전기" },
  { value: "gas", label: "가스" },
  { value: "septic", label: "정화조" },
  { value: "cleaning", label: "청소" },
  { value: "security", label: "보안" },
  { value: "other", label: "기타" },
];

export default function Vendors() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [filterCategory, setFilterCategory] = useState<string | undefined>();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const queryParams = filterCategory && filterCategory !== "all" ? { category: filterCategory } : undefined;
  const { data: vendors, isLoading } = useListVendors(queryParams as any);
  const createMutation = useCreateVendor();
  const updateMutation = useUpdateVendor();
  const deleteMutation = useDeleteVendor();

  const [form, setForm] = useState({
    name: "",
    category: "elevator",
    contactName: "",
    phone: "",
    email: "",
    address: "",
    rating: "",
    isRecommended: false,
    notes: "",
  });

  function resetForm() {
    setForm({ name: "", category: "elevator", contactName: "", phone: "", email: "", address: "", rating: "", isRecommended: false, notes: "" });
    setEditing(null);
  }

  function openEdit(item: any) {
    setEditing(item);
    setForm({
      name: item.name,
      category: item.category,
      contactName: item.contactName || "",
      phone: item.phone || "",
      email: item.email || "",
      address: item.address || "",
      rating: item.rating?.toString() || "",
      isRecommended: item.isRecommended,
      notes: item.notes || "",
    });
    setDialogOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const data = {
      name: form.name,
      category: form.category as any,
      contactName: form.contactName || null,
      phone: form.phone || null,
      email: form.email || null,
      address: form.address || null,
      rating: form.rating ? parseFloat(form.rating) : null,
      isRecommended: form.isRecommended,
      notes: form.notes || null,
    };

    if (editing) {
      await updateMutation.mutateAsync({ id: editing.id, data });
      toast({ title: "업체 정보가 수정되었습니다" });
    } else {
      await createMutation.mutateAsync({ data });
      toast({ title: "업체가 등록되었습니다" });
    }
    queryClient.invalidateQueries({ queryKey: getListVendorsQueryKey() });
    setDialogOpen(false);
    resetForm();
  }

  async function handleDelete(id: number) {
    await deleteMutation.mutateAsync({ id });
    queryClient.invalidateQueries({ queryKey: getListVendorsQueryKey() });
    toast({ title: "업체가 삭제되었습니다" });
  }

  const categoryLabel = (c: string) =>
    categoryOptions.find((o) => o.value === c)?.label || c;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">협력업체 관리</h1>
          <p className="text-muted-foreground text-sm mt-1">
            유지보수 협력업체를 등록하고 견적을 관리합니다
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) resetForm(); }}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              업체 등록
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editing ? "업체 수정" : "새 업체 등록"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>업체명</Label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
                </div>
                <div>
                  <Label>분류</Label>
                  <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {categoryOptions.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>담당자</Label>
                  <Input value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} />
                </div>
                <div>
                  <Label>전화번호</Label>
                  <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>이메일</Label>
                  <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                </div>
                <div>
                  <Label>평점 (1-5)</Label>
                  <Input type="number" min="1" max="5" step="0.1" value={form.rating} onChange={(e) => setForm({ ...form, rating: e.target.value })} />
                </div>
              </div>
              <div>
                <Label>주소</Label>
                <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.isRecommended}
                  onChange={(e) => setForm({ ...form, isRecommended: e.target.checked })}
                  className="w-4 h-4"
                />
                <Label>추천 업체로 등록</Label>
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
        <Select value={filterCategory || "all"} onValueChange={(v) => setFilterCategory(v === "all" ? undefined : v)}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="분류" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 분류</SelectItem>
            {categoryOptions.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-40" />)}
        </div>
      ) : vendors && vendors.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {vendors.map((vendor) => (
            <Card key={vendor.id}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-primary/10">
                      <Building2 className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{vendor.name}</p>
                        {vendor.isRecommended && (
                          <Star className="w-3.5 h-3.5 text-chart-3 fill-chart-3" />
                        )}
                      </div>
                      <Badge variant="outline" className="text-xs mt-1">
                        {categoryLabel(vendor.category)}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(vendor)}>
                      <Edit className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(vendor.id)}>
                      <Trash2 className="w-3.5 h-3.5 text-destructive" />
                    </Button>
                  </div>
                </div>
                <div className="mt-3 space-y-1.5 text-sm text-muted-foreground">
                  {vendor.contactName && <p>{vendor.contactName}</p>}
                  {vendor.phone && (
                    <p className="flex items-center gap-1.5">
                      <Phone className="w-3 h-3" /> {vendor.phone}
                    </p>
                  )}
                  {vendor.email && (
                    <p className="flex items-center gap-1.5">
                      <Mail className="w-3 h-3" /> {vendor.email}
                    </p>
                  )}
                  {vendor.rating && (
                    <p className="flex items-center gap-1">
                      <Star className="w-3 h-3 text-chart-3" />
                      {vendor.rating.toFixed(1)}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <Building2 className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground">등록된 협력업체가 없습니다</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
