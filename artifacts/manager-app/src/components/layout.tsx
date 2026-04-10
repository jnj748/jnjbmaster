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
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

const SIDEBAR_W = 220;
const BP = 900;

const managerNavItems = [
  { path: "/", label: "대시보드", icon: LayoutDashboard },
  { path: "/approvals", label: "결재함", icon: ClipboardCheck },
  { path: "/spending", label: "지출 현황", icon: DollarSign },
  { path: "/tasks", label: "업무 관리", icon: CheckSquare },
  { path: "/inspections", label: "법정 점검", icon: Shield },
  { path: "/drafts", label: "기안서", icon: ClipboardList },
  { path: "/tax-schedules", label: "세무 일정", icon: Calculator },
  { path: "/facility", label: "시설관리", icon: HardHat },
  { path: "/safety-checklists", label: "안전점검표", icon: ClipboardCheck },
  { path: "/maintenance-logs", label: "기전 업무일지", icon: Wrench },
  { path: "/safety-training", label: "안전교육", icon: GraduationCap },
  { path: "/attendance", label: "출퇴근 관리", icon: Clock },
  { path: "/tenants", label: "입주민 관리", icon: Users },
  { path: "/owners", label: "소유자 관리", icon: UserCheck },
  { path: "/vehicles", label: "차량 관리", icon: Car },
  { path: "/vendors", label: "협력업체", icon: Building2 },
  { path: "/rfqs", label: "견적 요청", icon: Send },
  { path: "/work-reports", label: "작업 검수", icon: ClipboardCheck },
  { path: "/commissions", label: "수수료", icon: Coins },
  { path: "/daily-reports", label: "일간보고", icon: BookOpen },
  { path: "/report-system", label: "보고 체계", icon: BarChart3 },
  { path: "/reports", label: "주간보고", icon: FileText },
  { path: "/document-templates", label: "서식 관리", icon: Settings },
  { path: "/users", label: "사용자 관리", icon: Users },
];

const partnerNavItems = [
  { path: "/", label: "대시보드", icon: LayoutDashboard },
  { path: "/vendors", label: "업체 정보", icon: Package },
  { path: "/commissions", label: "수수료", icon: Coins },
];

const roleLabels: Record<string, string> = {
  manager: "관리소장",
  partner: "파트너사",
  platform_admin: "플랫폼 관리자",
};

function useIsWide() {
  const [wide, setWide] = useState(() => typeof window !== "undefined" && window.innerWidth >= BP);
  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${BP}px)`);
    const handler = (e: MediaQueryListEvent) => setWide(e.matches);
    setWide(mq.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return wide;
}

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const base = import.meta.env.BASE_URL ?? "/";
  const [notifOpen, setNotifOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const isWide = useIsWide();

  useEffect(() => {
    setDrawerOpen(false);
  }, [location]);

  const { data: unreadCount } = useGetUnreadNotificationCount();
  const { data: notifications } = useListNotifications({
    query: { enabled: notifOpen },
  });
  const markRead = useMarkNotificationRead();
  const queryClient = useQueryClient();

  async function handleMarkRead(id: number) {
    await markRead.mutateAsync({ id });
    queryClient.invalidateQueries({ queryKey: getListNotificationsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetUnreadNotificationCountQueryKey() });
  }

  const isPartner = user?.portalType === "partner";
  const navItems = isPartner ? partnerNavItems : managerNavItems;

  const sidebar = (
    <div
      style={{ width: SIDEBAR_W, minWidth: SIDEBAR_W }}
      className="bg-sidebar text-sidebar-foreground flex flex-col h-full"
    >
      <div className="p-4 border-b border-sidebar-border flex items-center justify-between">
        <Link href="/">
          <img src={`${base}logo.png`} alt="관리의달인" className="h-10 w-auto" />
        </Link>
        {!isWide && (
          <button onClick={() => setDrawerOpen(false)} className="p-1 text-sidebar-foreground/60 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        )}
      </div>
      <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = item.path === "/" ? location === "/" : location.startsWith(item.path);
          return (
            <Link key={item.path} href={item.path}>
              <div
                className={cn(
                  "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer",
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
      </nav>
      <div className="p-3 border-t border-sidebar-border space-y-2">
        {user && (
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <div className="text-sm font-medium text-sidebar-foreground truncate">{user.name}</div>
              <div className="text-xs text-sidebar-foreground/50">{roleLabels[user.role] || user.role}</div>
            </div>
            <button
              onClick={logout}
              className="p-1.5 text-sidebar-foreground/50 hover:text-white rounded transition-colors shrink-0"
              title="로그아웃"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        )}
        <div className="text-xs text-sidebar-foreground/50">v1.0.0</div>
      </div>
    </div>
  );

  const notifButton = (
    <Popover open={notifOpen} onOpenChange={setNotifOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="relative">
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
                  className={cn(
                    "p-3 text-sm cursor-pointer hover:bg-muted/50 transition-colors",
                    !n.isRead && "bg-primary/5"
                  )}
                  onClick={() => !n.isRead && handleMarkRead(n.id)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium text-sm">{n.title}</p>
                    {!n.isRead && <span className="w-2 h-2 rounded-full bg-primary shrink-0 mt-1.5" />}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{n.message}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {new Date(n.createdAt).toLocaleString("ko-KR")}
                  </p>
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

  if (!isWide) {
    return (
      <div style={{ minHeight: "100vh" }}>
        {drawerOpen && (
          <>
            <div
              style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 40 }}
              onClick={() => setDrawerOpen(false)}
            />
            <div style={{ position: "fixed", top: 0, left: 0, height: "100vh", zIndex: 50 }}>
              {sidebar}
            </div>
          </>
        )}
        <div style={{ position: "sticky", top: 0, zIndex: 20 }} className="bg-background border-b px-4 py-2.5 flex items-center justify-between">
          <button onClick={() => setDrawerOpen(true)} className="p-1.5 rounded hover:bg-muted">
            <Menu className="w-5 h-5" />
          </button>
          <span className="text-sm font-semibold">관리의달인</span>
          {notifButton}
        </div>
        <div className="p-4">{children}</div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <div style={{ position: "fixed", top: 0, left: 0, height: "100vh", zIndex: 30 }}>
        {sidebar}
      </div>
      <div style={{ marginLeft: SIDEBAR_W, flex: 1, minWidth: 0 }}>
        <div style={{ position: "sticky", top: 0, zIndex: 20 }} className="bg-background border-b px-6 py-3 flex justify-end">
          {notifButton}
        </div>
        <div className="p-6 max-w-[1400px] mx-auto">{children}</div>
      </div>
    </div>
  );
}
