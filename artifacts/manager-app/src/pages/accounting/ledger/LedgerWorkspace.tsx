// [Task #802] 장부 모듈 — 10개 보고서 통합 워크스페이스.
//   라우트 `/accounting/ledger/:report` 로 진입하며,
//   상단 자연어 질의 → 서버 라우팅 → 보고서 자동 전환,
//   각 보고서는 필터/결과/CSV·Excel·PDF 다운로드를 공통 레이아웃으로 노출한다.
//   * XpBIZ UI 모방 금지 — 우리 DS(Card/Table/Tabs/Select/Input/Button) 사용.
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocation, useRoute, useSearch } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Sparkles, FileDown, FileSpreadsheet, FileText } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/auth-context";

const BASE = (import.meta.env.BASE_URL ?? "/") as string;
const apiBase = `${BASE}api`.replace(/\/+/g, "/");

const won = (n: number) => (Number(n) || 0).toLocaleString("ko-KR") + "원";
const todayStr = () => new Date().toISOString().slice(0, 10);
const monthStartStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`; };
const ymStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };

interface Account { code: string; name: string; type: string; isHeader: boolean; parentCode: string | null }

type ApiFn = <T>(path: string, init?: RequestInit) => Promise<T>;
function useApi(): ApiFn {
  const { token } = useAuth();
  return useMemo<ApiFn>(() => async (path, init) => {
    const res = await fetch(`${apiBase}${path}`, {
      credentials: "include",
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init?.headers ?? {}),
      },
    });
    if (!res.ok) throw new Error(`${res.status} ${await res.text().catch(() => "")}`.slice(0, 200));
    return res.json();
  }, [token]);
}

async function downloadCsv(token: string | null, path: string, filename: string) {
  const res = await fetch(`${apiBase}${path}`, {
    credentials: "include",
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text().catch(() => "")}`.slice(0, 200));
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ── 메타 ────────────────────────────────────────────────────
export const LEDGER_REPORTS = [
  { slug: "journal", title: "분개장", desc: "일자·적요별 차/대변 라인 검색" },
  { slug: "daily", title: "일계표", desc: "일자별 계정과목 차·대변 합계" },
  { slug: "monthly", title: "월계표", desc: "월별 계정과목 차·대변 합계" },
  { slug: "cash", title: "현금출납장", desc: "현금/예금 입출금 잔액 추적" },
  { slug: "bank-deposits", title: "제예금명세서", desc: "통장별 잔액·거래 내역" },
  { slug: "general", title: "총계정원장", desc: "계정 단위 차·대변·잔액" },
  { slug: "sub", title: "보조부원장", desc: "거래처/호실 단위 거래" },
  { slug: "account-balance", title: "계정과목별잔액장", desc: "월 기준 전월이월/당월/잔액" },
  { slug: "management-expenses", title: "관리비용명세서", desc: "비용 계정 전월·당월 비교" },
  { slug: "vendor", title: "거래처원장", desc: "거래처별 잔액·거래 내역" },
] as const;
type ReportSlug = typeof LEDGER_REPORTS[number]["slug"];

const REPORT_INDEX: Record<string, typeof LEDGER_REPORTS[number]> = Object.fromEntries(
  LEDGER_REPORTS.map(r => [r.slug, r]),
);

// URL 쿼리 파라미터 동기화 — 필터 변경 시 ?from=...&to=... 로 푸시해 새로고침/공유 가능.
//   wouter useLocation 은 base 가 제거된 경로를 돌려주므로 그대로 사용한다.
function useUrlParams(): [URLSearchParams, (next: Record<string, string>) => void] {
  const search = useSearch();
  const [location, navigate] = useLocation();
  const params = useMemo(() => new URLSearchParams(search ?? ""), [search]);
  const setParams = useCallback((next: Record<string, string>) => {
    const qs = new URLSearchParams(
      Object.entries(next).filter(([, v]) => v !== "" && v != null) as Array<[string, string]>,
    );
    navigate(`${location}${qs.toString() ? `?${qs}` : ""}`, { replace: true });
  }, [navigate, location]);
  return [params, setParams];
}

