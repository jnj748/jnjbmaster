import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import { useListMonthlySummaryReports, useListBuildings } from "@workspace/api-client-react";

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

export default function HqDashboard() {
  const [selectedBuilding, setSelectedBuilding] = useState<string>("all");
  const [expandedReport, setExpandedReport] = useState<number | null>(null);

  const { data: buildings = [] } = useListBuildings();
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

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">본사 총괄 대시보드</h1>
          <p className="text-muted-foreground text-sm mt-1">
            전체 현장의 운영 현황을 한눈에 확인합니다
            {latestMonth && <span className="ml-2">· {latestMonth} 기준</span>}
          </p>
        </div>
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
  );
}
