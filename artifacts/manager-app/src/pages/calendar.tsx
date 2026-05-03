import { useState } from "react";
import { useGetCalendarEvents } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ChevronLeft, ChevronRight, CheckCircle2, Clock, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

const TYPE_LABELS: Record<string, string> = {
  tax_schedule: "세무 일정",
  task: "업무",
  task_completed: "업무 완료",
  inspection_due: "법정점검 예정",
  inspection_completed: "법정점검 완료",
  safety_checklist: "안전점검",
  maintenance: "시설 업무",
  safety_training: "안전교육",
  // [Task #612] 비교견적 RFQ 의 확정된 현장방문 슬롯도 일정에 노출.
  rfq_site_visit: "현장방문 견적",
};

// [Task #785] 셀 안 일정 칩 색상 — 상태 우선(완료/기한초과) 후 source(회계/시설).
function chipClasses(ev: { source?: string; status?: string }, isSelected: boolean) {
  if (ev.status === "completed") {
    return isSelected
      ? "bg-primary-foreground/20 text-primary-foreground line-through"
      : "bg-gray-100 text-gray-500 line-through";
  }
  if (ev.status === "overdue") {
    return isSelected
      ? "bg-red-200 text-red-900"
      : "bg-red-100 text-red-700";
  }
  if (ev.source === "accounting") {
    return isSelected
      ? "bg-blue-200 text-blue-900"
      : "bg-blue-100 text-blue-700";
  }
  return isSelected
    ? "bg-emerald-200 text-emerald-900"
    : "bg-emerald-100 text-emerald-700";
}

