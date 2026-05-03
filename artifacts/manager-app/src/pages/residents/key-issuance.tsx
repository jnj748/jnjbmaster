// [Task #797] 키 발급/회수 — 자연어 한 줄로 AI가 호실/키번호/발급/회수를
//   추출해 미리보기 후 저장. 수기 입력 폼은 두지 않는다(컨셉: AI 자동화).
import { useEffect, useMemo, useState } from "react";
import { Sparkles, Loader2, RefreshCw, KeyRound, RotateCcw, AlertTriangle } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/page-header";
import { apiGet, apiSend } from "@/lib/residents-extras-api";

interface KeyIssuance {
  id: number;
  unit: string;
  tenantName: string | null;
  keyNumber: string;
  issueReason: string | null;
  issuedAt: string | null;
  returnedAt: string | null;
  status: "issued" | "returned" | "lost" | "discarded";
  handlerName: string | null;
  notes: string | null;
  createdAt: string;
}

const STATUS_LABEL: Record<KeyIssuance["status"], { label: string; tone: string }> = {
  issued: { label: "발급중", tone: "bg-blue-100 text-blue-800" },
  returned: { label: "회수", tone: "bg-emerald-100 text-emerald-800" },
  lost: { label: "분실", tone: "bg-red-100 text-red-800" },
  discarded: { label: "폐기", tone: "bg-gray-200 text-gray-700" },
};

