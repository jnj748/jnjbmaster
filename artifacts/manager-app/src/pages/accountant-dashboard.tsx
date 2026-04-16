import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CalendarDays,
  AlertTriangle,
  Clock,
  CheckCircle,
  Wallet,
  Send,
  Bell,
} from "lucide-react";

const today = new Date();
const currentMonth = today.getMonth() + 1;
const currentYear = today.getFullYear();

interface TaxEvent {
  day: number;
  title: string;
  type: "tax" | "insurance" | "invoice" | "deadline";
  done: boolean;
  daysUntil: number;
}

function buildTaxEvents(): TaxEvent[] {
  const dayOfMonth = today.getDate();

  const monthly: TaxEvent[] = [
    { day: 5, title: "세무사 자료 마감", type: "deadline", done: dayOfMonth > 5, daysUntil: 5 - dayOfMonth },
    { day: 10, title: "원천세 신고·납부", type: "tax", done: dayOfMonth > 10, daysUntil: 10 - dayOfMonth },
    { day: 10, title: "전자세금계산서 발급", type: "invoice", done: dayOfMonth > 10, daysUntil: 10 - dayOfMonth },
    { day: 10, title: "4대보험료 고지분 납부", type: "insurance", done: dayOfMonth > 10, daysUntil: 10 - dayOfMonth },
    { day: 25, title: "관리비 고지서 발송", type: "deadline", done: dayOfMonth > 25, daysUntil: 25 - dayOfMonth },
    { day: 28, title: "세무사 자료 요청 (익월분)", type: "deadline", done: dayOfMonth > 28, daysUntil: 28 - dayOfMonth },
  ];

  const vatDueMonths = [1, 4, 7, 10];
  if (vatDueMonths.includes(currentMonth)) {
    monthly.push({
      day: 25,
      title: "부가가치세 신고·납부",
      type: "tax",
      done: dayOfMonth > 25,
      daysUntil: 25 - dayOfMonth,
    });
  }

  const vatPrepMonths = [3, 6, 9, 12];
  if (vatPrepMonths.includes(currentMonth)) {
    monthly.push({
      day: 28,
      title: "부가세 신고 자료 준비",
      type: "tax",
      done: dayOfMonth > 28,
      daysUntil: 28 - dayOfMonth,
    });
  }

  return monthly.sort((a, b) => a.day - b.day);
}

const TAX_EVENTS = buildTaxEvents();

const DELINQUENT_UNITS = [
  { unit: "301호", months: 3, amount: 540000, lastAction: "문자 발송 (04/01)", lastActionType: "sms" },
  { unit: "502호", months: 2, amount: 380000, lastAction: "미조치", lastActionType: "none" },
  { unit: "704호", months: 1, amount: 195000, lastAction: "유선 연락 (04/10)", lastActionType: "call" },
];

const typeColors: Record<string, string> = {
  tax: "bg-blue-500/10 text-blue-600 border-blue-200",
  insurance: "bg-purple-500/10 text-purple-600 border-purple-200",
  invoice: "bg-green-500/10 text-green-600 border-green-200",
  deadline: "bg-amber-500/10 text-amber-600 border-amber-200",
};

const typeLabels: Record<string, string> = {
  tax: "세무",
  insurance: "보험",
  invoice: "세금계산서",
  deadline: "마감",
};