export default function CalendarPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const { data: events, isLoading } = useGetCalendarEvents({ year, month });

  const eventsByDate = new Map<string, NonNullable<typeof events>>();
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
    // [Task #785] "오늘" 은 단순히 이번 달로 이동만 한다. 셀이 클릭된 것이 아니므로
    //   바텀 시트는 열지 않는다(selectedDate 를 건드리지 않음).
    setYear(now.getFullYear());
    setMonth(now.getMonth() + 1);
    setSelectedDate(null);
  };

  const selectedEvents = selectedDate ? (eventsByDate.get(selectedDate) || []) : [];

  // [Task #785] 6 주 그리드(42 칸)로 항상 고정 — 화면 높이 계산이 일관된다.
  const totalCells = 42;
  const calendarCells: (number | null)[] = [];
  for (let i = 0; i < firstDayOfMonth; i++) calendarCells.push(null);
  for (let d = 1; d <= daysInMonth; d++) calendarCells.push(d);
  while (calendarCells.length < totalCells) calendarCells.push(null);

  return (
    // [Task #785] 한 화면 안에 월간 달력이 들어오도록 dvh 기반 컨테이너로 변경.
    //   layout-content-area 의 p-3 sm:p-6 패딩과 상단 헤더/하단 탭바를 고려해
    //   100dvh 에서 여유분을 차감한다.
    <div className="flex flex-col gap-3 h-[calc(100dvh-7.5rem)] sm:h-[calc(100dvh-8.5rem)] min-h-0">
      <div className="flex items-center justify-between shrink-0">
        <h1 className="text-xl font-bold">일정</h1>
        <Button variant="outline" size="sm" onClick={goToToday}>
          오늘
        </Button>
      </div>

      <Card className="flex-1 min-h-0 flex flex-col">
        <CardContent className="p-3 sm:p-4 flex flex-col flex-1 min-h-0">
          <div className="flex items-center justify-between mb-2 shrink-0">
            <Button variant="ghost" size="icon" onClick={prevMonth} className="h-9 w-9">
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <h2 className="text-base font-semibold">
              {year}년 {month}월
            </h2>
            <Button variant="ghost" size="icon" onClick={nextMonth} className="h-9 w-9">
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>

          {isLoading ? (
            <Skeleton className="flex-1 w-full" />
          ) : (
            <>
              <div className="grid grid-cols-7 mb-1 shrink-0">
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

              {/* [Task #785] 셀들이 컨테이너 높이를 6 행으로 균등 분할.
                  grid-rows-6 + auto-rows-fr 로 빈 영역까지 채우면서 칩 영역을 확보한다. */}
              <div className="grid grid-cols-7 grid-rows-6 flex-1 min-h-0 gap-px bg-border rounded-md overflow-hidden border">
                {calendarCells.map((day, idx) => {
                  if (day === null) {
                    return (
                      <div
                        key={`empty-${idx}`}
                        className="bg-muted/20"
                      />
                    );
                  }

                  const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                  const dayEvents = eventsByDate.get(dateStr) || [];
                  const isToday = dateStr === todayStr;
                  const isSelected = dateStr === selectedDate;
                  const dayOfWeek = (firstDayOfMonth + day - 1) % 7;

                  // [Task #785] 모바일은 1 칩 + N, 데스크톱은 2 칩 + N. CSS 로 토글한다.
                  const mobileVisible = 1;
                  const desktopVisible = 2;
                  const mobileExtra = Math.max(0, dayEvents.length - mobileVisible);
                  const desktopExtra = Math.max(0, dayEvents.length - desktopVisible);

                  return (
                    <button
                      key={dateStr}
                      onClick={() => setSelectedDate(dateStr)}
                      data-testid={`calendar-cell-${dateStr}`}
                      className={cn(
                        "flex flex-col items-stretch min-w-0 min-h-0 p-1 sm:p-1.5 text-left transition-colors overflow-hidden",
                        isSelected
                          ? "bg-primary text-primary-foreground"
                          : isToday
                          ? "bg-accent/30"
                          : "bg-card hover:bg-muted/40",
                      )}
                    >
                      <span
                        className={cn(
                          "text-xs sm:text-sm font-medium leading-none mb-0.5 sm:mb-1 shrink-0",
                          isToday && !isSelected && "font-bold",
                          !isSelected && dayOfWeek === 0 && "text-red-500",
                          !isSelected && dayOfWeek === 6 && "text-blue-500"
                        )}
                      >
                        {day}
                      </span>

                      {dayEvents.length > 0 && (
                        <div className="flex-1 min-h-0 flex flex-col gap-0.5 overflow-hidden">
                          {dayEvents.map((ev, i) => (
                            <span
                              key={ev.id}
                              className={cn(
                                "block w-full truncate text-[10px] sm:text-[11px] leading-tight px-1 py-0.5 rounded",
                                chipClasses(ev, isSelected),
                                // 모바일: 첫 번째만, 데스크톱(sm 이상): 처음 2 개
                                i >= mobileVisible && i < desktopVisible && "hidden sm:block",
                                i >= desktopVisible && "hidden",
                              )}
                            >
                              {ev.title}
                            </span>
                          ))}
                          {mobileExtra > 0 && (
                            <span
                              className={cn(
                                "block text-[10px] leading-tight px-1 sm:hidden",
                                isSelected ? "text-primary-foreground/80" : "text-muted-foreground"
                              )}
                            >
                              +{mobileExtra}개
                            </span>
                          )}
                          {desktopExtra > 0 && (
                            <span
                              className={cn(
                                "hidden sm:block text-[10px] leading-tight px-1",
                                isSelected ? "text-primary-foreground/80" : "text-muted-foreground"
                              )}
                            >
                              +{desktopExtra}개
                            </span>
                          )}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center gap-3 sm:gap-4 mt-2 text-xs text-muted-foreground border-t pt-2 shrink-0 flex-wrap">
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
                <div className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-gray-400" />
                  완료
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* [Task #785] 셀에 다 못 담는 일정은 바텀 시트로 보여줘 한 화면을 벗어나지 않게 한다. */}
      <Sheet
        open={selectedDate !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedDate(null);
        }}
      >
        <SheetContent
          side="bottom"
          className="max-h-[75dvh] overflow-y-auto rounded-t-2xl p-4 sm:p-6"
        >
          <SheetHeader className="mb-3">
            <SheetTitle className="text-base">
              {selectedDate?.replace(/-/g, ".")} 일정
              {selectedEvents.length > 0 && (
                <span className="ml-1 text-muted-foreground font-normal">
                  ({selectedEvents.length}건)
                </span>
              )}
            </SheetTitle>
          </SheetHeader>

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
                          {TYPE_LABELS[ev.originalType] || ev.originalType}
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
        </SheetContent>
      </Sheet>
    </div>
  );
}
