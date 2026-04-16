import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  Shield,
  TrendingUp,
  Users,
  AlertTriangle,
  CheckCircle,
  Clock,
  GraduationCap,
  Wallet,
  ChevronRight,
  Receipt,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

const MOCK_BUILDINGS = [
  { id: 1, name: "테스트빌딩", units: 30, collectionRate: 94.2, delinquent: 850000, totalBilled: 7800000, totalCollected: 7348000, unpaidUnits: 3 },
  { id: 2, name: "서초파크빌딩", units: 45, collectionRate: 97.1, delinquent: 320000, totalBilled: 11250000, totalCollected: 10930000, unpaidUnits: 2 },
  { id: 3, name: "강남오피스텔", units: 120, collectionRate: 89.5, delinquent: 2100000, totalBilled: 20000000, totalCollected: 17900000, unpaidUnits: 8 },
];

const MOCK_REPORTS = [
  {
    id: 1,
    building: "테스트빌딩",
    month: "2026-03",
    status: "submitted",
    submittedAt: "2026-04-07",
    accounting: { totalBilled: 7800000, totalCollected: 7348000, collectionRate: 94.2, unpaidUnits: 3, momChange: 2.1 },
  },
  {
    id: 2,
    building: "서초파크빌딩",
    month: "2026-03",
    status: "reviewed",
    submittedAt: "2026-04-05",
    accounting: { totalBilled: 11250000, totalCollected: 10930000, collectionRate: 97.1, unpaidUnits: 2, momChange: -0.5 },
  },
  {
    id: 3,
    building: "강남오피스텔",
    month: "2026-03",
    status: "pending",
    submittedAt: null,
    accounting: null,
  },
];

const MOCK_INSPECTIONS = [
  { id: 1, building: "테스트빌딩", type: "승강기 정기검사", status: "completed", dueDate: "2026-04-10" },
  { id: 2, building: "서초파크빌딩", type: "소방설비 점검", status: "pending_review", dueDate: "2026-04-20" },
  { id: 3, building: "강남오피스텔", type: "전기안전 점검", status: "overdue", dueDate: "2026-04-01" },
];

const MOCK_TRAINING = [
  { building: "테스트빌딩", completed: 3, total: 4, lastDate: "2026-03-15" },
  { building: "서초파크빌딩", completed: 4, total: 4, lastDate: "2026-04-02" },
  { building: "강남오피스텔", completed: 1, total: 6, lastDate: "2026-02-20" },
];

const statusLabels: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  submitted: { label: "제출완료", variant: "default" },
  reviewed: { label: "검토완료", variant: "secondary" },
  pending: { label: "미제출", variant: "destructive" },
  completed: { label: "완료", variant: "default" },
  pending_review: { label: "검토대기", variant: "outline" },
  overdue: { label: "기한초과", variant: "destructive" },
};

