import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/auth-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Building,
  MapPin,
  Layers,
  Shield,
  AlertTriangle,
  CheckCircle2,
  Wrench,
  Car,
  Users,
  Calendar,
  Info,
  Clock,
  Scale,
} from "lucide-react";
import { classifyLegalStaffing, daysUntil, type LegalAppointment } from "@/lib/legal-staffing";

const BASE = import.meta.env.BASE_URL ?? "/";
const apiBase = `${BASE}api`.replace(/\/+/g, "/");

const CATEGORY_LABELS: Record<string, string> = {
  fire_safety: "소방",
  electrical: "전기",
  elevator: "승강기",
  water_tank: "저수조",
  septic: "정화조",
  hygiene: "위생/환경",
  building_safety: "건축물 안전",
  safety_check: "안전점검",
  gas: "가스",
  playground: "놀이터",
};

interface OverviewData {
  building: Record<string, unknown>;
  inspections: {
    total: number;
    upcoming: number;
    overdue: number;
    upcomingList: Array<{ id: number; name: string; category: string; nextDueDate: string; status: string }>;
  };
  safetyChecklists: {
    total: number;
    recent: Array<{ id: number; title: string; category: string; inspectionDate: string; status: string }>;
  };
  maintenance: {
    pending: number;
    completed: number;
  };
  occupancy: {
    totalUnits: number;
    occupied: number;
    vacant: number;
    rate: number;
  };
  vehicles: {
    total: number;
  };
}

