import { lazy, Suspense } from "react";
import { Building2, Briefcase, Shield } from "lucide-react";
import { useLocation } from "wouter";

const DevQuickLogin = import.meta.env.DEV
  ? lazy(() => import("@/components/dev-quick-login"))
  : null;

export default function PortalSelect() {
  const [, navigate] = useLocation();
  const base = import.meta.env.BASE_URL ?? "/";

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-slate-50 to-slate-100">
      <div className="mb-12 text-center">
        <img
          src={`${base}logo.png`}
          alt="관리의달인"
          className="h-16 w-auto mx-auto mb-4"
        />
        <p className="text-muted-foreground text-lg">
          서비스 입장 유형을 선택해 주세요
        </p>
        <p className="text-xs text-muted-foreground mt-2">
          집합건물 관리 (공동주택관리법 비적용, 150세대 미만)
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl w-full px-6">
        <button
          onClick={() => navigate("/login/building")}
          className="group flex flex-col items-center gap-6 p-8 bg-white rounded-2xl border-2 border-slate-200 shadow-sm hover:border-primary hover:shadow-lg transition-all cursor-pointer"
        >
          <div className="p-5 rounded-2xl bg-primary/10 group-hover:bg-primary/20 transition-colors">
            <Building2 className="w-12 h-12 text-primary" />
          </div>
          <div className="text-center">
            <h2 className="text-xl font-bold mb-2">현장 관리</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              관리소장 · 회계 · 시설관리를 위한<br />건물관리 업무 포털
            </p>
          </div>
        </button>

        <button
          onClick={() => navigate("/login/hq")}
          className="group flex flex-col items-center gap-6 p-8 bg-white rounded-2xl border-2 border-slate-200 shadow-sm hover:border-chart-1 hover:shadow-lg transition-all cursor-pointer"
        >
          <div className="p-5 rounded-2xl bg-chart-1/10 group-hover:bg-chart-1/20 transition-colors">
            <Shield className="w-12 h-12 text-chart-1" />
          </div>
          <div className="text-center">
            <h2 className="text-xl font-bold mb-2">본사 총괄</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              총괄책임자 · 플랫폼 관리자를 위한<br />전체 현장 관리 포털
            </p>
          </div>
        </button>

        <button
          onClick={() => navigate("/login/partner")}
          className="group flex flex-col items-center gap-6 p-8 bg-white rounded-2xl border-2 border-slate-200 shadow-sm hover:border-chart-3 hover:shadow-lg transition-all cursor-pointer"
        >
          <div className="p-5 rounded-2xl bg-chart-3/10 group-hover:bg-chart-3/20 transition-colors">
            <Briefcase className="w-12 h-12 text-chart-3" />
          </div>
          <div className="text-center">
            <h2 className="text-xl font-bold mb-2">파트너사</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              협력업체를 위한<br />전용 파트너 포털
            </p>
          </div>
        </button>
      </div>

      <div className="mt-8 text-center">
        <p className="text-xs text-muted-foreground">
          역할: 관리소장 · 회계/행정 · 시설관리 · 총괄책임자 · 파트너사 · 플랫폼 관리자
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          신규 계정은 관리소장 또는 본사 관리자가 사용자 관리에서 생성합니다
        </p>
      </div>

      {DevQuickLogin && (
        <Suspense fallback={null}>
          <DevQuickLogin />
        </Suspense>
      )}
    </div>
  );
}
