import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { formatKoreanDate } from "@/lib/official-document";
import {
  useApi, todayISO, addDays, CATEGORY_LABEL,
  type WorkLogEntry,
} from "./shared";

/* ───────────────────────── 처리 내역 탭 (Task #250) ─────────────────────────
 * 메모(work_log_entries 단건), 후속조치(alert_actions 처리완료/연기),
 * 일일 일지(daily_journals 보고서) 를 한 화면에서 시간순(최신순)으로 본다.
 * 본 탭은 읽기 전용 통합 뷰이며, 원본 화면(메모: 타임라인 탭, 후속조치: 업무관리,
 * 일지: 일일 탭) 으로 즉시 이동할 수 있다.
 */
type ActivityKind = "memo" | "follow_up" | "journal";

interface ActivityRow {
  id: string;
  kind: ActivityKind;
  title: string;
  subtitle?: string;
  timestamp: string;
  href?: string;
  badge?: string;
}

const ACTIVITY_META: Record<ActivityKind, { label: string; className: string }> = {
  memo:      { label: "메모",     className: "border-amber-300 text-amber-700" },
  follow_up: { label: "처리완료", className: "border-blue-300 text-blue-700" },
  journal:   { label: "일지",     className: "border-emerald-300 text-emerald-700" },
};

