import { useState } from "react";
import {
  useListCommissions,
  useCreateCommission,
  useUpdateCommission,
  useListVendors,
  getListCommissionsQueryKey,
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
import { Plus, Coins, TrendingUp, Clock, CheckCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/utils";

export default function Commissions() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: commissions, isLoading } = useListCommissions();
  const { data: vendors } = useListVendors();
  const createMutation = useCreateCommission();
  const updateMutation = useUpdateCommission();

  const [form, setForm] = useState({
    vendorId: "",
    vendorName: "",
    contractAmount: "",
    commissionRate: "",
    commissionAmount: "",
    matchedDate: "",
    notes: "",
  });

  function resetForm() {
    setForm({ vendorId: "", vendorName: "", contractAmount: "", commissionRate: "", commissionAmount: "", matchedDate: "", notes: "" });
  }

  function handleVendorSelect(vendorId: string) {
    const vendor = vendors?.find((v) => v.id.toString() === vendorId);
    setForm({
      ...form,
      vendorId,
      vendorName: vendor?.name || "",
    });
  }

  function handleAmountChange(contractAmount: string, commissionRate: string) {
    const amount = parseFloat(contractAmount) || 0;
    const rate = parseFloat(commissionRate) || 0;
    const commissionAmount = (amount * rate / 100).toFixed(0);
    setForm({ ...form, contractAmount, commissionRate, commissionAmount });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const data = {
      vendorId: parseInt(form.vendorId),
      vendorName: form.vendorName,
      contractAmount: parseFloat(form.contractAmount),
      commissionRate: parseFloat(form.commissionRate),
      commissionAmount: parseFloat(form.commissionAmount),
      matchedDate: form.matchedDate,
      notes: form.notes || null,
    };

    await createMutation.mutateAsync({ data });
    queryClient.invalidateQueries({ queryKey: getListCommissionsQueryKey() });
    toast({ title: "수수료 내역이 등록되었습니다" });
    setDialogOpen(false);
    resetForm();
  }

  async function handleStatusChange(id: number, status: string) {
    await updateMutation.mutateAsync({ id, data: { status: status as any } });
    queryClient.invalidateQueries({ queryKey: getListCommissionsQueryKey() });
    toast({ title: "상태가 변경되었습니다" });
  }

  const total = commissions?.reduce((s, c) => s + c.commissionAmount, 0) ?? 0;
  const paid = commissions?.filter((c) => c.status === "paid").reduce((s, c) => s + c.commissionAmount, 0) ?? 0;
  const pending = commissions?.filter((c) => c.status === "pending" || c.status === "confirmed").reduce((s, c) => s + c.commissionAmount, 0) ?? 0;

  const statusLabel = (s: string) => {
    switch (s) {
      case "pending": return "대기";
      case "confirmed": return "확정";
      case "paid": return "지급완료";
      case "cancelled": return "취소";
      default: return s;
    }
  };

  const statusColor = (s: string) => {
    switch (s) {
      case "paid": return "outline";
      case "confirmed": return "secondary";
      case "pending": return "secondary";
      case "cancelled": return "destructive";
      default: return "outline" as const;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">수수료 관리</h1>
          <p className="text-muted-foreground text-sm mt-1">
            업체 매칭 수수료 현황을 관리합니다
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) resetForm(); }}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              수수료 등록
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>새 수수료 등록</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label>업체</Label>
                <Select value={form.vendorId} onValueChange={handleVendorSelect}>
                  <SelectTrigger><SelectValue placeholder="업체 선택" /></SelectTrigger>
                  <SelectContent>
                    {vendors?.map((v) => (
                      <SelectItem key={v.id} value={v.id.toString()}>{v.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>계약 금액 (원)</Label>
                  <Input
                    type="number"
                    value={form.contractAmount}
                    onChange={(e) => handleAmountChange(e.target.value, form.commissionRate)}
                    required
                  />
                </div>
                <div>
                  <Label>수수료율 (%)</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={form.commissionRate}
                    onChange={(e) => handleAmountChange(form.contractAmount, e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>수수료 금액 (원)</Label>
                  <Input type="number" value={form.commissionAmount} onChange={(e) => setForm({ ...form, commissionAmount: e.target.value })} required />
                </div>
                <div>
                  <Label>매칭일</Label>
                  <Input type="date" value={form.matchedDate} onChange={(e) => setForm({ ...form, matchedDate: e.target.value })} required />
                </div>
              </div>
              <div>
                <Label>비고</Label>
                <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
              <Button type="submit" className="w-full">등록</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-chart-4/10">
                <TrendingUp className="w-5 h-5 text-chart-4" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">총 수수료</p>
                <p className="text-xl font-bold">{total.toLocaleString()}원</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-chart-2/10">
                <CheckCircle className="w-5 h-5 text-chart-2" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">지급 완료</p>
                <p className="text-xl font-bold">{paid.toLocaleString()}원</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-chart-3/10">
                <Clock className="w-5 h-5 text-chart-3" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">미수금</p>
                <p className="text-xl font-bold">{pending.toLocaleString()}원</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20" />)}
        </div>
      ) : commissions && commissions.length > 0 ? (
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-3 font-medium">업체</th>
                  <th className="text-right p-3 font-medium">계약금액</th>
                  <th className="text-right p-3 font-medium">수수료율</th>
                  <th className="text-right p-3 font-medium">수수료</th>
                  <th className="text-center p-3 font-medium">매칭일</th>
                  <th className="text-center p-3 font-medium">상태</th>
                  <th className="text-center p-3 font-medium">관리</th>
                </tr>
              </thead>
              <tbody>
                {commissions.map((c) => (
                  <tr key={c.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="p-3 font-medium">{c.vendorName}</td>
                    <td className="p-3 text-right">{c.contractAmount.toLocaleString()}원</td>
                    <td className="p-3 text-right">{c.commissionRate}%</td>
                    <td className="p-3 text-right font-medium">{c.commissionAmount.toLocaleString()}원</td>
                    <td className="p-3 text-center">{formatDate(c.matchedDate)}</td>
                    <td className="p-3 text-center">
                      <Badge variant={statusColor(c.status) as any}>
                        {statusLabel(c.status)}
                      </Badge>
                    </td>
                    <td className="p-3 text-center">
                      <Select value={c.status} onValueChange={(v) => handleStatusChange(c.id, v)}>
                        <SelectTrigger className="h-8 w-24 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pending">대기</SelectItem>
                          <SelectItem value="confirmed">확정</SelectItem>
                          <SelectItem value="paid">지급완료</SelectItem>
                          <SelectItem value="cancelled">취소</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <Coins className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground">등록된 수수료 내역이 없습니다</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
