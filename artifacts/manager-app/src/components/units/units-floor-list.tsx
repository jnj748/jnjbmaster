import { Fragment } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Building2, ChevronDown, ChevronRight, Layers, Sparkles } from "lucide-react";
import type { Unit } from "@workspace/api-client-react";
import { UnitDetailInline } from "./unit-detail-inline";

interface Props {
  isLoading: boolean;
  units?: Unit[];
  floorGroups: [string, Unit[]][];
  statusMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" }>;
  // [Task #675] 행 클릭 = 인라인 펼침/접힘 토글. 동시에 한 행만 펼친다.
  expandedUnitId: number | null;
  onToggleExpand: (id: number) => void;
  // [Task #437] 호실이 한 번도 등록된 적 없는 경우에만 "대장 동기화" 진입점을
  //   빈 상태 안에 노출한다. totalUnits 는 필터와 무관한 전체 등록 호실 수
  //   (useGetUnitsSummary().total) 이며, 정확히 0 일 때만 버튼을 보여 준다.
  //   summary 가 아직 로드되지 않아 undefined 인 경우엔 노출하지 않아 깜빡임을
  //   방지한다(필터 결과가 0이지만 호실은 존재하는 케이스 오노출 방지).
  totalUnits?: number;
  onSyncFromRegister?: () => void;
}

