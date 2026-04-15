import { useState } from "react";
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
  useCalculateFees,
  useGetBillingList,
  useGetFeeTrend,
  useSendKakaoNotification,
  useCalculateInterimSettlement,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import {
  Calculator,
  FileText,
  Send,
  TrendingUp,
  Receipt,
  DollarSign,
  Building2,
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
  const [calcOpen, setCalcOpen] = useState(false);
  const [interimOpen, setInterimOpen] = useState(false);

  const [calcForm, setCalcForm] = useState({
    commonMaintenanceFee: "3000000",
    specialFund: "500000",
    utilityTotal: "1500000",
  });

  const [interimForm, setInterimForm] = useState({
    unitNumber: "",
    moveOutDate: new Date().toISOString().slice(0, 10),
    monthlyFee: "250000",
    includeSpecialFund: true,
  });

  const { data: billing = [] } = useGetBillingList({ month });
  const { data: trend = [] } = useGetFeeTrend();
  const calcMutation = useCalculateFees();
  const kakaoMutation = useSendKakaoNotification();
  const interimMutation = useCalculateInterimSettlement();

  const [calcResult, setCalcResult] = useState<any>(null);
  const [interimResult, setInterimResult] = useState<any>(null);

  async function handleCalculate() {
    try {
      const result = await calcMutation.mutateAsync({
        data: {
          month,
          commonMaintenanceFee: Number(calcForm.commonMaintenanceFee),
          specialFund: Number(calcForm.specialFund),
          utilityTotal: Number(calcForm.utilityTotal),
        },
      });
      setCalcResult(result);
      toast({ title: `${result.totalUnits}세대 관리비가 산출되었습니다` });
    } catch {
      toast({ title: "산출에 실패했습니다", variant: "destructive" });
    }
  }

  async function handleKakaoNotify() {
    try {
      const result = await kakaoMutation.mutateAsync({
        data: { month },
      });
      toast({ title: `알림톡 발송: 성공 ${result.sent}건, 실패 ${result.failed}건` });
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
          <p className="text-sm text-muted-foreground">관리비 산출, 고지서 발행, 수납 현황을 관리합니다</p>
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

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Dialog open={calcOpen} onOpenChange={setCalcOpen}>
          <DialogTrigger asChild>
            <Card className="cursor-pointer hover:shadow-md transition-shadow">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-500/10">
                  <Calculator className="w-5 h-5 text-blue-500" />
                </div>
                <div>
                  <p className="text-sm font-medium">관리비 산출</p>
                  <p className="text-xs text-muted-foreground">전유면적 비례 배분</p>
                </div>
              </CardContent>
            </Card>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>관리비 산출 ({month})</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>공용관리비 (원)</Label>
                <Input type="number" value={calcForm.commonMaintenanceFee} onChange={(e) => setCalcForm((p) => ({ ...p, commonMaintenanceFee: e.target.value }))} />
              </div>
              <div>
                <Label>장기수선충당금 (원)</Label>
                <Input type="number" value={calcForm.specialFund} onChange={(e) => setCalcForm((p) => ({ ...p, specialFund: e.target.value }))} />
              </div>
              <div>
                <Label>공과금 합계 (원)</Label>
                <Input type="number" value={calcForm.utilityTotal} onChange={(e) => setCalcForm((p) => ({ ...p, utilityTotal: e.target.value }))} />
              </div>
              <Button className="w-full" onClick={handleCalculate} disabled={calcMutation.isPending}>
                <Calculator className="w-4 h-4 mr-2" />
                산출하기
              </Button>
            </div>
            {calcResult && (
              <div className="mt-4 border-t pt-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span>총 세대: {calcResult.totalUnits}</span>
                  <span className="font-bold">합계: {formatKrw(calcResult.grandTotal)}원</span>
                </div>
                <div className="max-h-60 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b text-muted-foreground">
                        <th className="p-2 text-left">호실</th>
                        <th className="p-2 text-right">면적</th>
                        <th className="p-2 text-right">비율</th>
                        <th className="p-2 text-right">합계</th>
                      </tr>
                    </thead>
                    <tbody>
                      {calcResult.items.map((item: any) => (
                        <tr key={item.unitNumber} className="border-b">
                          <td className="p-2">{item.unitNumber}호</td>
                          <td className="p-2 text-right">{item.exclusiveArea}㎡</td>
                          <td className="p-2 text-right">{item.areaRatio}%</td>
                          <td className="p-2 text-right font-medium">{formatKrw(item.totalFee)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={handleKakaoNotify}>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-yellow-500/10">
              <Send className="w-5 h-5 text-yellow-600" />
            </div>
            <div>
              <p className="text-sm font-medium">카카오 알림톡</p>
              <p className="text-xs text-muted-foreground">고지서 발송 (시뮬레이션)</p>
            </div>
          </CardContent>
        </Card>

        <Dialog open={interimOpen} onOpenChange={setInterimOpen}>
          <DialogTrigger asChild>
            <Card className="cursor-pointer hover:shadow-md transition-shadow">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="p-2 rounded-lg bg-emerald-500/10">
                  <Receipt className="w-5 h-5 text-emerald-500" />
                </div>
                <div>
                  <p className="text-sm font-medium">이사 정산</p>
                  <p className="text-xs text-muted-foreground">일할 계산</p>
                </div>
              </CardContent>
            </Card>
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
                <div className="flex justify-between"><span>일할 관리비</span><span>{formatKrw(interimResult.proRatedFee)}원</span></div>
                {interimResult.specialFundRefund > 0 && (
                  <div className="flex justify-between text-emerald-600"><span>장기수선 환급</span><span>-{formatKrw(interimResult.specialFundRefund)}원</span></div>
                )}
                <div className="flex justify-between font-bold border-t pt-2"><span>정산 금액</span><span>{formatKrw(interimResult.totalSettlement)}원</span></div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="w-4 h-4" />
            관리비 추세 (최근 12개월)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-40 flex items-end gap-1">
            {trend.map((t) => {
              const max = Math.max(...trend.map((x) => x.buildingAvg));
              const h = max > 0 ? (t.buildingAvg / max) * 100 : 0;
              return (
                <div key={t.month} className="flex-1 flex flex-col items-center gap-1">
                  <div
                    className="w-full bg-primary/20 rounded-t relative group"
                    style={{ height: `${h}%`, minHeight: 4 }}
                  >
                    <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-[9px] text-muted-foreground opacity-0 group-hover:opacity-100 whitespace-nowrap">
                      {formatKrw(t.buildingAvg)}
                    </div>
                  </div>
                  <span className="text-[8px] text-muted-foreground">{t.month.slice(5)}</span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="w-4 h-4" />
            세대별 고지/수납 현황 ({month})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="p-3 font-medium">호실</th>
                  <th className="p-3 font-medium text-right">면적(㎡)</th>
                  <th className="p-3 font-medium text-right">관리비</th>
                  <th className="p-3 font-medium">수납</th>
                </tr>
              </thead>
              <tbody>
                {billing.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-8 text-center text-muted-foreground">
                      관리비 산출 후 고지 내역이 표시됩니다
                    </td>
                  </tr>
                ) : (
                  billing.map((b) => (
                    <tr key={b.unitNumber} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="p-3 font-medium">{b.unitNumber}호</td>
                      <td className="p-3 text-right">{b.exclusiveArea}</td>
                      <td className="p-3 text-right">{formatKrw(b.totalFee)}원</td>
                      <td className="p-3">
                        <Badge variant={b.isPaid ? "default" : "destructive"} className="text-[10px]">
                          {b.isPaid ? "완납" : "미납"}
                        </Badge>
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
