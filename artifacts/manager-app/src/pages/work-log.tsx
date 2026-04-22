import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";
import { AuthImage } from "@/components/auth-image";
import { A4DocumentFrame, type A4DocumentFrameHandle } from "@/components/a4-document-frame";
import { PhotoUploadField } from "@/components/photo-upload-field";
import { elementToPdfBlob, safeFilename } from "@/lib/document-export";
import { shareDocument, formatKoreanDate } from "@/lib/official-document";
import {
  Wrench, Receipt, MessageSquareWarning, ChevronLeft, ChevronRight,
  CheckCircle2, AlertTriangle, Image as ImageIcon, FileText, Share2, Printer, NotebookPen,
} from "lucide-react";
import { detectFollowUp, type FollowUpDetection, type FollowUpSource } from "@/lib/follow-up-detection";
import { FollowUpSuggestionDialog } from "@/components/follow-up-suggestion-dialog";

type Category = "facility" | "bill" | "complaint";
type Status = "ok" | "issue";

interface WorkLogEntry {
  id: number;
  category: Category;
  memo: string;
  photoUrl: string | null;
  occurredAt: string;
  occurredDate: string;
  authorName: string;
}

interface DailyJournal {
  id: number;
  journalDate: string;
  authorName: string;
  securityStatus: Status; securityMemo: string | null; securityPhotoUrl: string | null;
  cleaningStatus: Status; cleaningMemo: string | null; cleaningPhotoUrl: string | null;
  facilityStatus: Status; facilityMemo: string | null; facilityPhotoUrl: string | null;
  complaintStatus: Status; complaintMemo: string | null; complaintPhotoUrl: string | null;
}

interface DailyReport {
  date: string;
  buildingName: string | null;
  authorName: string;
  journal: DailyJournal | null;
  entries: WorkLogEntry[];
  statutory: {
    completed: { name: string; result: string | null; memo: string | null }[];
    postponed: { id: number; name: string; nextDueDate: string | null }[];
    drafted: { id: number; title: string; draftType: string }[];
  };
}

interface WeeklyReport {
  weekStart: string; weekEnd: string;
  buildingName: string | null;
  days: { date: string; hasJournal: boolean; issueCount: number; entryCount: number; topMemos: string[] }[];
  sectionTotals: Record<"security" | "cleaning" | "facility" | "complaint", { issues: number; memos: string[] }>;
  byCategory: { facility: number; bill: number; complaint: number };
  totalEntries: number;
  totalJournals: number;
  issues: number;
  textSummary: string;
}

interface MonthlyWeekRollup {
  weekStart: string;
  weekEnd: string;
  totalJournals: number;
  totalEntries: number;
  issues: number;
  byCategory: { facility: number; bill: number; complaint: number };
  sectionTotals: Record<"security" | "cleaning" | "facility" | "complaint", { issues: number; memos: string[] }>;
  textSummary: string;
}

interface MonthlyReport {
  month: string; monthStart: string; monthEnd: string;
  buildingName: string | null;
  weeks: MonthlyWeekRollup[];
  totalEntries: number;
  totalJournals: number;
  issues: number;
  byCategory: { facility: number; bill: number; complaint: number };
  sectionTotals: Record<"security" | "cleaning" | "facility" | "complaint", { issues: number; memos: string[] }>;
  textSummary: string;
}

const CATEGORY_LABEL: Record<Category, string> = {
  facility: "시설", bill: "관리비", complaint: "민원",
};
const CATEGORY_ICON: Record<Category, typeof Wrench> = {
  facility: Wrench, bill: Receipt, complaint: MessageSquareWarning,
};

const SECTIONS: { key: "security" | "cleaning" | "facility" | "complaint"; label: string }[] = [
  { key: "security", label: "보안 / 출입" },
  { key: "cleaning", label: "청소 / 미화" },
  { key: "facility", label: "시설 / 점검" },
  { key: "complaint", label: "민원 / 소통" },
];

/** KST(UTC+9) 기준 YYYY-MM-DD. */
function toKstDateKey(d: Date): string {
  const ms = d.getTime() + 9 * 60 * 60 * 1000;
  return new Date(ms).toISOString().split("T")[0];
}
function todayISO(): string {
  return toKstDateKey(new Date());
}
function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().split("T")[0];
}
function mondayOf(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const day = dt.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  return addDays(iso, diff);
}
function formatWeekLabel(mondayIso: string): string {
  const [y, m, d] = mondayIso.split("-").map(Number);
  const firstOfMonth = new Date(Date.UTC(y, m - 1, 1));
  const firstDow = firstOfMonth.getUTCDay();
  const firstMondayDay = 1 + ((8 - firstDow) % 7);
  const weekNum = Math.floor((d - firstMondayDay) / 7) + 1;
  return `${String(m).padStart(2, "0")}월 ${weekNum}주차`;
}
function thisMonth(): string {
  const today = todayISO();
  return today.slice(0, 7);
}

function useApi() {
  const { token } = useAuth();
  const BASE = import.meta.env.BASE_URL ?? "/";
  const apiBase = `${BASE}api`.replace(/\/+/g, "/");

  async function call<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${apiBase}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init?.headers ?? {}),
      },
    });
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    if (res.status === 204) return null as T;
    return (await res.json()) as T;
  }
  return { call };
}

type WorkLogTab = "timeline" | "daily" | "weekly" | "monthly";

function readInitialTab(): WorkLogTab {
  if (typeof window === "undefined") return "timeline";
  const sp = new URLSearchParams(window.location.search);
  const t = sp.get("tab");
  if (t === "daily" || t === "weekly" || t === "monthly" || t === "timeline") return t;
  return "timeline";
}

