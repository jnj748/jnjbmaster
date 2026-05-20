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
  Activity,
} from "lucide-react";
import { ROLE_LABELS } from "@workspace/shared/role-labels";

// [Task #267] 플랫폼 — 역할별 가입/활동 현황 페이지.
//   5개 라우트(/platform/managers, accountants, facility-staff, hq-executives, partners)가
//   동일 레이아웃을 공유하므로 단일 컴포넌트를 매개변수화하고 얇은 래퍼 5개로 export.
//   기본 가입 현황은 GET /api/users 사용.
//
// [사장님요청] manager / partner 의 경우 GET /api/platform/role-activity?role=...
//   를 추가로 호출해 각 사용자별 최근 5개 액션(일지/주보/월보/견적/공고문사용 또는
//   견적제출)과 30일 이용도(활성화도) 를 함께 노출한다.

interface UserRecord {
  id: number;
  email: string;
  name: string;
  role: string;
  portalType: string;
  createdAt: string;
  buildingId: number | null;
}

type ActionType =
  | "journal"
  | "weekly"
  | "monthly"
  | "rfq"
  | "noticeOutput"
  | "quote";

interface ActionRecord {
  type: ActionType;
  occurredAt: string;
  title: string;
}

interface UserActivityRow {
  userId: number;
  name: string;
  email: string | null;
  username: string | null;
  buildingId: number | null;
  buildingName: string | null;
  vendorId: number | null;
  vendorName: string | null;
  totalCount30d: number;
  lastActionAt: string | null;
  breakdown: Record<string, number>;
  recentActions: ActionRecord[];
}

const ACTION_LABEL: Record<ActionType, string> = {
  journal: "일지",
  weekly: "주보",
  monthly: "월보",
  rfq: "견적",
  noticeOutput: "공고문",
  quote: "견적제출",
};

const ACTION_BADGE: Record<ActionType, string> = {
  journal: "bg-blue-100 text-blue-700",
  weekly: "bg-emerald-100 text-emerald-700",
  monthly: "bg-violet-100 text-violet-700",
  rfq: "bg-amber-100 text-amber-700",
  noticeOutput: "bg-pink-100 text-pink-700",
  quote: "bg-indigo-100 text-indigo-700",
};

const ROLE_META: Record<
  string,
  { label: string; description: string; accent: string }
> = {
  manager: {
    label: ROLE_LABELS.manager,
    description: `현장에서 입주민과 시설을 직접 챙기는 ${ROLE_LABELS.manager} 현황`,
    accent: "bg-blue-100 text-blue-700",
  },
  accountant: {
    label: ROLE_LABELS.accountant,
    description: `관리비 부과·수납·전자결재를 맡는 ${ROLE_LABELS.accountant} 담당자 현황`,
    accent: "bg-amber-100 text-amber-700",
  },
  facility_staff: {
    label: ROLE_LABELS.facility_staff,
    description: `법정 점검·시설 보수·안전교육을 책임지는 ${ROLE_LABELS.facility_staff} 현황`,
    accent: "bg-teal-100 text-teal-700",
  },
  hq_executive: {
    label: ROLE_LABELS.hq_executive,
    description: `여러 건물의 운영 지표를 모니터링하는 ${ROLE_LABELS.hq_executive} 현황`,
    accent: "bg-indigo-100 text-indigo-700",
  },
  partner: {
    label: ROLE_LABELS.partner,
    description: `협력업체로 견적·공사·계약을 담당하는 ${ROLE_LABELS.partner} 현황`,
    accent: "bg-emerald-100 text-emerald-700",
  },
};

const DAY_MS = 24 * 60 * 60 * 1000;