export default function HqDashboard() {
  const [selectedBuilding, setSelectedBuilding] = useState<string>("all");
  const [expandedReport, setExpandedReport] = useState<number | null>(null);

  const filteredReports = selectedBuilding === "all"
    ? MOCK_REPORTS
    : MOCK_REPORTS.filter((r) => r.building === selectedBuilding);

  const filteredInspections = selectedBuilding === "all"
    ? MOCK_INSPECTIONS
    : MOCK_INSPECTIONS.filter((i) => i.building === selectedBuilding);

  const totalDelinquent = MOCK_BUILDINGS.reduce((s, b) => s + b.delinquent, 0);
  const avgCollectionRate = (MOCK_BUILDINGS.reduce((s, b) => s + b.collectionRate, 0) / MOCK_BUILDINGS.length).toFixed(1);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">본사 총괄 대시보드</h1>
          <p className="text-muted-foreground text-sm mt-1">
            전체 현장의 운영 현황을 한눈에 확인합니다
          </p>
        </div>
        <Select value={selectedBuilding} onValueChange={setSelectedBuilding}>
          <SelectTrigger className="w-48">
            <Building2 className="w-4 h-4 mr-2" />
            <SelectValue placeholder="건물 선택" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 건물</SelectItem>
            {MOCK_BUILDINGS.map((b) => (
              <SelectItem key={b.id} value={b.name}>{b.name}</SelectItem>
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
                <p className="text-2xl font-bold mt-1">{MOCK_BUILDINGS.length}</p>
                <p className="text-xs text-muted-foreground mt-1">총 {MOCK_BUILDINGS.reduce((s, b) => s + b.units, 0)}세대</p>
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
                <p className="text-2xl font-bold mt-1">{avgCollectionRate}%</p>
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
                <p className="text-2xl font-bold mt-1">₩{totalDelinquent.toLocaleString()}</p>
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
                <p className="text-xs text-muted-foreground">검토 대기</p>
                <p className="text-2xl font-bold mt-1">{MOCK_INSPECTIONS.filter((i) => i.status === "pending_review").length}</p>
                <p className="text-xs text-muted-foreground mt-1">점검보고서</p>
              </div>
              <div className="p-2 rounded-lg bg-amber-500/10"><Shield className="w-5 h-5 text-amber-500" /></div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="w-4 h-4" />
              현장별 수납 현황
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {MOCK_BUILDINGS.map((b) => (
              <div key={b.id} className="flex items-center justify-between p-3 rounded-lg border">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{b.name}</p>
                  <p className="text-xs text-muted-foreground">{b.units}세대 · 미납 ₩{b.delinquent.toLocaleString()}</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <div className="text-right">
                    <p className="text-sm font-bold">{b.collectionRate}%</p>
                    <div className="w-16 h-1.5 bg-muted rounded-full mt-1">
                      <div className="h-full bg-accent rounded-full" style={{ width: `${b.collectionRate}%` }} />
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
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
            {filteredReports.map((r) => {
              const st = statusLabels[r.status];
              const isExpanded = expandedReport === r.id;
              return (
                <div key={r.id} className="rounded-lg border overflow-hidden">
                  <button
                    onClick={() => setExpandedReport(isExpanded ? null : r.id)}
                    className="flex items-center justify-between p-3 w-full text-left hover:bg-muted/30 transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{r.building}</p>
                      <p className="text-xs text-muted-foreground">{r.month} · {r.submittedAt ? `제출일: ${r.submittedAt}` : "미제출"}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant={st?.variant ?? "outline"}>{st?.label ?? r.status}</Badge>
                      {r.accounting && (
                        isExpanded
                          ? <ChevronUp className="w-4 h-4 text-muted-foreground" />
                          : <ChevronDown className="w-4 h-4 text-muted-foreground" />
                      )}
                    </div>
                  </button>
                  {isExpanded && r.accounting && (
                    <div className="px-3 pb-3 border-t bg-muted/10">
                      <div className="pt-2 space-y-1.5">
                        <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                          <Receipt className="w-3 h-3" />
                          회계 현황
                        </p>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div className="p-2 rounded bg-background border">
                            <p className="text-muted-foreground">부과 총액</p>
                            <p className="font-bold">₩{r.accounting.totalBilled.toLocaleString()}</p>
                          </div>
                          <div className="p-2 rounded bg-background border">
                            <p className="text-muted-foreground">수납 총액</p>
                            <p className="font-bold">₩{r.accounting.totalCollected.toLocaleString()}</p>
                          </div>
                          <div className="p-2 rounded bg-background border">
                            <p className="text-muted-foreground">수납률</p>
                            <p className="font-bold">{r.accounting.collectionRate}%</p>
                          </div>
                          <div className="p-2 rounded bg-background border">
                            <p className="text-muted-foreground">미납 세대</p>
                            <p className="font-bold">{r.accounting.unpaidUnits}세대</p>
                          </div>
                        </div>
                        {r.accounting.momChange !== undefined && (
                          <div className="flex items-center gap-1 text-xs mt-1">
                            <span className="text-muted-foreground">전월 대비:</span>
                            <span className={r.accounting.momChange > 0 ? "text-red-500" : r.accounting.momChange < 0 ? "text-green-500" : ""}>
                              {r.accounting.momChange > 0 ? "▲" : r.accounting.momChange < 0 ? "▼" : "→"}
                              {Math.abs(r.accounting.momChange)}%
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Shield className="w-4 h-4" />
              법정 점검보고서 검토
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {filteredInspections.map((i) => {
              const st = statusLabels[i.status];
              return (
                <div key={i.id} className="flex items-center justify-between p-3 rounded-lg border">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{i.type}</p>
                    <p className="text-xs text-muted-foreground">{i.building} · 기한: {i.dueDate}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant={st?.variant ?? "outline"}>{st?.label ?? i.status}</Badge>
                    {i.status === "pending_review" && (
                      <Button size="sm" variant="outline" className="h-7 text-xs">검토</Button>
                    )}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <GraduationCap className="w-4 h-4" />
              안전교육 이수 현황
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {MOCK_TRAINING.map((t) => {
              const rate = Math.round((t.completed / t.total) * 100);
              const isLow = rate < 50;
              return (
                <div key={t.building} className="flex items-center justify-between p-3 rounded-lg border">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{t.building}</p>
                    <p className="text-xs text-muted-foreground">최근 교육: {t.lastDate}</p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <p className={`text-sm font-bold ${isLow ? "text-destructive" : ""}`}>
                        {t.completed}/{t.total}명
                      </p>
                      <div className="w-16 h-1.5 bg-muted rounded-full mt-1">
                        <div className={`h-full rounded-full ${isLow ? "bg-destructive" : "bg-accent"}`} style={{ width: `${rate}%` }} />
                      </div>
                    </div>
                    {isLow && <AlertTriangle className="w-4 h-4 text-destructive" />}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