export default function WorkLogPage() {
  const [tab, setTab] = useState<WorkLogTab>(readInitialTab);
  const [autoOpenDailyWizard, setAutoOpenDailyWizard] = useState(false);

  return (
    <div className="space-y-4 pb-24">
      <div className="flex items-center gap-2">
        <NotebookPen className="w-5 h-5 text-accent" />
        <h1 className="text-xl font-bold">업무일지</h1>
      </div>
      <p className="text-sm text-muted-foreground">
        평소엔 가볍게 메모만, 보고할 땐 자동으로 일·주·월 일지가 만들어집니다.
      </p>

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList className="grid grid-cols-4 w-full">
          <TabsTrigger value="timeline" data-testid="tab-timeline">타임라인</TabsTrigger>
          <TabsTrigger value="daily" data-testid="tab-daily">일일</TabsTrigger>
          <TabsTrigger value="weekly" data-testid="tab-weekly">주간</TabsTrigger>
          <TabsTrigger value="monthly" data-testid="tab-monthly">월간</TabsTrigger>
        </TabsList>
        <TabsContent value="timeline">
          <TimelineTab onGoDaily={() => { setAutoOpenDailyWizard(true); setTab("daily"); }} />
        </TabsContent>
        <TabsContent value="daily">
          <DailyTab
            autoOpenWizard={autoOpenDailyWizard}
            onAutoOpenConsumed={() => setAutoOpenDailyWizard(false)}
          />
        </TabsContent>
        <TabsContent value="weekly"><WeeklyTab /></TabsContent>
        <TabsContent value="monthly"><MonthlyTab /></TabsContent>
      </Tabs>
    </div>
  );
}