function formatRelative(iso: string | null): string {
  if (!iso) return "—";
  const ts = new Date(iso).getTime();
  const diff = Date.now() - ts;
  if (diff < 60_000) return "방금";
  if (diff < 60 * 60_000) return `${Math.floor(diff / 60_000)}분 전`;
  if (diff < 24 * 60 * 60_000) return `${Math.floor(diff / (60 * 60_000))}시간 전`;
  if (diff < 30 * DAY_MS) return `${Math.floor(diff / DAY_MS)}일 전`;
  return new Date(iso).toLocaleDateString("ko-KR");
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString("ko-KR")} ${d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}`;
}

function activityLevel(count: number): {
  label: string;
  className: string;
} {
  if (count >= 20) return { label: "활성", className: "bg-emerald-100 text-emerald-700" };
  if (count >= 5) return { label: "보통", className: "bg-amber-100 text-amber-700" };
  if (count >= 1) return { label: "저조", className: "bg-orange-100 text-orange-700" };
  return { label: "휴면", className: "bg-slate-100 text-slate-500" };
}

function RoleStatusPage({ role }: { role: string }) {
  const { token } = useAuth();
  const [, navigate] = useLocation();
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // [사장님요청] 활동 집계 — manager / partner 만 호출.
  const supportsActivity = role === "manager" || role === "partner";
  const [activity, setActivity] = useState<UserActivityRow[]>([]);
  const [activityLoading, setActivityLoading] = useState(supportsActivity);
  const [activityError, setActivityError] = useState<string | null>(null);

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

  useEffect(() => {
    if (!supportsActivity) {
      setActivityLoading(false);
      return;
    }
    setActivityLoading(true);
    setActivityError(null);
    (async () => {
      try {
        const res = await fetch(
          `${API_BASE}/platform/role-activity?role=${role}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (!res.ok) throw new Error("활동 집계를 불러올 수 없습니다");
        const data: UserActivityRow[] = await res.json();
        setActivity(data);
      } catch (e) {
        setActivityError(
          e instanceof Error ? e.message : "오류가 발생했습니다",
        );
      } finally {
        setActivityLoading(false);
      }
    })();
  }, [token, API_BASE, role, supportsActivity]);

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

      {/* [사장님요청] manager / partner 만 활동 집계 노출. */}
      {supportsActivity && (
        <Card data-testid={`role-activity-${role}`}>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="w-4 h-4" />
              {role === "manager"
                ? "소장별 최근 활동 (최근 90일, 30일 이용도)"
                : "파트너사별 견적 제출 활동 (최근 90일, 30일 이용도)"}
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              {role === "manager"
                ? "일지 · 주보 · 월보 · 견적 · 공고문사용 5종을 합산한 활동 지표입니다. 견적은 같은 건물의 모든 소장에게 동일하게 카운트됩니다."
                : "vendor 에 연결된 사용자가 제출한 견적(quotes) 을 집계합니다."}
            </p>
          </CardHeader>
          <CardContent>
            {activityError && (
              <div className="p-3 rounded-lg bg-red-50 text-red-600 text-sm mb-3">
                {activityError}
              </div>
            )}
            {activityLoading ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                활동 집계를 불러오는 중...
              </p>
            ) : activity.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                집계할 사용자가 없습니다
              </p>
            ) : (
              <div className="space-y-3">
                {activity.map((row) => {
                  const lvl = activityLevel(row.totalCount30d);
                  return (
                    <div
                      key={row.userId}
                      className="border rounded-lg p-3 space-y-2"
                      data-testid={`activity-row-${row.userId}`}
                    >
                      <div className="flex items-start justify-between flex-wrap gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-semibold">{row.name}</p>
                            <Badge className={`text-[11px] ${lvl.className}`}>
                              {lvl.label} · 30일 {row.totalCount30d}건
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground truncate">
                            {row.email ?? row.username ?? `user#${row.userId}`}
                            {row.buildingName ? ` · 🏢 ${row.buildingName}` : ""}
                            {row.vendorName ? ` · 🛠️ ${row.vendorName}` : ""}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-[11px] text-muted-foreground">
                            마지막 액션
                          </p>
                          <p className="text-xs font-medium">
                            {formatRelative(row.lastActionAt)}
                          </p>
                        </div>
                      </div>

                      {/* 30일 종류별 분포 */}
                      {Object.keys(row.breakdown).length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {(role === "manager"
                            ? ([
                                "journal",
                                "weekly",
                                "monthly",
                                "rfq",
                                "noticeOutput",
                              ] as ActionType[])
                            : (["quote"] as ActionType[])
                          )
                            .filter((t) => (row.breakdown[t] ?? 0) > 0)
                            .map((t) => (
                              <span
                                key={t}
                                className={`text-[11px] px-2 py-0.5 rounded ${ACTION_BADGE[t]}`}
                              >
                                {ACTION_LABEL[t]} {row.breakdown[t]}
                              </span>
                            ))}
                        </div>
                      )}

                      {/* 최근 5개 액션 */}
                      {row.recentActions.length === 0 ? (
                        <p className="text-xs text-muted-foreground italic">
                          최근 90일 내 액션 없음
                        </p>
                      ) : (
                        <div className="space-y-1">
                          {row.recentActions.map((a, idx) => (
                            <div
                              key={`${a.type}-${a.occurredAt}-${idx}`}
                              className="flex items-center justify-between text-xs gap-2"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <span
                                  className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 ${ACTION_BADGE[a.type]}`}
                                >
                                  {ACTION_LABEL[a.type]}
                                </span>
                                <span className="truncate text-slate-700">
                                  {a.title}
                                </span>
                              </div>
                              <span className="text-muted-foreground shrink-0">
                                {formatDateTime(a.occurredAt)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

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