// ── 외곽 워크스페이스 ───────────────────────────────────────
export default function LedgerWorkspagePageImpl() {
  return <LedgerWorkspacePageInner />;
}
function LedgerWorkspacePageInner() {
  const [match, params] = useRoute("/accounting/ledger/:report");
  const [, navigate] = useLocation();
  const search = useSearch();
  const slug = (match && params?.report && REPORT_INDEX[params.report] ? params.report : "journal") as ReportSlug;
  const meta = REPORT_INDEX[slug];

  const api = useApi();
  const [accounts, setAccounts] = useState<Account[]>([]);
  useEffect(() => { api<{ accounts: Account[] }>("/accounting/accounts").then(r => setAccounts(r.accounts)).catch(e => toast.error(`계정과목 로드 실패: ${e.message}`)); }, [api]);
  const codeOptions = useMemo(() => accounts.filter(a => !a.isHeader), [accounts]);

  // 자연어 질의 → 서버에서 보고서 라우팅 결정.
  const [q, setQ] = useState("");
  const [routing, setRouting] = useState(false);
  const askAi = async () => {
    if (!q.trim()) return;
    setRouting(true);
    try {
      const r = await api<{ suggestion: { report: string; reason: string; params?: Record<string, string> } }>(
        "/accounting/ledger/nl-route", { method: "POST", body: JSON.stringify({ text: q }) });
      const target = REPORT_INDEX[r.suggestion.report]?.slug ?? "journal";
      const qs = new URLSearchParams(r.suggestion.params ?? {}).toString();
      navigate(`/accounting/ledger/${target}${qs ? `?${qs}` : ""}`);
      toast.success(`${REPORT_INDEX[target].title} 으로 이동: ${r.suggestion.reason}`);
    } catch (e) { toast.error(`라우팅 실패: ${(e as Error).message}`); }
    finally { setRouting(false); }
  };

  return (
    <div className="p-4 md:p-6 space-y-4" data-testid="ledger-workspace">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">장부 — {meta.title}</h1>
          <p className="text-sm text-muted-foreground">{meta.desc}</p>
        </div>
        <div className="flex gap-1 flex-wrap" data-testid="ledger-nav">
          {LEDGER_REPORTS.map(r => (
            <Button key={r.slug} size="sm" variant={r.slug === slug ? "default" : "outline"}
              data-testid={`ledger-nav-${r.slug}`}
              onClick={() => navigate(`/accounting/ledger/${r.slug}`)}>{r.title}</Button>
          ))}
        </div>
      </div>

      <Card className="border-primary/30">
        <CardContent className="pt-4">
          <Label className="flex items-center gap-1 text-sm">
            <Sparkles className="h-4 w-4" /> 자연어로 질문하세요
          </Label>
          <div className="flex gap-2 mt-1">
            <Input value={q} onChange={e => setQ(e.target.value)}
              placeholder="예: 2025년 8월 관리비용 명세 / 거래처 ABC 원장 / 8월 일계표"
              onKeyDown={e => { if (e.key === "Enter") askAi(); }}
              data-testid="ledger-nl-input" />
            <Button onClick={askAi} disabled={routing} data-testid="ledger-nl-submit">{routing ? "분석중..." : "AI 라우팅"}</Button>
          </div>
        </CardContent>
      </Card>

      {/* slug + 쿼리스트링을 key 로 묶어 NL 라우팅이 같은 보고서로 다른 파라미터를 보낼 때도 강제 리마운트. */}
      <ReportRouter key={`${slug}?${search ?? ""}`} slug={slug} codeOptions={codeOptions} />
    </div>
  );
}

function ReportRouter({ slug, codeOptions }: { slug: ReportSlug; codeOptions: Account[] }) {
  switch (slug) {
    case "journal": return <JournalReport />;
    case "daily": return <DailySummaryReport />;
    case "monthly": return <MonthlySummaryReport />;
    case "cash": return <CashbookReport />;
    case "bank-deposits": return <BankDepositsReport />;
    case "general": return <GeneralLedgerReport codeOptions={codeOptions} />;
    case "sub": return <SubLedgerReport />;
    case "account-balance": return <AccountBalanceReport />;
    case "management-expenses": return <ManagementExpensesReport />;
    case "vendor": return <VendorLedgerReport />;
  }
}

