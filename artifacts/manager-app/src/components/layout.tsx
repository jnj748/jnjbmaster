import { useState } from "react";
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
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

const buildingNavItems = [
  { path: "/", label: "대시보드", icon: LayoutDashboard },
  { path: "/tasks", label: "업무 관리", icon: CheckSquare },
  { path: "/inspections", label: "법정 점검", icon: Shield },
  { path: "/drafts", label: "기안서", icon: ClipboardList },
  { path: "/tax-schedules", label: "세무 일정", icon: Calculator },
  { path: "/facility", label: "시설관리", icon: HardHat },
  { path: "/safety-checklists", label: "안전점검표", icon: ClipboardCheck },
  { path: "/maintenance-logs", label: "기전 업무일지", icon: Wrench },
  { path: "/safety-training", label: "안전교육", icon: GraduationCap },
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
];

const executiveNavItems = [
  { path: "/", label: "대시보드", icon: LayoutDashboard },
  { path: "/approvals", label: "결재함", icon: ClipboardCheck },
  { path: "/spending", label: "지출 현황", icon: DollarSign },
  { path: "/tasks", label: "업무 관리", icon: CheckSquare },
  { path: "/inspections", label: "법정 점검", icon: Shield },
  { path: "/drafts", label: "기안서", icon: ClipboardList },
  { path: "/tax-schedules", label: "세무 일정", icon: Calculator },
  { path: "/tenants", label: "입주민 관리", icon: Users },
  { path: "/owners", label: "소유자 관리", icon: UserCheck },
  { path: "/vehicles", label: "차량 관리", icon: Car },
  { path: "/vendors", label: "협력업체", icon: Building2 },
  { path: "/commissions", label: "수수료", icon: Coins },
  { path: "/daily-reports", label: "일간보고", icon: BookOpen },
  { path: "/report-system", label: "보고 체계", icon: BarChart3 },
  { path: "/reports", label: "주간보고", icon: FileText },
  { path: "/document-templates", label: "서식 관리", icon: Settings },
  { path: "/users", label: "사용자 관리", icon: Users },
];

const managerOnlyItems = [
  { path: "/approvals", label: "결재함", icon: ClipboardCheck },
  { path: "/users", label: "사용자 관리", icon: Users },
];

const vendorNavItems = [
  { path: "/", label: "대시보드", icon: LayoutDashboard },
  { path: "/vendors", label: "업체 정보", icon: Package },
  { path: "/commissions", label: "수수료", icon: Coins },
];

const roleLabels: Record<string, string> = {
  manager: "관리소장",
  executive: "최고관리자",
  facility_staff: "시설관리 담당자",
  vendor: "견적 업체",
};

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const base = import.meta.env.BASE_URL ?? "/";
  const [notifOpen, setNotifOpen] = useState(false);

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

  const isVendor = user?.portalType === "vendor";
  const isExecutive = user?.role === "executive";
  let navItems = isVendor
    ? vendorNavItems
    : isExecutive
    ? executiveNavItems
    : buildingNavItems;

  if (user?.role === "manager") {
    navItems = [...navItems, ...managerOnlyItems];
  }

  return (
    <div className="min-h-screen flex">
      <aside className="w-60 bg-sidebar text-sidebar-foreground flex flex-col fixed h-full z-30">
        <div className="p-4 border-b border-sidebar-border">
          <Link href="/">
            <img
              src={`${base}logo.png`}
              alt="관리의달인"
              className="h-12 w-auto"
            />
          </Link>
        </div>
        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          {navItems.map((item) => {
            const isActive =
              item.path === "/"
                ? location === "/"
                : location.startsWith(item.path);
            return (
              <Link key={item.path} href={item.path}>
                <div
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer",
                    isActive
                      ? "bg-sidebar-accent text-white"
                      : "text-sidebar-foreground/70 hover:text-white hover:bg-sidebar-accent/50"
                  )}
                >
                  <item.icon className="w-4.5 h-4.5 shrink-0" />
                  {item.label}
                </div>
              </Link>
            );
          })}
        </nav>
        <div className="p-4 border-t border-sidebar-border space-y-3">
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
          <div className="text-xs text-sidebar-foreground/50">
            v1.0.0
          </div>
        </div>
      </aside>
      <main className="flex-1 ml-60">
        <div className="sticky top-0 z-20 bg-background border-b px-6 py-3 flex justify-end">
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
        <div className="p-6 max-w-[1400px] mx-auto">{children}</div>
      </main>
    </div>
  );
}
