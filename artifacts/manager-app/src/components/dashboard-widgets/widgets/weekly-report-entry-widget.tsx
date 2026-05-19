import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { CalendarRange, ChevronRight } from "lucide-react";

export default function WeeklyReportEntryWidget() {
  return (
    <section data-testid="weekly-report-entry-widget" className="h-full">
      <Link href="/work-log?tab=weekly" className="block h-full">
        <Card
          className="h-full hover-elevate active-elevate-2 cursor-pointer"
          data-testid="weekly-report-entry-card"
        >
          <CardContent className="py-2.5 px-3 flex items-center gap-3 h-full">
            <div className="w-9 h-9 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center shrink-0">
              <CalendarRange className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">주간보고</p>
              <p className="text-xs text-muted-foreground truncate">
                이번 주 업무를 모아 주간 보고서로 확인·인쇄합니다
              </p>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
          </CardContent>
        </Card>
      </Link>
    </section>
  );
}
