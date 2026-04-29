import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/auth-context";
import { ShieldAlert, Clock, CalendarClock } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Building2,
  FileText,
  TrendingUp,
  Users,
  AlertTriangle,
  Wallet,
  ChevronRight,
  Receipt,
  ChevronDown,
  ChevronUp,
  Car,
  UserCheck,
} from "lucide-react";
import { useListMonthlySummaryReports, useListBuildings, useGetDashboardAlerts, useGetRfqMonitoring } from "@workspace/api-client-react";
import {
  MobileOnly,
  DesktopOnly,
  MobileKpiStrip,
  MobileTabPanels,
  type KpiItem,
} from "@/components/dashboard-widgets/mobile-compact";

const statusLabels: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  draft: { label: "초안", variant: "outline" },
  submitted: { label: "제출완료", variant: "default" },
  reviewed: { label: "검토완료", variant: "secondary" },
  forwarded: { label: "전달완료", variant: "secondary" },
};

function CollectionGauge({ rate, size = 64 }: { rate: number; size?: number }) {
  const radius = (size - 8) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (rate / 100) * circumference;
  const color = rate >= 95 ? "text-green-500" : rate >= 85 ? "text-amber-500" : "text-destructive";

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="currentColor" strokeWidth={4} className="text-muted" />
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="currentColor" strokeWidth={4} strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" className={color} />
      </svg>
      <span className="absolute text-xs font-bold">{rate}%</span>
    </div>
  );
}

const CATEGORY_LABELS_HQ: Record<string, string> = {
  elevator: "승강기", water_tank: "저수조", fire_safety: "소방", electrical: "전기",
  gas: "가스", septic: "정화조", playground: "놀이터", safety_check: "안전점검",
  hygiene: "위생/환경", building_safety: "건축물안전", administrative: "행정", other: "기타",
};

interface LegalInspectionItem {
  id: number;
  name: string;
  category: string;
  nextDueDate: string;
}

interface LegalInspectionSummary {
  buildingId: number;
  buildingName: string;
  overdueCount: number;
  due7Count: number;
  due30Count: number;
  overdueItems: LegalInspectionItem[];
  due7Items: LegalInspectionItem[];
  due30Items: LegalInspectionItem[];
}

function formatDueLabel(dateStr: string): string {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const due = new Date(dateStr); due.setHours(0, 0, 0, 0);
  const diff = Math.round((due.getTime() - today.getTime()) / 86400000);
  if (diff < 0) return `${Math.abs(diff)}일 초과`;
  if (diff === 0) return "오늘";
  return `D-${diff}`;
}

