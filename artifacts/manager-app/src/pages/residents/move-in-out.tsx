// [Task #797] 전입/전출 현황 — 입주민 데이터에서 자동 집계하여 보여준다.
//   수기 입력은 입주민 관리 화면에서 처리하고, 이 화면은 기간 기반 조회만.
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PageHeader } from "@/components/page-header";
import { LogIn, LogOut, RefreshCw } from "lucide-react";
import { apiGet } from "@/lib/residents-extras-api";

interface MoveRow {
  id: number;
  unit: string;
  name: string;
  contact: string | null;
  moveInDate: string | null;
  moveOutDate: string | null;
  status: string;
}
interface MoveResp {
  moveIns: MoveRow[];
  moveOuts: MoveRow[];
}

function defaultRange() {
  const today = new Date();
  const from = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
  const to = today.toISOString().slice(0, 10);
  return { from, to };
}

export default function MoveInOutPage() {
  const { token } = useAuth();
  const { toast } = useToast();
  const init = defaultRange();
  const [from, setFrom] = useState(init.from);
  const [to, setTo] = useState(init.to);
  const [data, setData] = useState<MoveResp>({ moveIns: [], moveOuts: [] });
  const [loading, setLoading] = useState(false);

  const reload = () => {
    if (!token) return;
    setLoading(true);
    const p = new URLSearchParams();
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    apiGet<MoveResp>(`/move-in-out?${p}`, token)
      .then(setData)
      .catch((e) => toast({ title: "불러오기 실패", description: String(e), variant: "destructive" }))
      .finally(() => setLoading(false));
  };
  useEffect(reload, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  const totals = useMemo(
    () => ({ in: data.moveIns.length, out: data.moveOuts.length, net: data.moveIns.length - data.moveOuts.length }),
    [data],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="전입/전출 현황"
        description="입주민 데이터에서 선택한 기간의 전입·전출을 자동 집계합니다."
      />

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Kpi label="전입" value={`${totals.in}건`} icon={<LogIn className="w-4 h-4 text-emerald-600" />} />
        <Kpi label="전출" value={`${totals.out}건`} icon={<LogOut className="w-4 h-4 text-red-600" />} />
        <Kpi label="순증감" value={`${totals.net >= 0 ? "+" : ""}${totals.net}`} />
      </div>

      <Card>
        <CardContent className="pt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
            <span className="text-muted-foreground text-sm">~</span>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
            <Button variant="outline" size="sm" onClick={reload} disabled={loading}>
              <RefreshCw className="w-4 h-4 mr-1" /> 적용
            </Button>
          </div>

          <Tabs defaultValue="in">
            <TabsList>
              <TabsTrigger value="in">전입 {totals.in}</TabsTrigger>
              <TabsTrigger value="out">전출 {totals.out}</TabsTrigger>
            </TabsList>
            <TabsContent value="in">
              <MoveTable rows={data.moveIns} dateField="moveInDate" loading={loading} empty="해당 기간 전입 기록이 없습니다." />
            </TabsContent>
            <TabsContent value="out">
              <MoveTable rows={data.moveOuts} dateField="moveOutDate" loading={loading} empty="해당 기간 전출 기록이 없습니다." />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

function MoveTable({
  rows,
  dateField,
  loading,
  empty,
}: {
  rows: MoveRow[];
  dateField: "moveInDate" | "moveOutDate";
  loading: boolean;
  empty: string;
}) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{dateField === "moveInDate" ? "전입일" : "전출일"}</TableHead>
            <TableHead>호실</TableHead>
            <TableHead>이름</TableHead>
            <TableHead>연락처</TableHead>
            <TableHead>상태</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading && (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                불러오는 중...
              </TableCell>
            </TableRow>
          )}
          {!loading && rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                {empty}
              </TableCell>
            </TableRow>
          )}
          {rows
            .slice()
            .sort((a, b) => String(b[dateField] ?? "").localeCompare(String(a[dateField] ?? "")))
            .map((r) => (
              <TableRow key={r.id}>
                <TableCell>{r[dateField] ?? "-"}</TableCell>
                <TableCell className="font-medium">{r.unit}</TableCell>
                <TableCell>{r.name}</TableCell>
                <TableCell>{r.contact ?? "-"}</TableCell>
                <TableCell>
                  <Badge variant="outline">{r.status}</Badge>
                </TableCell>
              </TableRow>
            ))}
        </TableBody>
      </Table>
    </div>
  );
}

function Kpi({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{label}</span>
          {icon}
        </div>
        <div className="text-2xl font-bold mt-1">{value}</div>
      </CardContent>
    </Card>
  );
}
