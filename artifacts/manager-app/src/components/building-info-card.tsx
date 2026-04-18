import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Building, MapPin, Layers, Maximize2, ArrowRight } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { useBuilding } from "@/contexts/building-context";

const BASE = import.meta.env.BASE_URL ?? "/";
const apiBase = `${BASE}api`.replace(/\/+/g, "/");

export interface BuildingInfoCardData {
  name?: string | null;
  addressFull?: string | null;
  addressJibun?: string | null;
  buildingUsage?: string | null;
  totalUnits?: number | null;
  totalFloors?: number | null;
  basementFloors?: number | null;
  totalArea?: number | string | null;
  elevatorCount?: number | null;
  parkingSpaces?: number | null;
  completionDate?: string | null;
}

interface PresentationProps {
  data: BuildingInfoCardData;
  detailHref?: string;
  className?: string;
}

/**
 * 건물 정보 요약 카드 — 순수 표현 컴포넌트.
 * 데이터 페칭 없이 props 만으로 렌더되어, 대시보드/온보딩 결과 화면 등에서
 * 동일하게 재사용 가능합니다.
 */
export function BuildingInfoCardView({
  data,
  detailHref = "/building-info",
  className,
}: PresentationProps) {
  const address = data.addressFull || data.addressJibun || null;
  const floors =
    data.totalFloors != null
      ? `지상 ${data.totalFloors}층${
          data.basementFloors ? ` / 지하 ${data.basementFloors}층` : ""
        }`
      : null;
  const area =
    data.totalArea != null && Number(data.totalArea) > 0
      ? `${Number(data.totalArea).toLocaleString()}㎡`
      : null;

  return (
    <Card className={className}>
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            <h2 className="text-base font-bold flex items-center gap-2">
              <Building className="w-4 h-4 text-primary shrink-0" />
              <span className="truncate">건물 정보</span>
            </h2>
            {data.name && (
              <p className="text-sm font-semibold mt-1 truncate">
                {data.name}
              </p>
            )}
          </div>
          <Link href={detailHref}>
            <button className="text-xs text-primary hover:underline font-medium flex items-center gap-0.5 shrink-0 min-h-[32px]">
              자세히 <ArrowRight className="w-3 h-3" />
            </button>
          </Link>
        </div>

        {address && (
          <div className="flex items-start gap-2 text-sm mb-3">
            <MapPin className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
            <span className="text-muted-foreground break-keep">{address}</span>
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat
            icon={Layers}
            label="세대수"
            value={
              data.totalUnits != null && data.totalUnits > 0
                ? `${data.totalUnits}세대`
                : "-"
            }
            sub={floors ?? undefined}
          />
          <Stat
            icon={Maximize2}
            label="연면적"
            value={area ?? "-"}
            sub={data.buildingUsage ?? undefined}
          />
          <Stat
            icon={Building}
            label="승강기"
            value={
              data.elevatorCount && data.elevatorCount > 0
                ? `${data.elevatorCount}대`
                : "없음"
            }
          />
          <Stat
            icon={Building}
            label="주차"
            value={
              data.parkingSpaces && data.parkingSpaces > 0
                ? `${data.parkingSpaces}대`
                : "-"
            }
          />
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
        <Icon className="w-3 h-3 shrink-0" />
        <span className="truncate">{label}</span>
      </div>
      <p className="text-sm font-bold mt-0.5 truncate">{value}</p>
      {sub && (
        <p className="text-[10px] text-muted-foreground truncate">{sub}</p>
      )}
    </div>
  );
}

/**
 * 데이터 페칭을 포함한 컨테이너. 대시보드에서 한 줄로 사용하기 위한 편의 컴포넌트.
 * 건물이 없으면 등록 안내 카드를 표시합니다.
 */
export function BuildingInfoCard({ className }: { className?: string }) {
  const { token } = useAuth();
  const { building } = useBuilding();
  const [loading, setLoading] = useState(true);
  const [extra, setExtra] = useState<BuildingInfoCardData | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Reset extra immediately when building switches or context clears,
    // so stale fields from a previous building don't leak into the merged view.
    setExtra(null);
    async function load() {
      if (!building) {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const res = await fetch(`${apiBase}/buildings/overview`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          return;
        }
        const result = await res.json();
        if (!cancelled && result?.building) {
          setExtra(result.building as BuildingInfoCardData);
        }
      } catch {
        // silent — fall back to building context data
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [token, building?.id]);

  if (loading && !building) {
    return <Skeleton className={`h-32 ${className ?? ""}`} />;
  }

  if (!building) {
    return (
      <Card className={className}>
        <CardContent className="p-4 sm:p-5">
          <div className="flex items-center gap-3">
            <Building className="w-5 h-5 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">건물 정보 미등록</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                <Link href="/building-setup">
                  <span className="text-primary hover:underline cursor-pointer">
                    건물 정보를 등록
                  </span>
                </Link>
                하면 더 정확한 관리 현황을 확인할 수 있습니다.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const merged: BuildingInfoCardData = {
    name: building.name,
    addressFull: (extra?.addressFull as string) ?? building.addressFull ?? null,
    addressJibun:
      (extra?.addressJibun as string) ?? (building as any).addressJibun ?? null,
    buildingUsage:
      (extra?.buildingUsage as string) ??
      (building as any).buildingUsage ??
      null,
    totalUnits: extra?.totalUnits ?? building.totalUnits ?? null,
    totalFloors:
      (extra?.totalFloors as number) ?? (building as any).totalFloors ?? null,
    basementFloors:
      (extra?.basementFloors as number) ??
      (building as any).basementFloors ??
      null,
    totalArea: extra?.totalArea ?? (building as any).totalArea ?? null,
    elevatorCount:
      (extra?.elevatorCount as number) ??
      (building as any).elevatorCount ??
      null,
    parkingSpaces:
      (extra?.parkingSpaces as number) ??
      (building as any).parkingSpaces ??
      null,
    completionDate:
      (extra?.completionDate as string) ??
      (building as any).completionDate ??
      null,
  };

  return <BuildingInfoCardView data={merged} className={className} />;
}
