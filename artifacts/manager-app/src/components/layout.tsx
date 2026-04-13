import { useState, useEffect } from "react";
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
  LayoutDashboard,
  CheckSquare,
  Shield,
  Calculator,
  Building2,
  Coins,
  FileText,
  ClipboardList,
  ClipboardCheck,
  Users,
  UserCheck,
  Car,
  Bell,
  LogOut,
  Package,
  Send,
  DollarSign,
  Wrench,
  GraduationCap,
  HardHat,
  BookOpen,
  BarChart3,
  Settings,
  Clock,
  Menu,
  X,
  ChevronLeft,
  MoreHorizontal,
  Building,
  CalendarDays,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

interface NavSection {
  title?: string;
  items: { path: string; label: string; icon: React.ElementType }[];
}

const managerNavSections: NavSection[] = [
  {
    items: [
      { path: "/", label: "대시보드", icon: LayoutDashboard },
      { path: "/building-setup", label: "건물 정보", icon: Building },
      { path: "/calendar", label: "일정", icon: CalendarDays },
      { path: "/tasks", label: "업무 관리", icon: CheckSquare },
      { path: "/attendance", label: "출퇴근 관리", icon: Clock },
    ],
  },
  {
    title: "관리비회계",
    items: [
      { path: "/accounting", label: "관리비회계", icon: DollarSign },
      { path: "/approvals", label: "결재함", icon: ClipboardCheck },
      { path: "/spending", label: "지출 현황", icon: DollarSign },
      { path: "/tax-schedules", label: "세무 일정", icon: Calculator },
      { path: "/drafts", label: "기안서", icon: ClipboardList },
      { path: "/commissions", label: "수수료", icon: Coins },
      { path: "/rfqs", label: "견적 요청", icon: Send },
      { path: "/work-reports", label: "작업 검수", icon: ClipboardCheck },
    ],
  },
  {
    title: "시설관리",
    items: [
      { path: "/facility", label: "시설관리", icon: HardHat },
      { path: "/inspections", label: "법정 점검", icon: Shield },
      { path: "/safety-checklists", label: "안전점검표", icon: ClipboardCheck },
      { path: "/maintenance-logs", label: "기전 업무일지", icon: Wrench },
      { path: "/safety-training", label: "안전교육", icon: GraduationCap },
    ],
  },
  {
    title: "입주/자산관리",
    items: [
      { path: "/tenants", label: "입주민 관리", icon: Users },
      { path: "/owners", label: "소유자 관리", icon: UserCheck },
      { path: "/vehicles", label: "차량 관리", icon: Car },
      { path: "/vendors", label: "협력업체", icon: Building2 },
    ],
  },
  {
    title: "보고/서식",
    items: [
      { path: "/daily-reports", label: "일간보고", icon: BookOpen },
      { path: "/report-system", label: "보고 체계", icon: BarChart3 },
      { path: "/reports", label: "주간보고", icon: FileText },
      { path: "/document-templates", label: "서식 관리", icon: Settings },
      { path: "/users", label: "사용자 관리", icon: Users },
    ],
  },
];

const managerNavItems = managerNavSections.flatMap((s) => s.items);

const partnerNavItems = [
  { path: "/", label: "대시보드", icon: LayoutDashboard },
  { path: "/rfqs", label: "견적 요청", icon: FileText },
  { path: "/vendors", label: "업체 정보", icon: Package },
  { path: "/commissions", label: "수수료", icon: Coins },
];

const managerBottomNavItems = [
  { path: "/", label: "홈", icon: LayoutDashboard },
  { path: "/calendar", label: "일정", icon: CalendarDays },
  { path: "/accounting", label: "회계", icon: DollarSign },
  { path: "/facility", label: "시설", icon: HardHat },
  { path: "/tasks", label: "업무", icon: CheckSquare },
];

const partnerBottomNavItems = [
  { path: "/", label: "홈", icon: LayoutDashboard },
  { path: "/rfqs", label: "견적", icon: FileText },
  { path: "/vendors", label: "업체", icon: Package },
  { path: "/commissions", label: "수수료", icon: Coins },
];

const roleLabels: Record<string, string> = {
  manager: "관리소장",
  partner: "파트너사",
  platform_admin: "플랫폼 관리자",
};

