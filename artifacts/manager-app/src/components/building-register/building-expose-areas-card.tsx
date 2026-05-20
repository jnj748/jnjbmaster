// [Task #568] 건축물대장 전유부(동·층·호실별 전용/공용 면적) 카드.
//
// 두 가지 모드를 지원한다:
//
//  1) Uncontrolled (/building-info) — `seedAreas` 가 undefined.
//     · 마운트 시 /buildings/lookup-area-info?buildingId=X 를 호출해 자체 보관·표시.
//     · "다시 조회" 버튼으로 사용자가 직접 재조회.
//
//  2) Controlled (/settings/building) — 부모(useBuildingSetup)가 `seedAreas` 를 전달.
//     · "건축물대장 다시 조회" → useBuildingSetup.lookupAreaInfo 가 areaInfo 를 갱신하면
//       이 카드도 즉시 새 데이터를 그린다(저장/네비게이션 없이).
//     · 빈 배열일 때만 fallback 으로 한 번 자체 페치. 자체 "다시 조회" 버튼은 노출하지
//       않고, 빈 상태 안내문에서 위쪽 부모 버튼 사용을 유도한다.
import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Layers, RefreshCw, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";

interface AreaRow {
  dong: string;
  floorNo: string;
  purposeName: string;
  hoNm: string;
  exposArea: number;
  pubUseArea: number;
}

const BASE = import.meta.env.BASE_URL ?? "/";
const apiBase = `${BASE}api`.replace(/\/+/g, "/");

interface Props {
  buildingId: number | null;
  // [Task #568] controlled 모드용. undefined 면 uncontrolled, 배열(빈 배열 포함)이면
  //   controlled 로 동작해 부모 in-memory 상태를 진실의 원천으로 쓴다.
  seedAreas?: AreaRow[];
  // [Task #873] /building-info 에서 호실 리스트가 너무 길어 기본 접어두기 옵션.
  //   true 면 마운트 시 접힌 상태로 렌더, 카드 헤더 클릭/버튼으로 펼침.
  defaultCollapsed?: boolean;
}

