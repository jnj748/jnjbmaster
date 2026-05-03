// [Task #797] 개인정보 접근 이력 — PII 마스킹 해제·다운로드·인쇄 등
//   민감 액션이 자동 기록된다. 화면은 조회 + 기간 필터만 노출하고 수기
//   입력은 두지 않는다.
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/page-header";
import { Eye, Download, Printer, RefreshCw, Shield } from "lucide-react";
import { apiGet } from "@/lib/residents-extras-api";

interface PrivacyLog {
  id: number;
  userName: string | null;
  page: string;
  purpose: string | null;
  reason: string | null;
  ip: string | null;
  unmasked: boolean;
  printed: boolean;
  downloaded: boolean;
  targetType: string | null;
  targetId: number | null;
  createdAt: string;
}

export default function PrivacyAccessLogPage() {
  const { token } = useAuth();
  const { toast } = useToast();
  const [rows, setRows] = useState<PrivacyLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [search, setSearch] = useState("");

  const reload = () => {
    if (!token) return;
    setLoading(true);
    const p = new URLSearchParams();
    if (from) p.set("from", new Date(from).toISOString());
    if (to) p.set("to", new Date(to + "T23:59:59").toISOString());
    if (search.trim()) p.set("search", search.trim());
    apiGet<PrivacyLog[]>(`/privacy-access-logs?${p}`, token)
      .then(setRows)
      .catch((e) => toast({ title: "불러오기 실패", description: String(e), variant: "destructive" }))
      .finally(() => setLoading(false));
  };
  useEffect(reload, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  const summary = useMemo(() => {
    const s = { total: rows.length, unmasked: 0, printed: 0, downloaded: 0, byUser: new Map<string, number>() };
    for (const r of rows) {
      if (r.unmasked) s.unmasked++;
      if (r.printed) s.printed++;
      if (r.downloaded) s.downloaded++;
      const k = r.userName ?? "(미상)";
      s.byUser.set(k, (s.byUser.get(k) ?? 0) + 1);
    }
    return s;
  }, [rows]);

  const topUser = useMemo(() => {
    let best: [string, number] | null = null;
    for (const e of summary.byUser.entries()) if (!best || e[1] > best[1]) best = e;
    return best;
  }, [summary]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="개인정보 접근 이력"
        description="입주민/소유자 PII 마스킹 해제·인쇄·다운로드 등 민감 액션이 자동 기록됩니다."
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="총 접근" value={summary.total} icon={<Shield className="w-4 h-4" />} />
        <Kpi label="마스킹 해제" value={summary.unmasked} tone="text-amber-700" icon={<Eye className="w-4 h-4" />} />
        <Kpi label="인쇄" value={summary.printed} icon={<Printer className="w-4 h-4" />} />
        <Kpi label="다운로드" value={summary.downloaded} icon={<Download className="w-4 h-4" />} />
      </div>

      {topUser && topUser[1] >= 5 && (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="pt-4 text-sm flex items-start gap-2">
            <Shield className="w-4 h-4 text-amber-700 mt-0.5" />
            <div>
              <b>{topUser[0]}</b> 님의 접근이 같은 기간 동안 <b>{topUser[1]}회</b>로 가장 많습니다. 업무 사유를 한 번 더 확인해 보세요.
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="pt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
            <span className="text-muted-foreground text-sm">~</span>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
            <Input
              placeholder="사용자·화면·업무 검색"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && reload()}
              className="max-w-xs"
            />
            <Button variant="outline" size="sm" onClick={reload}>
              <RefreshCw className="w-4 h-4 mr-1" /> 적용
            </Button>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>시각</TableHead>
                  <TableHead>사용자</TableHead>
                  <TableHead>화면</TableHead>
                  <TableHead>업무</TableHead>
                  <TableHead>사유</TableHead>
                  <TableHead>액션</TableHead>
                  <TableHead>IP</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      불러오는 중...
                    </TableCell>
                  </TableRow>
                )}
                {!loading && rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      해당 기간에 기록된 PII 접근이 없습니다.
                    </TableCell>
                  </TableRow>
                )}
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs">{new Date(r.createdAt).toLocaleString("ko-KR")}</TableCell>
                    <TableCell>{r.userName ?? "-"}</TableCell>
                    <TableCell className="text-sm">{r.page}</TableCell>
                    <TableCell className="text-sm">{r.purpose ?? "-"}</TableCell>
                    <TableCell className="text-sm max-w-[200px] truncate">{r.reason ?? "-"}</TableCell>
                    <TableCell className="space-x-1">
                      {r.unmasked && <Badge className="bg-amber-100 text-amber-800">노출</Badge>}
                      {r.printed && <Badge className="bg-blue-100 text-blue-800">인쇄</Badge>}
                      {r.downloaded && <Badge className="bg-emerald-100 text-emerald-800">다운로드</Badge>}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.ip ?? "-"}</TableCell>
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

function Kpi({ label, value, tone, icon }: { label: string; value: number; tone?: string; icon?: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{label}</span>
          {icon}
        </div>
        <div className={`text-2xl font-bold mt-1 ${tone ?? ""}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
