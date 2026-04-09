import { useState } from "react";
import { useGetWeeklyReport } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText, CheckSquare, Shield, Calculator, BarChart3 } from "lucide-react";
import { formatDate } from "@/lib/utils";

function getMondayOfCurrentWeek() {
  const today = new Date();
  const day = today.getDay();
  const diff = today.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(today.setDate(diff)).toISOString().split("T")[0];
}

const categoryLabel = (c: string) => {
  const labels: Record<string, string> = {
    daily_check: "일일 점검",
    maintenance: "유지보수",
    administrative: "행정업무",
    tax: "세무",
    elevator: "승강기",
    water_tank: "저수조",
    fire_safety: "소방",
    electrical: "전기",
    gas: "가스",
    septic: "정화조",
    playground: "놀이터",
    safety_check: "안전점검",
    other: "기타",
  };
  return labels[c] || c;
};

export default function Reports() {
  const [weekStart, setWeekStart] = useState(getMondayOfCurrentWeek());
  const { data: report, isLoading } = useGetWeeklyReport(
    { weekStart },
    { query: { enabled: !!weekStart } }
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">주간 업무 보고서</h1>
        <p className="text-muted-foreground text-sm mt-1">
          AI가 자동으로 생성한 주간 업무 보고서입니다
        </p>
      </div>

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
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-32" />
          <Skeleton className="h-48" />
        </div>
      ) : report ? (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <FileText className="w-5 h-5 text-accent" />
                주간 업무 요약
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                {formatDate(String(report.weekStart))} ~ {formatDate(String(report.weekEnd))}
              </p>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div className="text-center p-4 bg-muted/50 rounded-lg">
                  <p className="text-2xl font-bold">{report.totalTasks}</p>
                  <p className="text-xs text-muted-foreground mt-1">총 업무</p>
                </div>
                <div className="text-center p-4 bg-chart-2/10 rounded-lg">
                  <p className="text-2xl font-bold text-chart-2">{report.completedTasks}</p>
                  <p className="text-xs text-muted-foreground mt-1">완료</p>
                </div>
                <div className="text-center p-4 bg-chart-3/10 rounded-lg">
                  <p className="text-2xl font-bold text-chart-3">{report.pendingTasks}</p>
                  <p className="text-xs text-muted-foreground mt-1">미완료</p>
                </div>
                <div className="text-center p-4 bg-accent/10 rounded-lg">
                  <p className="text-2xl font-bold text-accent">{report.inspectionsDue}</p>
                  <p className="text-xs text-muted-foreground mt-1">점검 예정</p>
                </div>
                <div className="text-center p-4 bg-chart-4/10 rounded-lg">
                  <p className="text-2xl font-bold text-chart-4">{report.taxSchedulesDue}</p>
                  <p className="text-xs text-muted-foreground mt-1">세무 일정</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {report.tasksByCategory.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-accent" />
                  분류별 업무 현황
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {report.tasksByCategory.map((cat) => (
                    <div key={cat.category} className="flex items-center justify-between">
                      <span className="text-sm font-medium">{categoryLabel(cat.category)}</span>
                      <div className="flex items-center gap-3">
                        <div className="w-32 bg-muted rounded-full h-2">
                          <div
                            className="bg-accent h-2 rounded-full transition-all"
                            style={{
                              width: `${Math.min(100, (cat.count / Math.max(report.totalTasks, 1)) * 100)}%`,
                            }}
                          />
                        </div>
                        <span className="text-sm font-medium w-8 text-right">{cat.count}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {report.nextWeekInspections && report.nextWeekInspections.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Shield className="w-4 h-4 text-accent" />
                  다음 주 예정 점검
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {report.nextWeekInspections.map((insp) => (
                    <div key={insp.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                      <div>
                        <p className="text-sm font-medium">{insp.name}</p>
                        <p className="text-xs text-muted-foreground">{categoryLabel(insp.category)}</p>
                      </div>
                      <Badge variant="outline">{formatDate(insp.nextDueDate)}</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {report.highlights.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">주요 사항</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {report.highlights.map((h, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <span className="w-1.5 h-1.5 rounded-full bg-accent mt-1.5 shrink-0" />
                      {h}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground">해당 주간의 보고서 데이터가 없습니다</p>
            <p className="text-sm text-muted-foreground mt-1">
              업무를 등록하고 처리하면 자동으로 보고서가 생성됩니다
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
