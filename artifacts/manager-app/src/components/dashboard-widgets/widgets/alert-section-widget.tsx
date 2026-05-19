// [Task #495] dashboard-manager-legacy 에서 추출. 매니저 대시보드의
//   "필수업무현황(mandatory) / 제안업무현황(suggested)" 두 슬롯 모두에서
//   사용되는 페이지네이션 + 스와이프 가능한 알림 섹션 컴포넌트.
//   동작/스타일/props 시그니처는 원본 그대로 보존(회귀 방지).
//
//   [원본 주석 보존]
//   [Task #184 → #331] Renders one alert section (필수업무현황/제안업무현황).
//   - Always pads to PAGE_SIZE (2) slots so layout height stays constant
//     regardless of card count (0/1/2/3+).
//   - Title shows description text inline + count badge.
//   - Traffic light: green ≥30d, yellow 7~29d, red <7d or overdue.

import type React from "react";
import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronRight } from "lucide-react";
import {
  type DashboardAlert,
  ACTIONABLE_ALERT_TYPES,
  getDdayLabel,
  getScheduledBadge,
  getTestTaskCardOverride,
} from "@/lib/alert-utils";

export type AlertSlot =
  | { kind: "alert"; alert: DashboardAlert }
  | { kind: "placeholder"; message?: string };