// ── 공통 다운로드 도구 ─────────────────────────────────────
function exportClientCsv(filename: string, header: string[], rows: Array<Array<string | number | null | undefined>>): void {
  // [Task #802] 서버 CSV 가 없는 신규 보고서용 클라이언트 측 내보내기.
  //   엑셀 수식 인젝션 방지: 셀이 = + - @ 로 시작하면 ' 를 prefix.
  const escape = (v: unknown): string => {
    let s = v == null ? "" : String(v);
    if (/^[=+\-@]/.test(s)) s = `'${s}`;
    if (/[",\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const bom = "\uFEFF";
  const csv = bom + [header, ...rows].map(r => r.map(escape).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function exportClientExcel(filename: string, header: string[], rows: Array<Array<string | number | null | undefined>>): void {
  // [Task #802] 간단한 Excel 호환: SYLK 보다 안전한 .xls (HTML 테이블) 포맷.
  const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const html = `<html><head><meta charset="utf-8"><meta name="ProgId" content="Excel.Sheet"></head>
    <body><table border="1">
      <thead><tr>${header.map(h => `<th>${esc(h)}</th>`).join("")}</tr></thead>
      <tbody>${rows.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody>
    </table></body></html>`;
  const blob = new Blob(["\uFEFF", html], { type: "application/vnd.ms-excel" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function exportClientPdf(title: string, header: string[], rows: Array<Array<string | number | null | undefined>>): void {
  // [Task #802] window.print 기반 인쇄(PDF 저장) — 무거운 PDF 라이브러리 회피.
  const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const w = window.open("", "_blank");
  if (!w) { toast.error("팝업이 차단되었습니다"); return; }
  w.document.write(`<html><head><meta charset="utf-8"><title>${esc(title)}</title>
    <style>
      body { font-family: 'Pretendard','맑은 고딕',sans-serif; padding: 24px; }
      h1 { font-size: 16px; margin: 0 0 12px; }
      table { width: 100%; border-collapse: collapse; font-size: 11px; }
      th, td { border: 1px solid #999; padding: 4px 6px; text-align: left; }
      th { background: #f3f4f6; }
      td.num { text-align: right; font-variant-numeric: tabular-nums; }
    </style></head><body>
    <h1>${esc(title)}</h1>
    <table>
      <thead><tr>${header.map(h => `<th>${esc(h)}</th>`).join("")}</tr></thead>
      <tbody>${rows.map(r => `<tr>${r.map(c => `<td class="${typeof c === "number" ? "num" : ""}">${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody>
    </table></body></html>`);
  w.document.close();
  w.focus();
  setTimeout(() => { try { w.print(); } catch { /* noop */ } }, 200);
}

function DownloadButtons({ slug, serverCsv, header, rows, title }: {
  slug: string;
  serverCsv?: { path: string; filename: string }; // 서버 CSV(감사로그) 우선.
  header: string[];
  rows: Array<Array<string | number | null | undefined>>;
  title: string;
}) {
  const { token } = useAuth();
  const onCsv = async () => {
    try {
      if (serverCsv) {
        await downloadCsv(token, serverCsv.path, serverCsv.filename);
      } else {
        exportClientCsv(`${title}-${Date.now()}.csv`, header, rows);
      }
      toast.success("CSV 다운로드 완료");
    } catch (e) { toast.error(`CSV 실패: ${(e as Error).message}`); }
  };
  const onXls = () => { try { exportClientExcel(`${title}-${Date.now()}.xls`, header, rows); toast.success("Excel 다운로드 완료"); } catch (e) { toast.error((e as Error).message); } };
  const onPdf = () => { exportClientPdf(title, header, rows); };
  return (
    <div className="flex gap-1">
      <Button size="sm" variant="outline" onClick={onCsv} data-testid={`ledger-csv-${slug}`}><FileDown className="h-4 w-4 mr-1" />CSV</Button>
      <Button size="sm" variant="outline" onClick={onXls} data-testid={`ledger-xls-${slug}`}><FileSpreadsheet className="h-4 w-4 mr-1" />Excel</Button>
      <Button size="sm" variant="outline" onClick={onPdf} data-testid={`ledger-pdf-${slug}`}><FileText className="h-4 w-4 mr-1" />PDF</Button>
    </div>
  );
}

function FilterBar({ children, onSearch, downloads }: { children: ReactNode; onSearch: () => void; downloads: ReactNode }) {
  return (
    <div className="flex items-end gap-2 flex-wrap mb-4">
      {children}
      <Button onClick={onSearch} data-testid="ledger-search">조회</Button>
      <div className="ml-auto">{downloads}</div>
    </div>
  );
}

// ── 분개장 ─────────────────────────────────────────────────
interface JournalLine { id: number; accountCode: string; accountName: string; debit: number; credit: number; partyName: string | null; unitId: number | null; memo: string | null }
interface JournalEntry { id: number; entryDate: string; memo: string; sourceEvent: string; isBalanced: boolean; locked: boolean; isReversal: boolean; lines: JournalLine[] }

function JournalReport() {
  const api = useApi();
  const [urlP, setUrlP] = useUrlParams();
  const [from, setFrom] = useState(urlP.get("from") ?? monthStartStr());
  const [to, setTo] = useState(urlP.get("to") ?? todayStr());
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [total, setTotal] = useState(0);
  const PAGE = 100;
  const [offset, setOffset] = useState(0);
  const reload = async (next = 0) => {
    try {
      const r = await api<{ entries: JournalEntry[]; total: number }>(`/accounting/journal?from=${from}&to=${to}&limit=${PAGE}&offset=${next}`);
      setEntries(r.entries); setTotal(r.total); setOffset(next);
      setUrlP({ from, to });
    } catch (e) { toast.error(`분개장 로드 실패: ${(e as Error).message}`); }
  };
  useEffect(() => { reload(0); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  const header = ["전표번호","일자","적요","출처","라인수","합계"];
  const rows = entries.map(e => [e.id, e.entryDate, e.memo, e.sourceEvent, e.lines.length, e.lines.reduce((s, l) => s + l.debit, 0)]);
  return (
    <Card>
      <CardHeader><CardTitle data-testid="report-title-journal">분개장</CardTitle></CardHeader>
      <CardContent>
        <FilterBar onSearch={() => reload(0)} downloads={
          <DownloadButtons slug="journal" title={`분개장-${from}_${to}`}
            serverCsv={{ path: `/accounting/journal.csv?from=${from}&to=${to}`, filename: `journal-${from}_${to}.csv` }}
            header={header} rows={rows} />
        }>
          <div><Label>시작</Label><Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="w-36" data-testid="journal-from" /></div>
          <div><Label>종료</Label><Input type="date" value={to} onChange={e => setTo(e.target.value)} className="w-36" data-testid="journal-to" /></div>
        </FilterBar>
        <Table data-testid="journal-table">
          <TableHeader><TableRow><TableHead>전표#</TableHead><TableHead>일자</TableHead><TableHead>적요</TableHead><TableHead>출처</TableHead><TableHead>라인</TableHead><TableHead className="text-right">합계</TableHead></TableRow></TableHeader>
          <TableBody>
            {entries.map(e => (
              <TableRow key={e.id}>
                <TableCell className="font-mono">#{e.id}</TableCell>
                <TableCell>{e.entryDate}</TableCell>
                <TableCell>
                  <div>{e.memo}</div>
                  <div className="text-xs text-muted-foreground space-y-0.5 mt-1">
                    {e.lines.map(l => (<div key={l.id}>· {l.accountCode} {l.accountName} {l.debit > 0 ? `차변 ${won(l.debit)}` : `대변 ${won(l.credit)}`}{l.partyName ? ` (${l.partyName})` : ""}</div>))}
                  </div>
                </TableCell>
                <TableCell><Badge variant="outline">{e.sourceEvent}</Badge>{e.isReversal && <Badge variant="destructive" className="ml-1">역분개</Badge>}</TableCell>
                <TableCell>{e.lines.length}</TableCell>
                <TableCell className="text-right">{won(e.lines.reduce((s, l) => s + l.debit, 0))}</TableCell>
              </TableRow>
            ))}
            {entries.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">조회 결과가 없습니다</TableCell></TableRow>}
          </TableBody>
        </Table>
        <div className="flex justify-between items-center text-sm mt-2">
          <span>총 {total.toLocaleString("ko-KR")}건</span>
          <div className="flex gap-1">
            <Button size="sm" variant="outline" disabled={offset === 0} onClick={() => reload(Math.max(0, offset - PAGE))}>이전</Button>
            <Button size="sm" variant="outline" disabled={offset + PAGE >= total} onClick={() => reload(offset + PAGE)}>다음</Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── 일계표 ─────────────────────────────────────────────────
function DailySummaryReport() {
  const api = useApi();
  const [urlP, setUrlP] = useUrlParams();
  const [from, setFrom] = useState(urlP.get("from") ?? monthStartStr());
  const [to, setTo] = useState(urlP.get("to") ?? todayStr());
  type Day = { entryDate: string; rows: Array<{ accountCode: string; accountName: string; debit: number; credit: number }>; debit: number; credit: number };
  const [data, setData] = useState<{ days: Day[]; totals: { debit: number; credit: number } } | null>(null);
  const reload = async () => {
    try { setData(await api(`/accounting/daily-summary?from=${from}&to=${to}`)); setUrlP({ from, to }); }
    catch (e) { toast.error(`일계표 실패: ${(e as Error).message}`); }
  };
  useEffect(() => { reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  const header = ["일자","계정코드","계정과목","차변","대변"];
  const rows = (data?.days ?? []).flatMap(d => d.rows.map(r => [d.entryDate, r.accountCode, r.accountName, r.debit, r.credit]));
  return (
    <Card>
      <CardHeader><CardTitle data-testid="report-title-daily">일계표</CardTitle></CardHeader>
      <CardContent>
        <FilterBar onSearch={reload} downloads={<DownloadButtons slug="daily" title={`일계표-${from}_${to}`}
          serverCsv={{ path: `/accounting/daily-summary.csv?from=${from}&to=${to}`, filename: `daily-summary-${from}_${to}.csv` }}
          header={header} rows={rows} />}>
          <div><Label>시작</Label><Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="w-36" /></div>
          <div><Label>종료</Label><Input type="date" value={to} onChange={e => setTo(e.target.value)} className="w-36" /></div>
        </FilterBar>
        {data && data.days.length === 0 && <div className="text-sm text-muted-foreground py-6 text-center">조회 결과가 없습니다</div>}
        {data?.days.map(d => (
          <div key={d.entryDate} className="mb-4 rounded border">
            <div className="flex justify-between bg-muted/50 px-3 py-2 font-semibold">
              <span>{d.entryDate}</span>
              <span>차 {won(d.debit)} · 대 {won(d.credit)}</span>
            </div>
            <Table>
              <TableHeader><TableRow><TableHead>계정</TableHead><TableHead className="text-right">차변</TableHead><TableHead className="text-right">대변</TableHead></TableRow></TableHeader>
              <TableBody>
                {d.rows.map((r, i) => (<TableRow key={i}><TableCell>{r.accountCode} {r.accountName}</TableCell><TableCell className="text-right">{won(r.debit)}</TableCell><TableCell className="text-right">{won(r.credit)}</TableCell></TableRow>))}
              </TableBody>
            </Table>
          </div>
        ))}
        {data && (
          <div className="text-right font-semibold">총합 차 {won(data.totals.debit)} · 대 {won(data.totals.credit)}</div>
        )}
      </CardContent>
    </Card>
  );
}

// ── 월계표 ─────────────────────────────────────────────────
function MonthlySummaryReport() {
  const api = useApi();
  const [urlP, setUrlP] = useUrlParams();
  const [fromYM, setFromYM] = useState(urlP.get("fromYM") ?? ymStr());
  const [toYM, setToYM] = useState(urlP.get("toYM") ?? ymStr());
  type M = { ym: string; rows: Array<{ accountCode: string; accountName: string; debit: number; credit: number }>; debit: number; credit: number };
  const [data, setData] = useState<{ months: M[]; totals: { debit: number; credit: number } } | null>(null);
  const reload = async () => {
    try { setData(await api(`/accounting/monthly-summary?fromYM=${fromYM}&toYM=${toYM}`)); setUrlP({ fromYM, toYM }); }
    catch (e) { toast.error(`월계표 실패: ${(e as Error).message}`); }
  };
  useEffect(() => { reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  const header = ["연월","계정코드","계정과목","차변","대변"];
  const rows = (data?.months ?? []).flatMap(m => m.rows.map(r => [m.ym, r.accountCode, r.accountName, r.debit, r.credit]));
  return (
    <Card>
      <CardHeader><CardTitle data-testid="report-title-monthly">월계표</CardTitle></CardHeader>
      <CardContent>
        <FilterBar onSearch={reload} downloads={<DownloadButtons slug="monthly" title={`월계표-${fromYM}_${toYM}`}
          serverCsv={{ path: `/accounting/monthly-summary.csv?fromYM=${fromYM}&toYM=${toYM}`, filename: `monthly-summary-${fromYM}_${toYM}.csv` }}
          header={header} rows={rows} />}>
          <div><Label>시작월</Label><Input type="month" value={fromYM} onChange={e => setFromYM(e.target.value)} /></div>
          <div><Label>종료월</Label><Input type="month" value={toYM} onChange={e => setToYM(e.target.value)} /></div>
        </FilterBar>
        {data?.months.map(m => (
          <div key={m.ym} className="mb-4 rounded border">
            <div className="flex justify-between bg-muted/50 px-3 py-2 font-semibold"><span>{m.ym}</span><span>차 {won(m.debit)} · 대 {won(m.credit)}</span></div>
            <Table>
              <TableHeader><TableRow><TableHead>계정</TableHead><TableHead className="text-right">차변</TableHead><TableHead className="text-right">대변</TableHead></TableRow></TableHeader>
              <TableBody>{m.rows.map((r, i) => (<TableRow key={i}><TableCell>{r.accountCode} {r.accountName}</TableCell><TableCell className="text-right">{won(r.debit)}</TableCell><TableCell className="text-right">{won(r.credit)}</TableCell></TableRow>))}</TableBody>
            </Table>
          </div>
        ))}
        {data && data.months.length === 0 && <div className="text-sm text-muted-foreground py-6 text-center">조회 결과가 없습니다</div>}
      </CardContent>
    </Card>
  );
}

// ── 현금출납장 ─────────────────────────────────────────────
function CashbookReport() {
  const api = useApi();
  const [urlP, setUrlP] = useUrlParams();
  const [from, setFrom] = useState(urlP.get("from") ?? monthStartStr());
  const [to, setTo] = useState(urlP.get("to") ?? todayStr());
  type Line = { entryId: number; entryDate: string; memo: string; accountName: string; debit: number; credit: number; balance: number; partyName: string | null };
  const [data, setData] = useState<{ lines: Line[]; finalBalance: number } | null>(null);
  const reload = async () => { try { setData(await api(`/accounting/cashbook?from=${from}&to=${to}`)); setUrlP({ from, to }); } catch (e) { toast.error((e as Error).message); } };
  useEffect(() => { reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  const header = ["전표번호","일자","적요","계정","거래처","입금","출금","잔액"];
  const rows = (data?.lines ?? []).map(l => [l.entryId, l.entryDate, l.memo, l.accountName, l.partyName ?? "", l.debit, l.credit, l.balance]);
  return (
    <Card>
      <CardHeader><CardTitle data-testid="report-title-cash">현금출납장</CardTitle></CardHeader>
      <CardContent>
        <FilterBar onSearch={reload} downloads={<DownloadButtons slug="cash" title={`현금출납장-${from}_${to}`} header={header} rows={rows} />}>
          <div><Label>시작</Label><Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="w-36" /></div>
          <div><Label>종료</Label><Input type="date" value={to} onChange={e => setTo(e.target.value)} className="w-36" /></div>
        </FilterBar>
        {data && (
          <Table>
            <TableHeader><TableRow><TableHead>전표#</TableHead><TableHead>일자</TableHead><TableHead>적요</TableHead><TableHead>계정</TableHead><TableHead>거래처</TableHead><TableHead className="text-right">입금</TableHead><TableHead className="text-right">출금</TableHead><TableHead className="text-right">잔액</TableHead></TableRow></TableHeader>
            <TableBody>
              {data.lines.map((l, i) => (<TableRow key={i}><TableCell className="font-mono">#{l.entryId}</TableCell><TableCell>{l.entryDate}</TableCell><TableCell>{l.memo}</TableCell><TableCell>{l.accountName}</TableCell><TableCell>{l.partyName ?? "-"}</TableCell><TableCell className="text-right">{l.debit > 0 ? won(l.debit) : "-"}</TableCell><TableCell className="text-right">{l.credit > 0 ? won(l.credit) : "-"}</TableCell><TableCell className="text-right font-mono">{won(l.balance)}</TableCell></TableRow>))}
              {data.lines.length === 0 && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-6">조회 결과가 없습니다</TableCell></TableRow>}
              <TableRow className="font-semibold"><TableCell colSpan={7}>현재 잔액</TableCell><TableCell className="text-right">{won(data.finalBalance)}</TableCell></TableRow>
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

// ── 제예금명세서 ────────────────────────────────────────────
function BankDepositsReport() {
  const api = useApi();
  type Line = { entryDate: string; memo: string; accountCode: string; accountName: string; debit: number; credit: number; partyName: string | null; balance: number };
  type Acc = { code: string; name: string; balance: number; lines: Line[] };
  const [data, setData] = useState<{ accounts: Acc[] } | null>(null);
  const reload = async () => { try { setData(await api("/accounting/deposits")); } catch (e) { toast.error((e as Error).message); } };
  useEffect(() => { reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  const header = ["계좌코드","계좌명","일자","적요","거래처","입금","출금","잔액"];
  const rows = (data?.accounts ?? []).flatMap(a => a.lines.map(l => [a.code, a.name, l.entryDate, l.memo, l.partyName ?? "", l.debit, l.credit, l.balance]));
  return (
    <Card>
      <CardHeader><CardTitle data-testid="report-title-bank-deposits">제예금명세서</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <FilterBar onSearch={reload} downloads={<DownloadButtons slug="bank-deposits" title="제예금명세서" header={header} rows={rows} />}>
          <span className="text-sm text-muted-foreground self-center">현금/예금 계정의 통장별 잔액을 보여줍니다.</span>
        </FilterBar>
        {data?.accounts.map(a => (
          <div key={a.code} className="rounded border">
            <div className="flex items-center justify-between bg-muted/40 px-3 py-2"><div className="font-semibold">{a.code} {a.name}</div><div className="font-mono">잔액 {won(a.balance)}</div></div>
            {a.lines.length > 0 && (
              <Table>
                <TableHeader><TableRow><TableHead>일자</TableHead><TableHead>적요</TableHead><TableHead>거래처</TableHead><TableHead className="text-right">입금</TableHead><TableHead className="text-right">출금</TableHead><TableHead className="text-right">잔액</TableHead></TableRow></TableHeader>
                <TableBody>{a.lines.map((l, i) => (<TableRow key={i}><TableCell>{l.entryDate}</TableCell><TableCell>{l.memo}</TableCell><TableCell>{l.partyName ?? "-"}</TableCell><TableCell className="text-right font-mono">{l.debit ? won(l.debit) : "-"}</TableCell><TableCell className="text-right font-mono">{l.credit ? won(l.credit) : "-"}</TableCell><TableCell className="text-right font-mono">{won(l.balance)}</TableCell></TableRow>))}</TableBody>
              </Table>
            )}
          </div>
        ))}
        {data && data.accounts.length === 0 && <div className="text-sm text-muted-foreground">등록된 예금/현금 계정이 없습니다.</div>}
      </CardContent>
    </Card>
  );
}

// ── 총계정원장 ──────────────────────────────────────────────
function GeneralLedgerReport({ codeOptions }: { codeOptions: Account[] }) {
  const api = useApi();
  const [urlP, setUrlP] = useUrlParams();
  const [code, setCode] = useState(urlP.get("accountCode") ?? "");
  const [from, setFrom] = useState(urlP.get("from") ?? monthStartStr());
  const [to, setTo] = useState(urlP.get("to") ?? todayStr());
  type Line = { entryDate: string; memo: string; debit: number; credit: number; balance: number; partyName: string | null };
  const [data, setData] = useState<{ account: { code: string; name: string }; lines: Line[]; finalBalance: number; total: number } | null>(null);
  const PAGE = 100;
  const [offset, setOffset] = useState(0);
  const reload = async (next = 0) => {
    if (!code) return;
    try { const r = await api<NonNullable<typeof data>>(`/accounting/general-ledger?accountCode=${code}&from=${from}&to=${to}&limit=${PAGE}&offset=${next}`);
      setData(r); setOffset(next); setUrlP({ accountCode: code, from, to }); }
    catch (e) { toast.error((e as Error).message); }
  };
  const header = ["일자","적요","거래처","차변","대변","잔액"];
  const rows = (data?.lines ?? []).map(l => [l.entryDate, l.memo, l.partyName ?? "", l.debit, l.credit, l.balance]);
  return (
    <Card>
      <CardHeader><CardTitle data-testid="report-title-general">총계정원장</CardTitle></CardHeader>
      <CardContent>
        <FilterBar onSearch={() => reload(0)} downloads={
          <DownloadButtons slug="general" title={`총계정원장-${code}-${from}_${to}`}
            serverCsv={code ? { path: `/accounting/general-ledger.csv?accountCode=${code}&from=${from}&to=${to}`, filename: `general-ledger-${code}-${from}_${to}.csv` } : undefined}
            header={header} rows={rows} />
        }>
          <div><Label>계정과목</Label>
            <Select value={code} onValueChange={setCode}>
              <SelectTrigger className="w-56" data-testid="general-account-select"><SelectValue placeholder="선택" /></SelectTrigger>
              <SelectContent>{codeOptions.map(a => <SelectItem key={a.code} value={a.code}>{a.code} {a.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>시작</Label><Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="w-36" /></div>
          <div><Label>종료</Label><Input type="date" value={to} onChange={e => setTo(e.target.value)} className="w-36" /></div>
        </FilterBar>
        {data ? (
          <>
            <Table data-testid="general-table">
              <TableHeader><TableRow><TableHead>일자</TableHead><TableHead>적요</TableHead><TableHead>거래처</TableHead><TableHead className="text-right">차변</TableHead><TableHead className="text-right">대변</TableHead><TableHead className="text-right">잔액</TableHead></TableRow></TableHeader>
              <TableBody>
                {data.lines.map((l, i) => (<TableRow key={i}><TableCell>{l.entryDate}</TableCell><TableCell>{l.memo}</TableCell><TableCell>{l.partyName ?? "-"}</TableCell><TableCell className="text-right">{l.debit > 0 ? won(l.debit) : "-"}</TableCell><TableCell className="text-right">{l.credit > 0 ? won(l.credit) : "-"}</TableCell><TableCell className="text-right font-mono">{won(l.balance)}</TableCell></TableRow>))}
                <TableRow className="font-semibold"><TableCell colSpan={5}>최종 잔액</TableCell><TableCell className="text-right">{won(data.finalBalance)}</TableCell></TableRow>
              </TableBody>
            </Table>
            <div className="flex justify-between items-center text-sm mt-2">
              <span>총 {data.total.toLocaleString("ko-KR")}건</span>
              <div className="flex gap-1">
                <Button size="sm" variant="outline" disabled={offset === 0} onClick={() => reload(Math.max(0, offset - PAGE))}>이전</Button>
                <Button size="sm" variant="outline" disabled={offset + PAGE >= data.total} onClick={() => reload(offset + PAGE)}>다음</Button>
              </div>
            </div>
          </>
        ) : <div className="text-sm text-muted-foreground py-6 text-center">계정과목을 선택한 뒤 조회하세요</div>}
      </CardContent>
    </Card>
  );
}

// ── 보조부원장 (거래처/호실) ────────────────────────────────
function SubLedgerReport() {
  const api = useApi();
  const [urlP, setUrlP] = useUrlParams();
  const [partyName, setPartyName] = useState(urlP.get("partyName") ?? "");
  const [unitId, setUnitId] = useState(urlP.get("unitId") ?? "");
  type Line = { entryDate: string; memo: string; accountCode: string; accountName: string; debit: number; credit: number; partyName: string | null; unitId: number | null };
  const [lines, setLines] = useState<Line[]>([]);
  const [total, setTotal] = useState(0);
  const PAGE = 100;
  const [offset, setOffset] = useState(0);
  const reload = async (next = 0) => {
    if (!partyName && !unitId) { toast.info("거래처명 또는 호실 ID 를 입력하세요"); return; }
    const qs = new URLSearchParams();
    if (partyName) qs.set("partyName", partyName);
    if (unitId) qs.set("unitId", unitId);
    qs.set("limit", String(PAGE)); qs.set("offset", String(next));
    try { const r = await api<{ lines: Line[]; total: number }>(`/accounting/sub-ledger?${qs}`); setLines(r.lines); setTotal(r.total); setOffset(next); setUrlP({ partyName, unitId }); }
    catch (e) { toast.error((e as Error).message); }
  };
  // 동일 거래처/호실 단위로 시간순 누적 잔액을 계산 (서버는 이미 일자/ID 순 정렬을 반환).
  let runBal = 0;
  const linesWithBal = lines.map(l => { runBal += l.debit - l.credit; return { ...l, balance: runBal }; });
  const header = ["일자","적요","계정","거래처","호실","차변","대변","누계잔액"];
  const rows = linesWithBal.map(l => [l.entryDate, l.memo, `${l.accountCode} ${l.accountName}`, l.partyName ?? "", l.unitId ?? "", l.debit, l.credit, l.balance]);
  const buildQs = () => { const q = new URLSearchParams(); if (partyName) q.set("partyName", partyName); if (unitId) q.set("unitId", unitId); return q.toString(); };
  return (
    <Card>
      <CardHeader><CardTitle data-testid="report-title-sub">보조부원장</CardTitle></CardHeader>
      <CardContent>
        <FilterBar onSearch={() => reload(0)} downloads={
          <DownloadButtons slug="sub" title="보조부원장"
            serverCsv={(partyName || unitId) ? { path: `/accounting/sub-ledger.csv?${buildQs()}`, filename: `sub-ledger-${Date.now()}.csv` } : undefined}
            header={header} rows={rows} />
        }>
          <div><Label>거래처명</Label><Input value={partyName} onChange={e => setPartyName(e.target.value)} className="w-44" /></div>
          <div><Label>호실 ID</Label><Input type="number" value={unitId} onChange={e => setUnitId(e.target.value)} className="w-28" /></div>
        </FilterBar>
        <Table>
          <TableHeader><TableRow><TableHead>일자</TableHead><TableHead>적요</TableHead><TableHead>계정</TableHead><TableHead>거래처/호실</TableHead><TableHead className="text-right">차변</TableHead><TableHead className="text-right">대변</TableHead><TableHead className="text-right">누계잔액</TableHead></TableRow></TableHeader>
          <TableBody>
            {linesWithBal.map((l, i) => (<TableRow key={i}><TableCell>{l.entryDate}</TableCell><TableCell>{l.memo}</TableCell><TableCell>{l.accountCode} {l.accountName}</TableCell><TableCell>{l.partyName ?? `호실#${l.unitId}`}</TableCell><TableCell className="text-right">{l.debit > 0 ? won(l.debit) : "-"}</TableCell><TableCell className="text-right">{l.credit > 0 ? won(l.credit) : "-"}</TableCell><TableCell className="text-right font-mono">{won(l.balance)}</TableCell></TableRow>))}
            {linesWithBal.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">조회 결과가 없습니다</TableCell></TableRow>}
          </TableBody>
        </Table>
        {total > 0 && (
          <div className="flex justify-between items-center text-sm mt-2">
            <span>총 {total.toLocaleString("ko-KR")}건</span>
            <div className="flex gap-1">
              <Button size="sm" variant="outline" disabled={offset === 0} onClick={() => reload(Math.max(0, offset - PAGE))}>이전</Button>
              <Button size="sm" variant="outline" disabled={offset + PAGE >= total} onClick={() => reload(offset + PAGE)}>다음</Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── 계정과목별 잔액장 ──────────────────────────────────────
function AccountBalanceReport() {
  const api = useApi();
  const [urlP, setUrlP] = useUrlParams();
  const [ym, setYm] = useState(urlP.get("ym") ?? ymStr());
  type Row = { code: string; name: string; type: string; opening: number; debit: number; credit: number; closing: number };
  const [data, setData] = useState<{ ym: string; rows: Row[] } | null>(null);
  const reload = async () => { try { setData(await api(`/accounting/account-balance?ym=${ym}`)); setUrlP({ ym }); } catch (e) { toast.error((e as Error).message); } };
  useEffect(() => { reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  const header = ["코드","계정과목","분류","전월이월","당월차변","당월대변","당월잔액"];
  const rows = (data?.rows ?? []).map(r => [r.code, r.name, r.type, r.opening, r.debit, r.credit, r.closing]);
  return (
    <Card>
      <CardHeader><CardTitle data-testid="report-title-account-balance">계정과목별 잔액장</CardTitle></CardHeader>
      <CardContent>
        <FilterBar onSearch={reload} downloads={<DownloadButtons slug="account-balance" title={`계정과목별잔액장-${ym}`}
          serverCsv={{ path: `/accounting/account-balance.csv?ym=${ym}`, filename: `account-balance-${ym}.csv` }}
          header={header} rows={rows} />}>
          <div><Label>기준월</Label><Input type="month" value={ym} onChange={e => setYm(e.target.value)} /></div>
        </FilterBar>
        {data && (
          <Table>
            <TableHeader><TableRow><TableHead>코드</TableHead><TableHead>계정과목</TableHead><TableHead>분류</TableHead><TableHead className="text-right">전월이월</TableHead><TableHead className="text-right">당월차변</TableHead><TableHead className="text-right">당월대변</TableHead><TableHead className="text-right">당월잔액</TableHead></TableRow></TableHeader>
            <TableBody>
              {data.rows.map(r => (<TableRow key={r.code}><TableCell className="font-mono">{r.code}</TableCell><TableCell>{r.name}</TableCell><TableCell><Badge variant="outline">{r.type}</Badge></TableCell><TableCell className="text-right font-mono">{won(r.opening)}</TableCell><TableCell className="text-right font-mono">{won(r.debit)}</TableCell><TableCell className="text-right font-mono">{won(r.credit)}</TableCell><TableCell className="text-right font-mono">{won(r.closing)}</TableCell></TableRow>))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

// ── 관리비용명세서 ────────────────────────────────────────
function ManagementExpensesReport() {
  const api = useApi();
  const [urlP, setUrlP] = useUrlParams();
  const [ym, setYm] = useState(urlP.get("ym") ?? ymStr());
  type Row = { code: string; name: string; prevAmount: number; currAmount: number; delta: number; ratio: number };
  const [data, setData] = useState<{ ym: string; rows: Row[]; totals: { prev: number; curr: number } } | null>(null);
  const reload = async () => { try { setData(await api(`/accounting/management-expenses?ym=${ym}`)); setUrlP({ ym }); } catch (e) { toast.error((e as Error).message); } };
  useEffect(() => { reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  const header = ["코드","계정과목","전월","당월","증감","구성비%"];
  const rows = (data?.rows ?? []).map(r => [r.code, r.name, r.prevAmount, r.currAmount, r.delta, (r.ratio * 100).toFixed(1)]);
  return (
    <Card>
      <CardHeader><CardTitle data-testid="report-title-management-expenses">관리비용 명세서</CardTitle></CardHeader>
      <CardContent>
        <FilterBar onSearch={reload} downloads={<DownloadButtons slug="management-expenses" title={`관리비용명세서-${ym}`}
          serverCsv={{ path: `/accounting/management-expenses.csv?ym=${ym}`, filename: `management-expenses-${ym}.csv` }}
          header={header} rows={rows} />}>
          <div><Label>기준월</Label><Input type="month" value={ym} onChange={e => setYm(e.target.value)} /></div>
        </FilterBar>
        {data && (
          <Table>
            <TableHeader><TableRow><TableHead>코드</TableHead><TableHead>비용 계정</TableHead><TableHead className="text-right">전월</TableHead><TableHead className="text-right">당월</TableHead><TableHead className="text-right">증감</TableHead><TableHead className="text-right">구성비</TableHead></TableRow></TableHeader>
            <TableBody>
              {data.rows.map(r => (
                <TableRow key={r.code}>
                  <TableCell className="font-mono">{r.code}</TableCell>
                  <TableCell>{r.name}</TableCell>
                  <TableCell className="text-right font-mono">{won(r.prevAmount)}</TableCell>
                  <TableCell className="text-right font-mono">{won(r.currAmount)}</TableCell>
                  <TableCell className={"text-right font-mono " + (r.delta > 0 ? "text-red-600" : r.delta < 0 ? "text-green-600" : "")}>{won(r.delta)}</TableCell>
                  <TableCell className="text-right font-mono">{(r.ratio * 100).toFixed(1)}%</TableCell>
                </TableRow>
              ))}
              <TableRow className="font-semibold"><TableCell colSpan={2}>합계</TableCell><TableCell className="text-right">{won(data.totals.prev)}</TableCell><TableCell className="text-right">{won(data.totals.curr)}</TableCell><TableCell className="text-right">{won(data.totals.curr - data.totals.prev)}</TableCell><TableCell className="text-right">100.0%</TableCell></TableRow>
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

// ── 거래처원장 ────────────────────────────────────────────
function VendorLedgerReport() {
  const api = useApi();
  const [urlP, setUrlP] = useUrlParams();
  const [partyName, setPartyName] = useState(urlP.get("partyName") ?? "");
  const [from, setFrom] = useState(urlP.get("from") ?? "");
  const [to, setTo] = useState(urlP.get("to") ?? "");
  type Line = { entryId: number; entryDate: string; memo: string; accountCode: string; accountName: string; debit: number; credit: number; partyName: string | null; balance: number };
  type Vendor = { partyName: string; balance: number; lines: Line[] };
  const [data, setData] = useState<{ vendors: Vendor[] } | null>(null);
  const reload = async () => {
    const qs = new URLSearchParams();
    if (partyName) qs.set("partyName", partyName);
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    try { setData(await api(`/accounting/vendor-ledger${qs.toString() ? `?${qs}` : ""}`)); setUrlP({ partyName, from, to }); }
    catch (e) { toast.error((e as Error).message); }
  };
  useEffect(() => { reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  const header = ["거래처","전표번호","일자","적요","계정","차변","대변","잔액"];
  const rows = (data?.vendors ?? []).flatMap(v => v.lines.map(l => [v.partyName, l.entryId, l.entryDate, l.memo, `${l.accountCode} ${l.accountName}`, l.debit, l.credit, l.balance]));
  const buildVendorQs = () => { const q = new URLSearchParams(); if (partyName) q.set("partyName", partyName); if (from) q.set("from", from); if (to) q.set("to", to); return q.toString(); };
  return (
    <Card>
      <CardHeader><CardTitle data-testid="report-title-vendor">거래처원장</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <FilterBar onSearch={reload} downloads={<DownloadButtons slug="vendor" title={`거래처원장-${partyName || "전체"}`}
          serverCsv={{ path: `/accounting/vendor-ledger.csv${buildVendorQs() ? `?${buildVendorQs()}` : ""}`, filename: `vendor-ledger-${Date.now()}.csv` }}
          header={header} rows={rows} />}>
          <div><Label>거래처명</Label><Input value={partyName} onChange={e => setPartyName(e.target.value)} className="w-44" placeholder="전체" /></div>
          <div><Label>시작</Label><Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="w-36" /></div>
          <div><Label>종료</Label><Input type="date" value={to} onChange={e => setTo(e.target.value)} className="w-36" /></div>
        </FilterBar>
        {data?.vendors.map(v => (
          <div key={v.partyName} className="rounded border">
            <div className="flex items-center justify-between bg-muted/40 px-3 py-2"><div className="font-semibold">{v.partyName}</div><div className="font-mono">잔액 {won(v.balance)}</div></div>
            {v.lines.length > 0 && (
              <Table>
                <TableHeader><TableRow><TableHead>일자</TableHead><TableHead>적요</TableHead><TableHead>계정</TableHead><TableHead className="text-right">차변</TableHead><TableHead className="text-right">대변</TableHead><TableHead className="text-right">잔액</TableHead></TableRow></TableHeader>
                <TableBody>{v.lines.map((l, i) => (<TableRow key={i}><TableCell>{l.entryDate}</TableCell><TableCell>{l.memo}</TableCell><TableCell>{l.accountCode} {l.accountName}</TableCell><TableCell className="text-right">{l.debit > 0 ? won(l.debit) : "-"}</TableCell><TableCell className="text-right">{l.credit > 0 ? won(l.credit) : "-"}</TableCell><TableCell className="text-right font-mono">{won(l.balance)}</TableCell></TableRow>))}</TableBody>
              </Table>
            )}
          </div>
        ))}
        {data && data.vendors.length === 0 && <div className="text-sm text-muted-foreground py-6 text-center">거래처 데이터가 없습니다</div>}
      </CardContent>
    </Card>
  );
}