export function BuildingExposeAreasCard({ buildingId, seedAreas, defaultCollapsed = false }: Props) {
  const { token } = useAuth();
  const isControlled = seedAreas !== undefined;
  const [fetched, setFetched] = useState<AreaRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [refetching, setRefetching] = useState(false);
  // [Task #873] 접힘/펼침 토글 상태. 기본값은 prop 으로 결정.
  const [collapsed, setCollapsed] = useState<boolean>(defaultCollapsed);

  const fetchAreas = useCallback(
    async (showRefetchSpinner: boolean) => {
      if (!buildingId || !token) return;
      if (showRefetchSpinner) setRefetching(true);
      else setLoading(true);
      try {
        const params = new URLSearchParams({ buildingId: String(buildingId) });
        const res = await fetch(`${apiBase}/buildings/lookup-area-info?${params}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          setFetched([]);
          return;
        }
        const result = await res.json();
        setFetched(Array.isArray(result.areas) ? result.areas : []);
      } catch {
        setFetched([]);
      } finally {
        setLoading(false);
        setRefetching(false);
      }
    },
    [buildingId, token],
  );

  // 자동 페치 정책:
  //   · uncontrolled  → 마운트 1회 페치.
  //   · controlled    → seedAreas 가 비어 있을 때만 1회 fallback 페치(추후 부모가
  //                     채워주면 자연스레 그쪽으로 표시 우선순위가 넘어간다).
  useEffect(() => {
    if (!buildingId || !token) return;
    if (fetched !== null) return;
    if (isControlled && seedAreas && seedAreas.length > 0) return;
    fetchAreas(false);
  }, [buildingId, token, fetched, isControlled, seedAreas, fetchAreas]);

  if (!buildingId && !isControlled) return null;

  // 표시 우선순위: controlled 모드는 항상 seedAreas. 단, seedAreas 가 비어 있고
  //   fallback 페치가 데이터를 가져왔다면 그 결과를 그대로 보여 준다.
  const areas: AreaRow[] = isControlled
    ? (seedAreas && seedAreas.length > 0 ? seedAreas : (fetched ?? []))
    : (fetched ?? []);
  const grouped = groupAreas(areas);

  return (
    <Card>
      {/* [Task #873] 헤더 전체 클릭으로 접힘/펼침 토글. 우측 chevron 으로 시각 힌트. */}
      <CardHeader
        className="pb-3 cursor-pointer select-none"
        onClick={() => setCollapsed((c) => !c)}
        data-testid="button-toggle-expose-areas"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="text-base flex items-center gap-2">
              <Layers className="w-4 h-4 text-emerald-600" />
              전유부 (호실별 면적)
              {grouped.length > 0 && (
                <span className="text-xs font-normal text-muted-foreground">
                  총 {grouped.reduce((sum, g) => sum + g.rows.length, 0)}호
                </span>
              )}
            </CardTitle>
            <CardDescription>
              국토교통부 건축물대장 전유부에서 자동으로 가져온 동·층·호실별 전용/공용면적
            </CardDescription>
          </div>
          {collapsed ? (
            <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
          ) : (
            <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" />
          )}
        </div>
      </CardHeader>
      {!collapsed && (
      <CardContent>
        {/* [Task #568] controlled 모드에서도 fallback 페치 중일 때 스켈레톤을 보여
            줘 빈 상태 텍스트가 잠깐 깜빡이는 회귀를 막는다. */}
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-32" />
          </div>
        ) : grouped.length === 0 ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              전유부 정보가 비어 있습니다.{" "}
              {isControlled
                ? "위쪽 ‘건축물대장 다시 조회’ 버튼으로 갱신해 주세요."
                : "건축물대장에서 다시 조회해 주세요."}
            </p>
            {/* controlled 모드에서는 부모의 ‘건축물대장 다시 조회’ 가 진실 원천이므로
                자체 버튼을 노출하지 않는다. 빈 응답 + uncontrolled 인 경우에만 노출. */}
            {!isControlled && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => fetchAreas(true)}
                disabled={refetching}
                data-testid="button-refetch-expose-areas"
              >
                {refetching ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4 mr-2" />
                )}
                전유부 정보를 다시 조회
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-5">
            {!isControlled && (
              <div className="flex items-center justify-end">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => fetchAreas(true)}
                  disabled={refetching}
                  data-testid="button-refetch-expose-areas"
                >
                  {refetching ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <RefreshCw className="w-4 h-4 mr-2" />
                  )}
                  다시 조회
                </Button>
              </div>
            )}
            {grouped.map((g) => (
              <section key={g.dong || "_"} data-testid={`expose-dong-${g.dong || "default"}`}>
                <h4 className="text-sm font-semibold mb-2">
                  {g.dong || "동 정보 없음"}{" "}
                  <span className="text-muted-foreground text-xs font-normal">
                    총 {g.rows.length}건
                  </span>
                </h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-muted-foreground text-xs">
                        <th className="text-left py-1 pr-2 font-normal">층</th>
                        <th className="text-left py-1 pr-2 font-normal">호실</th>
                        <th className="text-left py-1 pr-2 font-normal">용도</th>
                        <th className="text-right py-1 pr-2 font-normal">전유면적(㎡)</th>
                        <th className="text-right py-1 font-normal">공용면적(㎡)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.rows.map((r, i) => (
                        <tr key={`${r.dong}-${r.floorNo}-${r.hoNm}-${i}`} className="border-b border-muted/30">
                          <td className="py-1 pr-2 whitespace-nowrap">{r.floorNo || "-"}</td>
                          <td className="py-1 pr-2 whitespace-nowrap">{r.hoNm || "-"}</td>
                          <td className="py-1 pr-2">{r.purposeName || "-"}</td>
                          <td className="text-right py-1 pr-2 tabular-nums">
                            {r.exposArea ? r.exposArea.toFixed(2) : "-"}
                          </td>
                          <td className="text-right py-1 tabular-nums">
                            {r.pubUseArea ? r.pubUseArea.toFixed(2) : "-"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ))}
          </div>
        )}
      </CardContent>
      )}
    </Card>
  );
}

export function groupAreasForTest(rows: AreaRow[]) {
  return groupAreas(rows);
}

function groupAreas(rows: AreaRow[]): { dong: string; rows: AreaRow[] }[] {
  const map = new Map<string, AreaRow[]>();
  for (const row of rows) {
    const key = row.dong || "";
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(row);
  }
  const naturalCmp = (a: string, b: string) => {
    const an = parseFloat(a);
    const bn = parseFloat(b);
    if (!Number.isNaN(an) && !Number.isNaN(bn) && an !== bn) return an - bn;
    return a.localeCompare(b, "ko");
  };
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b, "ko"))
    .map(([dong, rs]) => {
      rs.sort((a, b) => naturalCmp(a.floorNo, b.floorNo) || naturalCmp(a.hoNm, b.hoNm));
      return { dong, rows: rs };
    });
}
