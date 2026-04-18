import { useState, useEffect, useMemo, useCallback } from "react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/auth-context";
import {
  useListNotifications,
  useGetUnreadNotificationCount,
  useMarkNotificationRead,
  getListNotificationsQueryKey,
  getGetUnreadNotificationCountQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  LogOut,
  Settings,
  Menu,
  X,
  ChevronLeft,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
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

function NotifBell() {
  const [notifOpen, setNotifOpen] = useState(false);
  const { data: unreadCount } = useGetUnreadNotificationCount({ query: { staleTime: 30 * 1000, refetchInterval: 60 * 1000 } });
  const { data: notifications } = useListNotifications({ query: { enabled: notifOpen } });
  const markRead = useMarkNotificationRead();
  const queryClient = useQueryClient();

  const handleMarkRead = useCallback(async (id: number) => {
    await markRead.mutateAsync({ id });
    queryClient.invalidateQueries({ queryKey: getListNotificationsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetUnreadNotificationCountQueryKey() });
  }, [markRead, queryClient]);

  return (
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
              {notifications.map((n) => (
                <div
                  key={n.id}
                  className={cn("p-3 text-sm cursor-pointer hover:bg-muted/50 transition-colors min-h-[44px]", !n.isRead && "bg-primary/5")}
                  onClick={() => !n.isRead && handleMarkRead(n.id)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium text-sm">{n.title}</p>
                    {!n.isRead && <span className="w-2 h-2 rounded-full bg-primary shrink-0 mt-1.5" />}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{n.message}</p>
                  <p className="text-xs text-muted-foreground mt-1">{new Date(n.createdAt).toLocaleString("ko-KR")}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-6 text-center text-sm text-muted-foreground">알림이 없습니다</div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const { user, logout } = useAuth();
  const base = import.meta.env.BASE_URL ?? "/";
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => { setDrawerOpen(false); }, [location]);

  const effectiveRole = getEffectiveRole(user);
  const isPartner = effectiveRole === "partner";
  const sections = useMemo(() => getSidebarSections(effectiveRole), [effectiveRole]);
  const navItems = useMemo(() => sections.flatMap((s) => s.items), [sections]);
  const bottomItems = useMemo(() => getBottomNavItems(effectiveRole), [effectiveRole]);

  const bottomNavItems = bottomItems;
  const pageTitle = getPageTitle(location, navItems);
  const showBack = isSubPage(location);

  const navLinks = useMemo(() => sections.map((section, si) => {
    // 시설 및 안전관리 그룹은 4-아이콘 그리드로 렌더 (시니어 친화적 인지 속도 향상).
    // 그룹 헤더는 role이 /facility 접근 권한이 있을 때만 클릭 가능 (headerHref 사용).
    const isFacilityGrid =
      section.title === "시설 및 안전관리" && section.items.length > 0;

    if (isFacilityGrid) {
      const header = (
        <div
          className={cn(
            "px-3 pt-4 pb-1 text-[10px] uppercase tracking-wider font-semibold transition-colors",
            section.headerHref
              ? "text-sidebar-foreground/40 cursor-pointer hover:text-sidebar-foreground/70"
              : "text-sidebar-foreground/40",
          )}
        >
          {section.title}
        </div>
      );
      return (
        <div key={si}>
          {section.headerHref ? <Link href={section.headerHref}>{header}</Link> : header}
          <div className="grid grid-cols-4 gap-1 px-2 pb-1">
            {section.items.map((item) => {
              const isActive =
                item.path === "/" ? location === "/" : location.startsWith(item.path);
              return (
                <Link key={item.path} href={item.path}>
                  <div
                    className={cn(
                      "flex flex-col items-center justify-center gap-1 py-2 px-1 rounded-lg text-[10px] font-medium transition-colors cursor-pointer min-h-[56px] text-center",
                      isActive
                        ? "bg-sidebar-accent text-white"
                        : "text-sidebar-foreground/70 hover:text-white hover:bg-sidebar-accent/50"
                    )}
                    title={item.label}
                  >
                    <item.icon className="w-5 h-5 shrink-0" />
                    <span
                      className="block w-full leading-tight overflow-hidden text-ellipsis whitespace-nowrap break-keep"
                    >
                      {item.label}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
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
  }), [location, isPartner, sections]);

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
            {sections.map((section, si) => (
              <div key={si} className="mb-6">
                {section.title && (
                  <div className="px-1 pb-2 text-xs font-semibold text-muted-foreground">
                    {section.title}
                  </div>
                )}
                <div className="grid grid-cols-4 gap-2">
                  {section.items.map((item) => {
                    const isActive = item.path === "/" ? location === "/" : location.startsWith(item.path);
                    return (
                      <Link key={item.path} href={item.path}>
                        <button
                          onClick={() => setDrawerOpen(false)}
                          className={cn(
                            "w-full min-w-0 flex flex-col items-center gap-1.5 py-3 px-1 rounded-xl border transition-colors overflow-hidden",
                            isActive
                              ? "bg-accent/10 border-accent text-accent"
                              : "bg-card border-border hover:bg-muted text-foreground"
                          )}
                        >
                          <item.icon className="w-6 h-6 shrink-0" />
                          <span className="block w-full text-[10px] font-medium text-center whitespace-nowrap overflow-hidden text-ellipsis px-0.5">
                            {item.label}
                          </span>
                        </button>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <div
            className="border-t px-4 py-3 bg-background"
            style={{ paddingBottom: "calc(12px + env(safe-area-inset-bottom, 0px))" }}
          >
            {user && (
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{user.name}</div>
                  <div className="text-xs text-muted-foreground">{ROLE_LABELS[user.role as Role] || user.role}</div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {!isPartner && (
                    <Link href="/settings" onClick={() => setDrawerOpen(false)}>
                      <button className="p-2 rounded hover:bg-muted min-w-[44px] min-h-[44px] flex items-center justify-center" title="설정">
                        <Settings className="w-5 h-5" />
                      </button>
                    </Link>
                  )}
                  <button
                    onClick={logout}
                    className="p-2 rounded hover:bg-muted min-w-[44px] min-h-[44px] flex items-center justify-center"
                    title="로그아웃"
                  >
                    <LogOut className="w-5 h-5" />
                  </button>
                </div>
              </div>
            )}
          </div>
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
