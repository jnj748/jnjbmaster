// [Task #797] 중간 정산서 조회 — 발생 금액·마감 금액·당월 부과 금액 등을
//   호실/월 기준으로 자동 집계해 보여준다(읽기 전용 + 메모 추가만).
//   수기 입력 폼은 두지 않는다(컨셉: 부과/마감 엔진의 결과를 그대로 노출).
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/page-header";
import { RefreshCw, Receipt } from "lucide-react";
import { apiGet } from "@/lib/residents-extras-api";

interface InterimSettlement {
  id: number;
  unit: string;
  billingMonth: string;
  closingAmount: number;
  monthAmount: number;
  occurredAmount: number;
  applyLateFee: boolean;
  notes: string | null;
  status: "draft" | "confirmed";
  createdAt: string;
}

const fmt = (n: number) => n.toLocaleString("ko-KR") + "원";

export default function InterimSettlementPage() {
  const { token } = useAuth();
  const { toast } = useToast();
  const [rows, setRows] = useState<InterimSettlement[]>([]);
  const [loading, setLoading] = useState(false);
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [search, setSearch] = useState("");

  const reload = () => {
    if (!token) return;
    setLoading(true);
    const params = new URLSearchParams();
    if (month) params.set("month", month);
    if (search.trim()) params.set("search", search.trim());
    apiGet<InterimSettlement[]>(`/interim-settlements?${params}`, token)
      .then(setRows)
      .catch((e) => toast({ title: "불러오기 실패", description: String(e), variant: "destructive" }))
      .finally(() => setLoading(false));
  };
  useEffect(reload, [token, month]); // eslint-disable-line react-hooks/exhaustive-deps

  const totals = useMemo(() => {
    return rows.reduce(
      (a, r) => ({
        count: a.count + 1,
        occurred: a.occurred + (r.occurredAmount ?? 0),
        closing: a.closing + (r.closingAmount ?? 0),
        late: a.late + (r.applyLateFee ? 1 : 0),
      }),
      { count: 0, occurred: 0, closing: 0, late: 0 },
    );
  }, [rows]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="중간 정산서 조회"
        description="부과·마감 엔진이 산출한 호실별 중간 정산 결과를 조회합니다."
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label={`${month} 건수`} value={`${totals.count}건`} icon={<Receipt className="w-4 h-4" />} />
        <Kpi label="발생 합계" value={fmt(totals.occurred)} />
        <Kpi label="마감 합계" value={fmt(totals.closing)} />
        <Kpi label="연체료 적용" value={`${totals.late}건`} />
      </div>

      <Card>
        <CardContent className="pt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="w-40"
            />
            <Input
              placeholder="호실 검색"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && reload()}
              className="max-w-xs"
            />
            <Button variant="outline" size="sm" onClick={reload}>
              <RefreshCw className="w-4 h-4 mr-1" /> 다시 불러오기
            </Button>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>호실</TableHead>
                  <TableHead>부과월</TableHead>
                  <TableHead className="text-right">발생금액</TableHead>
                  <TableHead className="text-right">당월부과</TableHead>
                  <TableHead className="text-right">마감금액</TableHead>
                  <TableHead>연체</TableHead>
                  <TableHead>상태</TableHead>
                  <TableHead>메모</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                      불러오는 중...
                    </TableCell>
                  </TableRow>
                )}
                {!loading && rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                      해당 월에 산출된 중간 정산 결과가 없습니다. 부과·마감 엔진을 먼저 실행해 주세요.
                    </TableCell>
                  </TableRow>
                )}
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.unit}</TableCell>
                    <TableCell>{r.billingMonth}</TableCell>
                    <TableCell className="text-right">{fmt(r.occurredAmount)}</TableCell>
                    <TableCell className="text-right">{fmt(r.monthAmount)}</TableCell>
                    <TableCell className="text-right">{fmt(r.closingAmount)}</TableCell>
                    <TableCell>{r.applyLateFee ? <Badge className="bg-red-100 text-red-800">연체</Badge> : "-"}</TableCell>
                    <TableCell>
                      <Badge variant={r.status === "confirmed" ? "default" : "outline"}>
                        {r.status === "confirmed" ? "확정" : "초안"}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[240px] truncate text-sm text-muted-foreground">{r.notes ?? ""}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({ label, value, icon }: { label: string; value: string | number; icon?: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{label}</span>
          {icon}
        </div>
        <div className="text-xl font-bold mt-1">{value}</div>
      </CardContent>
    </Card>
  );
}