export default function AccountantDashboard() {
  const nextEvent = TAX_EVENTS.find((e) => !e.done);
  const daysUntilNext = nextEvent ? nextEvent.daysUntil : null;
  const totalDelinquent = DELINQUENT_UNITS.reduce((s, u) => s + u.amount, 0);

  const urgentCount = TAX_EVENTS.filter(e => !e.done && e.daysUntil >= 0 && e.daysUntil <= 3).length;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">회계/행정 대시보드</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {currentYear}년 {currentMonth}월 세무·회계 일정과 미납 현황을 관리합니다
          </p>
        </div>
        {urgentCount > 0 && (
          <Badge variant="destructive" className="text-xs gap-1 animate-pulse">
            <AlertTriangle className="w-3 h-3" />
            {urgentCount}건 D-3 이내
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-muted-foreground">다음 세무 일정</p>
                <p className="text-2xl font-bold mt-1">
                  {daysUntilNext !== null && daysUntilNext > 0 ? `D-${daysUntilNext}` : daysUntilNext === 0 ? "D-Day" : "완료"}
                </p>
                <p className="text-xs text-muted-foreground mt-1">{nextEvent?.title ?? "이번 달 완료"}</p>
              </div>
              <div className="p-2 rounded-lg bg-accent/10"><CalendarDays className="w-5 h-5 text-accent" /></div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-muted-foreground">미납 세대</p>
                <p className="text-2xl font-bold mt-1">{DELINQUENT_UNITS.length}</p>
                <p className="text-xs text-muted-foreground mt-1">₩{totalDelinquent.toLocaleString()}</p>
              </div>
              <div className="p-2 rounded-lg bg-destructive/10"><AlertTriangle className="w-5 h-5 text-destructive" /></div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-muted-foreground">완료 일정</p>
                <p className="text-2xl font-bold mt-1">{TAX_EVENTS.filter((e) => e.done).length}/{TAX_EVENTS.length}</p>
                <p className="text-xs text-muted-foreground mt-1">이번 달 기준</p>
              </div>
              <div className="p-2 rounded-lg bg-green-500/10"><CheckCircle className="w-5 h-5 text-green-500" /></div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-muted-foreground">긴급 알림</p>
                <p className="text-2xl font-bold mt-1">{urgentCount > 0 ? `${urgentCount}건` : "없음"}</p>
                <p className="text-xs text-muted-foreground mt-1">D-3 이내 일정</p>
              </div>
              <div className="p-2 rounded-lg bg-amber-500/10"><Bell className="w-5 h-5 text-amber-500" /></div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarDays className="w-4 h-4" />
              {currentMonth}월 세무·회계 캘린더
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {TAX_EVENTS.map((event, i) => {
              const isUrgent = !event.done && event.daysUntil >= 0 && event.daysUntil <= 3;
              return (
                <div
                  key={i}
                  className={`flex items-center justify-between p-3 rounded-lg border ${event.done ? "opacity-60" : ""} ${isUrgent ? "border-red-300 bg-red-50/50" : ""}`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-sm font-mono font-bold w-8 text-center shrink-0">
                      {event.day}일
                    </span>
                    {event.done ? (
                      <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
                    ) : isUrgent ? (
                      <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
                    ) : (
                      <Clock className="w-4 h-4 text-amber-500 shrink-0" />
                    )}
                    <span className="text-sm font-medium truncate">{event.title}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {isUrgent && (
                      <Badge variant="destructive" className="text-[10px]">
                        {event.daysUntil === 0 ? "D-Day" : `D-${event.daysUntil}`}
                      </Badge>
                    )}
                    <Badge variant="outline" className={`text-[10px] ${typeColors[event.type]}`}>
                      {typeLabels[event.type]}
                    </Badge>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Wallet className="w-4 h-4" />
                미납 관리비 현황
              </CardTitle>
              <Badge variant="destructive" className="text-xs">
                총 ₩{totalDelinquent.toLocaleString()}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {DELINQUENT_UNITS.map((u) => (
              <div key={u.unit} className="p-3 rounded-lg border space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold">{u.unit}</span>
                    <Badge variant="destructive" className="text-[10px]">{u.months}개월 연체</Badge>
                  </div>
                  <span className="text-sm font-bold">₩{u.amount.toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">
                    조치사항: {u.lastAction}
                  </p>
                  <Button size="sm" variant="outline" className="h-6 text-[10px] gap-1">
                    <Send className="w-3 h-3" />
                    문자 발송
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