export function AlertSection({
  title,
  description,
  icon: Icon,
  iconClassName,
  alerts,
  loading,
  placeholderZero,
  placeholderOne,
  onAlertClick,
  // [Task #380] 섹션 종류(필수/제안) 식별자.
  //   - mandatory: 둘째 줄을 "미처리시 과태료 발생" 고정 문구로 표시
  //     (법정 의무 업무라는 점을 시니어 사용자에게 분명히 전달).
  //   - suggested: 기존처럼 alert.message 를 그대로 노출.
  //   기본값은 안전하게 suggested 동작.
  sectionKind = "suggested",
  // [Task #503] 한 페이지에 표시할 카드 수. 기본값 2(모바일/세로 컴팩트)이며,
  //   매니저 데스크톱 2열 레이아웃에서는 5 를 전달해 한 화면에 5개씩 노출한다.
  //   빈 슬롯 패딩·페이지네이션 동작은 동일한 패턴으로 일반화한다.
  pageSize = 2,
}: {
  title: string;
  description: string;
  icon: React.ElementType;
  iconClassName: string;
  alerts: DashboardAlert[];
  loading: boolean;
  placeholderZero: string;
  placeholderOne: string;
  onAlertClick: (alert: DashboardAlert) => void;
  sectionKind?: "mandatory" | "suggested";
  pageSize?: number;
}) {
  const PAGE_SIZE = Math.max(1, pageSize);
  const slots: AlertSlot[] = alerts.map((alert) => ({ kind: "alert" as const, alert }));
  if (alerts.length === 0) {
    slots.push({ kind: "placeholder", message: placeholderZero });
    while (slots.length < PAGE_SIZE) slots.push({ kind: "placeholder" });
  } else if (alerts.length === 1) {
    slots.push({ kind: "placeholder", message: placeholderOne });
    while (slots.length < PAGE_SIZE) slots.push({ kind: "placeholder" });
  } else if (alerts.length % PAGE_SIZE !== 0) {
    // Pad last page so it still occupies PAGE_SIZE rows of vertical space.
    while (slots.length % PAGE_SIZE !== 0) slots.push({ kind: "placeholder" });
  }
  const pages: AlertSlot[][] = Array.from(
    { length: Math.ceil(slots.length / PAGE_SIZE) },
    (_, i) => slots.slice(i * PAGE_SIZE, i * PAGE_SIZE + PAGE_SIZE),
  );
  const totalPages = pages.length;
  const [page, setPage] = useState(0);
  // Reset to first page when alert count changes (e.g. after action).
  useEffect(() => {
    if (page > 0 && page >= totalPages) setPage(0);
  }, [page, totalPages]);

  return (
    <div>
      <div className="flex items-center justify-between mb-2 gap-2 min-w-0">
        <h2 className="text-base font-bold flex items-center gap-2 min-w-0 flex-1">
          <Icon className={`w-4 h-4 shrink-0 ${iconClassName}`} />
          <span className="shrink-0">{title}</span>
          <span className="text-xs font-normal text-muted-foreground truncate min-w-0">
            {description}
          </span>
        </h2>
        {/* [Task #429] 헤더 우측 "총 N건" 텍스트를 "모두보기" 링크로 대체.
            mandatory → /facility/mandatory-tasks, suggested → /facility/suggested-tasks.
            알림이 0건이어도 항상 표시해 전체 목록 진입을 보장한다.
            카드 클릭(처리 모달 열기)과 영역이 분리되도록 헤더 내부에서만 동작한다. */}
        <Link
          href={
            sectionKind === "mandatory"
              ? "/facility/mandatory-tasks"
              : "/facility/suggested-tasks"
          }
          className="shrink-0 inline-flex items-center gap-0.5 text-xs font-normal text-muted-foreground hover:text-foreground hover:underline px-2 py-1 -mr-2 rounded-md"
          data-testid={`link-view-all-${sectionKind === "mandatory" ? "mandatory" : "suggested"}`}
        >
          모두보기
          <ChevronRight className="w-3 h-3" />
        </Link>
      </div>
      {loading ? (
        // [Task #503] 로딩 스켈레톤 행 수도 PAGE_SIZE 에 맞춰 보여 최종 렌더 후
        //   세로 점프(짧은 → 긴 높이)를 줄인다.
        <div className="space-y-2">
          {Array.from({ length: PAGE_SIZE }, (_, i) => (
            <Skeleton key={i} className="h-14 rounded-lg" />
          ))}
        </div>
      ) : (
        <div
          className="overflow-hidden relative"
          onTouchStart={(e) => {
            const el = e.currentTarget;
            (el as any)._touchStartX = e.touches[0].clientX;
          }}
          onTouchEnd={(e) => {
            const el = e.currentTarget;
            const startX = (el as any)._touchStartX;
            if (startX == null) return;
            const diff = startX - e.changedTouches[0].clientX;
            if (Math.abs(diff) > 50) {
              if (diff > 0 && page < totalPages - 1) setPage(page + 1);
              if (diff < 0 && page > 0) setPage(page - 1);
            }
          }}
        >
          <div
            className="flex transition-transform duration-300 ease-in-out"
            style={{ transform: `translateX(-${page * 100}%)` }}
          >
            {pages.map((pageSlots, pi) => (
              <div key={pi} className="w-full shrink-0 space-y-2 px-0.5">
                {pageSlots.map((slot, si) => {
                  if (slot.kind === "placeholder") {
                    return (
                      <div
                        key={`ph-${pi}-${si}`}
                        className="flex items-center justify-center p-2 rounded-lg border border-dashed bg-muted/20 min-h-[52px]"
                        aria-hidden={slot.message ? undefined : true}
                      >
                        {slot.message && (
                          <p className="text-xs text-muted-foreground text-center whitespace-pre-line leading-relaxed">
                            {slot.message}
                          </p>
                        )}
                      </div>
                    );
                  }
                  const alert = slot.alert;
                  const dday = getDdayLabel(alert.dueDate ?? null);
                  const trafficColor =
                    dday.isOverdue || (dday.days !== null && dday.days < 7)
                      ? "red"
                      : dday.days !== null && dday.days < 30
                      ? "yellow"
                      : "green";
                  const isInteractive =
                    (ACTIONABLE_ALERT_TYPES as readonly string[]).includes(alert.type) ||
                    alert.type === "data_destruction" ||
                    alert.type === "task_template_mandatory" ||
                    alert.type === "task_template_suggested" ||
                    alert.type === "quote_received" ||
                    // [Task #389] 공고문 게시 제안업무 — 클릭 시 액션 모달 오픈.
                    alert.type === "notice_posting";
                  return (
                    <div
                      key={alert.id}
                      role={isInteractive ? "button" : undefined}
                      tabIndex={isInteractive ? 0 : undefined}
                      className={`flex items-center gap-3 p-2 rounded-lg border bg-card transition-colors border-l-4 min-h-[52px] ${
                        isInteractive ? "cursor-pointer hover:bg-muted/50" : "cursor-default"
                      } ${
                        trafficColor === "red"
                          ? "border-l-red-500"
                          : trafficColor === "yellow"
                          ? "border-l-yellow-400"
                          : "border-l-green-500"
                      }`}
                      onClick={() => isInteractive && onAlertClick(alert)}
                      onKeyDown={(e) => {
                        if (!isInteractive) return;
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onAlertClick(alert);
                        }
                      }}
                    >
                      <div className="flex flex-col items-center gap-0.5 shrink-0">
                        <span className={`w-3 h-3 rounded-full ${
                          trafficColor === "red" ? "bg-red-500 animate-pulse" :
                          trafficColor === "yellow" ? "bg-yellow-400" :
                          "bg-green-500"
                        }`} />
                        <span className={`text-[10px] font-bold whitespace-nowrap ${
                          trafficColor === "red" ? "text-red-700" :
                          trafficColor === "yellow" ? "text-yellow-700" :
                          "text-green-700"
                        }`}>
                          {dday.label}
                        </span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{alert.title}</p>
                        {/* [Task #380] 필수업무 섹션은 둘째 줄을 "미처리시 과태료 발생" 고정 문구로
                            노출해 법정 의무 업무라는 점을 시니어 사용자에게 분명히 전달한다.
                            제안업무 섹션은 기존처럼 alert.message 를 그대로 보여준다.
                            [Task #437/#567] (테스트업무) 정화조 청소 카드는 온보딩 가이드
                            문구로 대체. 한 줄 안내. (호실데이터 불러오기 카드는 시드에서 제거됨) */}
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
                              <p className="text-xs text-red-600 font-medium truncate">
                                미처리시 과태료 발생
                              </p>
                            );
                          }
                          return (
                            <p className="text-xs text-muted-foreground truncate">{alert.message}</p>
                          );
                        })()}
                        {/* 빨간색(7일 이내/초과) 카드의 추가 penaltyInfo 라인은 기존대로 동작.
                            mandatory 섹션에서는 둘째 줄 고정 문구와 의미가 중복될 수 있어
                            penaltyInfo 가 별도 정보(예: 과태료 금액)일 때만 의미가 있다. */}
                        {trafficColor === "red" && alert.penaltyInfo && (
                          <p className="text-[10px] text-red-600 font-medium mt-0.5">⚠ {alert.penaltyInfo}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {alert.hasDraft && (
                          <Badge variant="outline" className="text-[10px] h-5">기안서</Badge>
                        )}
                        {alert.actionStatus === "postponed" && (
                          <Badge variant="outline" className="text-[10px] h-5 text-amber-600 border-amber-300">연기</Badge>
                        )}
                        {/* [Task #511] 비교견적 진행 중 라벨 (rfq_requested 액션 기록 후) */}
                        {alert.actionStatus === "rfq_requested" && (
                          <Badge
                            variant="outline"
                            className="text-[10px] h-5 text-blue-700 border-blue-300 bg-blue-50"
                            data-testid={`rfq-progress-badge-${alert.relatedId ?? alert.id}`}
                          >
                            견적 요청 진행 중
                          </Badge>
                        )}
                        {/* [Task #511] 처리예정 D-N 라벨 (yellow=오늘 이후, red=경과) */}
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
                })}
              </div>
            ))}
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-1.5 mt-3">
              {pages.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  aria-label={`페이지 ${i + 1}`}
                  onClick={() => setPage(i)}
                  style={{ width: 6, height: 6, minWidth: 0, minHeight: 0, padding: 0, border: 0 }}
                  className={`rounded-full transition-colors ${
                    i === page ? "bg-primary" : "bg-muted-foreground/30"
                  }`}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
