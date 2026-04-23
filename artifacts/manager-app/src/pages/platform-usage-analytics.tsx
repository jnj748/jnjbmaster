import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowDown, ArrowRight, ArrowUp, BarChart3, Users, MousePointerClick, Loader2 } from "lucide-react";
import { ROLE_LABELS, type Role } from "@/lib/permissions";
import { getMenuLabel } from "@/lib/menu-label";

// [Task #296] 유저유형별 이용현황 분석 대시보드.
//   - 기간(7d/30d/90d) × 역할(전체 또는 1개) 필터.
//   - 요약 카드(활성 사용자 수, 총 페이지 조회 수) + 직전 동기간 대비 증감률.
//   - 가장 많이 이용한 메뉴 TOP 10 (메뉴명, 조회수, 고유사용자, 증감률).
//   - 역할 간 비교 막대 차트(총 조회수).

const BASE = import.meta.env.BASE_URL ?? "/";
const API_BASE = `${BASE}api`;

type RangeKey = "7d" | "30d" | "90d";
const RANGE_OPTIONS: { key: RangeKey; label: string }[] = [
  { key: "7d", label: "최근 7일" },
  { key: "30d", label: "최근 30일" },
  { key: "90d", label: "최근 90일" },
];

const TARGET_ROLES: Role[] = ["manager", "accountant", "facility_staff", "hq_executive", "partner"];

interface RoleStat {
  role: string;
  activeUsers: number;
  activeUsersPrev: number;
  activeUsersChangePct: number | null;
  totalViews: number;
  totalViewsPrev: number;
  totalViewsChangePct: number | null;
}

interface MenuStat {
  path: string;
  menuKey: string | null;
  views: number;
  uniqueUsers: number;
  viewsPrev: number;
  changePct: number | null;
}

interface AnalyticsResponse {
  range: RangeKey;
  role: string | null;
  period: { start: string; end: string };
  previousPeriod: { start: string; end: string };
  summary: {
    activeUsers: number;
    activeUsersChangePct: number | null;
    totalViews: number;
    totalViewsChangePct: number | null;
  };
  byRole: RoleStat[];
  topMenus: MenuStat[];
}

