import { useState, useEffect, useMemo, useCallback } from "react";
import { Link, useLocation } from "wouter";
import { QuickEntryFab } from "@/components/work-log/quick-entry-fab";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/auth-context";
import {
  useListNotifications,
  useGetUnreadNotificationCount,
  useMarkNotificationRead,
  useMarkAnnouncementRead,
  useGetFacilityStatusSummary,
  getListNotificationsQueryKey,
  getGetUnreadNotificationCountQueryKey,
  type FacilityStatusBadge as FacilityBadge,
  type FacilityStatusSummary,
  type Notification,
} from "@workspace/api-client-react";
import { FacilityStatusBadge } from "@/components/facility-status-badge";
import { useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  LogOut,
  Settings,
  Menu,
  X,
  ChevronLeft,
  Check,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Megaphone } from "lucide-react";
import { PlatformFooter } from "@/components/intermediary-disclaimer";
import {
  ROLE_LABELS,
  getSidebarSections,
  getBottomNavItems,
  getEffectiveRole,
  type NavItem,
  type NavSection,
  type Role,
} from "@/lib/permissions";

// All sidebar / bottom-nav definitions live in `@/lib/permissions` and are
// derived from the role × screen permission matrix (single source of truth).
// Any per-role visibility tweak must go through that file.

// KST 날짜 키 ("YYYY-MM-DD"). 자정 경과 감지 + stale 4/4 방지에만 사용.
function kstDateKey(at?: Date): string {
  const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
  const base = at ? at.getTime() : Date.now();
  const d = new Date(base + KST_OFFSET_MS);
  return d.toISOString().split("T")[0];
}

function getPageTitle(location: string, navItems: NavItem[]): string {
  if (location === "/") return "대시보드";
  const item = navItems.find((n) =>
    n.path !== "/" && location.startsWith(n.path)
  );
  return item?.label || "관리의달인";
}

function isSubPage(location: string): boolean {
  const parts = location.split("/").filter(Boolean);
  return parts.length > 1;
}

