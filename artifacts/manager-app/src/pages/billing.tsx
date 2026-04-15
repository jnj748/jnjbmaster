import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  useGetBillingList,
  useGetFeeTrend,
  useSendKakaoNotification,
  useCalculateInterimSettlement,
} from "@workspace/api-client-react";
import type { InterimSettlementResponse } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { motion } from "framer-motion";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import {
  Calculator,
  FileText,
  Send,
  TrendingUp,
  Receipt,
  DollarSign,
  MessageCircle,
  CheckCircle2,
  XCircle,
  Users,
} from "lucide-react";

function formatKrw(n: number) {
  return new Intl.NumberFormat("ko-KR").format(n);
}

const currentMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

export default function Billing() {
  const { toast } = useToast();
  const [month, setMonth] = useState(currentMonth());
  const [interimOpen, setInterimOpen] = useState(false);
  const [searchText, setSearchText] = useState("");

  const [interimForm, setInterimForm] = useState({
    unitNumber: "",
    moveOutDate: new Date().toISOString().slice(0, 10),
    monthlyFee: "250000",
    includeSpecialFund: true,
  });

  const { data: billing = [] } = useGetBillingList({ month });
  const { data: trend = [] } = useGetFeeTrend();
  const kakaoMutation = useSendKakaoNotification();
  const interimMutation = useCalculateInterimSettlement();

  const [interimResult, setInterimResult] = useState<InterimSettlementResponse | null>(null);
  const [selectedUnits, setSelectedUnits] = useState<Set<string>>(new Set());

  const filteredBilling = useMemo(() => {
    if (!searchText) return billing;
    const q = searchText.toLowerCase();
    return billing.filter(
      (b) =>
        b.unitNumber.toLowerCase().includes(q) ||
        (b.ownerName && b.ownerName.toLowerCase().includes(q))
    );
  }, [billing, searchText]);

  const summaryStats = useMemo(() => {
    const total = billing.reduce((s, b) => s + b.totalFee, 0);
    const paid = billing.filter((b) => b.isPaid);
    const unpaid = billing.filter((b) => !b.isPaid);
    const paidAmount = paid.reduce((s, b) => s + b.totalFee, 0);
    const unpaidAmount = unpaid.reduce((s, b) => s + b.totalFee, 0);
    return {
      totalUnits: billing.length,
      totalAmount: total,
      paidCount: paid.length,
      paidAmount,
      unpaidCount: unpaid.length,
      unpaidAmount,
      collectionRate: billing.length > 0 ? Math.round((paid.length / billing.length) * 100) : 0,
    };
  }, [billing]);

  const trendData = useMemo(() => {
    return trend.map((t) => ({
      month: t.month.slice(5),
      우리건물: t.buildingAvg,
      KAPT평균: t.kaptAvg ?? 0,
      전년동기: (t as { priorYearAvg?: number }).priorYearAvg ?? 0,
    }));
  }, [trend]);

  function toggleUnit(unitNumber: string) {
    setSelectedUnits((prev) => {
      const next = new Set(prev);
      if (next.has(unitNumber)) next.delete(unitNumber);
      else next.add(unitNumber);
      return next;
    });
  }

  function selectAllUnpaid() {
    const unpaid = billing.filter((b) => !b.isPaid).map((b) => b.unitNumber);
    setSelectedUnits(new Set(unpaid));
  }

  async function handleKakaoNotify(unitNumbers?: string[]) {
    try {
      const result = await kakaoMutation.mutateAsync({
        data: { month, unitNumbers },
      });
      toast({ title: `알림톡 발송: 성공 ${result.sent}건, 실패 ${result.failed}건` });
      setSelectedUnits(new Set());
    } catch {
      toast({ title: "알림톡 발송에 실패했습니다", variant: "destructive" });
    }
  }

  async function handleInterim() {
    if (!interimForm.unitNumber) {
      toast({ title: "호실을 입력하세요", variant: "destructive" });
      return;
    }
    try {
      const result = await interimMutation.mutateAsync({
        data: {
          unitNumber: interimForm.unitNumber,
          moveOutDate: interimForm.moveOutDate,
          monthlyFee: Number(interimForm.monthlyFee),
          includeSpecialFund: interimForm.includeSpecialFund,
        },
      });
      setInterimResult(result);
    } catch {
      toast({ title: "정산 계산에 실패했습니다", variant: "destructive" });
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold">관리비 부과/수납</h1>
          <p className="text-sm text-muted-foreground">세대별 고지·수납 현황 및 추세를 관리합니다</p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="w-40"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">총 부과</p>
            <p className="text-lg font-bold">{formatKrw(summaryStats.totalAmount)}<span className="text-xs font-normal">원</span></p>
            <p className="text-xs text-muted-foreground">{summaryStats.totalUnits}세대</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-emerald-600">수납 완료</p>
            <p className="text-lg font-bold text-emerald-600">{formatKrw(summaryStats.paidAmount)}<span className="text-xs font-normal">원</span></p>
            <p className="text-xs text-muted-foreground">{summaryStats.paidCount}세대</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-red-500">미수납</p>
            <p className="text-lg font-bold text-red-500">{formatKrw(summaryStats.unpaidAmount)}<span className="text-xs font-normal">원</span></p>
            <p className="text-xs text-muted-foreground">{summaryStats.unpaidCount}세대</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-blue-600">수납률</p>
            <p className="text-lg font-bold text-blue-600">{summaryStats.collectionRate}%</p>
            <div className="h-1.5 bg-gray-200 rounded-full mt-1 overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full transition-all"
                style={{ width: `${summaryStats.collectionRate}%` }}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="w-4 h-4" />
            관리비 추세 비교 (최근 12개월)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {trendData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(v / 10000)}만`} />
                <Tooltip
                  formatter={(value: number) => [`${formatKrw(value)}원`]}
                  labelFormatter={(label) => `${label}월`}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="우리건물" stroke="hsl(199, 89%, 48%)" strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="KAPT평균" stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
                <Line type="monotone" dataKey="전년동기" stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="2 2" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-40 flex items-center justify-center text-sm text-muted-foreground">
              추세 데이터가 없습니다
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center gap-2 flex-wrap">
        <Dialog open={interimOpen} onOpenChange={setInterimOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm">
              <Receipt className="w-4 h-4 mr-1" />
              이사 정산
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>이사 정산 계산</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>호실</Label>
                <Input value={interimForm.unitNumber} onChange={(e) => setInterimForm((p) => ({ ...p, unitNumber: e.target.value }))} placeholder="예: 101" />
              </div>
              <div>
                <Label>퇴거일</Label>
                <Input type="date" value={interimForm.moveOutDate} onChange={(e) => setInterimForm((p) => ({ ...p, moveOutDate: e.target.value }))} />
              </div>
              <div>
                <Label>월 관리비 (원)</Label>
                <Input type="number" value={interimForm.monthlyFee} onChange={(e) => setInterimForm((p) => ({ ...p, monthlyFee: e.target.value }))} />
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="sf" checked={interimForm.includeSpecialFund} onChange={(e) => setInterimForm((p) => ({ ...p, includeSpecialFund: e.target.checked }))} />
                <Label htmlFor="sf">장기수선충당금 포함</Label>
              </div>
              <Button className="w-full" onClick={handleInterim} disabled={interimMutation.isPending}>
                <Calculator className="w-4 h-4 mr-2" />
                정산 계산
              </Button>
            </div>
            {interimResult && (
              <div className="mt-4 border-t pt-4 space-y-2 text-sm">
                <div className="flex justify-between"><span>호실</span><span>{interimResult.unitNumber}호</span></div>
                <div className="flex justify-between"><span>퇴거일</span><span>{interimResult.moveOutDate}</span></div>
                <div className="flex justify-between"><span>거주일수</span><span>{interimResult.residencyDays}/{interimResult.daysInMonth}일</span></div>
                <div className="flex justify-between"><span>일할 관리비</span><span>{formatKrw(interimResult.proRatedFee ?? 0)}원</span></div>
                {(interimResult.specialFundRefund ?? 0) > 0 && (
                  <div className="flex justify-between text-emerald-600"><span>장기수선 환급</span><span>-{formatKrw(interimResult.specialFundRefund ?? 0)}원</span></div>
                )}
                <div className="flex justify-between font-bold border-t pt-2"><span>정산 금액</span><span>{formatKrw(interimResult.totalSettlement ?? 0)}원</span></div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {selectedUnits.size > 0 && (
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="flex items-center gap-2">
            <Button size="sm" onClick={() => handleKakaoNotify(Array.from(selectedUnits))}>
              <MessageCircle className="w-4 h-4 mr-1" />
              선택 {selectedUnits.size}건 알림톡
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setSelectedUnits(new Set())}>
              선택 해제
            </Button>
          </motion.div>
        )}

        <Button variant="ghost" size="sm" onClick={selectAllUnpaid} className="ml-auto">
          <Users className="w-4 h-4 mr-1" />
          미납 전체선택
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="w-4 h-4" />
              세대별 고지/수납 현황 ({month})
            </CardTitle>
            <Input
              placeholder="호실·소유자 검색..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="w-40 h-8 text-xs"
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground bg-muted/30">
                  <th className="p-3 font-medium w-8"></th>
                  <th className="p-3 font-medium">호실</th>
                  <th className="p-3 font-medium">소유자</th>
                  <th className="p-3 font-medium text-right">면적(㎡)</th>
                  <th className="p-3 font-medium text-right">관리비</th>
                  <th className="p-3 font-medium text-center">수납</th>
                  <th className="p-3 font-medium text-center">납기</th>
                  <th className="p-3 font-medium text-center">알림</th>
                </tr>
              </thead>
              <tbody>
                {filteredBilling.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-muted-foreground">
                      {billing.length === 0 ? "관리비 산출 후 고지 내역이 표시됩니다" : "검색 결과가 없습니다"}
                    </td>
                  </tr>
                ) : (
                  filteredBilling.map((b) => (
                    <tr key={b.unitNumber} className={`border-b last:border-0 hover:bg-muted/30 ${selectedUnits.has(b.unitNumber) ? "bg-blue-50" : ""}`}>
                      <td className="p-3">
                        <input
                          type="checkbox"
                          checked={selectedUnits.has(b.unitNumber)}
                          onChange={() => toggleUnit(b.unitNumber)}
                          className="w-3.5 h-3.5"
                        />
                      </td>
                      <td className="p-3 font-medium">{b.unitNumber}호</td>
                      <td className="p-3 text-muted-foreground">{b.ownerName ?? "-"}</td>
                      <td className="p-3 text-right">{b.exclusiveArea}</td>
                      <td className="p-3 text-right font-medium">{formatKrw(b.totalFee)}원</td>
                      <td className="p-3 text-center">
                        {b.isPaid ? (
                          <Badge variant="default" className="text-[10px]">
                            <CheckCircle2 className="w-3 h-3 mr-0.5" /> 완납
                          </Badge>
                        ) : (
                          <Badge variant="destructive" className="text-[10px]">
                            <XCircle className="w-3 h-3 mr-0.5" /> 미납
                          </Badge>
                        )}
                      </td>
                      <td className="p-3 text-center text-xs text-muted-foreground">
                        {b.dueDate ?? "-"}
                      </td>
                      <td className="p-3 text-center">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2"
                          onClick={() => handleKakaoNotify([b.unitNumber])}
                          disabled={kakaoMutation.isPending}
                        >
                          <MessageCircle className="w-3.5 h-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