export function UnitsFloorList({
  isLoading,
  units,
  floorGroups,
  statusMap,
  expandedUnitId,
  onToggleExpand,
  totalUnits,
  onSyncFromRegister,
}: Props) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}
      </div>
    );
  }

  if (!units || units.length === 0) {
    // [Task #437] 한 번도 호실이 등록된 적 없는 첫 진입 상태에서는 안내 문구
    //   영역 안에 "대장 동기화" 버튼을 함께 노출해, 시니어 사용자가 곧바로
    //   가져오기 흐름으로 진입할 수 있도록 한다. 필터 결과가 0건인 경우(이미
    //   호실이 등록되어 있음)에는 버튼을 숨겨 혼란을 방지한다.
    const showSyncCta = totalUnits === 0 && !!onSyncFromRegister;
    return (
      <Card>
        <CardContent className="py-12 text-center">
          {/* [Task #469] 시니어 사용자가 첫 화면에서 곧바로 인지할 수 있도록
              "AI 호실데이터 로딩하기" 버튼을 빈 상태 아이콘과 안내 문구 위쪽에
              먼저 노출한다. testid 는 기존 동작(자동화/검증)과의 호환을 위해
              그대로 유지한다. */}
          {showSyncCta && (
            <Button
              size="lg"
              className="mb-6"
              onClick={onSyncFromRegister}
              data-testid="btn-empty-units-sync-from-register"
            >
              <Sparkles className="w-5 h-5 mr-2" />
              AI 호실데이터 로딩하기
            </Button>
          )}
          <Building2 className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
          <p className="text-muted-foreground mb-4">등록된 호실이 없습니다</p>
          {/* [Task #675] 호실 추가/CSV/자동 생성은 설정 메뉴로 이관됨. */}
          <p className="text-sm text-muted-foreground">
            호실 등록은 [설정 → 건물정보 수정] 화면에서 진행해 주세요.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {floorGroups.map(([floor, floorUnits]) => (
        <div key={floor}>
          <div className="flex items-center gap-2 mb-2">
            <Layers className="w-4 h-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">{floor}층</h3>
            <Badge variant="outline" className="text-xs">{floorUnits.length}개</Badge>
          </div>

          <div className="hidden desktop:block">
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[40px]"></TableHead>
                      <TableHead>호실</TableHead>
                      <TableHead>상태</TableHead>
                      <TableHead>용도</TableHead>
                      <TableHead>면적</TableHead>
                      <TableHead>입주자</TableHead>
                      <TableHead>소유자</TableHead>
                      <TableHead>차량</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {floorUnits.map((unit) => {
                      const st = statusMap[unit.status] || statusMap.vacant;
                      const expanded = expandedUnitId === unit.id;
                      return (
                        <Fragment key={unit.id}>
                          {/* [Task #675] 행 본문 클릭 = 펼침/접힘 토글. 키보드 접근성도 함께 챙긴다. */}
                          <TableRow
                            role="button"
                            tabIndex={0}
                            aria-expanded={expanded}
                            aria-controls={`unit-detail-${unit.id}`}
                            onClick={() => onToggleExpand(unit.id)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                onToggleExpand(unit.id);
                              }
                            }}
                            data-testid={`row-unit-${unit.id}`}
                            className="cursor-pointer hover:bg-muted/50"
                          >
                            <TableCell className="text-muted-foreground">
                              {expanded ? (
                                <ChevronDown className="w-4 h-4" />
                              ) : (
                                <ChevronRight className="w-4 h-4" />
                              )}
                            </TableCell>
                            <TableCell className="font-medium">
                              <div className="flex items-center gap-1.5">
                                <span>{unit.unitNumber}</span>
                                {/* [Task #348] 출처 뱃지 — 대장 동기화로 들어온 호실은 한눈에 구분 */}
                                {unit.source === "register" && (
                                  <Badge
                                    variant="outline"
                                    className="text-[10px] px-1.5 py-0 border-emerald-300 bg-emerald-50 text-emerald-700"
                                    title={
                                      unit.lastRegisterSyncedAt
                                        ? `대장 동기화: ${new Date(unit.lastRegisterSyncedAt).toLocaleString("ko-KR")}`
                                        : "건축물대장 출처"
                                    }
                                  >
                                    대장
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant={st.variant}>{st.label}</Badge>
                            </TableCell>
                            <TableCell className="text-muted-foreground">{unit.usage || "-"}</TableCell>
                            <TableCell className="text-muted-foreground text-xs">
                              {unit.exclusiveArea ? `${unit.exclusiveArea}m²` : "-"}
                            </TableCell>
                            <TableCell className="text-center">{unit.tenantCount || 0}</TableCell>
                            <TableCell className="text-center">{unit.ownerCount || 0}</TableCell>
                            <TableCell className="text-center">{unit.vehicleCount || 0}</TableCell>
                          </TableRow>
                          {expanded && (
                            <TableRow
                              id={`unit-detail-${unit.id}`}
                              className="bg-muted/20 hover:bg-muted/20"
                            >
                              <TableCell colSpan={8} className="p-2">
                                <UnitDetailInline unitId={unit.id} />
                              </TableCell>
                            </TableRow>
                          )}
                        </Fragment>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>

          <div className="desktop:hidden grid grid-cols-3 gap-2">
            {floorUnits.map((unit) => {
              const st = statusMap[unit.status] || statusMap.vacant;
              const expanded = expandedUnitId === unit.id;
              return (
                <div
                  key={unit.id}
                  className={expanded ? "col-span-3" : ""}
                >
                  <Card
                    role="button"
                    tabIndex={0}
                    aria-expanded={expanded}
                    aria-controls={`unit-detail-mobile-${unit.id}`}
                    className={`cursor-pointer active:bg-muted/50 ${
                      unit.status === "occupied"
                        ? "border-primary/30"
                        : unit.status === "maintenance"
                        ? "border-destructive/30"
                        : ""
                    } ${expanded ? "ring-2 ring-primary/40" : ""}`}
                    onClick={() => onToggleExpand(unit.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onToggleExpand(unit.id);
                      }
                    }}
                    data-testid={`card-unit-${unit.id}`}
                  >
                    <CardContent className="p-2.5">
                      <div className="text-center">
                        <p className="font-semibold text-sm">{unit.unitNumber}</p>
                        <Badge variant={st.variant} className="text-[10px] mt-1">{st.label}</Badge>
                        {unit.usage && (
                          <p className="text-[10px] text-muted-foreground mt-1 truncate">{unit.usage}</p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                  {expanded && (
                    <div id={`unit-detail-mobile-${unit.id}`} className="mt-2">
                      <UnitDetailInline unitId={unit.id} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
