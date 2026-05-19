// [Task #413] 시설관리 "필수업무" / "제안업무" 페이지의 공통 본문.
//   /facility/mandatory-tasks · /facility/suggested-tasks 두 라우트가 동일한
//   UI 를 공유한다. 차이점은 데이터 소스(useGetFacilityMandatoryTasks /
//   useGetFacilitySuggestedTasks) 뿐이다.
//
//   기능
//   - 기한 필터: 30일 / 60일 / 180일 / 365일 / 전체
//   - 유형 필터: 점검·세금·보증·후속업무·태스크 템플릿·공고문 게시 등 alert.type
//   - 검색: title/message 부분일치
//   - 트래픽 라이트 D-day(빨강 <7d/초과, 노랑 <30d, 녹색 ≥30d)
//   - 기한초과 그룹 상단 분리 노출
//   - 클릭 시 대시보드와 동일한 AlertActionDialog 처리 흐름

import { useCallback, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useLocation } from "wouter";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import { useBuilding } from "@/contexts/building-context";
import { Search } from "lucide-react";
import {
  getGetFacilityMandatoryTasksQueryKey,
  getGetFacilitySuggestedTasksQueryKey,
} from "@workspace/api-client-react";
import {
  type DashboardAlert,
  ACTIONABLE_ALERT_TYPES,
  ALERT_FALLBACK_ROUTES,
  getDdayLabel,
  getScheduledBadge,
  getTrafficColor,
  getTestTaskCardOverride,
} from "@/lib/alert-utils";
import { splitDashboardAlerts, type DashboardAlertRole } from "@/lib/dashboard-alert-filters";
import { AlertActionDialog } from "@/components/alert-action-dialog";

// 필터 옵션 — alert.type 기준으로 노출. "전체" 외에 알림 유형별로 좁혀 본다.
const TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "전체 유형" },
  { value: "inspection_due", label: "법정/자체 점검" },
  { value: "tax_due", label: "세금" },
  { value: "warranty_expiry", label: "보증 만료" },
  { value: "task_overdue", label: "업무 기한초과" },
  { value: "task_followup", label: "업무 후속조치" },
  { value: "task_template_mandatory", label: "필수 업무 템플릿" },
  { value: "task_template_suggested", label: "제안 업무 템플릿" },
  { value: "notice_posting", label: "공고문 게시" },
  { value: "quote_received", label: "견적 도착" },
];

const DUE_OPTIONS: { value: string; label: string }[] = [
  { value: "30", label: "30일 이내" },
  { value: "60", label: "60일 이내" },
  { value: "180", label: "180일 이내" },
  { value: "365", label: "1년 이내" },
  { value: "all", label: "전체 기간" },
];

interface FacilityTaskListProps {
  pageTitle: string;
  pageDescription: string;
  /**
   * mandatory 페이지는 둘째 줄을 "미처리시 과태료 발생" 고정 문구로 표시.
   * suggested 는 alert.message 그대로 노출.
   */
  sectionKind: "mandatory" | "suggested";
  alerts: DashboardAlert[] | undefined;
  loading: boolean;
}

