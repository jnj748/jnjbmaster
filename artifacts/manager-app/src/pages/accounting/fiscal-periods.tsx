// [Task #801] 회계 기수 — 1년 단위 회계기간 등록.
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { useApi } from "@/lib/accounting-api";
import { Calendar, Plus, Star } from "lucide-react";

interface FiscalPeriod {
  id: number; buildingId: number; code: string; name: string;
  startDate: string; endDate: string; status: string; isCurrent: boolean; memo: string | null;
}

export default function FiscalPeriodsPage() {
  const api = useApi();
  const [rows, setRows] = useState<FiscalPeriod[]>([]);
  const [loading, setLoading] = useState(false);
  const today = new Date();
  const yyyy = today.getFullYear();
  const [form, setForm] = useState({
    code: `FY${yyyy}`,
    name: `${yyyy} 회계기수`,
    startDate: `${yyyy}-01-01`,
    endDate: `${yyyy}-12-31`,
    isCurrent: true,
  });

  async function load() {
    setLoading(true);
    try {
      const data = await api<{ periods: FiscalPeriod[] }>("/accounting/fiscal-periods");
      setRows(data.periods);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  async function save() {
    try {
      await api("/accounting/fiscal-periods", { method: "POST", body: JSON.stringify(form) });
      toast.success("회계기수가 등록되었습니다");
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function setCurrent(id: number) {
    try {
      await api(`/accounting/fiscal-periods/${id}`, { method: "PATCH", body: JSON.stringify({ isCurrent: true }) });
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function close(id: number) {
    try {
      await api(`/accounting/fiscal-periods/${id}`, { method: "PATCH", body: JSON.stringify({ status: "closed" }) });
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-3">
        <Calendar className="size-6 text-primary" />
        <h1 className="text-2xl font-bold">회계 기수</h1>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">새 기수 등록</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-5">
          <div><Label>코드</Label><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} data-testid="fiscal-code" /></div>
          <div><Label>이름</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="fiscal-name" /></div>
          <div><Label>시작일</Label><Input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} /></div>
          <div><Label>종료일</Label><Input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} /></div>
          <div className="flex items-end"><Button onClick={save} className="w-full" data-testid="fiscal-save"><Plus className="size-4 mr-1" />등록</Button></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">기수 목록</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>코드</TableHead><TableHead>이름</TableHead><TableHead>기간</TableHead><TableHead>상태</TableHead><TableHead></TableHead></TableRow></TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono">{r.code}</TableCell>
                  <TableCell>{r.name} {r.isCurrent && <Badge variant="secondary" className="ml-2"><Star className="size-3 mr-1" />현행</Badge>}</TableCell>
                  <TableCell>{r.startDate} ~ {r.endDate}</TableCell>
                  <TableCell><Badge variant={r.status === "closed" ? "destructive" : r.status === "active" ? "default" : "outline"}>{r.status}</Badge></TableCell>
                  <TableCell className="text-right space-x-2">
                    {!r.isCurrent && <Button variant="outline" size="sm" onClick={() => setCurrent(r.id)}>현행 지정</Button>}
                    {r.status !== "closed" && <Button variant="outline" size="sm" onClick={() => close(r.id)}>마감</Button>}
                  </TableCell>
                </TableRow>
              ))}
              {!loading && rows.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">등록된 기수가 없습니다</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