export function ActivityTab() {
  const { call } = useApi();
  // [Hotfix] 사용자 요청: 분류 필터(전체/메모/처리완료/일지) 제거.
  // 모든 종류를 한 화면에 시간순으로 보여주고 기간 필터만 노출한다.
  // rangeDays = 7 / 30 / 90 + "custom" (기간검색 — startDate/endDate 직접 지정).
  type RangeMode = 7 | 30 | 90 | "custom";
  const [rangeMode, setRangeMode] = useState<RangeMode>(30);
  const [customStart, setCustomStart] = useState<string>(addDays(todayISO(), -29));
  const [customEnd, setCustomEnd] = useState<string>(todayISO());

  const startDate = useMemo(
    () => (rangeMode === "custom" ? customStart : addDays(todayISO(), -rangeMode + 1)),
    [rangeMode, customStart],
  );
  const endDate = useMemo(
    () => (rangeMode === "custom" ? customEnd : todayISO()),
    [rangeMode, customEnd],
  );

  const memosQ = useQuery({
    queryKey: ["activity-memos", startDate],
    queryFn: () => call<WorkLogEntry[]>(`/work-logs?startDate=${startDate}`),
  });

  const followUpsQ = useQuery({
    queryKey: ["activity-followups"],
    queryFn: () => call<Array<{
      id: number; alertType: string; relatedEntityType: string;
      actionType: string; notes: string | null; postponeReason: string | null;
      completedDate: string | null; createdAt: string;
    }>>(`/alert-actions`),
  });

  const journalsQ = useQuery({
    // [Task #250] 90일 필터에서 누락이 발생하지 않도록 서버 cap(100)까지 가져온다.
    queryKey: ["activity-journals"],
    queryFn: () => call<Array<{ id: number; journalDate: string; authorName: string }>>(
      `/daily-journals?limit=100`,
    ),
  });

  const isLoading = memosQ.isLoading || followUpsQ.isLoading || journalsQ.isLoading;

  const rows = useMemo<ActivityRow[]>(() => {
    const out: ActivityRow[] = [];
    // 시간 범위 = [startDate 00:00, endDate 24:00) — KST 기준 inclusive.
    const startMs = new Date(`${startDate}T00:00:00+09:00`).getTime();
    const endMs = new Date(`${endDate}T00:00:00+09:00`).getTime() + 24 * 60 * 60 * 1000;

    for (const m of memosQ.data ?? []) {
      const t = new Date(m.occurredAt).getTime();
      if (t < startMs || t >= endMs) continue;
      out.push({
        id: `memo-${m.id}`,
        kind: "memo",
        title: m.memo,
        subtitle: `${CATEGORY_LABEL[m.category]} · ${m.authorName}`,
        timestamp: m.occurredAt,
        // [Task #250] item-level deep link: 타임라인 탭으로 이동하며 해당 메모 id 를 fragment 로 전달.
        href: `/work-log?tab=timeline#entry-${m.id}`,
      });
    }
    for (const a of followUpsQ.data ?? []) {
      const t = new Date(a.createdAt).getTime();
      if (t < startMs || t >= endMs) continue;
      const action = a.actionType === "postponed" ? "연기" : "처리완료";
      out.push({
        id: `action-${a.id}`,
        kind: "follow_up",
        title: a.notes ?? a.postponeReason ?? `${a.alertType} ${action}`,
        subtitle: `${a.alertType} · ${action}`,
        timestamp: a.createdAt,
        href: "/tasks",
        badge: action,
      });
    }
    for (const j of journalsQ.data ?? []) {
      if (j.journalDate < startDate || j.journalDate > endDate) continue;
      out.push({
        id: `journal-${j.id}`,
        kind: "journal",
        title: `${j.journalDate} 일일 업무 보고서`,
        subtitle: j.authorName ? `작성자: ${j.authorName}` : undefined,
        timestamp: `${j.journalDate}T00:00:00.000Z`,
        // [Task #250] item-level deep link: 해당 일자 일지로 바로 이동.
        href: `/work-log?tab=daily&date=${j.journalDate}`,
      });
    }
    out.sort((a, b) => (a.timestamp < b.timestamp ? 1 : a.timestamp > b.timestamp ? -1 : 0));
    return out;
  }, [memosQ.data, followUpsQ.data, journalsQ.data, startDate, endDate]);

  return (
    <div className="space-y-3 pt-3">
      <p className="text-xs text-muted-foreground">
        메모·처리완료(후속조치)·일지를 한 곳에서 시간순으로 확인합니다.
      </p>
      {/* [Hotfix] 분류 필터 제거 — 모든 종류를 시간순으로 한 번에 보여주고
          기간만 선택할 수 있다. 빠른 선택(최근 7/30/90일) + 기간검색(직접 지정). */}
      <div className="flex flex-wrap gap-1.5 items-center">
        {([7, 30, 90] as const).map((d) => (
          <button
            key={d}
            onClick={() => setRangeMode(d)}
            data-testid={`activity-range-${d}`}
            className={`px-3 py-1 rounded-full text-[11px] whitespace-nowrap border ${
              rangeMode === d
                ? "bg-accent text-accent-foreground border-accent"
                : "bg-background"
            }`}
          >
            최근 {d}일
          </button>
        ))}
        <button
          onClick={() => setRangeMode("custom")}
          data-testid="activity-range-custom"
          className={`px-3 py-1 rounded-full text-[11px] whitespace-nowrap border ${
            rangeMode === "custom"
              ? "bg-accent text-accent-foreground border-accent"
              : "bg-background"
          }`}
        >
          기간검색
        </button>
      </div>
      {rangeMode === "custom" && (
        <div className="flex flex-wrap items-center gap-2 text-xs" data-testid="activity-range-custom-inputs">
          <Input
            type="date"
            value={customStart}
            max={customEnd}
            onChange={(e) => setCustomStart(e.target.value)}
            className="w-40 h-8 text-xs"
            data-testid="activity-range-custom-start"
          />
          <span className="text-muted-foreground">~</span>
          <Input
            type="date"
            value={customEnd}
            min={customStart}
            max={todayISO()}
            onChange={(e) => setCustomEnd(e.target.value)}
            className="w-40 h-8 text-xs"
            data-testid="activity-range-custom-end"
          />
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-10"><Spinner /></div>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            선택한 기간에 처리 내역이 없습니다.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2" data-testid="activity-list">
          {rows.map((r) => {
            const meta = ACTIVITY_META[r.kind];
            const inner = (
              <Card data-testid={`activity-${r.id}`}>
                <CardContent className="p-3 space-y-1">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant="outline" className={`text-[10px] ${meta.className}`}>
                      {meta.label}
                    </Badge>
                    {r.badge && (
                      <Badge variant="outline" className="text-[10px]">{r.badge}</Badge>
                    )}
                    <span className="ml-auto">
                      {formatKoreanDate(r.timestamp.slice(0, 10))}
                    </span>
                  </div>
                  <p className="text-sm whitespace-pre-wrap break-words line-clamp-3">
                    {r.title}
                  </p>
                  {r.subtitle && (
                    <p className="text-xs text-muted-foreground truncate">{r.subtitle}</p>
                  )}
                </CardContent>
              </Card>
            );
            return r.href ? (
              <a
                key={r.id}
                href={r.href}
                onClick={(e) => {
                  // 같은 페이지(/work-log) 내부 탭 이동은 부드럽게.
                  if (r.href === "/work-log?tab=daily") {
                    e.preventDefault();
                    const url = new URL(r.href, window.location.origin);
                    // [Task #250] hash 도 함께 보존해 메모 anchor(#entry-id) 가 유지되도록 한다.
                    window.history.pushState({}, "", url.pathname + url.search + url.hash);
                    window.dispatchEvent(new PopStateEvent("popstate"));
                    if (url.hash) {
                      // 다음 tick 에 anchor 로 스크롤 시도(요소 존재 시).
                      setTimeout(() => {
                        const el = document.getElementById(url.hash.slice(1));
                        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
                      }, 50);
                    }
                  }
                }}
                className="block"
              >
                {inner}
              </a>
            ) : (
              <div key={r.id}>{inner}</div>
            );
          })}
        </div>
      )}
    </div>
  );
}