function SidebarContent({ navLinks, user, logout, base, isPartner }: {
  navLinks: React.ReactNode;
  user: any;
  logout: () => void;
  base: string;
  isPartner: boolean;
}) {
  return (
    <>
      <div className="p-4 border-b border-sidebar-border shrink-0">
        <Link href="/"><img src={`${base}logo.png`} alt="관리의달인" className="h-10 w-auto" /></Link>
      </div>
      <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">{navLinks}</nav>
      <div className="p-3 border-t border-sidebar-border space-y-2 shrink-0">
        {user && (
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <div className="text-sm font-medium text-sidebar-foreground truncate">{user.name}</div>
              <div className="text-xs text-sidebar-foreground/50">{ROLE_LABELS[user.role as Role] || user.role}</div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {!isPartner && (
                <Link href="/settings">
                  <button className="p-1.5 text-sidebar-foreground/50 hover:text-white rounded transition-colors" title="설정">
                    <Settings className="w-4 h-4" />
                  </button>
                </Link>
              )}
              <button onClick={logout} className="p-1.5 text-sidebar-foreground/50 hover:text-white rounded transition-colors" title="로그아웃">
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
        <div className="text-xs text-sidebar-foreground/50">v1.0.0</div>
      </div>
    </>
  );
}

function isAnnouncement(n: Notification): boolean {
  return n.kind === "announcement" || n.notificationType === "platform_announcement";
}

function NotifBell() {
  const [notifOpen, setNotifOpen] = useState(false);
  const [openDetail, setOpenDetail] = useState<Notification | null>(null);
  const { data: unreadCount } = useGetUnreadNotificationCount({ query: { staleTime: 30 * 1000, refetchInterval: 60 * 1000 } });
  const { data: notifications } = useListNotifications({ query: { enabled: notifOpen } });
  const markRead = useMarkNotificationRead();
  const markAnnouncementRead = useMarkAnnouncementRead();
  const queryClient = useQueryClient();

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: getListNotificationsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetUnreadNotificationCountQueryKey() });
  }, [queryClient]);

  const handleMarkRead = useCallback(async (n: Notification) => {
    if (isAnnouncement(n)) {
      await markAnnouncementRead.mutateAsync({ id: n.id });
    } else {
      await markRead.mutateAsync({ id: n.id });
    }
    invalidate();
  }, [markRead, markAnnouncementRead, invalidate]);

  const onItemClick = useCallback(async (n: Notification) => {
    if (isAnnouncement(n)) {
      setOpenDetail(n);
      if (!n.isRead) {
        await markAnnouncementRead.mutateAsync({ id: n.id });
        invalidate();
      }
      setNotifOpen(false);
      return;
    }
    if (!n.isRead) await handleMarkRead(n);
  }, [handleMarkRead, markAnnouncementRead, invalidate]);

  return (
    <>
      <Popover open={notifOpen} onOpenChange={setNotifOpen}>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="sm" className="relative min-w-[44px] min-h-[44px]">
            <Bell className="w-5 h-5" />
            {(unreadCount?.count ?? 0) > 0 && (
              <span className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground text-xs rounded-full w-5 h-5 flex items-center justify-center">
                {unreadCount!.count}
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-0" align="end">
          <div className="p-3 border-b">
            <div className="font-medium text-sm">알림</div>
          </div>
          <ScrollArea className="max-h-80">
            {notifications && notifications.length > 0 ? (
              <div className="divide-y">
                {notifications.map((n) => {
                  const ann = isAnnouncement(n);
                  return (
                    <div
                      key={`${ann ? "ann" : "sys"}-${n.id}`}
                      className={cn(
                        "p-3 text-sm cursor-pointer hover:bg-muted/50 transition-colors min-h-[44px]",
                        !n.isRead && "bg-primary/5",
                      )}
                      onClick={() => onItemClick(n)}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          {ann && (
                            <Badge
                              variant="secondary"
                              className="shrink-0 gap-1 bg-blue-100 text-blue-700 hover:bg-blue-100"
                            >
                              <Megaphone className="w-3 h-3" />
                              공지
                            </Badge>
                          )}
                          <p className="font-medium text-sm truncate">{n.title}</p>
                        </div>
                        {!n.isRead && <span className="w-2 h-2 rounded-full bg-primary shrink-0 mt-1.5" />}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2 whitespace-pre-line">{n.message}</p>
                      <p className="text-xs text-muted-foreground mt-1">{new Date(n.createdAt).toLocaleString("ko-KR")}</p>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-6 text-center text-sm text-muted-foreground">알림이 없습니다</div>
            )}
          </ScrollArea>
        </PopoverContent>
      </Popover>

      <Dialog open={openDetail !== null} onOpenChange={(open) => !open && setOpenDetail(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Megaphone className="w-4 h-4 text-blue-600" />
              <span>{openDetail?.title}</span>
            </DialogTitle>
            {openDetail && (
              <DialogDescription className="text-xs">
                {new Date(openDetail.createdAt).toLocaleString("ko-KR")}
              </DialogDescription>
            )}
          </DialogHeader>
          <div className="text-sm whitespace-pre-line max-h-[60vh] overflow-y-auto">
            {openDetail?.message}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const { user, logout } = useAuth();
  const base = import.meta.env.BASE_URL ?? "/";
  const [drawerOpen, setDrawerOpen] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => { setDrawerOpen(false); }, [location]);

  const effectiveRole = getEffectiveRole(user);
  const isPartner = effectiveRole === "partner";
  const sections = useMemo(() => getSidebarSections(effectiveRole), [effectiveRole]);
  const navItems = useMemo(() => sections.flatMap((s) => s.items), [sections]);
  const bottomItems = useMemo(() => getBottomNavItems(effectiveRole), [effectiveRole]);

  // 시설 그룹 신호등 배지: 1분 폴링 + 창 포커스 갱신.
  // 시설 섹션이 노출되는 role에만 활성화하여 불필요한 호출을 막는다.
  const hasFacilitySection = useMemo(
    () => sections.some((s) => s.title === "시설관리"),
    [sections],
  );
  const { data: facilityStatus, dataUpdatedAt: facilityStatusUpdatedAt } =
    useGetFacilityStatusSummary({
      query: {
        queryKey: ["facility-status-summary"],
        enabled: hasFacilitySection,
        refetchInterval: 60 * 1000,
        refetchOnWindowFocus: true,
        staleTime: 30 * 1000,
      },
    });
  // 시설 그룹 헤더 우측 N/4 진행률 배지.
  // 자정 리셋: 클라이언트 KST 날짜가 바뀌면 (1) 즉시 stale 데이터를 숨기고
  // (2) 서버에서 최신값을 다시 받아오도록 쿼리를 invalidate.
  const [todayKey, setTodayKey] = useState(() => kstDateKey());
  useEffect(() => {
    const tick = () => {
      const k = kstDateKey();
      setTodayKey((prev) => (prev === k ? prev : k));
    };
    const id = window.setInterval(tick, 60 * 1000);
    const onFocus = () => tick();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, []);
  // 데이터가 도착한 시점의 KST 날짜를 추적해, 자정 경과 후
  // 새 데이터가 오기 전까지 이전 날짜의 4/4가 보이는 것을 차단.
  const fetchedKstKey = useMemo(
    () => (facilityStatusUpdatedAt ? kstDateKey(new Date(facilityStatusUpdatedAt)) : null),
    [facilityStatusUpdatedAt],
  );
  useEffect(() => {
    if (!hasFacilitySection) return;
    if (fetchedKstKey && fetchedKstKey !== todayKey) {
      void queryClient.invalidateQueries({ queryKey: ["facility-status-summary"] });
    }
  }, [todayKey, fetchedKstKey, hasFacilitySection, queryClient]);
  const isProgressFresh = fetchedKstKey !== null && fetchedKstKey === todayKey;
  const todayProgress =
    isProgressFresh &&
    facilityStatus &&
    (facilityStatus as FacilityStatusSummary).todayProgress
      ? (facilityStatus as FacilityStatusSummary).todayProgress!
      : null;
  const showTodayProgress = hasFacilitySection && todayProgress !== null;
  const isFullyDone =
    showTodayProgress && todayProgress!.completedCount >= todayProgress!.totalCount;

  const badgeForPath = useCallback(
    (path: string): FacilityBadge | undefined => {
      if (!facilityStatus) return undefined;
      const s = facilityStatus as FacilityStatusSummary;
      switch (path) {
        case "/inspections":
          return s.inspections;
        case "/safety-checklists":
          return s.safetyChecklists;
        case "/maintenance-logs":
          return s.maintenanceLogs;
        case "/safety-training":
          return s.safetyTrainings;
        default:
          return undefined;
      }
    },
    [facilityStatus],
  );

  const bottomNavItems = bottomItems;
  const pageTitle = getPageTitle(location, navItems);
  const showBack = isSubPage(location);

  const navLinks = useMemo(() => sections.map((section, si) => {
    // 시설 및 안전관리 그룹은 4-아이콘 그리드로 렌더 (시니어 친화적 인지 속도 향상).
    // 그룹 헤더는 role이 /facility 접근 권한이 있을 때만 클릭 가능 (headerHref 사용).
    const isFacilityGrid =
      section.title === "시설관리" && section.items.length > 0;

    if (isFacilityGrid) {
      // [요청] 사이드바 그룹 헤더의 N/4 진행률 텍스트 제거.
      const header = (
        <div
          className={cn(
            "px-3 pt-4 pb-1 flex items-center gap-2 text-[10px] uppercase tracking-wider font-semibold transition-colors",
            section.headerHref
              ? "text-sidebar-foreground/40 cursor-pointer hover:text-sidebar-foreground/70"
              : "text-sidebar-foreground/40",
          )}
        >
          <span className="truncate">{section.title}</span>
        </div>
      );
      // [종배치] 시설 그룹도 다른 그룹과 동일한 세로 리스트로 렌더하되,
      // 그룹 헤더의 진행률 배지와 항목별 신호등 배지는 유지한다.
      return (
        <div key={si}>
          {section.headerHref ? <Link href={section.headerHref}>{header}</Link> : header}
          {section.items.map((item) => {
            const isActive =
              item.path === "/" ? location === "/" : location.startsWith(item.path);
            const badge = badgeForPath(item.path);
            return (
              <Link key={item.path} href={item.path}>
                <div
                  className={cn(
                    "flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer min-h-[44px]",
                    isActive
                      ? "bg-sidebar-accent text-white"
                      : "text-sidebar-foreground/70 hover:text-white hover:bg-sidebar-accent/50"
                  )}
                  title={badge?.ariaLabel ?? item.label}
                >
                  <span className="relative inline-flex">
                    <item.icon className="w-4 h-4 shrink-0" />
                    <FacilityStatusBadge badge={badge} size="sm" />
                  </span>
                  <span className="truncate">{item.label}</span>
                </div>
              </Link>
            );
          })}
        </div>
      );
    }

    return (
      <div key={si}>
        {section.title && (
          <div className="px-3 pt-4 pb-1 text-[10px] uppercase tracking-wider text-sidebar-foreground/40 font-semibold">
            {section.title}
          </div>
        )}
        {section.items.map((item) => {
          const isActive = item.path === "/" ? location === "/" : location.startsWith(item.path);
          return (
            <Link key={item.path} href={item.path}>
              <div
                className={cn(
                  "flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer min-h-[44px]",
                  isActive
                    ? "bg-sidebar-accent text-white"
                    : "text-sidebar-foreground/70 hover:text-white hover:bg-sidebar-accent/50"
                )}
              >
                <item.icon className="w-4 h-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </div>
            </Link>
          );
        })}
      </div>
    );
  }), [location, isPartner, sections, badgeForPath, showTodayProgress, todayProgress, isFullyDone]);

  return (
    <>
      <style>{`
        .layout-grid {
          display: flex;
          flex-direction: column;
          width: 100%;
          min-height: 100vh;
        }
        .layout-sidebar { display: none; }
        .layout-mobile-header { display: flex; }
        .layout-desktop-header { display: none; }
        .layout-bottom-nav { display: flex; }
        .layout-content-area { padding-bottom: calc(60px + env(safe-area-inset-bottom, 0px)); }

        @media (max-width: 899px) {
          .layout-grid {
            max-width: 100vw;
            overflow-x: hidden;
          }
        }

        @media (min-width: 900px) {
          .layout-grid {
            display: block;
            padding-left: 220px;
          }
          .layout-sidebar {
            display: flex;
            position: fixed;
            top: 0;
            left: 0;
            width: 220px;
            height: 100vh;
            overflow: hidden;
            z-index: 30;
          }
          .layout-mobile-header { display: none; }
          .layout-desktop-header { display: flex; }
          .layout-bottom-nav { display: none; }
          .layout-content-area { padding-bottom: 0; }
        }
      `}</style>

      {drawerOpen && (
        <div
          className="fixed top-0 left-0 right-0 z-20 bg-background flex flex-col"
          style={{
            paddingTop: "env(safe-area-inset-top, 0px)",
            bottom: "calc(60px + env(safe-area-inset-bottom, 0px))",
          }}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <Link href="/" onClick={() => setDrawerOpen(false)}>
              <img src={`${base}logo.png`} alt="관리의달인" className="h-9 w-auto" />
            </Link>
            <button
              onClick={() => setDrawerOpen(false)}
              className="p-2 rounded hover:bg-muted min-w-[44px] min-h-[44px] flex items-center justify-center"
              aria-label="닫기"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-4">
            {sections.map((section, si) => {
              const isFacility = section.title === "시설관리" && section.items.length > 0;
              // [요청] 모바일 드로어 그룹 헤더의 N/4 진행률 텍스트 제거.
              const drawerProgressPill = isFacility && false ? (
                <span
                  aria-label={`오늘 4대 핵심 과업 ${todayProgress!.completedCount}/${todayProgress!.totalCount} 완료`}
                  className={cn(
                    "inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums",
                    isFullyDone
                      ? "bg-emerald-500/15 text-emerald-700"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {isFullyDone && <Check className="w-3.5 h-3.5" aria-hidden="true" />}
                  <span>{todayProgress!.completedCount}/{todayProgress!.totalCount}</span>
                </span>
              ) : null;
              const headerInner = (
                <div className="flex items-center justify-between gap-2 pb-2">
                  <span className="px-1 text-xs font-semibold text-muted-foreground truncate">
                    {section.title}
                  </span>
                  {drawerProgressPill}
                </div>
              );
              return (
              <div key={si} className="mb-6">
                {section.title && (
                  section.headerHref ? (
                    <Link href={section.headerHref} onClick={() => setDrawerOpen(false)}>
                      <div className="cursor-pointer hover:text-foreground transition-colors">
                        {headerInner}
                      </div>
                    </Link>
                  ) : (
                    headerInner
                  )
                )}
                {/* [종배치] 모바일 드로어도 세로 리스트로 통일 */}
                <div className="flex flex-col gap-1">
                  {section.items.map((item) => {
                    const isActive = item.path === "/" ? location === "/" : location.startsWith(item.path);
                    const badge = badgeForPath(item.path);
                    return (
                      <Link key={item.path} href={item.path}>
                        <button
                          onClick={() => setDrawerOpen(false)}
                          aria-label={badge?.ariaLabel ?? item.label}
                          className={cn(
                            "w-full min-w-0 flex items-center gap-2.5 py-3 px-3 rounded-lg border transition-colors text-left",
                            isActive
                              ? "bg-accent/10 border-accent text-accent"
                              : "bg-card border-border hover:bg-muted text-foreground"
                          )}
                        >
                          <span className="relative inline-flex">
                            <item.icon className="w-5 h-5 shrink-0" />
                            <FacilityStatusBadge badge={badge} size="md" />
                          </span>
                          <span className="text-sm font-medium truncate">
                            {item.label}
                          </span>
                        </button>
                      </Link>
                    );
                  })}
                </div>
              </div>
              );
            })}
          </div>

          {/* 모바일 드로어 하단의 사용자/설정/로그아웃 바는 제거됨.
              설정 진입은 메뉴 항목, 로그아웃은 설정 화면 최하단으로 이동. */}
        </div>
      )}

      <div className="layout-grid">
        <aside className="layout-sidebar bg-sidebar text-sidebar-foreground flex-col">
          <SidebarContent navLinks={navLinks} user={user} logout={logout} base={base} isPartner={isPartner} />
        </aside>

        <div className="flex flex-col min-h-screen min-w-0">
          <div className="layout-mobile-header sticky top-0 z-20 bg-background border-b px-2 py-2 items-center justify-between">
            <div className="flex items-center gap-1 min-w-0">
              {showBack ? (
                <button
                  onClick={() => {
                    const parts = location.split("/").filter(Boolean);
                    setLocation("/" + parts.slice(0, -1).join("/"));
                  }}
                  className="p-2 rounded hover:bg-muted min-w-[44px] min-h-[44px] flex items-center justify-center shrink-0"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
              ) : (
                <div className="w-2" />
              )}
              <span className="text-sm font-semibold truncate">{pageTitle}</span>
            </div>
            <NotifBell />
          </div>

          <div className="layout-desktop-header sticky top-0 z-20 bg-background border-b px-6 py-3 justify-end">
            <NotifBell />
          </div>

          <div className="layout-content-area flex-1 p-3 sm:p-6 max-w-[1400px] w-full mx-auto">{children}</div>
          {isPartner && <PlatformFooter />}
        </div>
      </div>

      {(user.role === "manager" || user.role === "platform_admin") && (
        <QuickEntryFab onCreated={() => queryClient.invalidateQueries({ queryKey: ["work-logs"] })} />
      )}

      <nav className="layout-bottom-nav fixed bottom-0 left-0 right-0 z-30 bg-background border-t items-center justify-around"
          style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)", height: "calc(60px + env(safe-area-inset-bottom, 0px))" }}
        >
          {bottomNavItems.map((item) => {
            const isActive = item.path === "/" ? location === "/" : location.startsWith(item.path);
            return (
              <Link key={item.path} href={item.path}>
                <button className={cn(
                  "flex flex-col items-center justify-center gap-0.5 min-w-[64px] min-h-[48px] py-1.5 px-2 rounded-lg transition-colors",
                  isActive ? "text-accent" : "text-muted-foreground"
                )}>
                  <item.icon className="w-5 h-5" />
                  <span className="text-[10px] font-medium">{item.label}</span>
                </button>
              </Link>
            );
          })}
          <button
            onClick={() => setDrawerOpen(true)}
            className={cn(
              "flex flex-col items-center justify-center gap-0.5 min-w-[64px] min-h-[48px] py-1.5 px-2 rounded-lg transition-colors text-muted-foreground"
            )}
          >
            <Menu className="w-5 h-5" />
            <span className="text-[10px] font-medium">더보기</span>
          </button>
        </nav>
    </>
  );
}
