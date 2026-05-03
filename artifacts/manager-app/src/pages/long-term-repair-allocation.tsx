// [Task #797] 장기수선충당금 산출 — 호실/면적 데이터를 기반으로 AI 가
//   호실별 산출액을 자동 계산한다. 사용자는 항목·기간·총액·산출 기준만
//   고른다(수기 호실별 입력 X). 산출 결과는 미리보기 후 확정 저장.
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/page-header";
import { Sparkles, Save, Calculator } from "lucide-react";
import { apiGet, apiSend } from "@/lib/residents-extras-api";

interface UnitBase {
  id: number;
  unitNumber: string;
  dong: string;
  supplyArea: string | null;
  exclusiveArea: string | null;
}
interface Allocation {
  id: number;
  itemCategory: string | null;
  calcMethod: "supply_area" | "exclusive_area" | "equal";
  calcDate: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  unitResults: { unit: string; area: number; amount: number }[];
  totalAmount: number;
  status: "draft" | "confirmed";
  createdAt: string;
}

const fmt = (n: number) => Math.round(n).toLocaleString("ko-KR") + "원";

export default function LongTermRepairAllocationPage() {
  const { token } = useAuth();
  const { toast } = useToast();

  const [units, setUnits] = useState<UnitBase[]>([]);
  const [history, setHistory] = useState<Allocation[]>([]);

  const [itemCategory, setItemCategory] = useState("장기수선충당금");
  const [calcMethod, setCalcMethod] = useState<"supply_area" | "exclusive_area" | "equal">("supply_area");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [totalAmount, setTotalAmount] = useState<string>("0");
  const [preview, setPreview] = useState<{ unit: string; area: number; amount: number }[] | null>(null);

  useEffect(() => {
    if (!token) return;
    apiGet<UnitBase[]>(`/long-term-repair-allocations/units-base`, token).then(setUnits).catch(() => {});
    apiGet<Allocation[]>(`/long-term-repair-allocations`, token).then(setHistory).catch(() => {});
  }, [token]);

  const compute = () => {
    const total = Number(totalAmount.replace(/,/g, "")) || 0;
    if (total <= 0) {
      toast({ title: "총액을 입력하세요", variant: "destructive" });
      return;
    }
    const items = units.map((u) => {
      const supply = Number(u.supplyArea ?? 0);
      const excl = Number(u.exclusiveArea ?? 0);
      const area = calcMethod === "supply_area" ? supply : calcMethod === "exclusive_area" ? excl : 1;
      return { unit: `${u.dong ? u.dong + " " : ""}${u.unitNumber}`, area };
    });
    const sumArea = items.reduce((a, b) => a + b.area, 0);
    if (sumArea <= 0) {
      toast({ title: "면적 정보가 부족합니다", description: "호실관리에서 분양/전용 면적을 먼저 입력해 주세요.", variant: "destructive" });
      return;
    }
    const result = items.map((i) => ({
      ...i,
      amount: calcMethod === "equal" ? total / items.length : (total * i.area) / sumArea,
    }));
    setPreview(result);
  };

  const totalsPreview = useMemo(() => {
    if (!preview) return 0;
    return preview.reduce((a, b) => a + b.amount, 0);
  }, [preview]);

  const save = async () => {
    if (!token || !preview) return;
    try {
      await apiSend(`/long-term-repair-allocations`, "POST", token, {
        itemCategory,
        calcMethod,
        calcDate: new Date().toISOString().slice(0, 10),
        periodStart: periodStart || null,
        periodEnd: periodEnd || null,
        unitResults: preview,
        unitPrices: [],
        disclosures: [],
        totalAmount: Math.round(totalsPreview),
        status: "confirmed",
      });
      toast({ title: "산출 결과가 저장되었습니다" });
      setPreview(null);
      const list = await apiGet<Allocation[]>(`/long-term-repair-allocations`, token);
      setHistory(list);
    } catch (e) {
      toast({ title: "저장 실패", description: String(e), variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="장기수선충당금 산출"
        description="총액과 산출 기준만 입력하면 호실별 분담액을 자동 계산합니다."
      />

      <Card>
        <CardContent className="pt-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="space-y-1">
              <Label>항목</Label>
              <Input value={itemCategory} onChange={(e) => setItemCategory(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>산출 기준</Label>
              <Select value={calcMethod} onValueChange={(v) => setCalcMethod(v as typeof calcMethod)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="supply_area">분양면적</SelectItem>
                  <SelectItem value="exclusive_area">전용면적</SelectItem>
                  <SelectItem value="equal">균등</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>적립 기간 시작</Label>
              <Input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>적립 기간 종료</Label>
              <Input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label>총 산출 금액</Label>
              <Input
                value={totalAmount}
                onChange={(e) => setTotalAmount(e.target.value.replace(/[^\d,]/g, ""))}
                placeholder="예: 12,000,000"
              />
            </div>
            <div className="md:col-span-2 flex items-end gap-2">
              <Button onClick={compute}>
                <Calculator className="w-4 h-4 mr-1" /> 자동 산출
              </Button>
              {preview && (
                <Button variant="default" onClick={save}>
                  <Save className="w-4 h-4 mr-1" /> 결과 저장(확정)
                </Button>
              )}
            </div>
          </div>

          <div className="text-sm text-muted-foreground">
            대상 호실 {units.length}개 · 총 면적{" "}
            {units
              .reduce((a, u) => a + Number(calcMethod === "exclusive_area" ? u.exclusiveArea ?? 0 : u.supplyArea ?? 0), 0)
              .toFixed(2)}
            ㎡
          </div>
        </CardContent>
      </Card>

      {preview && (
        <Card>
          <CardContent className="pt-4 space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-violet-600" /> 산출 미리보기
              </h3>
              <span className="text-sm text-muted-foreground">합계 {fmt(totalsPreview)}</span>
            </div>
            <div className="overflow-x-auto max-h-[420px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>호실</TableHead>
                    <TableHead className="text-right">기준값</TableHead>
                    <TableHead className="text-right">분담액</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.map((r) => (
                    <TableRow key={r.unit}>
                      <TableCell className="font-medium">{r.unit}</TableCell>
                      <TableCell className="text-right">{r.area.toFixed(2)}</TableCell>
                      <TableCell className="text-right">{fmt(r.amount)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="pt-4 space-y-2">
          <h3 className="font-semibold">최근 산출 이력</h3>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">아직 저장된 산출 이력이 없습니다.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>산출일</TableHead>
                    <TableHead>항목</TableHead>
                    <TableHead>기준</TableHead>
                    <TableHead>적립기간</TableHead>
                    <TableHead className="text-right">총액</TableHead>
                    <TableHead>상태</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.map((h) => (
                    <TableRow key={h.id}>
                      <TableCell>{h.calcDate ?? "-"}</TableCell>
                      <TableCell>{h.itemCategory ?? "-"}</TableCell>
                      <TableCell>
                        {h.calcMethod === "supply_area"
                          ? "분양면적"
                          : h.calcMethod === "exclusive_area"
                          ? "전용면적"
                          : "균등"}
                      </TableCell>
                      <TableCell>
                        {h.periodStart ?? "-"} ~ {h.periodEnd ?? "-"}
                      </TableCell>
                      <TableCell className="text-right">{fmt(h.totalAmount)}</TableCell>
                      <TableCell>
                        <Badge variant={h.status === "confirmed" ? "default" : "outline"}>
                          {h.status === "confirmed" ? "확정" : "초안"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