function getPageTitle(location: string, navItems: typeof managerNavItems): string {
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

function SidebarContent({ navLinks, user, logout, base }: {
  navLinks: React.ReactNode;
  user: any;
  logout: () => void;
  base: string;
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
              <div className="text-xs text-sidebar-foreground/50">{roleLabels[user.role] || user.role}</div>
            </div>
            <button onClick={logout} className="p-1.5 text-sidebar-foreground/50 hover:text-white rounded transition-colors shrink-0" title="로그아웃">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        )}
        <div className="text-xs text-sidebar-foreground/50">v1.0.0</div>
      </div>
    </>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const { user, logout } = useAuth();
  const base = import.meta.env.BASE_URL ?? "/";
  const [notifOpen, setNotifOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => { setDrawerOpen(false); }, [location]);

  const { data: unreadCount } = useGetUnreadNotificationCount();
  const { data: notifications } = useListNotifications({ query: { enabled: notifOpen } });
  const markRead = useMarkNotificationRead();
  const queryClient = useQueryClient();

  async function handleMarkRead(id: number) {
    await markRead.mutateAsync({ id });
    queryClient.invalidateQueries({ queryKey: getListNotificationsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetUnreadNotificationCountQueryKey() });
  }

  const isPartner = user?.portalType === "partner";
  const navItems = isPartner ? partnerNavItems : managerNavItems;
  const bottomNavItems = isPartner ? partnerBottomNavItems : managerBottomNavItems;
  const pageTitle = getPageTitle(location, navItems);
  const showBack = isSubPage(location);

  const sections = isPartner ? [{ items: partnerNavItems }] : managerNavSections;

  const navLinks = sections.map((section, si) => (
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
  ));

  const notifButton = (
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
        <div className="p-3 border-b font-medium text-sm">알림</div>
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

  return (
    <>
      <style>{`
        .layout-grid {
          display: flex;
          flex-direction: column;
          width: 100%;
          min-height: 100vh;
          max-width: 100vw;
          overflow-x: hidden;
        }
        .layout-sidebar { display: none; }
        .layout-mobile-header { display: flex; }
        .layout-desktop-header { display: none; }
        .layout-bottom-nav { display: flex; }
        .layout-content-area { padding-bottom: calc(60px + env(safe-area-inset-bottom, 0px)); }

        @media (min-width: 900px) {
          .layout-grid {
            display: grid;
            grid-template-columns: 220px 1fr;
            grid-template-rows: 1fr;
          }
          .layout-sidebar { display: flex; }
          .layout-mobile-header { display: none; }
          .layout-desktop-header { display: flex; }
          .layout-bottom-nav { display: none; }
          .layout-content-area { padding-bottom: 0; }
        }
      `}</style>

      {drawerOpen && (
        <>
          <div
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 40 }}
            onClick={() => setDrawerOpen(false)}
          />
          <aside
            style={{ position: "fixed", top: 0, left: 0, width: 260, height: "100%", zIndex: 50 }}
            className="bg-sidebar text-sidebar-foreground flex flex-col"
          >
            <div className="p-4 border-b border-sidebar-border flex items-center justify-between">
              <Link href="/"><img src={`${base}logo.png`} alt="관리의달인" className="h-10 w-auto" /></Link>
              <button onClick={() => setDrawerOpen(false)} className="p-2 text-sidebar-foreground/60 hover:text-white min-w-[44px] min-h-[44px] flex items-center justify-center">
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">{navLinks}</nav>
            <div className="p-3 border-t border-sidebar-border space-y-2" style={{ paddingBottom: "calc(12px + env(safe-area-inset-bottom, 0px))" }}>
              {user && (
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-sidebar-foreground truncate">{user.name}</div>
                    <div className="text-xs text-sidebar-foreground/50">{roleLabels[user.role] || user.role}</div>
                  </div>
                  <button onClick={logout} className="p-2 text-sidebar-foreground/50 hover:text-white rounded transition-colors shrink-0 min-w-[44px] min-h-[44px] flex items-center justify-center" title="로그아웃">
                    <LogOut className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </aside>
        </>
      )}

      <div className="layout-grid">
        <aside className="layout-sidebar bg-sidebar text-sidebar-foreground flex-col h-screen sticky top-0 overflow-hidden">
          <SidebarContent navLinks={navLinks} user={user} logout={logout} base={base} />
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
            {notifButton}
          </div>

          <div className="layout-desktop-header sticky top-0 z-20 bg-background border-b px-6 py-3 justify-end">
            {notifButton}
          </div>

          <div className="layout-content-area flex-1 p-3 sm:p-6 max-w-[1400px] w-full mx-auto">{children}</div>
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