export function FacilityTaskList({
  pageTitle,
  pageDescription,
  sectionKind,
  alerts,
  loading,
}: FacilityTaskListProps) {
  const { user } = useAuth();
  const { building } = useBuilding();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();

  // 도래일 기본값은 365일 — 신규 메뉴의 목적이 "중장기 업무 사전 확인"이므로
  // 가능한 넓게 보여 주고 사용자가 좁히도록 한다.
  const [dueFilter, setDueFilter] = useState<string>("365");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [search, setSearch] = useState<string>("");
  const [selectedAlert, setSelectedAlert] = useState<DashboardAlert | null>(null);

  // 알림 처리(완료/연기/RFQ 생성) 직후 본 페이지 목록도 즉시 갱신되도록
  // mandatory/suggested 쿼리 키를 invalidate. dashboard 알림 키는 다이얼로그
  // 내부에서 이미 처리한다.
  const handleProcessed = useCallback(() => {
    const key =
      sectionKind === "mandatory"
        ? getGetFacilityMandatoryTasksQueryKey()
        : getGetFacilitySuggestedTasksQueryKey();
    queryClient.invalidateQueries({ queryKey: key });
  }, [queryClient, sectionKind]);

  // 알림 클릭 → 대시보드와 동일한 분기 로직.
  function handleAlertClick(alert: DashboardAlert) {
    // [Task #567] (테스트업무) 호실데이터 불러오기 카드 전용 분기(/units 직행)는
    //   카드 자체가 시드에서 제거됨에 따라 함께 제거됐다. 정화조 카드는 일반
    //   처리 모달 흐름(아래 ACTIONABLE_ALERT_TYPES 분기)을 그대로 사용한다.
    if ((ACTIONABLE_ALERT_TYPES as readonly string[]).includes(alert.type)) {
      if (alert.relatedId) {
        setSelectedAlert(alert);
        return;
      }
      const fallback = ALERT_FALLBACK_ROUTES[alert.type];
      if (fallback) {
        navigate(fallback);
        return;
      }
      toast({ title: "처리할 항목 정보를 찾을 수 없습니다", description: alert.title });
      return;
    }

    if (alert.type === "data_destruction") {
      if (!alert.relatedId) {
        toast({ title: "대상 정보를 찾을 수 없습니다", description: alert.title });
        return;
      }
      const isOwner = alert.title.includes("소유자");
      navigate(
        isOwner
          ? `/units?tab=owners&openOwner=${alert.relatedId}`
          : `/tenants?openTenant=${alert.relatedId}`,
      );
      return;
    }

    if (alert.type === "quote_received") {
      if (!alert.relatedId) {
        toast({ title: "견적 정보를 찾을 수 없습니다", description: alert.title });
        return;
      }
      navigate(`/rfqs?openQuote=${alert.relatedId}`);
      return;
    }

    if (
      alert.type === "task_template_mandatory" ||
      alert.type === "task_template_suggested" ||
      alert.type === "notice_posting"
    ) {
      if (!alert.relatedId) {
        toast({ title: "처리할 항목 정보를 찾을 수 없습니다", description: alert.title });
        return;
      }
      setSelectedAlert(alert);
      return;
    }

    toast({ title: "이 항목은 별도 처리 화면이 없습니다", description: alert.title });
  }

  // [Task #742] 클라이언트 안전망 — 서버가 이미 역할 필터링된 응답을 주지만,
  //   캐시된 구버전 응답이 떠 있을 수 있으므로 한 번 더 거른다. 매니저/플랫폼
  //   관리자/본부장은 splitDashboardAlerts 가 manager 분기로 fall-through 되어
  //   기존 동작이 그대로 유지된다(추가 필터링 없음).
  //   sectionKind 가 mandatory 면 splitDashboardAlerts 의 legalAlerts 를,
  //   suggested 면 proposedAlerts 를 사용한다(매니저 한정 — 경리/시설은 서버에서
  //   suggested 가 비어 오므로 영향 없음).
  const role = (user?.role ?? "manager") as DashboardAlertRole;
  const roleFiltered = useMemo<DashboardAlert[]>(() => {
    const list = (alerts ?? []) as DashboardAlert[];
    if (role !== "manager" && role !== "accountant" && role !== "facility_staff") {
      return list;
    }
    const split = splitDashboardAlerts(list, role);
    return sectionKind === "mandatory" ? split.legalAlerts : split.proposedAlerts;
  }, [alerts, role, sectionKind]);

  // 필터링 — 검색·유형·기한.
  const filtered = useMemo(() => {
    const list = roleFiltered;
    const dueLimitDays = dueFilter === "all" ? null : parseInt(dueFilter, 10);
    const q = search.trim().toLowerCase();
    return list.filter((a) => {
      if (typeFilter !== "all" && a.type !== typeFilter) return false;
      if (dueLimitDays != null && a.dueDate) {
        const dday = getDdayLabel(a.dueDate);
        // 기한초과(음수) 는 항상 노출 — 시설관리자가 늦게라도 처리해야 함.
        if (!dday.isOverdue && dday.days != null && dday.days > dueLimitDays) {
          return false;
        }
      }
      if (q) {
        const hay = `${a.title}\n${a.message}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [roleFiltered, dueFilter, typeFilter, search]);

  // 상단 요약 바 카운트 — 검색·유형 필터는 적용하지 않고 (역할 필터링된) 전체
  // 알림 기준으로 "곧 도래하는 업무량"을 한눈에 보여 준다. 기한 없음 항목은
  // 어떤 기간 버킷에도 포함되지 않는다.
  // [Task #742] 카운트도 roleFiltered 기준 — 카드/모두보기 일치 보장.
  const summary = useMemo(() => {
    const list = roleFiltered;
    let overdueCount = 0;
    let d30 = 0;
    let d60 = 0;
    let d180 = 0;
    let d365 = 0;
    for (const a of list) {
      const dday = getDdayLabel(a.dueDate ?? null);
      if (dday.isOverdue) {
        overdueCount += 1;
        continue;
      }
      const days = dday.days;
      if (days == null) continue;
      if (days <= 30) d30 += 1;
      if (days <= 60) d60 += 1;
      if (days <= 180) d180 += 1;
      if (days <= 365) d365 += 1;
    }
    return {
      total: list.length,
      overdue: overdueCount,
      d30,
      d60,
      d180,
      d365,
    };
  }, [roleFiltered]);

  // 기한초과 그룹은 상단으로 분리.
  const { overdue, upcoming } = useMemo(() => {
    const overdue: DashboardAlert[] = [];
    const upcoming: DashboardAlert[] = [];
    for (const a of filtered) {
      const dday = getDdayLabel(a.dueDate ?? null);
      if (dday.isOverdue) overdue.push(a);
      else upcoming.push(a);
    }
    // 기한초과는 가장 오래 지난 순(=days 가 가장 작은 음수)으로 정렬.
    overdue.sort((x, y) => {
      const dx = getDdayLabel(x.dueDate ?? null).days ?? 0;
      const dy = getDdayLabel(y.dueDate ?? null).days ?? 0;
      return dx - dy;
    });
    upcoming.sort((x, y) => {
      const dx = getDdayLabel(x.dueDate ?? null).days ?? Number.MAX_SAFE_INTEGER;
      const dy = getDdayLabel(y.dueDate ?? null).days ?? Number.MAX_SAFE_INTEGER;
      return dx - dy;
    });
    return { overdue, upcoming };
  }, [filtered]);

  return (
    <div className="space-y-4 p-3 sm:p-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
          {pageTitle}
          {alerts && (
            <span className="text-sm font-normal text-muted-foreground">
              총 {roleFiltered.length}건
            </span>
          )}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">{pageDescription}</p>
      </div>

      <Card>
        <CardContent className="p-3 sm:p-4">
          <div
            className="grid grid-cols-3 sm:grid-cols-6 gap-2"
            data-testid="summary-bar"
          >
            <SummaryCell
              label="전체"
              count={summary.total}
              testid="summary-total"
              tone="neutral"
            />
            <SummaryCell
              label="기한초과"
              count={summary.overdue}
              testid="summary-overdue"
              tone="overdue"
            />
            <SummaryCell
              label="30일"
              count={summary.d30}
              testid="summary-30"
              tone="warn"
            />
            <SummaryCell
              label="60일"
              count={summary.d60}
              testid="summary-60"
              tone="warn"
            />
            <SummaryCell
              label="180일"
              count={summary.d180}
              testid="summary-180"
              tone="neutral"
            />
            <SummaryCell
              label="365일"
              count={summary.d365}
              testid="summary-365"
              tone="neutral"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-3 sm:p-4 space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <Select value={dueFilter} onValueChange={setDueFilter}>
              <SelectTrigger data-testid="select-due-filter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DUE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger data-testid="select-type-filter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TYPE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="relative col-span-2 sm:col-span-1">
              <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="검색"
                className="pl-8"
                data-testid="input-search"
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            기한초과 항목은 필터와 무관하게 항상 상단에 노출됩니다.
          </p>
        </CardContent>
      </Card>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-16 rounded-lg" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            조건에 맞는 업무가 없습니다.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {[...overdue, ...upcoming].map((alert) => (
            <AlertRow
              key={alert.id}
              alert={alert}
              sectionKind={sectionKind}
              onClick={handleAlertClick}
            />
          ))}
        </div>
      )}

      <AlertActionDialog
        alert={selectedAlert}
        onClose={() => setSelectedAlert(null)}
        building={building}
        user={user}
        onProcessed={handleProcessed}
      />
    </div>
  );
}

interface SummaryCellProps {
  label: string;
  count: number;
  testid: string;
  tone: "neutral" | "warn" | "overdue";
}

function SummaryCell({ label, count, testid, tone }: SummaryCellProps) {
  const toneClass =
    tone === "overdue"
      ? "text-red-700"
      : tone === "warn"
      ? "text-amber-700"
      : "text-foreground";
  return (
    <div
      data-testid={testid}
      className="rounded-md border bg-muted/30 px-2 py-2 text-center"
    >
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className={`text-base sm:text-lg font-bold ${toneClass}`}>{count}</div>
    </div>
  );
}

interface AlertRowProps {
  alert: DashboardAlert;
  sectionKind: "mandatory" | "suggested";
  onClick: (alert: DashboardAlert) => void;
}

function AlertRow({ alert, sectionKind, onClick }: AlertRowProps) {
  const trafficColor = getTrafficColor(alert.dueDate ?? null);
  // [Task #742] 대시보드 카드(`AlertSection`) 와 동일한 D-day 라벨을 신호등 점
  //   아래에 함께 노출한다. dueDate 가 없는 항목은 라벨을 생략한다.
  //   라벨 색상은 신호등(`getTrafficColor`) 톤과 매칭(빨강/노랑/녹색).
  const dday = alert.dueDate ? getDdayLabel(alert.dueDate) : null;
  const isInteractive =
    (ACTIONABLE_ALERT_TYPES as readonly string[]).includes(alert.type) ||
    alert.type === "data_destruction" ||
    alert.type === "task_template_mandatory" ||
    alert.type === "task_template_suggested" ||
    alert.type === "quote_received" ||
    alert.type === "notice_posting";

  return (
    <div
      role={isInteractive ? "button" : undefined}
      tabIndex={isInteractive ? 0 : undefined}
      data-testid={`alert-row-${alert.type}-${alert.relatedId ?? alert.id}`}
      className={`flex items-center gap-3 p-3 rounded-lg border bg-card transition-colors border-l-4 min-h-[64px] ${
        isInteractive ? "cursor-pointer hover:bg-muted/50" : "cursor-default"
      } ${
        trafficColor === "red"
          ? "border-l-red-500"
          : trafficColor === "yellow"
          ? "border-l-yellow-400"
          : "border-l-green-500"
      }`}
      onClick={() => isInteractive && onClick(alert)}
      onKeyDown={(e) => {
        if (!isInteractive) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick(alert);
        }
      }}
    >
      <div className="flex flex-col items-center gap-0.5 shrink-0">
        <span
          className={`w-3 h-3 rounded-full ${
            trafficColor === "red"
              ? "bg-red-500 animate-pulse"
              : trafficColor === "yellow"
              ? "bg-yellow-400"
              : "bg-green-500"
          }`}
        />
        {dday && (
          <span
            className={`text-[10px] font-bold whitespace-nowrap ${
              trafficColor === "red"
                ? "text-red-700"
                : trafficColor === "yellow"
                ? "text-yellow-700"
                : "text-green-700"
            }`}
            data-testid={`dday-label-${alert.relatedId ?? alert.id}`}
          >
            {dday.label}
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate">{alert.title}</p>
        {/* [Task #437/#567] (테스트업무) 정화조 청소 카드는 온보딩 가이드 문구로
            대체해 한 줄 안내로 노출한다. (호실데이터 불러오기 카드는 시드에서 제거됨) */}
        {(() => {
          const test = getTestTaskCardOverride(alert);
          if (test) {
            return (
              <div
                className="text-xs text-blue-600 font-medium leading-snug"
                data-testid={`test-task-guide-${test.kind}`}
              >
                {test.secondLines.map((line, i) => (
                  <span key={i} className="block truncate">{line}</span>
                ))}
              </div>
            );
          }
          if (sectionKind === "mandatory") {
            return (
              <p className="text-xs text-red-600 font-medium truncate">미처리시 과태료 발생</p>
            );
          }
          return (
            <p className="text-xs text-muted-foreground truncate">{alert.message}</p>
          );
        })()}
        {trafficColor === "red" && alert.penaltyInfo && (
          <p className="text-[10px] text-red-600 font-medium mt-0.5">⚠ {alert.penaltyInfo}</p>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {alert.hasDraft && (
          <Badge variant="outline" className="text-[10px] h-5">기안서</Badge>
        )}
        {alert.actionStatus === "postponed" && (
          <Badge variant="outline" className="text-[10px] h-5 text-amber-600 border-amber-300">
            연기
          </Badge>
        )}
        {/* [Task #511] 비교견적(예전 RFQ 요청) 액션이 기록된 알림은 모달에서 사용자가
            비교견적 페이지로 이동했음을 의미. 알림은 그대로 노출하되 진행 중 라벨로
            상태를 명확히 한다. */}
        {alert.actionStatus === "rfq_requested" && (
          <Badge
            variant="outline"
            className="text-[10px] h-5 text-blue-700 border-blue-300 bg-blue-50"
            data-testid={`rfq-progress-badge-${alert.relatedId ?? alert.id}`}
          >
            견적 요청 진행 중
          </Badge>
        )}
        {/* [Task #511] 처리예정 D-N 라벨. 예정일 도래 전이면 노란색, 경과하면 빨간색.
            연기 라벨과 달리 알림 자체는 사라지지 않으므로 함께 노출돼도 무방. */}
        {(() => {
          const sched = getScheduledBadge(alert);
          if (!sched) return null;
          const cls =
            sched.tone === "red"
              ? "text-red-700 border-red-300 bg-red-50"
              : "text-yellow-800 border-yellow-300 bg-yellow-50";
          return (
            <Badge
              variant="outline"
              className={`text-[10px] h-5 ${cls}`}
              data-testid={`scheduled-badge-${alert.relatedId ?? alert.id}`}
            >
              {sched.text}
            </Badge>
          );
        })()}
      </div>
    </div>
  );
}
