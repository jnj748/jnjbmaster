import { useState } from "react";
import { useLocation } from "wouter";
import { buildApprovalPrefillSearch } from "@/lib/approval-prefill";
import {
  useListWeeklySummaryReports,
  useGenerateWeeklySummaryReport,
  useForwardWeeklySummaryReport,
  useListMonthlySummaryReports,
  useGenerateMonthlySummaryReport,
  getListWeeklySummaryReportsQueryKey,
  getListMonthlySummaryReportsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogFooter,
} from "@/components/ui/responsive-dialog";
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/utils";
import {
  FileText,
  Calendar,
  Send,
  BarChart3,
  ChevronRight,
} from "lucide-react";

const statusLabels: Record<string, string> = {
  draft: "작성중",
  submitted: "제출됨",
  reviewed: "검토완료",
  forwarded: "전달됨",
};

function getMondayOfCurrentWeek() {
  const today = new Date();
  const day = today.getDay();
  const diff = today.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(today.setDate(diff)).toISOString().split("T")[0];
}

function getSundayOfWeek(monday: string) {
  const d = new Date(monday);
  d.setDate(d.getDate() + 6);
  return d.toISOString().split("T")[0];
}

export default function ReportSystem() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const isManager = user?.role === "manager";

  // [Task #610] 주보/월보 → 기안서로 만들기 진입.
  function goApprovalFromReport(kind: "weekly_report" | "monthly_report", id: number, title: string) {
    const qs = buildApprovalPrefillSearch({
      kind,
      sourceTable: kind === "weekly_report" ? "weekly_summary_reports" : "monthly_summary_reports",
      sourceId: id,
      title,
    });
    navigate(`/approvals/create?${qs.toString()}`);
  }

  const [activeTab, setActiveTab] = useState<"weekly" | "monthly">("weekly");
  const [weekStart, setWeekStart] = useState(getMondayOfCurrentWeek());
  const [monthFilter, setMonthFilter] = useState(
    new Date().toISOString().slice(0, 7)
  );
  const [weeklyDetailId, setWeeklyDetailId] = useState<number | null>(null);
  const [monthlyDetailId, setMonthlyDetailId] = useState<number | null>(null);

  const { data: weeklyReports, isLoading: loadingWeekly } =
    useListWeeklySummaryReports({});
  const { data: monthlyReports, isLoading: loadingMonthly } =
    useListMonthlySummaryReports({});

  const generateWeekly = useGenerateWeeklySummaryReport();
  const forwardWeekly = useForwardWeeklySummaryReport();
  const generateMonthly = useGenerateMonthlySummaryReport();

  const selectedWeekly = weeklyReports?.find((r) => r.id === weeklyDetailId);
  const selectedMonthly = monthlyReports?.find((r) => r.id === monthlyDetailId);

  async function handleGenerateWeekly() {
    try {
      const weekEnd = getSundayOfWeek(weekStart);
      await generateWeekly.mutateAsync({
        data: { weekStart, weekEnd },
      });
      queryClient.invalidateQueries({
        queryKey: getListWeeklySummaryReportsQueryKey(),
      });
      toast({ title: "주간 보고서가 생성되었습니다" });
    } catch {
      toast({ title: "생성에 실패했습니다", variant: "destructive" });
    }
  }

  async function handleForwardWeekly(id: number) {
    try {
      await forwardWeekly.mutateAsync({ id });
      queryClient.invalidateQueries({
        queryKey: getListWeeklySummaryReportsQueryKey(),
      });
      toast({ title: "주간 보고서가 전달되었습니다" });
      setWeeklyDetailId(null);
    } catch {
      toast({ title: "전달에 실패했습니다", variant: "destructive" });
    }
  }

  async function handleGenerateMonthly() {
    try {
      await generateMonthly.mutateAsync({
        data: { reportMonth: monthFilter },
      });
      queryClient.invalidateQueries({
        queryKey: getListMonthlySummaryReportsQueryKey(),
      });
      toast({ title: "월간 보고서가 생성되었습니다" });
    } catch {
      toast({ title: "생성에 실패했습니다", variant: "destructive" });
    }
  }

  const tabs = [
    { key: "weekly" as const, label: "주간 보고" },
    { key: "monthly" as const, label: "월간 보고" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">보고 체계</h1>
        <p className="text-muted-foreground text-sm mt-1">
          일간→주간→월간 보고서를 집계하고 관리합니다
        </p>
      </div>

      <div className="flex gap-2">
        {tabs.map((t) => (
          <Button
            key={t.key}
            variant={activeTab === t.key ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveTab(t.key)}
          >
            {t.label}
          </Button>
        ))}
      </div>

      {activeTab === "weekly" && (
        <div className="space-y-4">
          <div className="flex items-end gap-4">
            <div>
              <Label>주간 시작일</Label>
              <Input
                type="date"
                value={weekStart}
                onChange={(e) => setWeekStart(e.target.value)}
                className="w-48"
              />
            </div>
            {isManager && (
              <Button size="sm" onClick={handleGenerateWeekly}>
                <BarChart3 className="w-4 h-4 mr-1" />
                주간 보고서 생성
              </Button>
            )}
          </div>

          {loadingWeekly ? (
            <Skeleton className="h-32" />
          ) : weeklyReports && weeklyReports.length > 0 ? (
            <div className="space-y-3">
              {weeklyReports.map((r) => (
                <Card
                  key={r.id}
                  className="cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => setWeeklyDetailId(r.id)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-sm">{r.title}</span>
                          <Badge variant="outline" className="text-xs">
                            {statusLabels[r.status]}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span>
                            {r.weekStart} ~ {r.weekEnd}
                          </span>
                          <span>일간 보고 {r.totalDailyReports}건</span>
                          <span>작성자: {r.authorName}</span>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <FileText className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
                <p className="text-muted-foreground">주간 보고서가 없습니다</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {activeTab === "monthly" && (
        <div className="space-y-4">
          <div className="flex items-end gap-4">
            <div>
              <Label>보고 월</Label>
              <Input
                type="month"
                value={monthFilter}
                onChange={(e) => setMonthFilter(e.target.value)}
                className="w-48"
              />
            </div>
            {isManager && (
              <Button size="sm" onClick={handleGenerateMonthly}>
                <BarChart3 className="w-4 h-4 mr-1" />
                월간 보고서 생성
              </Button>
            )}
          </div>

          {loadingMonthly ? (
            <Skeleton className="h-32" />
          ) : monthlyReports && monthlyReports.length > 0 ? (
            <div className="space-y-3">
              {monthlyReports.map((r) => (
                <Card
                  key={r.id}
                  className="cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => setMonthlyDetailId(r.id)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-sm">{r.title}</span>
                          <Badge variant="outline" className="text-xs">
                            {statusLabels[r.status]}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span>{r.reportMonth}</span>
                          <span>주간 보고 {r.totalWeeklyReports}건</span>
                          <span>작성자: {r.authorName}</span>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <FileText className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
                <p className="text-muted-foreground">월간 보고서가 없습니다</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <ResponsiveDialog
        open={weeklyDetailId !== null}
        onOpenChange={(o) => !o && setWeeklyDetailId(null)}
      >
        {selectedWeekly && (
          <ResponsiveDialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <ResponsiveDialogHeader>
              <ResponsiveDialogTitle>{selectedWeekly.title}</ResponsiveDialogTitle>
            </ResponsiveDialogHeader>
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Badge variant="outline">
                  {statusLabels[selectedWeekly.status]}
                </Badge>
                <span className="text-sm text-muted-foreground">
                  {selectedWeekly.weekStart} ~ {selectedWeekly.weekEnd}
                </span>
              </div>
              <div className="p-4 bg-muted/50 rounded-lg text-sm whitespace-pre-wrap">
                {selectedWeekly.summary}
              </div>
              <div className="text-sm text-muted-foreground">
                일간 보고서 {selectedWeekly.totalDailyReports}건 집계 | 작성자:{" "}
                {selectedWeekly.authorName}
              </div>
            </div>
            <ResponsiveDialogFooter>
              {/* [2026-05-20 사장님 지시] 일/주/월보 생성 후 "기안서로 만들기" 버튼 숨김. */}
              {isManager && selectedWeekly.status !== "forwarded" && (
                <Button onClick={() => handleForwardWeekly(selectedWeekly.id)}>
                  <Send className="w-4 h-4 mr-1" />
                  보고서 전달
                </Button>
              )}
            </ResponsiveDialogFooter>
          </ResponsiveDialogContent>
        )}
      </ResponsiveDialog>

      <ResponsiveDialog
        open={monthlyDetailId !== null}
        onOpenChange={(o) => !o && setMonthlyDetailId(null)}
      >
        {selectedMonthly && (
          <ResponsiveDialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <ResponsiveDialogHeader>
              <ResponsiveDialogTitle>{selectedMonthly.title}</ResponsiveDialogTitle>
            </ResponsiveDialogHeader>
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Badge variant="outline">
                  {statusLabels[selectedMonthly.status]}
                </Badge>
                <span className="text-sm text-muted-foreground">
                  {selectedMonthly.reportMonth}
                </span>
              </div>
              <div className="p-4 bg-muted/50 rounded-lg text-sm whitespace-pre-wrap">
                {selectedMonthly.summary}
              </div>
              <div className="text-sm text-muted-foreground">
                주간 보고서 {selectedMonthly.totalWeeklyReports}건 집계 | 작성자:{" "}
                {selectedMonthly.authorName}
              </div>
            </div>
            <ResponsiveDialogFooter>
              {/* [2026-05-20 사장님 지시] 일/주/월보 생성 후 "기안서로 만들기" 버튼 숨김. */}
            </ResponsiveDialogFooter>
          </ResponsiveDialogContent>
        )}
      </ResponsiveDialog>
    </div>
  );
}