export default function KeyIssuancePage() {
  const { token } = useAuth();
  const { toast } = useToast();
  const [rows, setRows] = useState<KeyIssuance[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [aiOpen, setAiOpen] = useState(false);
  const [aiText, setAiText] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiPreview, setAiPreview] = useState<Partial<KeyIssuance> | null>(null);

  const reload = () => {
    if (!token) return;
    setLoading(true);
    const qs = search.trim() ? `?search=${encodeURIComponent(search.trim())}` : "";
    apiGet<KeyIssuance[]>(`/key-issuances${qs}`, token)
      .then(setRows)
      .catch((e) => toast({ title: "불러오기 실패", description: String(e), variant: "destructive" }))
      .finally(() => setLoading(false));
  };
  useEffect(reload, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  const summary = useMemo(() => {
    const s = { issued: 0, returned: 0, lost: 0, total: rows.length };
    for (const r of rows) {
      if (r.status === "issued") s.issued++;
      else if (r.status === "returned") s.returned++;
      else if (r.status === "lost") s.lost++;
    }
    return s;
  }, [rows]);

  const runExtract = async () => {
    if (!aiText.trim() || !token) return;
    setAiBusy(true);
    try {
      const { data } = await apiSend<{ data: Partial<KeyIssuance> }>(
        `/residents-extras/ai-extract`,
        "POST",
        token,
        { domain: "key_issuance", text: aiText.trim() },
      );
      setAiPreview(data);
    } catch (e) {
      toast({ title: "AI 추출 실패", description: String(e), variant: "destructive" });
    } finally {
      setAiBusy(false);
    }
  };

  const confirmSave = async () => {
    if (!aiPreview || !token) return;
    if (!aiPreview.unit || !aiPreview.keyNumber) {
      toast({ title: "필수 정보 부족", description: "호실과 키 번호를 인식하지 못했습니다.", variant: "destructive" });
      return;
    }
    try {
      await apiSend(`/key-issuances`, "POST", token, {
        unit: aiPreview.unit,
        tenantName: aiPreview.tenantName ?? null,
        keyNumber: aiPreview.keyNumber,
        issueReason: aiPreview.issueReason ?? null,
        issuedAt: aiPreview.issuedAt ?? null,
        returnedAt: aiPreview.returnedAt ?? null,
        status: aiPreview.status ?? "issued",
        notes: aiPreview.notes ?? null,
      });
      toast({ title: "기록되었습니다" });
      setAiOpen(false);
      setAiText("");
      setAiPreview(null);
      reload();
    } catch (e) {
      toast({ title: "저장 실패", description: String(e), variant: "destructive" });
    }
  };

  const markReturned = async (row: KeyIssuance) => {
    if (!token) return;
    try {
      await apiSend(`/key-issuances/${row.id}`, "PATCH", token, {
        status: "returned",
        returnedAt: new Date().toISOString().slice(0, 10),
      });
      reload();
    } catch (e) {
      toast({ title: "회수 처리 실패", description: String(e), variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="키 발급/회수"
        description="음성·문장으로 한 줄 입력하면 AI가 호실·키번호·상태를 자동 분리합니다."
        actions={
          <Button onClick={() => setAiOpen(true)} data-testid="btn-key-ai-add">
            <Sparkles className="w-4 h-4 mr-1" /> AI로 기록
          </Button>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="전체" value={summary.total} icon={<KeyRound className="w-4 h-4" />} />
        <Kpi label="발급중" value={summary.issued} tone="text-blue-700" />
        <Kpi label="회수" value={summary.returned} tone="text-emerald-700" />
        <Kpi label="분실" value={summary.lost} tone="text-red-700" icon={<AlertTriangle className="w-4 h-4" />} />
      </div>

      <Card>
        <CardContent className="pt-4 space-y-3">
          <div className="flex items-center gap-2">
            <Input
              placeholder="호실·이름·키번호 검색"
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
                  <TableHead>이름</TableHead>
                  <TableHead>키 번호</TableHead>
                  <TableHead>발급일</TableHead>
                  <TableHead>회수일</TableHead>
                  <TableHead>상태</TableHead>
                  <TableHead>사유/메모</TableHead>
                  <TableHead className="w-24"></TableHead>
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
                      아직 기록이 없습니다. 우측 상단 "AI로 기록" 버튼을 눌러 한 줄로 입력해 보세요.
                    </TableCell>
                  </TableRow>
                )}
                {rows.map((r) => {
                  const s = STATUS_LABEL[r.status];
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.unit}</TableCell>
                      <TableCell>{r.tenantName ?? "-"}</TableCell>
                      <TableCell>{r.keyNumber}</TableCell>
                      <TableCell>{r.issuedAt ?? "-"}</TableCell>
                      <TableCell>{r.returnedAt ?? "-"}</TableCell>
                      <TableCell>
                        <Badge className={s.tone}>{s.label}</Badge>
                      </TableCell>
                      <TableCell className="max-w-[260px] truncate text-sm text-muted-foreground">
                        {r.issueReason ?? r.notes ?? ""}
                      </TableCell>
                      <TableCell>
                        {r.status === "issued" && (
                          <Button size="sm" variant="outline" onClick={() => markReturned(r)}>
                            <RotateCcw className="w-3 h-3 mr-1" /> 회수
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={aiOpen} onOpenChange={(o) => { setAiOpen(o); if (!o) { setAiText(""); setAiPreview(null); }}}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-violet-600" /> AI로 키 발급/회수 기록
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Textarea
              placeholder='예: "302호 김민수 키 5번 발급, 사유 입주" / "405호 키 12번 회수 완료"'
              rows={3}
              value={aiText}
              onChange={(e) => setAiText(e.target.value)}
            />
            <div className="flex gap-2">
              <Button onClick={runExtract} disabled={aiBusy || !aiText.trim()}>
                {aiBusy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Sparkles className="w-4 h-4 mr-1" />}
                AI 분석
              </Button>
            </div>
            {aiPreview && (
              <div className="rounded-md border bg-muted/40 p-3 text-sm space-y-1">
                <div><b>호실</b>: {String(aiPreview.unit ?? "-")}</div>
                <div><b>이름</b>: {String(aiPreview.tenantName ?? "-")}</div>
                <div><b>키 번호</b>: {String(aiPreview.keyNumber ?? "-")}</div>
                <div><b>상태</b>: {STATUS_LABEL[(aiPreview.status as KeyIssuance["status"]) ?? "issued"]?.label ?? aiPreview.status}</div>
                <div><b>발급일</b>: {String(aiPreview.issuedAt ?? "-")} / <b>회수일</b>: {String(aiPreview.returnedAt ?? "-")}</div>
                <div><b>사유</b>: {String(aiPreview.issueReason ?? "-")}</div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAiOpen(false)}>닫기</Button>
            <Button onClick={confirmSave} disabled={!aiPreview}>저장</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
