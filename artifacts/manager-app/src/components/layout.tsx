import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  CheckSquare,
  Shield,
  Calculator,
  Building2,
  Coins,
  FileText,
} from "lucide-react";

const navItems = [
  { path: "/", label: "대시보드", icon: LayoutDashboard },
  { path: "/tasks", label: "업무 관리", icon: CheckSquare },
  { path: "/inspections", label: "법정 점검", icon: Shield },
  { path: "/tax-schedules", label: "세무 일정", icon: Calculator },
  { path: "/vendors", label: "협력업체", icon: Building2 },
  { path: "/commissions", label: "수수료", icon: Coins },
  { path: "/reports", label: "주간보고", icon: FileText },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  return (
    <div className="min-h-screen flex">
      <aside className="w-60 bg-sidebar text-sidebar-foreground flex flex-col fixed h-full z-30">
        <div className="p-5 border-b border-sidebar-border">
          <h1 className="text-lg font-bold tracking-tight text-white">
            관리의달인
          </h1>
          <p className="text-xs text-sidebar-foreground/60 mt-0.5">
            AI 건물관리 워크툴
          </p>
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
        <div className="p-4 border-t border-sidebar-border">
          <div className="text-xs text-sidebar-foreground/50">
            v1.0.0
          </div>
        </div>
      </aside>
      <main className="flex-1 ml-60">
        <div className="p-6 max-w-[1400px] mx-auto">{children}</div>
      </main>
    </div>
  );
}