export default function BuildingInfo() {
  const { token } = useAuth();
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchOverview() {
      try {
        const res = await fetch(`${apiBase}/buildings/overview`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          setError("건물 현황을 불러올 수 없습니다");
          return;
        }
        const result = await res.json();
        if (result.building) {
          setData(result);
        }
      } catch {
        setError("서버 연결에 실패했습니다");
      } finally {
        setLoading(false);
      }
    }
    fetchOverview();
  }, [token]);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 desktop:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-40" />)}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <AlertTriangle className="w-16 h-16 text-red-300 mb-4" />
        <h2 className="text-xl font-semibold text-muted-foreground mb-2">{error}</h2>
        <p className="text-sm text-muted-foreground">잠시 후 다시 시도해주세요.</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Building className="w-16 h-16 text-muted-foreground/30 mb-4" />
        <h2 className="text-xl font-semibold text-muted-foreground mb-2">등록된 건물이 없습니다</h2>
        <p className="text-sm text-muted-foreground">설정에서 건물 정보를 먼저 등록해주세요.</p>
      </div>
    );
  }

  const b = data.building;

  return (
    <div className="space-y-6 pb-24">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Building className="w-6 h-6" />
          {String(b.name || "건물 정보")}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">건물 현황 및 운영 지표</p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <MapPin className="w-4 h-4 text-blue-600" />
            기본 정보
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 desktop:grid-cols-2 gap-x-8 gap-y-3">
            {b.addressFull && (
              <InfoRow label="도로명 주소" value={String(b.addressFull)} />
            )}
            {b.addressJibun && (
              <InfoRow label="지번 주소" value={String(b.addressJibun)} />
            )}
            {b.zipCode && (
              <InfoRow label="우편번호" value={String(b.zipCode)} />
            )}
            {b.buildingUsage && (
              <InfoRow label="용도" value={String(b.buildingUsage)} />
            )}
            {b.structureType && (
              <InfoRow label="구조" value={String(b.structureType)} />
            )}
            {b.completionDate && (
              <InfoRow label="준공일" value={String(b.completionDate)} />
            )}
            {b.managementOfficePhone && (
              <InfoRow label="관리사무소 전화" value={String(b.managementOfficePhone)} />
            )}
            {b.managementOfficeFax && (
              <InfoRow label="관리사무소 팩스" value={String(b.managementOfficeFax)} />
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 desktop:grid-cols-4 gap-3">
        <StatCard
          icon={Layers}
          label="세대수"
          value={b.totalUnits ? `${b.totalUnits}세대` : "-"}
          sub={b.totalFloors ? `지상 ${b.totalFloors}층 / 지하 ${b.basementFloors || 0}층` : undefined}
          color="blue"
        />
        <StatCard
          icon={Building}
          label="연면적"
          value={b.totalArea ? `${Number(b.totalArea).toLocaleString()}㎡` : "-"}
          sub={b.landArea ? `대지 ${Number(b.landArea).toLocaleString()}㎡` : undefined}
          color="teal"
        />
        <StatCard
          icon={Users}
          label="입주율"
          value={`${data.occupancy.rate}%`}
          sub={`${data.occupancy.occupied}/${data.occupancy.totalUnits} 호실`}
          color="green"
        />
        <StatCard
          icon={Car}
          label="차량 등록"
          value={`${data.vehicles.total}대`}
          color="purple"
        />
      </div>

      <LegalStaffingCard
        totalArea={b.totalArea as number | string | null | undefined}
        electricCapacityKw={b.electricCapacityKw as number | string | null | undefined}
        token={token}
      />

      {(b.buildingArea || b.buildingCoverageRatio || b.floorAreaRatio) && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Info className="w-4 h-4 text-teal-600" />
              총괄표제부 정보
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 desktop:grid-cols-4 gap-4 text-sm">
              {b.buildingArea && (
                <div>
                  <span className="text-muted-foreground">건축면적</span>
                  <p className="font-medium">{Number(b.buildingArea).toLocaleString()}㎡</p>
                </div>
              )}
              {b.landArea && (
                <div>
                  <span className="text-muted-foreground">대지면적</span>
                  <p className="font-medium">{Number(b.landArea).toLocaleString()}㎡</p>
                </div>
              )}
              {b.buildingCoverageRatio && (
                <div>
                  <span className="text-muted-foreground">건폐율</span>
                  <p className="font-medium">{Number(b.buildingCoverageRatio).toFixed(2)}%</p>
                </div>
              )}
              {b.floorAreaRatio && (
                <div>
                  <span className="text-muted-foreground">용적률</span>
                  <p className="font-medium">{Number(b.floorAreaRatio).toFixed(2)}%</p>
                </div>
              )}
              {Number(b.elevatorCount) > 0 && (
                <div>
                  <span className="text-muted-foreground">승강기</span>
                  <p className="font-medium">{String(b.elevatorCount)}대</p>
                </div>
              )}
              {Number(b.parkingSpaces) > 0 && (
                <div>
                  <span className="text-muted-foreground">주차대수</span>
                  <p className="font-medium">{String(b.parkingSpaces)}대</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 desktop:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Shield className="w-4 h-4 text-orange-600" />
              법정점검 현황
            </CardTitle>
            <CardDescription>등록된 법정점검 {data.inspections.total}건</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-4">
              <div className="flex items-center gap-2 text-sm">
                <Clock className="w-4 h-4 text-yellow-600" />
                <span>예정 <strong className="text-yellow-700">{data.inspections.upcoming}건</strong></span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <AlertTriangle className="w-4 h-4 text-red-600" />
                <span>지연 <strong className="text-red-700">{data.inspections.overdue}건</strong></span>
              </div>
            </div>
            {data.inspections.upcomingList.length > 0 ? (
              <div className="space-y-2">
                {data.inspections.upcomingList.map(ins => (
                  <div key={ins.id} className="flex items-center justify-between text-sm border rounded-lg p-2.5">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center rounded-md bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-800">
                        {CATEGORY_LABELS[ins.category] || ins.category}
                      </span>
                      <span className="font-medium">{ins.name}</span>
                    </div>
                    <span className="text-muted-foreground text-xs">{ins.nextDueDate}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground py-2">30일 이내 예정된 점검이 없습니다</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Wrench className="w-4 h-4 text-blue-600" />
              유지보수 현황
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-4">
              <div className="flex items-center gap-2 text-sm">
                <Clock className="w-4 h-4 text-yellow-600" />
                <span>진행중 <strong className="text-yellow-700">{data.maintenance.pending}건</strong></span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="w-4 h-4 text-green-600" />
                <span>완료 <strong className="text-green-700">{data.maintenance.completed}건</strong></span>
              </div>
            </div>

            <div>
              <h4 className="text-sm font-medium mb-2 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5" />
                최근 안전점검
              </h4>
              {data.safetyChecklists.recent.length > 0 ? (
                <div className="space-y-1.5">
                  {data.safetyChecklists.recent.map(sc => (
                    <div key={sc.id} className="flex items-center justify-between text-sm border rounded-lg p-2.5">
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center rounded-full w-2 h-2 ${sc.status === "completed" ? "bg-green-500" : "bg-yellow-500"}`} />
                        <span>{sc.title}</span>
                      </div>
                      <span className="text-muted-foreground text-xs">{sc.inspectionDate}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground py-2">안전점검 기록이 없습니다</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function LegalStaffingCard({
  totalArea,
  electricCapacityKw,
  token,
}: {
  totalArea?: number | string | null;
  electricCapacityKw?: number | string | null;
  token?: string | null;
}) {
  const [appointees, setAppointees] = useState<
    Partial<Record<"electrical" | "fire_safety" | "mechanical" | "telecom", { name: string; certificateExpiry?: string | null } | null>>
  >({});

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    fetch(`${apiBase}/buildings/legal-appointees`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data?.appointees) return;
        setAppointees(data.appointees);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [token]);

  const cleanAppointees = Object.fromEntries(
    Object.entries(appointees).filter(([, v]) => v != null),
  ) as Partial<Record<"electrical" | "fire_safety" | "mechanical" | "telecom", { name: string; certificateExpiry?: string | null }>>;
  const items = classifyLegalStaffing({ totalArea, electricCapacityKw }, cleanAppointees);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Scale className="w-4 h-4 text-purple-600" />
          법적 선임 현황
        </CardTitle>
        <CardDescription>건물 제원 기반 자동 산정 (4대 법정선임)</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 desktop:grid-cols-2 gap-3">
          {items.map((it) => (
            <LegalStaffingRow key={it.field} item={it} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function LegalStaffingRow({ item }: { item: LegalAppointment }) {
  // 신호등 색상: 미등록(빨강) > 만료임박(노랑) > 정상(초록) > 선임 불요(회색).
  const expiryDays = daysUntil(item.appointee?.certificateExpiry);
  let dotClass = "bg-slate-300";
  let statusBadge: { text: string; className: string } | null = null;
  let appointeeText: string | null = null;

  if (!item.required) {
    dotClass = "bg-slate-300";
    statusBadge = { text: "선임 불요", className: "bg-slate-100 text-slate-600 border-slate-200" };
  } else if (!item.appointee) {
    dotClass = "bg-red-500";
    statusBadge = { text: "미등록", className: "bg-red-100 text-red-700 border-red-200" };
  } else if (expiryDays !== null && expiryDays < 0) {
    dotClass = "bg-red-500";
    statusBadge = { text: "자격증 만료", className: "bg-red-100 text-red-700 border-red-200" };
    appointeeText = `${item.appointee.name} (만료 D${expiryDays})`;
  } else if (expiryDays !== null && expiryDays <= 30) {
    dotClass = "bg-yellow-400";
    statusBadge = { text: `D-${expiryDays}`, className: "bg-yellow-100 text-yellow-800 border-yellow-200" };
    appointeeText = `${item.appointee.name} (자격증 만료 D-${expiryDays})`;
  } else {
    dotClass = "bg-green-500";
    statusBadge = { text: "정상", className: "bg-green-100 text-green-700 border-green-200" };
    appointeeText = expiryDays !== null
      ? `${item.appointee.name} (만료 D-${expiryDays})`
      : item.appointee.name;
  }

  return (
    <div className="border rounded-lg p-3 flex items-start gap-3">
      <span
        className={`mt-1.5 inline-block w-2.5 h-2.5 rounded-full shrink-0 ${dotClass}`}
        aria-hidden="true"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="font-medium text-sm">{item.label}</span>
            {item.grade && (
              <span className="text-xs text-muted-foreground">{item.grade}</span>
            )}
          </div>
          {statusBadge && (
            <span
              className={`inline-flex items-center text-[11px] font-medium px-1.5 py-0.5 rounded border ${statusBadge.className}`}
            >
              {statusBadge.text}
            </span>
          )}
        </div>
        <div className="text-[11px] text-muted-foreground mt-0.5">
          {item.threshold} · {item.legalBasis}
        </div>
        {appointeeText && (
          <div className="text-xs mt-1">현재 선임자: <span className="font-medium">{appointeeText}</span></div>
        )}
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-3">
      <span className="text-sm text-muted-foreground whitespace-nowrap min-w-[100px]">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, sub, color }: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
  color: string;
}) {
  const colorMap: Record<string, string> = {
    blue: "bg-blue-50 text-blue-700",
    teal: "bg-teal-50 text-teal-700",
    green: "bg-green-50 text-green-700",
    purple: "bg-purple-50 text-purple-700",
    orange: "bg-orange-50 text-orange-700",
    red: "bg-red-50 text-red-700",
  };
  const iconColor = colorMap[color] || colorMap.blue;

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${iconColor}`}>
            <Icon className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-lg font-bold">{value}</p>
            {sub && <p className="text-xs text-muted-foreground truncate">{sub}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