export default function HqDashboard() {
  const [selectedBuilding, setSelectedBuilding] = useState<string>("all");
  const [expandedReport, setExpandedReport] = useState<number | null>(null);
  const [expandedLegal, setExpandedLegal] = useState<number | null>(null);
  const { token, user: currentUser } = useAuth();

  const { data: buildings = [], isLoading: buildingsLoading } = useListBuildings();
  // [Task #596] hq_executive 는 hq_building_assignments 매핑된 건물만 본다.
  //   매핑이 비어 있는 본부장에게는 전 영역 안내 배너로 platform_admin 의 할당을 기다리게 한다.
  const isHqWithoutAssignments =
    currentUser?.role === "hq_executive" && !buildingsLoading && buildings.length === 0;

  // [Task #221] 본사 관리 업무 템플릿에서 산출된 알림을 본사 화면에서도 동일하게 노출.
  const { data: dashboardAlerts = [] } = useGetDashboardAlerts();
  const templateAlerts = (dashboardAlerts as Array<{
    id: number;
    type: string;
    title: string;
    message: string;
    severity: string;
    dueDate: string | null;
  }>).filter(
    (a) => a.type === "task_template_mandatory" || a.type === "task_template_suggested",
  );

  const BASE = import.meta.env.BASE_URL ?? "/";
  const apiBase = `${BASE}api`.replace(/\/+/g, "/");
  const { data: legalSummary } = useQuery({
    queryKey: ["hq", "legal-inspections-summary"],
    queryFn: async () => {
      const res = await fetch(`${apiBase}/buildings/legal-inspections-summary`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return { summaries: [] as LegalInspectionSummary[] };
      return (await res.json()) as { summaries: LegalInspectionSummary[] };
    },
    enabled: !!token,
    staleTime: 5 * 60 * 1000,
  });
  const legalSummaries = useMemo(() => {
    const list = legalSummary?.summaries ?? [];
    const filtered = selectedBuilding !== "all"
      ? list.filter((s) => s.buildingId === parseInt(selectedBuilding))
      : list;
    return [...filtered].sort((a, b) => {
      const score = (s: LegalInspectionSummary) => s.overdueCount * 100 + s.due7Count * 10 + s.due30Count;
      return score(b) - score(a);
    });
  }, [legalSummary, selectedBuilding]);

  const legalTotals = useMemo(() => ({
    overdue: legalSummaries.reduce((s, b) => s + b.overdueCount, 0),
    due7: legalSummaries.reduce((s, b) => s + b.due7Count, 0),
    due30: legalSummaries.reduce((s, b) => s + b.due30Count, 0),
  }), [legalSummaries]);
  const { data: reports = [], isLoading: reportsLoading } = useListMonthlySummaryReports(
    selectedBuilding !== "all" ? { buildingId: parseInt(selectedBuilding) } : undefined
  );

  const latestMonth = useMemo(() => {
    if (reports.length === 0) return null;
    const months = [...new Set(reports.map(r => r.reportMonth))].sort().reverse();
    return months[0];
  }, [reports]);

  const latestReports = useMemo(() => {
    if (!latestMonth) return [];
    return reports.filter(r => r.reportMonth === latestMonth);
  }, [reports, latestMonth]);

  const buildingStats = useMemo(() => {
    return latestReports.map(r => {
      const building = buildings.find(b => b.id === r.buildingId);
      return {
        reportId: r.id,
        buildingId: r.buildingId,
        buildingName: building?.name ?? `건물 #${r.buildingId}`,
        totalUnits: r.totalUnits ?? building?.totalUnits ?? 0,
        collectionRate: r.collectionRate ?? 0,
        totalBilled: r.totalBilled ?? 0,
        totalCollected: r.totalCollected ?? 0,
        unpaidAmount: r.unpaidAmount ?? 0,
        unpaidUnits: r.unpaidUnits ?? 0,
        occupantCardCount: r.occupantCardCount ?? 0,
        vehicleCardCount: r.vehicleCardCount ?? 0,
        momChangePct: r.momChangePct,
        status: r.status,
        month: r.reportMonth,
        createdAt: r.createdAt,
        summary: r.summary,
      };
    });
  }, [latestReports, buildings]);

  const totalUnits = buildingStats.reduce((s, b) => s + b.totalUnits, 0);
  const totalDelinquent = buildingStats.reduce((s, b) => s + b.unpaidAmount, 0);
  const avgCollectionRate = buildingStats.length > 0
    ? Math.round(buildingStats.reduce((s, b) => s + b.collectionRate, 0) / buildingStats.length * 10) / 10
    : 0;
  const totalOccupantCards = buildingStats.reduce((s, b) => s + b.occupantCardCount, 0);
  const occupantCardRate = totalUnits > 0 ? Math.round((totalOccupantCards / totalUnits) * 1000) / 10 : 0;

  const hasData = buildingStats.length > 0;

  // [Task #327] 모바일 컴팩트 KPI 4개
  const hqKpis: KpiItem[] = [
    {
      key: "buildings",
      label: "관리 건물",
      value: buildings.length,
      hint: `총 ${totalUnits}세대`,
      icon: Building2,
      iconClass: "text-white",
      iconBg: "bg-accent",
    },
    {
      key: "rate",
      label: "평균 수납률",
      value: hasData ? `${avgCollectionRate}%` : "-",
      hint: "전체 현장 기준",
      icon: TrendingUp,
      iconClass: "text-white",
      iconBg: "bg-emerald-500",
      highlight: avgCollectionRate >= 95 ? "good" : avgCollectionRate >= 85 ? "default" : "warn",
    },
    {
      key: "delinquent",
      label: "미납 합계",
      value: hasData ? `${(totalDelinquent / 10000).toFixed(0)}만원` : "-",
      hint: "전체 현장",
      icon: Wallet,
      iconClass: "text-white",
      iconBg: "bg-rose-500",
      highlight: totalDelinquent > 0 ? "danger" : "default",
    },
    {
      key: "card",
      label: "입주카드율",
      value: hasData ? `${occupantCardRate}%` : "-",
      hint: `${totalOccupantCards}/${totalUnits}`,
      icon: UserCheck,
      iconClass: "text-white",
      iconBg: "bg-amber-500",
      highlight: occupantCardRate >= 80 ? "good" : "warn",
    },
  ];

  // 모바일에서 셀렉터(전체 건물 / 개별 건물) 재사용
  const mobileBuildingSelector = (
    <Select value={selectedBuilding} onValueChange={setSelectedBuilding}>
      <SelectTrigger className="w-full h-9 text-xs">
        <Building2 className="w-3.5 h-3.5 mr-1.5" />
        <SelectValue placeholder="건물 선택" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">전체 건물</SelectItem>
        {buildings.map((b) => (
          <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <>
      {/* [Task #596] 본부장 매핑이 비어 있을 때의 안내 배너.
          - hq_executive 만 노출. platform_admin 은 항상 매핑 무관.
          - 본문 위쪽에 띄워 모바일/데스크톱 공통으로 보이게 한다. */}
      {isHqWithoutAssignments ? (
        <div
          className="mx-1 my-2 rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-800"
          data-testid="hq-no-assignments-banner"
        >
          <p className="text-sm font-semibold">아직 관할 건물이 할당되지 않았습니다</p>
          <p className="text-xs mt-1 leading-relaxed">
            본부장 계정은 플랫폼 관리자가 관할 건물을 지정한 뒤부터 데이터가 표시됩니다.
            할당이 완료되면 자동으로 대시보드가 채워집니다.
          </p>
        </div>
      ) : null}
      {/* [Task #327] 모바일 컴팩트 — KPI 4개 + 탭(법정점검/수납/월간보고) */}
      <MobileOnly>
        <div className="space-y-3">
          {mobileBuildingSelector}
          <MobileKpiStrip items={hqKpis} />
          <MobileTabPanels
            sections={[
              {
                key: "legal",
                label: "법정점검",
                badge:
                  legalTotals.overdue > 0 ? (
                    <Badge variant="destructive" className="text-[9px] h-4 px-1">
                      {legalTotals.overdue}
                    </Badge>
                  ) : undefined,
                content: (
                  <div className="space-y-3">
                    <div className="grid grid-cols-3 gap-1.5">
                      <div className="rounded border border-destructive/30 bg-destructive/5 p-2 text-center">
                        <p className="text-[10px] text-muted-foreground">초과</p>
                        <p className="text-base font-bold text-destructive">{legalTotals.overdue}</p>
                      </div>
                      <div className="rounded border border-orange-300 bg-orange-50 p-2 text-center">
                        <p className="text-[10px] text-muted-foreground">7일</p>
                        <p className="text-base font-bold text-orange-600">{legalTotals.due7}</p>
                      </div>
                      <div className="rounded border border-amber-300 bg-amber-50 p-2 text-center">
                        <p className="text-[10px] text-muted-foreground">30일</p>
                        <p className="text-base font-bold text-amber-600">{legalTotals.due30}</p>
                      </div>
                    </div>
                    {legalSummaries.length === 0 ? (
                      <p className="text-xs text-muted-foreground py-4 text-center">
                        표시할 법정점검이 없습니다
                      </p>
                    ) : (
                      <div className="space-y-1.5">
                        {legalSummaries.slice(0, 8).map((s) => {
                          const total = s.overdueCount + s.due7Count + s.due30Count;
                          const isClean = total === 0;
                          return (
                            <div
                              key={s.buildingId}
                              className="flex items-center justify-between gap-2 p-2 rounded border bg-card"
                            >
                              <p className="text-xs font-medium truncate flex-1">{s.buildingName}</p>
                              <div className="flex items-center gap-1 shrink-0">
                                {s.overdueCount > 0 && (
                                  <Badge variant="destructive" className="text-[9px] h-4 px-1">
                                    초과 {s.overdueCount}
                                  </Badge>
                                )}
                                {s.due7Count > 0 && (
                                  <Badge className="text-[9px] h-4 px-1 bg-orange-500 hover:bg-orange-500/90">
                                    7일 {s.due7Count}
                                  </Badge>
                                )}
                                {s.due30Count > 0 && (
                                  <Badge variant="outline" className="text-[9px] h-4 px-1 border-amber-400 text-amber-700">
                                    30일 {s.due30Count}
                                  </Badge>
                                )}
                                {isClean && (
                                  <Badge variant="secondary" className="text-[9px] h-4 px-1">정상</Badge>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ),
              },
              {
                key: "collection",
                label: "수납",
                content: !hasData ? (
                  <p className="text-xs text-muted-foreground py-4 text-center">
                    월간보고서 데이터가 없습니다
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {buildingStats.map((b) => (
                      <div
                        key={b.reportId}
                        className="flex items-center justify-between p-2 rounded border bg-card"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium truncate">{b.buildingName}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {b.totalUnits}세대 · 미납{" "}
                            {b.unpaidUnits > 0 && (
                              <span className="text-destructive font-medium">
                                {b.unpaidUnits}세대
                              </span>
                            )}{" "}
                            ₩{b.unpaidAmount.toLocaleString()}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <CollectionGauge rate={b.collectionRate} size={36} />
                        </div>
                      </div>
                    ))}
                  </div>
                ),
              },
              {
                key: "reports",
                label: "월간보고",
                content: !hasData ? (
                  <p className="text-xs text-muted-foreground py-4 text-center">
                    보고서 데이터가 없습니다
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {buildingStats.map((r) => {
                      const st = statusLabels[r.status];
                      return (
                        <div
                          key={r.reportId}
                          className="flex items-center justify-between p-2 rounded border bg-card"
                        >
                          <div className="min-w-0">
                            <p className="text-xs font-medium truncate">{r.buildingName}</p>
                            <p className="text-[10px] text-muted-foreground">
                              {r.month} · 수납 {r.collectionRate}%
                            </p>
                          </div>
                          <Badge
                            variant={st?.variant ?? "outline"}
                            className="text-[9px] h-4 px-1"
                          >
                            {st?.label ?? r.status}
                          </Badge>
                        </div>
                      );
                    })}
                  </div>
                ),
              },
            ]}
          />
        </div>
      </MobileOnly>

      <DesktopOnly>
        <div className="space-y-6">
      {/* [Task #142] 페이지 헤더는 DashboardShell 이 일괄 렌더링한다.
          건물 선택 셀렉터만 남긴다. */}
      <div className="flex items-start justify-end flex-wrap gap-3">
        <Select value={selectedBuilding} onValueChange={setSelectedBuilding}>
          <SelectTrigger className="w-48">
            <Building2 className="w-4 h-4 mr-2" />
            <SelectValue placeholder="건물 선택" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 건물</SelectItem>
            {buildings.map((b) => (
              <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* [Task #612] 본사 비교견적 모니터링 — 매칭/견적/메시지/방문/마감 통계. */}
      <RfqMonitoringSection />

      {/* [Task #221] 본사 관리 업무 템플릿에서 산출된 알림 (필수+제안) */}
      {templateAlerts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-destructive" />
              본사 관리 업무 알림 ({templateAlerts.length}건)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {templateAlerts.slice(0, 8).map((a) => (
              <div
                key={a.id}
                className="flex items-start gap-2 text-sm border rounded p-2"
                data-testid={`hq-template-alert-${a.id}`}
              >
                <Badge
                  variant={
                    a.type === "task_template_mandatory" ? "destructive" : "secondary"
                  }
                >
                  {a.type === "task_template_mandatory" ? "필수" : "제안"}
                </Badge>
                <div className="flex-1">
                  <div className="font-medium">{a.title}</div>
                  <div className="text-muted-foreground text-xs">{a.message}</div>
                </div>
                {a.dueDate && (
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {a.dueDate}
                  </span>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-muted-foreground">관리 건물</p>
                <p className="text-2xl font-bold mt-1">{buildings.length}</p>
                <p className="text-xs text-muted-foreground mt-1">총 {totalUnits}세대</p>
              </div>
              <div className="p-2 rounded-lg bg-accent/10"><Building2 className="w-5 h-5 text-accent" /></div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-muted-foreground">평균 수납률</p>
                <p className="text-2xl font-bold mt-1">{hasData ? `${avgCollectionRate}%` : "-"}</p>
                <p className="text-xs text-muted-foreground mt-1">전체 현장 기준</p>
              </div>
              <div className="p-2 rounded-lg bg-green-500/10"><TrendingUp className="w-5 h-5 text-green-500" /></div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-muted-foreground">미납 합계</p>
                <p className="text-2xl font-bold mt-1">{hasData ? `₩${totalDelinquent.toLocaleString()}` : "-"}</p>
                <p className="text-xs text-muted-foreground mt-1">전체 현장</p>
              </div>
              <div className="p-2 rounded-lg bg-destructive/10"><Wallet className="w-5 h-5 text-destructive" /></div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-muted-foreground">입주자카드 작성률</p>
                <p className="text-2xl font-bold mt-1">{hasData ? `${occupantCardRate}%` : "-"}</p>
                <p className="text-xs text-muted-foreground mt-1">{totalOccupantCards}/{totalUnits}세대</p>
              </div>
              <div className="p-2 rounded-lg bg-amber-500/10"><UserCheck className="w-5 h-5 text-amber-500" /></div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-destructive" />
            현장별 법정점검 마감 현황
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            완료되지 않은 법정점검 항목을 마감일 기준으로 분류합니다
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-center">
              <p className="text-[11px] text-muted-foreground">기한 초과</p>
              <p className="text-2xl font-bold text-destructive mt-0.5">{legalTotals.overdue}</p>
              <p className="text-[10px] text-muted-foreground">건</p>
            </div>
            <div className="rounded-lg border border-orange-300 bg-orange-50 p-3 text-center">
              <p className="text-[11px] text-muted-foreground">7일 이내</p>
              <p className="text-2xl font-bold text-orange-600 mt-0.5">{legalTotals.due7}</p>
              <p className="text-[10px] text-muted-foreground">건</p>
            </div>
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-center">
              <p className="text-[11px] text-muted-foreground">30일 이내</p>
              <p className="text-2xl font-bold text-amber-600 mt-0.5">{legalTotals.due30}</p>
              <p className="text-[10px] text-muted-foreground">건</p>
            </div>
          </div>

          {legalSummaries.length === 0 ? (
            <div className="text-center py-6">
              <ShieldAlert className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-xs text-muted-foreground">표시할 법정점검이 없습니다</p>
            </div>
          ) : (
            <div className="space-y-2">
              {legalSummaries.map((s) => {
                const total = s.overdueCount + s.due7Count + s.due30Count;
                const isExpanded = expandedLegal === s.buildingId;
                const isClean = total === 0;
                return (
                  <div key={s.buildingId} className="rounded-lg border overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setExpandedLegal(isExpanded ? null : s.buildingId)}
                      disabled={isClean}
                      className="w-full flex items-center justify-between gap-2 p-3 text-left hover:bg-muted/30 transition-colors disabled:cursor-default disabled:hover:bg-transparent"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{s.buildingName}</p>
                        {isClean && <p className="text-[11px] text-muted-foreground mt-0.5">임박/초과 항목 없음</p>}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {s.overdueCount > 0 && (
                          <Badge variant="destructive" className="gap-1">
                            <ShieldAlert className="w-3 h-3" />초과 {s.overdueCount}
                          </Badge>
                        )}
                        {s.due7Count > 0 && (
                          <Badge className="gap-1 bg-orange-500 hover:bg-orange-500/90">
                            <Clock className="w-3 h-3" />7일 {s.due7Count}
                          </Badge>
                        )}
                        {s.due30Count > 0 && (
                          <Badge variant="outline" className="gap-1 border-amber-400 text-amber-700">
                            <CalendarClock className="w-3 h-3" />30일 {s.due30Count}
                          </Badge>
                        )}
                        {isClean && (
                          <Badge variant="secondary" className="text-[10px]">정상</Badge>
                        )}
                      </div>
                    </button>
                    {isExpanded && !isClean && (
                      <div className="border-t bg-muted/10 p-3 space-y-3">
                        {s.overdueItems.length > 0 && (
                          <div>
                            <p className="text-[11px] font-semibold text-destructive mb-1.5 flex items-center gap-1">
                              <ShieldAlert className="w-3 h-3" />기한 초과 ({s.overdueItems.length})
                            </p>
                            <ul className="space-y-1">
                              {s.overdueItems.map((it) => (
                                <li key={it.id} className="flex items-center justify-between text-xs px-2 py-1 rounded bg-destructive/5">
                                  <span className="truncate">
                                    <span className="text-muted-foreground mr-1">[{CATEGORY_LABELS_HQ[it.category] || it.category}]</span>
                                    {it.name}
                                  </span>
                                  <span className="text-destructive font-medium shrink-0 ml-2">
                                    {it.nextDueDate} · {formatDueLabel(it.nextDueDate)}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {s.due7Items.length > 0 && (
                          <div>
                            <p className="text-[11px] font-semibold text-orange-600 mb-1.5 flex items-center gap-1">
                              <Clock className="w-3 h-3" />7일 이내 ({s.due7Items.length})
                            </p>
                            <ul className="space-y-1">
                              {s.due7Items.map((it) => (
                                <li key={it.id} className="flex items-center justify-between text-xs px-2 py-1 rounded bg-orange-50">
                                  <span className="truncate">
                                    <span className="text-muted-foreground mr-1">[{CATEGORY_LABELS_HQ[it.category] || it.category}]</span>
                                    {it.name}
                                  </span>
                                  <span className="text-orange-700 font-medium shrink-0 ml-2">
                                    {it.nextDueDate} · {formatDueLabel(it.nextDueDate)}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {s.due30Items.length > 0 && (
                          <div>
                            <p className="text-[11px] font-semibold text-amber-700 mb-1.5 flex items-center gap-1">
                              <CalendarClock className="w-3 h-3" />30일 이내 ({s.due30Items.length})
                            </p>
                            <ul className="space-y-1">
                              {s.due30Items.map((it) => (
                                <li key={it.id} className="flex items-center justify-between text-xs px-2 py-1 rounded bg-amber-50">
                                  <span className="truncate">
                                    <span className="text-muted-foreground mr-1">[{CATEGORY_LABELS_HQ[it.category] || it.category}]</span>
                                    {it.name}
                                  </span>
                                  <span className="text-amber-700 font-medium shrink-0 ml-2">
                                    {it.nextDueDate} · {formatDueLabel(it.nextDueDate)}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {!hasData && !reportsLoading && (
        <Card>
          <CardContent className="p-8 text-center">
            <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">월간보고서 데이터가 없습니다</p>
            <p className="text-xs text-muted-foreground mt-1">현장에서 월간 보고서를 생성하면 여기에 표시됩니다</p>
          </CardContent>
        </Card>
      )}

      {hasData && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Building2 className="w-4 h-4" />
                현장별 수납 현황
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {buildingStats.map((b) => (
                <div key={b.reportId} className="flex items-center justify-between p-3 rounded-lg border">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{b.buildingName}</p>
                    <p className="text-xs text-muted-foreground">
                      {b.totalUnits}세대 · 미납 {b.unpaidUnits > 0 && (
                        <span className="text-destructive font-medium">{b.unpaidUnits}세대</span>
                      )}
                      {" "}₩{b.unpaidAmount.toLocaleString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <CollectionGauge rate={b.collectionRate} size={48} />
                    {b.momChangePct !== null && b.momChangePct !== undefined && (
                      <span className={`text-xs font-medium ${b.momChangePct > 0 ? "text-red-500" : b.momChangePct < 0 ? "text-green-500" : ""}`}>
                        {b.momChangePct > 0 ? "▲" : b.momChangePct < 0 ? "▼" : "→"}
                        {Math.abs(b.momChangePct)}%
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="w-4 h-4" />
                월간보고서 현황
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {buildingStats.map((r) => {
                const st = statusLabels[r.status];
                const isExpanded = expandedReport === r.reportId;
                return (
                  <div key={r.reportId} className="rounded-lg border overflow-hidden">
                    <button
                      onClick={() => setExpandedReport(isExpanded ? null : r.reportId)}
                      className="flex items-center justify-between p-3 w-full text-left hover:bg-muted/30 transition-colors"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{r.buildingName}</p>
                        <p className="text-xs text-muted-foreground">{r.month} · {r.createdAt?.slice(0, 10)}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant={st?.variant ?? "outline"}>{st?.label ?? r.status}</Badge>
                        {isExpanded
                          ? <ChevronUp className="w-4 h-4 text-muted-foreground" />
                          : <ChevronDown className="w-4 h-4 text-muted-foreground" />
                        }
                      </div>
                    </button>
                    {isExpanded && (
                      <div className="px-3 pb-3 border-t bg-muted/10">
                        <div className="pt-2 space-y-2">
                          <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                            <Receipt className="w-3 h-3" />
                            회계 현황
                          </p>
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div className="p-2 rounded bg-background border">
                              <p className="text-muted-foreground">부과 총액</p>
                              <p className="font-bold">₩{r.totalBilled.toLocaleString()}</p>
                            </div>
                            <div className="p-2 rounded bg-background border">
                              <p className="text-muted-foreground">수납 총액</p>
                              <p className="font-bold">₩{r.totalCollected.toLocaleString()}</p>
                            </div>
                            <div className="p-2 rounded bg-background border">
                              <p className="text-muted-foreground">수납률</p>
                              <p className="font-bold">{r.collectionRate}%</p>
                            </div>
                            <div className={`p-2 rounded border ${r.unpaidUnits > 0 ? "bg-destructive/5 border-destructive/20" : "bg-background"}`}>
                              <p className="text-muted-foreground">미납 세대</p>
                              <p className={`font-bold ${r.unpaidUnits > 0 ? "text-destructive" : ""}`}>
                                {r.unpaidUnits}세대
                                {r.unpaidAmount > 0 && (
                                  <span className="text-[10px] font-normal ml-1">(₩{r.unpaidAmount.toLocaleString()})</span>
                                )}
                              </p>
                            </div>
                          </div>
                          {r.momChangePct !== null && r.momChangePct !== undefined && (
                            <div className="flex items-center gap-1 text-xs mt-1">
                              <span className="text-muted-foreground">전월 대비:</span>
                              <span className={r.momChangePct > 0 ? "text-red-500" : r.momChangePct < 0 ? "text-green-500" : ""}>
                                {r.momChangePct > 0 ? "▲" : r.momChangePct < 0 ? "▼" : "→"}
                                {Math.abs(r.momChangePct)}%
                              </span>
                            </div>
                          )}

                          <div className="border-t pt-2 mt-2">
                            <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1 mb-2">
                              <Users className="w-3 h-3" />
                              현장 관리 품질
                            </p>
                            <div className="grid grid-cols-2 gap-2 text-xs">
                              <div className="p-2 rounded bg-background border">
                                <p className="text-muted-foreground flex items-center gap-1"><UserCheck className="w-3 h-3" />입주자카드</p>
                                <p className="font-bold">
                                  {r.occupantCardCount}/{r.totalUnits}세대
                                  <span className="text-[10px] font-normal ml-1">
                                    ({r.totalUnits > 0 ? Math.round((r.occupantCardCount / r.totalUnits) * 100) : 0}%)
                                  </span>
                                </p>
                                {r.totalUnits > 0 && (
                                  <div className="w-full h-1.5 bg-muted rounded-full mt-1">
                                    <div
                                      className={`h-full rounded-full ${(r.occupantCardCount / r.totalUnits) >= 0.8 ? "bg-green-500" : (r.occupantCardCount / r.totalUnits) >= 0.5 ? "bg-amber-500" : "bg-destructive"}`}
                                      style={{ width: `${Math.min(100, (r.occupantCardCount / r.totalUnits) * 100)}%` }}
                                    />
                                  </div>
                                )}
                              </div>
                              <div className="p-2 rounded bg-background border">
                                <p className="text-muted-foreground flex items-center gap-1"><Car className="w-3 h-3" />차량 등록</p>
                                <p className="font-bold">{r.vehicleCardCount}대</p>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>
      )}

      {hasData && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <UserCheck className="w-4 h-4" />
                현장별 입주자카드 작성률
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {buildingStats.map((b) => {
                const rate = b.totalUnits > 0 ? Math.round((b.occupantCardCount / b.totalUnits) * 100) : 0;
                const isLow = rate < 50;
                return (
                  <div key={b.reportId} className="flex items-center justify-between p-3 rounded-lg border">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{b.buildingName}</p>
                      <p className="text-xs text-muted-foreground">{b.occupantCardCount}/{b.totalUnits}세대 작성</p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-right">
                        <p className={`text-sm font-bold ${isLow ? "text-destructive" : ""}`}>{rate}%</p>
                        <div className="w-16 h-1.5 bg-muted rounded-full mt-1">
                          <div className={`h-full rounded-full ${isLow ? "bg-destructive" : rate >= 80 ? "bg-green-500" : "bg-amber-500"}`} style={{ width: `${rate}%` }} />
                        </div>
                      </div>
                      {isLow && <AlertTriangle className="w-4 h-4 text-destructive" />}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Car className="w-4 h-4" />
                현장별 차량 등록 현황
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {buildingStats.map((b) => (
                <div key={b.reportId} className="flex items-center justify-between p-3 rounded-lg border">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{b.buildingName}</p>
                    <p className="text-xs text-muted-foreground">{b.totalUnits}세대</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="text-right">
                      <p className="text-sm font-bold">{b.vehicleCardCount}대</p>
                      <p className="text-[10px] text-muted-foreground">등록 완료</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}
        </div>
      </DesktopOnly>
    </>
  );
}

// [Task #612] 본사 비교견적 모니터링 섹션 — 전 RFQ 의 매칭/견적/메시지/방문/마감 통계.
function RfqMonitoringSection() {
  const { data, isLoading } = useGetRfqMonitoring();
  if (isLoading || !data) return null;
  const { totals, rows } = data;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <FileText className="w-4 h-4 text-primary" />
          비교견적 모니터링
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
          <div className="rounded border p-2 text-center">
            <p className="text-xs text-muted-foreground">총 RFQ</p>
            <p className="text-xl font-bold">{totals.rfqs}</p>
          </div>
          <div className="rounded border p-2 text-center">
            <p className="text-xs text-muted-foreground">마감</p>
            <p className="text-xl font-bold text-emerald-600">{totals.closed}</p>
          </div>
          <div className="rounded border p-2 text-center">
            <p className="text-xs text-muted-foreground">견적 수</p>
            <p className="text-xl font-bold">{totals.quotes}</p>
          </div>
          <div className="rounded border p-2 text-center">
            <p className="text-xs text-muted-foreground">메시지</p>
            <p className="text-xl font-bold">{totals.messages}</p>
          </div>
          <div className="rounded border p-2 text-center">
            <p className="text-xs text-muted-foreground">방문 확정</p>
            <p className="text-xl font-bold">{totals.siteVisitsConfirmed}</p>
          </div>
        </div>
        {rows.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-muted/50 text-left">
                  <th className="p-2">RFQ</th>
                  <th className="p-2">건물</th>
                  <th className="p-2">상태</th>
                  <th className="p-2 text-center">매칭</th>
                  <th className="p-2 text-center">견적</th>
                  <th className="p-2 text-center">메시지</th>
                  <th className="p-2 text-center">방문확정</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 12).map((r) => (
                  <tr key={r.id} className="border-b last:border-0">
                    <td className="p-2">
                      <div className="font-medium">{r.title}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {CATEGORY_LABELS_HQ[r.category] || r.category}
                        {r.requiresSiteVisit && " · 현장방문"}
                      </div>
                    </td>
                    <td className="p-2">{r.buildingName || "-"}</td>
                    <td className="p-2">
                      <Badge
                        variant={r.closed ? "default" : r.status === "open" ? "secondary" : "outline"}
                      >
                        {r.closed ? "마감/계약" : r.status === "open" ? "접수중" : r.status}
                      </Badge>
                    </td>
                    <td className="p-2 text-center">{r.matchedPartnerCount}</td>
                    <td className="p-2 text-center">{r.quoteCount}</td>
                    <td className="p-2 text-center">{r.messageCount}</td>
                    <td className="p-2 text-center">{r.siteVisitConfirmedCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground text-center py-4">
            아직 RFQ 가 없습니다.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
