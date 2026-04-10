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
  ChevronRight,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

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

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const base = import.meta.env.BASE_URL ?? "/";
  const [notifOpen, setNotifOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    const saved = localStorage.getItem("sidebar_collapsed");
    return saved === "true";
  });
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem("sidebar_collapsed", String(collapsed));
  }, [collapsed]);

  useEffect(() => {
    setMobileOpen(false);
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
  const sidebarWidth = collapsed ? "w-[68px]" : "w-56";
  const mainMargin = collapsed ? "lg:ml-[68px]" : "lg:ml-56";

  const sidebarContent = (
    <>
      <div className={cn("p-3 border-b border-sidebar-border flex items-center", collapsed ? "justify-center" : "justify-between")}>
        {!collapsed && (
          <Link href="/">
            <img
              src={`${base}logo.png`}
              alt="관리의달인"
              className="h-10 w-auto"
            />
          </Link>
        )}
        <button
          onClick={() => {
            if (window.innerWidth < 1024) {
              setMobileOpen(false);
            } else {
              setCollapsed(!collapsed);
            }
          }}
          className="p-1.5 text-sidebar-foreground/60 hover:text-white rounded transition-colors hidden lg:block"
          title={collapsed ? "사이드바 펼치기" : "사이드바 접기"}
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
        <button
          onClick={() => setMobileOpen(false)}
          className="p-1.5 text-sidebar-foreground/60 hover:text-white rounded transition-colors lg:hidden"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
      <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => {
          const isActive =
            item.path === "/"
              ? location === "/"
              : location.startsWith(item.path);
          return (
            <Link key={item.path} href={item.path}>
              <div
                className={cn(
                  "flex items-center gap-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer",
                  collapsed ? "justify-center px-2 py-2.5" : "px-3 py-2",
                  isActive
                    ? "bg-sidebar-accent text-white"
                    : "text-sidebar-foreground/70 hover:text-white hover:bg-sidebar-accent/50"
                )}
                title={collapsed ? item.label : undefined}
              >
                <item.icon className="w-[18px] h-[18px] shrink-0" />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </div>
            </Link>
          );
        })}
      </nav>
      <div className={cn("border-t border-sidebar-border", collapsed ? "p-2" : "p-3 space-y-2")}>
        {user && !collapsed && (
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
        {user && collapsed && (
          <button
            onClick={logout}
            className="w-full flex justify-center p-2 text-sidebar-foreground/50 hover:text-white rounded transition-colors"
            title="로그아웃"
          >
            <LogOut className="w-4 h-4" />
          </button>
        )}
        {!collapsed && (
          <div className="text-xs text-sidebar-foreground/50">v1.0.0</div>
        )}
      </div>
    </>
  );

  return (
    <div className="min-h-screen flex">
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={cn(
          "bg-sidebar text-sidebar-foreground flex flex-col fixed h-full z-50 transition-all duration-200",
          "hidden lg:flex",
          sidebarWidth
        )}
      >
        {sidebarContent}
      </aside>

      <aside
        className={cn(
          "bg-sidebar text-sidebar-foreground flex flex-col fixed h-full z-50 transition-transform duration-200 w-56 lg:hidden",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {sidebarContent}
      </aside>

      <main className={cn("flex-1 transition-all duration-200", mainMargin)}>
        <div className="sticky top-0 z-20 bg-background border-b px-4 py-2.5 flex items-center justify-between">
          <button
            onClick={() => setMobileOpen(true)}
            className="p-1.5 rounded hover:bg-muted transition-colors lg:hidden"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="hidden lg:block" />
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
                          {!n.isRead && (
                            <span className="w-2 h-2 rounded-full bg-primary shrink-0 mt-1.5" />
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{n.message}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {new Date(n.createdAt).toLocaleString("ko-KR")}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-6 text-center text-sm text-muted-foreground">
                    알림이 없습니다
                  </div>
                )}
              </ScrollArea>
            </PopoverContent>
          </Popover>
        </div>
        <div className="p-4 lg:p-6 max-w-[1400px] mx-auto">{children}</div>
      </main>
    </div>
  );
}