/* ───────────────────────── 타임라인 탭 ───────────────────────── */
function TimelineTab({ onGoDaily }: { onGoDaily: () => void }) {
  const { call } = useApi();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [filter, setFilter] = useState<"all" | Category>("all");
  const [editing, setEditing] = useState<WorkLogEntry | null>(null);
  const [editMemo, setEditMemo] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["work-logs", filter],
    queryFn: () => call<WorkLogEntry[]>(
      `/work-logs${filter === "all" ? "" : `?category=${filter}`}`,
    ),
  });

  const removeMut = useMutation({
    mutationFn: (id: number) => call<null>(`/work-logs/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "삭제되었습니다" });
      qc.invalidateQueries({ queryKey: ["work-logs"] });
    },
  });
  const editMut = useMutation({
    mutationFn: ({ id, memo }: { id: number; memo: string }) =>
      call<WorkLogEntry>(`/work-logs/${id}`, { method: "PATCH", body: JSON.stringify({ memo }) }),
    onSuccess: () => {
      toast({ title: "수정되었습니다" });
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["work-logs"] });
    },
  });

  const grouped = useMemo(() => {
    const map = new Map<string, WorkLogEntry[]>();
    (data ?? []).forEach((e) => {
      const arr = map.get(e.occurredDate) ?? [];
      arr.push(e);
      map.set(e.occurredDate, arr);
    });
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [data]);

  return (
    <div className="space-y-3 pt-3">
      <Button onClick={onGoDaily} className="w-full" data-testid="timeline-goto-daily">
        오늘 업무일지 만들기
      </Button>
      <div className="flex gap-2 overflow-x-auto">
        {([
          ["all", "전체"], ["facility", "시설"], ["bill", "관리비"], ["complaint", "민원"],
        ] as const).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setFilter(k as typeof filter)}
            data-testid={`filter-${k}`}
            className={`px-3 py-1.5 rounded-full text-xs whitespace-nowrap border ${
              filter === k ? "bg-accent text-accent-foreground border-accent" : "bg-background"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10"><Spinner /></div>
      ) : grouped.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            아직 기록이 없습니다. 우측 하단의 + 버튼으로 빠르게 추가해보세요.
          </CardContent>
        </Card>
      ) : (
        grouped.map(([date, items]) => (
          <div key={date} className="space-y-2">
            <div className="text-xs font-semibold text-muted-foreground sticky top-0 bg-background py-1">
              {formatKoreanDate(date)}
            </div>
            {items.map((e) => {
              const Icon = CATEGORY_ICON[e.category];
              return (
                <Card key={e.id} data-testid={`entry-${e.id}`}>
                  <CardContent className="p-3 flex gap-3">
                    <div className="w-9 h-9 rounded-full bg-accent/10 flex items-center justify-center shrink-0">
                      <Icon className="w-4 h-4 text-accent" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Badge variant="outline" className="text-[10px]">{CATEGORY_LABEL[e.category]}</Badge>
                        <span>{e.authorName}</span>
                      </div>
                      <p className="text-sm whitespace-pre-wrap mt-1 break-words">{e.memo}</p>
                      {e.photoUrl ? (
                        <AuthImage src={e.photoUrl} alt="" className="mt-2 max-h-40 rounded-md border" />
                      ) : null}
                    </div>
                    <div className="flex flex-col gap-1 shrink-0 text-xs">
                      <button
                        onClick={() => { setEditing(e); setEditMemo(e.memo); }}
                        className="text-muted-foreground hover:text-foreground"
                        data-testid={`edit-${e.id}`}
                      >
                        수정
                      </button>
                      <button
                        onClick={() => { if (confirm("삭제할까요?")) removeMut.mutate(e.id); }}
                        className="text-muted-foreground hover:text-destructive"
                        data-testid={`delete-${e.id}`}
                      >
                        삭제
                      </button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ))
      )}

      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>업무 기록 수정</DialogTitle></DialogHeader>
          <Textarea
            value={editMemo}
            onChange={(e) => setEditMemo(e.target.value)}
            rows={4}
            data-testid="edit-memo-input"
          />
          <Button
            onClick={() => editing && editMut.mutate({ id: editing.id, memo: editMemo.trim() })}
            disabled={editMut.isPending || !editMemo.trim()}
            data-testid="edit-save"
          >
            저장
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ───────────────────────── 일일 탭 (위저드 + 보고서) ───────────────────────── */
function DailyTab({ autoOpenWizard = false, onAutoOpenConsumed }: { autoOpenWizard?: boolean; onAutoOpenConsumed?: () => void } = {}) {
  const [date, setDate] = useState(todayISO());
  const [wizardOpen, setWizardOpen] = useState(false);
  const [pendingAutoOpen, setPendingAutoOpen] = useState(false);
  const { call } = useApi();

  useEffect(() => {
    if (autoOpenWizard) {
      setDate(todayISO());
      setPendingAutoOpen(true);
      onAutoOpenConsumed?.();
    }
  }, [autoOpenWizard, onAutoOpenConsumed]);

  const reportQ = useQuery({
    queryKey: ["work-log-report-daily", date],
    queryFn: () => call<DailyReport>(`/work-log-reports/daily?date=${date}`),
  });

  useEffect(() => {
    if (pendingAutoOpen && !reportQ.isLoading && !reportQ.isFetching) {
      setWizardOpen(true);
      setPendingAutoOpen(false);
    }
  }, [pendingAutoOpen, reportQ.isLoading, reportQ.isFetching]);

  return (
    <div className="space-y-3 pt-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setDate(addDays(date, -1))} data-testid="daily-prev">
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-40" data-testid="daily-date" />
          <Button variant="outline" size="sm" onClick={() => setDate(addDays(date, 1))} data-testid="daily-next">
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
        <Button onClick={() => setWizardOpen(true)} data-testid="open-wizard">
          {reportQ.data?.journal ? "일일 일지 수정" : "일일 일지 작성"}
        </Button>
      </div>

      {reportQ.isLoading ? (
        <div className="flex justify-center py-10"><Spinner /></div>
      ) : reportQ.data ? (
        <DailyReportPreview report={reportQ.data} />
      ) : null}

      {wizardOpen && (
        <DailyJournalWizard
          date={date}
          existing={reportQ.data?.journal ?? null}
          onClose={() => setWizardOpen(false)}
          onSaved={() => { setWizardOpen(false); reportQ.refetch(); }}
        />
      )}
    </div>
  );
}

/**
 * [Task #205] 일/주/월 일지 공통 액션 버튼.
 * "이미지로 저장 / 공유 / 인쇄" 3개를 가로 풀폭 균등 배치한다.
 * 세 탭에서 명칭·아이콘·동작이 동일해야 한다.
 */
function ReportActionRow({
  onSaveImage, onShare, onPrint,
  saving = false, sharing = false,
  testidPrefix,
}: {
  onSaveImage: () => void;
  onShare: () => void;
  onPrint: () => void;
  saving?: boolean;
  sharing?: boolean;
  testidPrefix: string;
}) {
  return (
    <div className="grid grid-cols-3 gap-2 print:hidden" data-testid={`${testidPrefix}-actions`}>
      <Button
        variant="outline"
        onClick={onSaveImage}
        disabled={saving}
        data-testid={`${testidPrefix}-save-image`}
        className="w-full"
      >
        <FileText className="w-4 h-4 mr-1" />
        {saving ? "저장 중..." : "PDF로 저장"}
      </Button>
      <Button
        variant="outline"
        onClick={onShare}
        disabled={sharing}
        data-testid={`${testidPrefix}-share`}
        className="w-full"
      >
        <Share2 className="w-4 h-4 mr-1" />
        {sharing ? "공유 중..." : "공유"}
      </Button>
      <Button
        variant="outline"
        onClick={onPrint}
        data-testid={`${testidPrefix}-print`}
        className="w-full"
      >
        <Printer className="w-4 h-4 mr-1" />
        인쇄
      </Button>
    </div>
  );
}

async function withReadyDoc<T>(
  frameRef: React.RefObject<A4DocumentFrameHandle | null>,
  fn: () => Promise<T> | T,
): Promise<T> {
  if (frameRef.current) return await frameRef.current.withFullScale(fn);
  return await fn();
}

/** 일/주/월 일지 공통 PDF 다운로드 헬퍼. */
async function downloadElementAsPdf(element: HTMLElement, baseFilename: string): Promise<void> {
  const blob = await elementToPdfBlob(element);
  const filename = baseFilename.endsWith(".pdf") ? baseFilename : `${baseFilename}.pdf`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function DailyReportPreview({ report }: { report: DailyReport }) {
  const ref = useRef<HTMLDivElement>(null);
  const frameRef = useRef<A4DocumentFrameHandle>(null);
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [sharing, setSharing] = useState(false);

  async function exportPng() {
    if (!ref.current) return;
    setSaving(true);
    try {
      await withReadyDoc(frameRef, async () => {
        if (!ref.current) return;
        await downloadElementAsPdf(ref.current, safeFilename(`일일일지_${report.date}`));
      });
      toast({ title: "PDF 저장 완료" });
    } catch (e) {
      toast({ title: "내보내기 실패", description: String(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }
  async function share() {
    setSharing(true);
    try {
      const text = buildDailyShareText(report);
      const r = await shareDocument({ title: `일일 일지 ${report.date}`, text });
      if (r === "copied") toast({ title: "본문이 클립보드에 복사되었습니다" });
      else if (r === "failed") toast({ title: "공유 실패", variant: "destructive" });
    } finally {
      setSharing(false);
    }
  }
  function print() {
    void withReadyDoc(frameRef, () => {
      window.print();
    });
  }

  return (
    <>
      <ReportActionRow
        testidPrefix="daily"
        onSaveImage={exportPng}
        onShare={share}
        onPrint={print}
        saving={saving}
        sharing={sharing}
      />

      <A4DocumentFrame ref={frameRef}>
        <div ref={ref} className="a4-document text-foreground space-y-3">
          <h2 className="text-2xl font-bold text-center border-b-2 border-black pb-3">일 일 업 무 보 고 서</h2>

          <table className="w-full text-sm border-collapse mt-2">
            <tbody>
              <tr>
                <td className="border border-gray-400 bg-gray-100 font-semibold w-24 p-2">건물명</td>
                <td className="border border-gray-400 p-2">{report.buildingName ?? "-"}</td>
                <td className="border border-gray-400 bg-gray-100 font-semibold w-24 p-2">일자</td>
                <td className="border border-gray-400 p-2">{formatKoreanDate(report.date)}</td>
              </tr>
              <tr>
                <td className="border border-gray-400 bg-gray-100 font-semibold p-2">작성자</td>
                <td className="border border-gray-400 p-2">{report.authorName ?? "-"}</td>
                <td className="border border-gray-400 bg-gray-100 font-semibold p-2">작성일</td>
                <td className="border border-gray-400 p-2">{formatKoreanDate(todayISO())}</td>
              </tr>
              <tr>
                <td className="border border-gray-400 bg-gray-100 font-semibold p-2">총괄</td>
                <td className="border border-gray-400 p-2" colSpan={3}>
                  업무 기록 {report.entries.length}건 · 법정업무 완료 {report.statutory.completed.length} / 미완료 {report.statutory.postponed.length} / 기안 {report.statutory.drafted.length}
                </td>
              </tr>
            </tbody>
          </table>

          <p className="font-semibold mt-4 mb-2 text-[15px] border-l-4 border-gray-700 pl-2">1. 일일 일지</p>
          {report.journal ? (
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr>
                  <th className="border border-gray-400 bg-gray-100 p-2 w-28">영역</th>
                  <th className="border border-gray-400 bg-gray-100 p-2 w-24">상태</th>
                  <th className="border border-gray-400 bg-gray-100 p-2">메모</th>
                </tr>
              </thead>
              <tbody>
                {SECTIONS.map((s) => {
                  const status = report.journal![`${s.key}Status` as const] as Status;
                  const memo = report.journal![`${s.key}Memo` as const] as string | null;
                  return (
                    <tr key={s.key}>
                      <td className="border border-gray-400 p-2 font-semibold">{s.label}</td>
                      <td className="border border-gray-400 p-2 text-center">
                        {status === "ok" ? "이상 없음" : "특이사항"}
                      </td>
                      <td className="border border-gray-400 p-2 whitespace-pre-line">{memo || "-"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <p className="text-xs text-muted-foreground border border-gray-300 rounded p-3">아직 작성되지 않았습니다.</p>
          )}

          <p className="font-semibold mt-4 mb-2 text-[15px] border-l-4 border-gray-700 pl-2">2. 금일 업무 기록 ({report.entries.length}건)</p>
          {report.entries.length === 0 ? (
            <p className="text-sm border border-gray-300 rounded p-3 text-muted-foreground">기록 없음</p>
          ) : (
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr>
                  <th className="border border-gray-400 bg-gray-100 p-2 w-24">분류</th>
                  <th className="border border-gray-400 bg-gray-100 p-2">메모</th>
                  <th className="border border-gray-400 bg-gray-100 p-2 w-16">사진</th>
                </tr>
              </thead>
              <tbody>
                {report.entries.map((e) => (
                  <tr key={e.id}>
                    <td className="border border-gray-400 p-2">{CATEGORY_LABEL[e.category]}</td>
                    <td className="border border-gray-400 p-2 whitespace-pre-line">{e.memo}</td>
                    <td className="border border-gray-400 p-2 text-center">
                      {e.photoUrl ? <ImageIcon className="inline w-3 h-3 text-muted-foreground" /> : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <p className="font-semibold mt-4 mb-2 text-[15px] border-l-4 border-gray-700 pl-2">3. 법정/정기 업무</p>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr>
                <th className="border border-gray-400 bg-gray-100 p-2 w-24">구분</th>
                <th className="border border-gray-400 bg-gray-100 p-2 w-16">건수</th>
                <th className="border border-gray-400 bg-gray-100 p-2">내역</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-gray-400 p-2 font-semibold">완료</td>
                <td className="border border-gray-400 p-2 text-center">{report.statutory.completed.length}</td>
                <td className="border border-gray-400 p-2">
                  {report.statutory.completed.length === 0
                    ? "-"
                    : report.statutory.completed.map((c) => c.name).join(", ")}
                </td>
              </tr>
              <tr>
                <td className="border border-gray-400 p-2 font-semibold">미완료</td>
                <td className="border border-gray-400 p-2 text-center">{report.statutory.postponed.length}</td>
                <td className="border border-gray-400 p-2">
                  {report.statutory.postponed.length === 0
                    ? "-"
                    : report.statutory.postponed.map((p) => p.name).join(", ")}
                </td>
              </tr>
              <tr>
                <td className="border border-gray-400 p-2 font-semibold">기안</td>
                <td className="border border-gray-400 p-2 text-center">{report.statutory.drafted.length}</td>
                <td className="border border-gray-400 p-2">
                  {report.statutory.drafted.length === 0
                    ? "-"
                    : report.statutory.drafted.map((d) => d.title).join(", ")}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </A4DocumentFrame>
    </>
  );
}

function buildDailyShareText(r: DailyReport): string {
  const lines: string[] = [];
  lines.push(`[${r.buildingName ?? "건물"}] ${r.date} 일일 업무 보고`);
  lines.push(`작성: ${r.authorName}`);
  lines.push("");
  if (r.journal) {
    SECTIONS.forEach((s) => {
      const st = r.journal![`${s.key}Status` as const] as Status;
      const memo = r.journal![`${s.key}Memo` as const] as string | null;
      lines.push(`■ ${s.label}: ${st === "ok" ? "이상 없음" : "특이사항"}${memo ? ` — ${memo}` : ""}`);
    });
    lines.push("");
  }
  lines.push(`■ 금일 업무 기록 ${r.entries.length}건`);
  r.entries.forEach((e) => {
    lines.push(`  [${CATEGORY_LABEL[e.category]}] ${e.memo}`);
  });
  lines.push("");
  lines.push(`■ 법정업무: 완료 ${r.statutory.completed.length} / 미완료 ${r.statutory.postponed.length} / 기안 ${r.statutory.drafted.length}`);
  return lines.join("\n");
}

/* ─────────── 일일 일지 4단계 위저드 ─────────── */
function DailyJournalWizard({
  date, existing, onClose, onSaved,
}: { date: string; existing: DailyJournal | null; onClose: () => void; onSaved: () => void }) {
  const { call } = useApi();
  const { toast } = useToast();
  const [step, setStep] = useState(0);
  const [followUpOpen, setFollowUpOpen] = useState(false);
  const [followUpDetection, setFollowUpDetection] = useState<FollowUpDetection | null>(null);
  const [followUpSource, setFollowUpSource] = useState<FollowUpSource | null>(null);
  const [form, setForm] = useState({
    securityStatus: existing?.securityStatus ?? "ok" as Status,
    securityMemo: existing?.securityMemo ?? "",
    securityPhotoUrl: existing?.securityPhotoUrl ?? null as string | null,
    cleaningStatus: existing?.cleaningStatus ?? "ok" as Status,
    cleaningMemo: existing?.cleaningMemo ?? "",
    cleaningPhotoUrl: existing?.cleaningPhotoUrl ?? null as string | null,
    facilityStatus: existing?.facilityStatus ?? "ok" as Status,
    facilityMemo: existing?.facilityMemo ?? "",
    facilityPhotoUrl: existing?.facilityPhotoUrl ?? null as string | null,
    complaintStatus: existing?.complaintStatus ?? "ok" as Status,
    complaintMemo: existing?.complaintMemo ?? "",
    complaintPhotoUrl: existing?.complaintPhotoUrl ?? null as string | null,
  });

  const saveMut = useMutation({
    mutationFn: () => call<DailyJournal>(`/daily-journals/${date}`, {
      method: "PUT", body: JSON.stringify(form),
    }),
    onSuccess: (saved) => {
      toast({ title: "일일 일지가 저장되었습니다" });
      // [Task #197] 4개 영역 메모를 합쳐 후속 조치 키워드를 감지한다.
      const combined = SECTIONS
        .map((s) => `${s.label}: ${form[`${s.key}Memo` as const] ?? ""}`)
        .join("\n");
      const detection = detectFollowUp(combined);
      if (detection) {
        setFollowUpSource({
          type: "daily_journal",
          id: saved?.id ?? date,
          title: `${date} 일일업무일지 — ${detection.snippet.slice(0, 40)}`,
          occurredAt: date,
        });
        setFollowUpDetection(detection);
        setFollowUpOpen(true);
      } else {
        onSaved();
      }
    },
    onError: (e) => toast({ title: "저장 실패", description: String(e), variant: "destructive" }),
  });

  // 단계 이동 시 자동 저장 (멱등 PUT). 실패해도 사용자 흐름은 막지 않는다.
  async function autoSave() {
    try {
      await call<DailyJournal>(`/daily-journals/${date}`, { method: "PUT", body: JSON.stringify(form) });
    } catch {
      // best-effort
    }
  }
  function goNext() { autoSave(); setStep(step + 1); }
  function goPrev() { autoSave(); setStep(step - 1); }

  const section = SECTIONS[step];
  const statusKey = `${section.key}Status` as const;
  const memoKey = `${section.key}Memo` as const;
  const photoKey = `${section.key}PhotoUrl` as const;

  return (
    <>
    <FollowUpSuggestionDialog
      open={followUpOpen}
      source={followUpSource}
      detection={followUpDetection}
      onClose={() => { setFollowUpOpen(false); onSaved(); }}
    />
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{date} · 일일 일지 ({step + 1}/4)</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex gap-1">
            {SECTIONS.map((_, i) => (
              <div key={i} className={`flex-1 h-1.5 rounded-full ${i <= step ? "bg-accent" : "bg-muted"}`} />
            ))}
          </div>

          <div>
            <h3 className="text-base font-semibold">{section.label}</h3>
            <p className="text-xs text-muted-foreground">오늘 이 영역에 특이사항이 있었나요?</p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setForm((f) => ({ ...f, [statusKey]: "ok" }))}
              data-testid={`wizard-${section.key}-ok`}
              className={`py-3 rounded-lg border flex items-center justify-center gap-1 ${
                form[statusKey] === "ok" ? "bg-emerald-50 border-emerald-500 text-emerald-700" : ""
              }`}
            >
              <CheckCircle2 className="w-4 h-4" /> 이상 없음
            </button>
            <button
              type="button"
              onClick={() => setForm((f) => ({ ...f, [statusKey]: "issue" }))}
              data-testid={`wizard-${section.key}-issue`}
              className={`py-3 rounded-lg border flex items-center justify-center gap-1 ${
                form[statusKey] === "issue" ? "bg-amber-50 border-amber-500 text-amber-700" : ""
              }`}
            >
              <AlertTriangle className="w-4 h-4" /> 특이사항
            </button>
          </div>

          <Textarea
            value={form[memoKey] ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, [memoKey]: e.target.value }))}
            placeholder={form[statusKey] === "issue" ? "어떤 일이 있었는지 알려주세요" : "메모 (선택)"}
            rows={3}
            data-testid={`wizard-${section.key}-memo`}
          />

          <PhotoUploadField
            label="사진 (선택)"
            value={form[photoKey] ?? null}
            onChange={(url) => setForm((f) => ({ ...f, [photoKey]: url }))}
            testId={`wizard-${section.key}-photo`}
          />

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => step === 0 ? onClose() : goPrev()} data-testid="wizard-prev">
              {step === 0 ? "취소" : "이전"}
            </Button>
            {step < 3 ? (
              <Button onClick={goNext} data-testid="wizard-next">다음</Button>
            ) : (
              <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending} data-testid="wizard-save">
                {saveMut.isPending ? <Spinner className="w-4 h-4 mr-1" /> : null}
                저장
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}

/* ───────────────────────── 주간 탭 ───────────────────────── */
function WeeklyTab() {
  const [weekStart, setWeekStart] = useState(mondayOf(todayISO()));
  const { call } = useApi();
  const { toast } = useToast();
  const ref = useRef<HTMLDivElement>(null);
  const frameRef = useRef<A4DocumentFrameHandle>(null);
  const [saving, setSaving] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [followUpOpen, setFollowUpOpen] = useState(false);
  const [followUpDetection, setFollowUpDetection] = useState<FollowUpDetection | null>(null);
  const [followUpSource, setFollowUpSource] = useState<FollowUpSource | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["work-log-report-weekly", weekStart],
    queryFn: () => call<WeeklyReport>(`/work-log-reports/weekly?weekStart=${weekStart}`),
  });

  // [Task #197] 주간 보고서를 "생성/공유" 하는 시점에 후속 조치 키워드를 감지한다.
  // (단순 페이지 진입/탭 이동에는 띄우지 않는다.)
  function maybeOfferFollowUp(report: WeeklyReport) {
    const memos = [
      ...Object.values(report.sectionTotals).flatMap((s) => s.memos),
      ...report.days.flatMap((d) => d.topMemos),
    ].join("\n");
    const detection = detectFollowUp(memos);
    if (!detection) return;
    setFollowUpSource({
      type: "weekly_journal",
      id: report.weekStart,
      title: `${report.weekStart}~${report.weekEnd} 주간보고 — ${detection.snippet.slice(0, 30)}`,
      occurredAt: report.weekStart,
    });
    setFollowUpDetection(detection);
    setFollowUpOpen(true);
  }

  async function exportPng() {
    if (!ref.current || !data) return;
    setSaving(true);
    try {
      await withReadyDoc(frameRef, async () => {
        if (!ref.current) return;
        await downloadElementAsPdf(ref.current, safeFilename(`주간일지_${data.weekStart}_${data.weekEnd}`));
      });
      toast({ title: "PDF 저장 완료" });
      maybeOfferFollowUp(data);
    } catch (e) {
      toast({ title: "내보내기 실패", description: String(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }
  async function share() {
    if (!data) return;
    setSharing(true);
    try {
      const lines = [
        `[${data.buildingName ?? "건물"}] 주간 업무 보고 (${data.weekStart} ~ ${data.weekEnd})`,
        `일지 ${data.totalJournals}/7일 · 기록 ${data.totalEntries}건 · 특이 ${data.issues}건`,
        "",
        data.textSummary,
        "",
        ...SECTIONS.map((s) => `■ ${s.label}: 특이 ${data.sectionTotals[s.key].issues}일`),
      ];
      const r = await shareDocument({ title: `주간 보고 ${data.weekStart}`, text: lines.join("\n") });
      if (r === "copied") {
        toast({ title: "본문이 클립보드에 복사되었습니다" });
        maybeOfferFollowUp(data);
      } else if (r === "failed") {
        toast({ title: "공유 실패", variant: "destructive" });
      } else {
        maybeOfferFollowUp(data);
      }
    } finally {
      setSharing(false);
    }
  }
  function print() {
    void withReadyDoc(frameRef, () => { window.print(); });
  }

  return (
    <div className="space-y-3 pt-3">
      <FollowUpSuggestionDialog
        open={followUpOpen}
        source={followUpSource}
        detection={followUpDetection}
        onClose={() => setFollowUpOpen(false)}
      />
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setWeekStart(addDays(weekStart, -7))} data-testid="weekly-prev"><ChevronLeft className="w-4 h-4" /></Button>
          <span className="text-sm font-medium" data-testid="weekly-range">{formatWeekLabel(weekStart)}</span>
          <Button variant="outline" size="sm" onClick={() => setWeekStart(addDays(weekStart, 7))} data-testid="weekly-next"><ChevronRight className="w-4 h-4" /></Button>
        </div>
      </div>

      <ReportActionRow
        testidPrefix="weekly"
        onSaveImage={exportPng}
        onShare={share}
        onPrint={print}
        saving={saving}
        sharing={sharing}
      />

      {isLoading ? (
        <div className="flex justify-center py-10"><Spinner /></div>
      ) : data ? (
        <A4DocumentFrame ref={frameRef}>
          <div ref={ref} className="a4-document text-foreground" style={{ fontFamily: "'Noto Sans KR', 'Malgun Gothic', sans-serif" }}>
            <WeeklyA4ReportBody report={data} />
          </div>
        </A4DocumentFrame>
      ) : null}
    </div>
  );
}

/* [Task #205] 주간 일지 — A4 보고서 양식. 내용이 길면 여러 장으로 출력된다. */
function WeeklyA4ReportBody({ report }: { report: WeeklyReport }) {
  return (
    <div className="space-y-3">
      <h2 className="text-2xl font-bold text-center border-b-2 border-black pb-3">주 간 업 무 보 고 서</h2>
      <table className="w-full text-sm border-collapse mt-2">
        <tbody>
          <tr>
            <td className="border border-gray-400 bg-gray-100 font-semibold w-24 p-2">건물명</td>
            <td className="border border-gray-400 p-2">{report.buildingName ?? "-"}</td>
            <td className="border border-gray-400 bg-gray-100 font-semibold w-24 p-2">기간</td>
            <td className="border border-gray-400 p-2">{formatKoreanDate(report.weekStart)} ~ {formatKoreanDate(report.weekEnd)}</td>
          </tr>
          <tr>
            <td className="border border-gray-400 bg-gray-100 font-semibold p-2">작성일</td>
            <td className="border border-gray-400 p-2">{formatKoreanDate(todayISO())}</td>
            <td className="border border-gray-400 bg-gray-100 font-semibold p-2">주차</td>
            <td className="border border-gray-400 p-2">{formatWeekLabel(report.weekStart)}</td>
          </tr>
          <tr>
            <td className="border border-gray-400 bg-gray-100 font-semibold p-2">총괄</td>
            <td className="border border-gray-400 p-2" colSpan={3}>
              일지 {report.totalJournals}/7일 · 업무 기록 {report.totalEntries}건 · 특이사항 {report.issues}건
            </td>
          </tr>
        </tbody>
      </table>

      <p className="font-semibold mt-4 mb-2 text-[15px] border-l-4 border-gray-700 pl-2">1. 주간 요약</p>
      <div className="text-[14px] leading-7 whitespace-pre-line border border-gray-300 rounded p-3" data-testid="weekly-text-summary">
        {report.textSummary || "기록 없음"}
      </div>

      <p className="font-semibold mt-4 mb-2 text-[15px] border-l-4 border-gray-700 pl-2">2. 요일별 일지 / 기록</p>
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr>
            <th className="border border-gray-400 bg-gray-100 p-2 w-28">일자</th>
            <th className="border border-gray-400 bg-gray-100 p-2 w-20">일지</th>
            <th className="border border-gray-400 bg-gray-100 p-2 w-20">기록</th>
            <th className="border border-gray-400 bg-gray-100 p-2 w-20">특이</th>
            <th className="border border-gray-400 bg-gray-100 p-2">주요 메모</th>
          </tr>
        </thead>
        <tbody>
          {report.days.map((d) => (
            <tr key={d.date}>
              <td className="border border-gray-400 p-2">{d.date}</td>
              <td className="border border-gray-400 p-2 text-center">{d.hasJournal ? "✓" : "—"}</td>
              <td className="border border-gray-400 p-2 text-center">{d.entryCount}</td>
              <td className="border border-gray-400 p-2 text-center">{d.issueCount}</td>
              <td className="border border-gray-400 p-2">
                {d.topMemos.length === 0 ? "-" : (
                  <ul className="space-y-0.5">{d.topMemos.map((m, i) => <li key={i}>· {m}</li>)}</ul>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="font-semibold mt-4 mb-2 text-[15px] border-l-4 border-gray-700 pl-2">3. 영역별 특이사항</p>
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr>
            <th className="border border-gray-400 bg-gray-100 p-2 w-32">영역</th>
            <th className="border border-gray-400 bg-gray-100 p-2 w-20">특이일수</th>
            <th className="border border-gray-400 bg-gray-100 p-2">주요 메모</th>
          </tr>
        </thead>
        <tbody>
          {SECTIONS.map((s) => {
            const tot = report.sectionTotals[s.key];
            return (
              <tr key={s.key}>
                <td className="border border-gray-400 p-2 font-semibold">{s.label}</td>
                <td className="border border-gray-400 p-2 text-center">{tot.issues}일</td>
                <td className="border border-gray-400 p-2">
                  {tot.memos.length === 0 ? "-" : (
                    <ul className="space-y-0.5">{tot.memos.slice(0, 5).map((m, i) => <li key={i}>· {m}</li>)}</ul>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <p className="font-semibold mt-4 mb-2 text-[15px] border-l-4 border-gray-700 pl-2">4. 분류별 기록 합계</p>
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr>
            <th className="border border-gray-400 bg-gray-100 p-2">시설</th>
            <th className="border border-gray-400 bg-gray-100 p-2">관리비</th>
            <th className="border border-gray-400 bg-gray-100 p-2">민원</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="border border-gray-400 p-2 text-center">{report.byCategory.facility}건</td>
            <td className="border border-gray-400 p-2 text-center">{report.byCategory.bill}건</td>
            <td className="border border-gray-400 p-2 text-center">{report.byCategory.complaint}건</td>
          </tr>
        </tbody>
      </table>

      <div className="text-right pt-8 text-sm space-y-1">
        <p>{formatKoreanDate(todayISO())}</p>
        <p>작성자: {/* author 정보는 일지 단위라 주간 보고서엔 표기 생략 */} 관리자 (서명)</p>
      </div>
    </div>
  );
}

/* ───────────────────────── 월간 탭 ───────────────────────── */
function MonthlyTab() {
  const [month, setMonth] = useState(thisMonth());
  const { call } = useApi();
  const { toast } = useToast();
  const ref = useRef<HTMLDivElement>(null);
  const frameRef = useRef<A4DocumentFrameHandle>(null);
  const [saving, setSaving] = useState(false);
  const [sharing, setSharing] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["work-log-report-monthly", month],
    queryFn: () => call<MonthlyReport>(`/work-log-reports/monthly?month=${month}`),
  });

  async function exportPng() {
    if (!ref.current || !data) return;
    setSaving(true);
    try {
      await withReadyDoc(frameRef, async () => {
        if (!ref.current) return;
        await downloadElementAsPdf(ref.current, safeFilename(`월간일지_${data.month}`));
      });
      toast({ title: "PDF 저장 완료" });
    } catch (e) {
      toast({ title: "내보내기 실패", description: String(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }
  async function share() {
    if (!data) return;
    setSharing(true);
    try {
      const lines = [
        `[${data.buildingName ?? "건물"}] ${data.month} 월간 업무 보고`,
        `일지 ${data.totalJournals}일 · 기록 ${data.totalEntries}건 · ${data.weeks.length}주 · 특이 ${data.issues}건`,
        "",
        data.textSummary,
        "",
        ...data.weeks.map((w) => `[${w.weekStart}] ${w.textSummary}`),
      ];
      const r = await shareDocument({ title: `월간 보고 ${data.month}`, text: lines.join("\n") });
      if (r === "copied") toast({ title: "본문이 클립보드에 복사되었습니다" });
      else if (r === "failed") toast({ title: "공유 실패", variant: "destructive" });
    } finally {
      setSharing(false);
    }
  }
  function print() {
    void withReadyDoc(frameRef, () => { window.print(); });
  }

  function shiftMonth(delta: number) {
    const [y, m] = month.split("-").map(Number);
    const d = new Date(Date.UTC(y, m - 1 + delta, 1));
    setMonth(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }

  return (
    <div className="space-y-3 pt-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => shiftMonth(-1)} data-testid="monthly-prev"><ChevronLeft className="w-4 h-4" /></Button>
          <span className="text-sm font-medium" data-testid="monthly-label">{month}</span>
          <Button variant="outline" size="sm" onClick={() => shiftMonth(1)} data-testid="monthly-next"><ChevronRight className="w-4 h-4" /></Button>
        </div>
      </div>

      <ReportActionRow
        testidPrefix="monthly"
        onSaveImage={exportPng}
        onShare={share}
        onPrint={print}
        saving={saving}
        sharing={sharing}
      />

      {isLoading ? (
        <div className="flex justify-center py-10"><Spinner /></div>
      ) : data ? (
        <A4DocumentFrame ref={frameRef}>
          <div ref={ref} className="a4-document text-foreground" style={{ fontFamily: "'Noto Sans KR', 'Malgun Gothic', sans-serif" }}>
            <MonthlyA4ReportBody report={data} />
          </div>
        </A4DocumentFrame>
      ) : null}
    </div>
  );
}

/* [Task #205] 월간 일지 — A4 보고서 양식. 주차가 많을 경우 여러 장 출력 */
function MonthlyA4ReportBody({ report }: { report: MonthlyReport }) {
  return (
    <div className="space-y-3">
      <h2 className="text-2xl font-bold text-center border-b-2 border-black pb-3">월 간 업 무 보 고 서</h2>
      <table className="w-full text-sm border-collapse mt-2">
        <tbody>
          <tr>
            <td className="border border-gray-400 bg-gray-100 font-semibold w-24 p-2">건물명</td>
            <td className="border border-gray-400 p-2">{report.buildingName ?? "-"}</td>
            <td className="border border-gray-400 bg-gray-100 font-semibold w-24 p-2">대상월</td>
            <td className="border border-gray-400 p-2">{report.month}</td>
          </tr>
          <tr>
            <td className="border border-gray-400 bg-gray-100 font-semibold p-2">기간</td>
            <td className="border border-gray-400 p-2">{formatKoreanDate(report.monthStart)} ~ {formatKoreanDate(report.monthEnd)}</td>
            <td className="border border-gray-400 bg-gray-100 font-semibold p-2">작성일</td>
            <td className="border border-gray-400 p-2">{formatKoreanDate(todayISO())}</td>
          </tr>
          <tr>
            <td className="border border-gray-400 bg-gray-100 font-semibold p-2">총괄</td>
            <td className="border border-gray-400 p-2" colSpan={3}>
              일지 {report.totalJournals}일 · 업무 기록 {report.totalEntries}건 · {report.weeks.length}주차 · 특이사항 {report.issues}건
            </td>
          </tr>
        </tbody>
      </table>

      <p className="font-semibold mt-4 mb-2 text-[15px] border-l-4 border-gray-700 pl-2">1. 월간 요약</p>
      <div className="text-[14px] leading-7 whitespace-pre-line border border-gray-300 rounded p-3" data-testid="monthly-text-summary">
        {report.textSummary || "기록 없음"}
      </div>

      <p className="font-semibold mt-4 mb-2 text-[15px] border-l-4 border-gray-700 pl-2">2. 주차별 요약</p>
      {report.weeks.length === 0 ? (
        <p className="text-sm text-gray-600">기록 없음</p>
      ) : (
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr>
              <th className="border border-gray-400 bg-gray-100 p-2 w-44">주차</th>
              <th className="border border-gray-400 bg-gray-100 p-2 w-20">일지</th>
              <th className="border border-gray-400 bg-gray-100 p-2 w-20">기록</th>
              <th className="border border-gray-400 bg-gray-100 p-2 w-20">특이</th>
              <th className="border border-gray-400 bg-gray-100 p-2">요약</th>
            </tr>
          </thead>
          <tbody>
            {report.weeks.map((w) => (
              <tr key={w.weekStart} data-testid={`monthly-week-${w.weekStart}`}>
                <td className="border border-gray-400 p-2">{w.weekStart}<br />~ {w.weekEnd}</td>
                <td className="border border-gray-400 p-2 text-center">{w.totalJournals}일</td>
                <td className="border border-gray-400 p-2 text-center">{w.totalEntries}건</td>
                <td className="border border-gray-400 p-2 text-center">{w.issues}건</td>
                <td className="border border-gray-400 p-2 whitespace-pre-line">{w.textSummary || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p className="font-semibold mt-4 mb-2 text-[15px] border-l-4 border-gray-700 pl-2">3. 영역별 특이사항</p>
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr>
            <th className="border border-gray-400 bg-gray-100 p-2 w-32">영역</th>
            <th className="border border-gray-400 bg-gray-100 p-2 w-20">특이일수</th>
            <th className="border border-gray-400 bg-gray-100 p-2">주요 메모</th>
          </tr>
        </thead>
        <tbody>
          {SECTIONS.map((s) => {
            const tot = report.sectionTotals[s.key];
            return (
              <tr key={s.key}>
                <td className="border border-gray-400 p-2 font-semibold">{s.label}</td>
                <td className="border border-gray-400 p-2 text-center">{tot.issues}일</td>
                <td className="border border-gray-400 p-2">
                  {tot.memos.length === 0 ? "-" : (
                    <ul className="space-y-0.5">{tot.memos.slice(0, 5).map((m, i) => <li key={i}>· {m}</li>)}</ul>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <p className="font-semibold mt-4 mb-2 text-[15px] border-l-4 border-gray-700 pl-2">4. 분류별 기록 합계</p>
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr>
            <th className="border border-gray-400 bg-gray-100 p-2">시설</th>
            <th className="border border-gray-400 bg-gray-100 p-2">관리비</th>
            <th className="border border-gray-400 bg-gray-100 p-2">민원</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="border border-gray-400 p-2 text-center">{report.byCategory.facility}건</td>
            <td className="border border-gray-400 p-2 text-center">{report.byCategory.bill}건</td>
            <td className="border border-gray-400 p-2 text-center">{report.byCategory.complaint}건</td>
          </tr>
        </tbody>
      </table>

      <div className="text-right pt-8 text-sm space-y-1">
        <p>{formatKoreanDate(todayISO())}</p>
        <p>작성자: 관리자 (서명)</p>
      </div>
    </div>
  );
}