function ChangeBadge({ pct }: { pct: number | null }) {
  if (pct === null) {
    return (
      <Badge variant="outline" className="bg-slate-50 text-slate-500 border-slate-200 text-[11px]">
        신규
      </Badge>
    );
  }
  if (pct > 0) {
    return (
      <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[11px] gap-0.5">
        <ArrowUp className="w-3 h-3" /> {pct}%
      </Badge>
    );
  }
  if (pct < 0) {
    return (
      <Badge variant="outline" className="bg-rose-50 text-rose-700 border-rose-200 text-[11px] gap-0.5">
        <ArrowDown className="w-3 h-3" /> {Math.abs(pct)}%
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="bg-slate-50 text-slate-500 border-slate-200 text-[11px] gap-0.5">
      <ArrowRight className="w-3 h-3" /> 0%
    </Badge>
  );
}

export default function PlatformUsageAnalyticsPage() {
  const { token, user } = useAuth();
  const isPlatformAdmin = user?.role === "platform_admin";
  const [range, setRange] = useState<RangeKey>("30d");
  const [roleFilter, setRoleFilter] = useState<"" | Role>("");
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isPlatformAdmin) return;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    params.set("range", range);
    if (roleFilter) params.set("role", roleFilter);
    fetch(`${API_BASE}/platform/usage-analytics?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        if (!res.ok) throw new Error("이용현황을 불러올 수 없습니다");
        return (await res.json()) as AnalyticsResponse;
      })
      .then((d) => setData(d))
      .catch((e) => setError(e instanceof Error ? e.message : "오류가 발생했습니다"))
      .finally(() => setLoading(false));
  }, [range, roleFilter, token, isPlatformAdmin]);

  const maxRoleViews = useMemo(() => {
    if (!data) return 0;
    return Math.max(1, ...data.byRole.map((r) => r.totalViews));
  }, [data]);

  if (!isPlatformAdmin) {
    return (
      <div className="p-6">
        <div className="text-sm text-slate-600">플랫폼 관리자만 접근할 수 있습니다.</div>
      </div>
    );
  }

  const isEmpty = !loading && data && data.summary.totalViews === 0 && data.byRole.every((r) => r.totalViews === 0);

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-7xl" data-testid="page-usage-analytics">
      <div>
        <div className="flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-slate-700" />
          <h1 className="text-xl font-semibold">유저유형별 이용현황</h1>
        </div>
        <p className="text-xs text-slate-500 mt-1">
          역할별로 어떤 메뉴를 얼마나 사용하는지, 이전 동기간 대비 증감률을 한눈에 확인합니다.
          플랫폼 관리자 본인의 트래픽은 분석에서 제외됩니다.
        </p>
      </div>

      {/* 필터 */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex gap-1 border rounded-lg p-1 bg-white">
          {RANGE_OPTIONS.map((r) => (
            <Button
              key={r.key}
              size="sm"
              variant={range === r.key ? "default" : "ghost"}
              className="h-8 px-3 text-xs"
              onClick={() => setRange(r.key)}
              data-testid={`range-${r.key}`}
            >
              {r.label}
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">유저유형</span>
          <select
            className="h-8 text-xs border rounded-md px-2 bg-white"
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value as "" | Role)}
            data-testid="role-filter"
          >
            <option value="">전체</option>
            {TARGET_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && <div className="text-sm text-red-600">{error}</div>}

      {loading && (
        <div className="flex items-center gap-2 text-sm text-slate-500 py-8">
          <Loader2 className="w-4 h-4 animate-spin" /> 불러오는 중…
        </div>
      )}

      {!loading && data && (
        <>
          {/* 요약 카드 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs text-slate-500">활성 사용자 수</p>
                    <p className="text-3xl font-bold mt-1" data-testid="summary-active-users">
                      {data.summary.activeUsers.toLocaleString()}
                    </p>
                    <div className="mt-2">
                      <ChangeBadge pct={data.summary.activeUsersChangePct} />
                      <span className="text-[11px] text-slate-400 ml-2">직전 동기간 대비</span>
                    </div>
                  </div>
                  <Users className="w-5 h-5 text-blue-500" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs text-slate-500">총 페이지 조회 수</p>
                    <p className="text-3xl font-bold mt-1" data-testid="summary-total-views">
                      {data.summary.totalViews.toLocaleString()}
                    </p>
                    <div className="mt-2">
                      <ChangeBadge pct={data.summary.totalViewsChangePct} />
                      <span className="text-[11px] text-slate-400 ml-2">직전 동기간 대비</span>
                    </div>
                  </div>
                  <MousePointerClick className="w-5 h-5 text-emerald-500" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* 역할 간 비교 막대 차트 */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">역할별 총 이용량 비교</CardTitle>
            </CardHeader>
            <CardContent>
              {isEmpty ? (
                <p className="text-sm text-slate-500 text-center py-6">
                  선택한 조건에 데이터가 없습니다. 사용자가 페이지를 이동하면 자동으로 누적됩니다.
                </p>
              ) : (
                <div className="space-y-3">
                  {data.byRole.map((r) => {
                    const ratio = (r.totalViews / maxRoleViews) * 100;
                    return (
                      <div key={r.role} data-testid={`role-bar-${r.role}`}>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-slate-700 w-20">
                              {ROLE_LABELS[r.role as Role] ?? r.role}
                            </span>
                            <span className="text-slate-500">
                              조회 {r.totalViews.toLocaleString()} · 사용자 {r.activeUsers.toLocaleString()}
                            </span>
                          </div>
                          <ChangeBadge pct={r.totalViewsChangePct} />
                        </div>
                        <div className="h-2 bg-slate-100 rounded">
                          <div
                            className="h-2 bg-blue-500 rounded transition-all"
                            style={{ width: `${Math.max(2, ratio)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* 메뉴 TOP 10 */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">가장 많이 이용한 메뉴 TOP 10</CardTitle>
            </CardHeader>
            <CardContent>
              {data.topMenus.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-6">
                  선택한 조건에 메뉴 사용 데이터가 없습니다.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-xs text-slate-500 border-b">
                      <tr>
                        <th className="text-left p-2 font-medium w-10">#</th>
                        <th className="text-left p-2 font-medium">메뉴</th>
                        <th className="text-right p-2 font-medium">조회 수</th>
                        <th className="text-right p-2 font-medium">고유 사용자</th>
                        <th className="text-right p-2 font-medium">전 기간 대비</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.topMenus.map((m, i) => (
                        <tr key={m.path} className="border-t hover:bg-slate-50" data-testid={`menu-row-${i}`}>
                          <td className="p-2 text-slate-500">{i + 1}</td>
                          <td className="p-2">
                            <div className="font-medium">{m.menuKey ?? getMenuLabel(m.path)}</div>
                            <div className="text-[11px] text-slate-400">{m.path}</div>
                          </td>
                          <td className="p-2 text-right tabular-nums">{m.views.toLocaleString()}</td>
                          <td className="p-2 text-right tabular-nums">{m.uniqueUsers.toLocaleString()}</td>
                          <td className="p-2 text-right">
                            <ChangeBadge pct={m.changePct} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="text-[11px] text-slate-400">
            기준: {new Date(data.period.start).toLocaleString("ko-KR")} ~{" "}
            {new Date(data.period.end).toLocaleString("ko-KR")} · 비교: 직전{" "}
            {RANGE_OPTIONS.find((r) => r.key === range)?.label}
          </div>
        </>
      )}
    </div>
  );
}
