import { useState } from "react";
import { useGetCalendarEvents } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronLeft, ChevronRight, CheckCircle2, Clock, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

const SOURCE_LABELS: Record<string, string> = {
  tax_schedule: "세무 일정",
  task: "업무",
  task_completed: "업무 완료",
  inspection_due: "법정점검 예정",
  inspection_completed: "법정점검 완료",
  safety_checklist: "안전점검",
  maintenance: "기전 업무",
  safety_training: "안전교육",
};

export default function CalendarPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [selectedDate, setSelectedDate] = useState<string | null>(
    now.toISOString().split("T")[0]
  );

  const { data: events, isLoading } = useGetCalendarEvents({ year, month });

  const eventsByDate = new Map<string, typeof events>();
  if (events) {
    for (const ev of events) {
      const existing = eventsByDate.get(ev.date) || [];
      existing.push(ev);
      eventsByDate.set(ev.date, existing);
    }
  }

  const firstDayOfMonth = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const todayStr = now.toISOString().split("T")[0];

  const prevMonth = () => {
    if (month === 1) { setYear(year - 1); setMonth(12); }
    else setMonth(month - 1);
    setSelectedDate(null);
  };

  const nextMonth = () => {
    if (month === 12) { setYear(year + 1); setMonth(1); }
    else setMonth(month + 1);
    setSelectedDate(null);
  };

  const goToToday = () => {
    setYear(now.getFullYear());
    setMonth(now.getMonth() + 1);
    setSelectedDate(todayStr);
  };

  const selectedEvents = selectedDate ? (eventsByDate.get(selectedDate) || []) : [];

  const calendarCells: (number | null)[] = [];
  for (let i = 0; i < firstDayOfMonth; i++) calendarCells.push(null);
  for (let d = 1; d <= daysInMonth; d++) calendarCells.push(d);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">일정</h1>
        <Button variant="outline" size="sm" onClick={goToToday}>
          오늘
        </Button>
      </div>

      <Card>
        <CardContent className="p-3 sm:p-4">
          <div className="flex items-center justify-between mb-4">
            <Button variant="ghost" size="icon" onClick={prevMonth} className="h-8 w-8">
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <h2 className="text-base font-semibold">
              {year}년 {month}월
            </h2>
            <Button variant="ghost" size="icon" onClick={nextMonth} className="h-8 w-8">
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>

          {isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <>
              <div className="grid grid-cols-7 mb-1">
                {WEEKDAYS.map((w, i) => (
                  <div
                    key={w}
                    className={cn(
                      "text-center text-xs font-medium py-1",
                      i === 0 ? "text-red-500" : i === 6 ? "text-blue-500" : "text-muted-foreground"
                    )}
                  >
                    {w}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7">
                {calendarCells.map((day, idx) => {
                  if (day === null) {
                    return <div key={`empty-${idx}`} className="aspect-square" />;
                  }

                  const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                  const dayEvents = eventsByDate.get(dateStr) || [];
                  const isToday = dateStr === todayStr;
                  const isSelected = dateStr === selectedDate;
                  const dayOfWeek = (firstDayOfMonth + day - 1) % 7;

                  const hasAccounting = dayEvents.some((e) => e.source === "accounting");
                  const hasFacility = dayEvents.some((e) => e.source === "facility");
                  const hasOverdue = dayEvents.some((e) => e.status === "overdue");

                  return (
                    <button
                      key={dateStr}
                      onClick={() => setSelectedDate(dateStr)}
                      className={cn(
                        "aspect-square flex flex-col items-center justify-center relative rounded-lg transition-colors text-sm",
                        isSelected
                          ? "bg-primary text-primary-foreground"
                          : isToday
                          ? "bg-accent/20 font-bold"
                          : "hover:bg-muted/50",
                        dayOfWeek === 0 && !isSelected && "text-red-500",
                        dayOfWeek === 6 && !isSelected && "text-blue-500"
                      )}
                    >
                      <span className="text-xs sm:text-sm">{day}</span>
                      {dayEvents.length > 0 && (
                        <div className="flex gap-0.5 mt-0.5">
                          {hasAccounting && (
                            <span
                              className={cn(
                                "w-1.5 h-1.5 rounded-full",
                                isSelected ? "bg-primary-foreground" : "bg-blue-500"
                              )}
                            />
                          )}
                          {hasFacility && (
                            <span
                              className={cn(
                                "w-1.5 h-1.5 rounded-full",
                                isSelected ? "bg-primary-foreground" : "bg-emerald-500"
                              )}
                            />
                          )}
                          {hasOverdue && (
                            <span
                              className={cn(
                                "w-1.5 h-1.5 rounded-full",
                                isSelected ? "bg-primary-foreground" : "bg-red-500"
                              )}
                            />
                          )}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground border-t pt-2">
                <div className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-blue-500" />
                  관리비회계
                </div>
                <div className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  시설관리
                </div>
                <div className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-red-500" />
                  기한초과
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {selectedDate && (
        <div>
          <h3 className="text-sm font-semibold mb-2 text-muted-foreground">
            {selectedDate.replace(/-/g, ".")} 일정
            {selectedEvents.length > 0 && (
              <span className="ml-1">({selectedEvents.length}건)</span>
            )}
          </h3>
          {selectedEvents.length === 0 ? (
            <Card>
              <CardContent className="p-4 text-center text-sm text-muted-foreground">
                등록된 일정이 없습니다
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {selectedEvents.map((ev) => (
                <Card
                  key={ev.id}
                  className={cn(
                    "border-l-4",
                    ev.status === "overdue"
                      ? "border-l-red-500"
                      : ev.status === "completed"
                      ? "border-l-emerald-500"
                      : ev.source === "accounting"
                      ? "border-l-blue-500"
                      : "border-l-teal-500"
                  )}
                >
                  <CardContent className="p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p
                          className={cn(
                            "text-sm font-medium",
                            ev.status === "completed" && "line-through text-muted-foreground"
                          )}
                        >
                          {ev.title}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {SOURCE_LABELS[ev.sourceType] || ev.sourceType}
                        </p>
                      </div>
                      <div className="shrink-0">
                        {ev.status === "completed" ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                        ) : ev.status === "overdue" ? (
                          <AlertTriangle className="w-4 h-4 text-red-500" />
                        ) : (
                          <Clock className="w-4 h-4 text-blue-500" />
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span
                        className={cn(
                          "text-[10px] px-1.5 py-0.5 rounded-full font-medium",
                          ev.source === "accounting"
                            ? "bg-blue-100 text-blue-700"
                            : "bg-emerald-100 text-emerald-700"
                        )}
                      >
                        {ev.source === "accounting" ? "회계" : "시설"}
                      </span>
                      <span
                        className={cn(
                          "text-[10px] px-1.5 py-0.5 rounded-full font-medium",
                          ev.status === "completed"
                            ? "bg-gray-100 text-gray-600"
                            : ev.status === "overdue"
                            ? "bg-red-100 text-red-700"
                            : "bg-yellow-100 text-yellow-700"
                        )}
                      >
                        {ev.status === "completed"
                          ? "완료"
                          : ev.status === "overdue"
                          ? "기한초과"
                          : "예정"}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
