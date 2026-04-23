import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Users,
  Building2,
  UserPlus,
  ChevronRight,
  CalendarClock,
} from "lucide-react";

// [Task #267] 플랫폼 — 역할별 가입/활동 현황 페이지.
//   5개 라우트(/platform/managers, accountants, facility-staff, hq-executives, partners)가
//   동일 레이아웃을 공유하므로 단일 컴포넌트를 매개변수화하고 얇은 래퍼 5개로 export.
//   백엔드 신규 엔드포인트 없이 기존 GET /api/users 만 사용한다.

interface UserRecord {
  id: number;
  email: string;
  name: string;
  role: string;
  portalType: string;
  createdAt: string;
  buildingId: number | null;
}

const ROLE_META: Record<
  string,
  { label: string; description: string; accent: string }
> = {
  manager: {
    label: "관리소장",
    description: "현장에서 입주민과 시설을 직접 챙기는 관리소장 현황",
    accent: "bg-blue-100 text-blue-700",
  },
  accountant: {
    label: "경리·회계",
    description: "관리비 부과·수납·전자결재를 맡는 경리·회계 담당자 현황",
    accent: "bg-amber-100 text-amber-700",
  },
  facility_staff: {
    label: "시설기사",
    description: "법정 점검·시설 보수·안전교육을 책임지는 시설기사 현황",
    accent: "bg-teal-100 text-teal-700",
  },
  hq_executive: {
    label: "본사총괄",
    description: "여러 건물의 운영 지표를 모니터링하는 본사 총괄 현황",
    accent: "bg-indigo-100 text-indigo-700",
  },
  partner: {
    label: "파트너사",
    description: "협력업체로 견적·공사·계약을 담당하는 파트너사 현황",
    accent: "bg-emerald-100 text-emerald-700",
  },
};

const DAY_MS = 24 * 60 * 60 * 1000;

function RoleStatusPage({ role }: { role: string }) {
  const { token } = useAuth();
  const [, navigate] = useLocation();
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const BASE = import.meta.env.BASE_URL ?? "/";
  const API_BASE = `${BASE}api`;

  useEffect(() => {
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/users`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error("사용자 목록을 불러올 수 없습니다");
        const data: UserRecord[] = await res.json();
        setUsers(data);
      } catch (e) {
        setError(e instanceof Error ? e.message : "오류가 발생했습니다");
      } finally {
        setLoading(false);
      }
    })();
  }, [token, API_BASE]);

  const meta = ROLE_META[role] ?? {
    label: role,
    description: "",
    accent: "bg-slate-100 text-slate-700",
  };

  const stats = useMemo(() => {
    const filtered = users.filter((u) => u.role === role);
    const now = Date.now();
    const recent30 = filtered.filter(
      (u) => now - new Date(u.createdAt).getTime() <= 30 * DAY_MS,
    ).length;
    const buildingIds = new Set<number>();
    for (const u of filtered) {
      if (u.buildingId !== null && u.buildingId !== undefined) {
        buildingIds.add(u.buildingId);
      }
    }
    const recent7 = filtered
      .filter((u) => now - new Date(u.createdAt).getTime() <= 7 * DAY_MS)
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )
      .slice(0, 5);
    return {
      total: filtered.length,
      recent30,
      activeBuildings: buildingIds.size,
      recent: recent7,
    };
  }, [users, role]);

  return (
    <div className="space-y-6" data-testid={`role-status-${role}`}>
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Badge className={`text-xs ${meta.accent}`}>{meta.label}</Badge>
            <h1 className="text-xl font-bold text-slate-900">현황</h1>
          </div>
          <p className="text-sm text-slate-500 mt-1">{meta.description}</p>
        </div>
        <Button
          onClick={() => navigate(`/users?role=${role}`)}
          className="gap-2"
          data-testid={`button-view-users-${role}`}
        >
          <Users className="w-4 h-4" />
          사용자 목록 보기
        </Button>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-50 text-red-600 text-sm">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-muted-foreground">전체 가입자</p>
                <p
                  className="text-3xl font-bold mt-1"
                  data-testid={`stat-total-${role}`}
                >
                  {loading ? "—" : stats.total}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  최근 30일 신규{" "}
                  <span className="font-semibold text-foreground">
                    {loading ? "—" : stats.recent30}
                  </span>
                  명
                </p>
              </div>
              <div className="p-2 rounded-lg bg-accent/10">
                <UserPlus className="w-5 h-5 text-accent" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-muted-foreground">활성 건물</p>
                <p
                  className="text-3xl font-bold mt-1"
                  data-testid={`stat-buildings-${role}`}
                >
                  {loading ? "—" : stats.activeBuildings}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  해당 역할이 1명 이상 배정된 건물
                </p>
              </div>
              <div className="p-2 rounded-lg bg-blue-500/10">
                <Building2 className="w-5 h-5 text-blue-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-muted-foreground">최근 7일 신규</p>
                <p className="text-3xl font-bold mt-1">
                  {loading ? "—" : stats.recent.length}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  아래 목록 참고
                </p>
              </div>
              <div className="p-2 rounded-lg bg-emerald-500/10">
                <CalendarClock className="w-5 h-5 text-emerald-500" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarClock className="w-4 h-4" />
            최근 7일 내 가입한 {meta.label}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              불러오는 중...
            </p>
          ) : stats.recent.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              최근 7일 내 신규 가입자가 없습니다
            </p>
          ) : (
            <div className="space-y-2">
              {stats.recent.map((u) => (
                <div
                  key={u.id}
                  className="flex items-center justify-between p-3 rounded-lg border hover:bg-slate-50 cursor-pointer"
                  onClick={() => navigate(`/users?role=${role}`)}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{u.name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {u.email}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-muted-foreground">
                      {new Date(u.createdAt).toLocaleDateString("ko-KR")}
                    </span>
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default RoleStatusPage;
export const ManagersStatus = () => <RoleStatusPage role="manager" />;
export const AccountantsStatus = () => <RoleStatusPage role="accountant" />;
export const FacilityStaffStatus = () => (
  <RoleStatusPage role="facility_staff" />
);
export const HqExecutivesStatus = () => <RoleStatusPage role="hq_executive" />;
export const PartnersStatus = () => <RoleStatusPage role="partner" />;
