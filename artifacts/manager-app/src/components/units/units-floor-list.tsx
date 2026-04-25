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
import { Building2, Edit, Eye, Layers, Trash2 } from "lucide-react";
import type { Unit } from "@workspace/api-client-react";

interface Props {
  isLoading: boolean;
  units?: Unit[];
  floorGroups: [string, Unit[]][];
  statusMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" }>;
  onView: (id: number) => void;
  onEdit: (unit: Unit) => void;
  onDelete: (id: number) => void;
}

export function UnitsFloorList({
  isLoading,
  units,
  floorGroups,
  statusMap,
  onView,
  onEdit,
  onDelete,
}: Props) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}
      </div>
    );
  }

  if (!units || units.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Building2 className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
          <p className="text-muted-foreground mb-4">등록된 호실이 없습니다</p>
          <p className="text-sm text-muted-foreground">
            호실을 개별 추가하거나, CSV 업로드 또는 자동 생성으로 일괄 등록하세요
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
                      <TableHead>호실</TableHead>
                      <TableHead>상태</TableHead>
                      <TableHead>용도</TableHead>
                      <TableHead>면적</TableHead>
                      <TableHead>입주자</TableHead>
                      <TableHead>소유자</TableHead>
                      <TableHead>차량</TableHead>
                      <TableHead className="text-right">관리</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {floorUnits.map((unit) => {
                      const st = statusMap[unit.status] || statusMap.vacant;
                      return (
                        <TableRow key={unit.id}>
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
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button variant="ghost" size="sm" onClick={() => onView(unit.id)}>
                                <Eye className="w-3.5 h-3.5" />
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => onEdit(unit)}>
                                <Edit className="w-3.5 h-3.5" />
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => onDelete(unit.id)}>
                                <Trash2 className="w-3.5 h-3.5 text-destructive" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
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
              return (
                <Card
                  key={unit.id}
                  className={`cursor-pointer active:bg-muted/50 ${
                    unit.status === "occupied"
                      ? "border-primary/30"
                      : unit.status === "maintenance"
                      ? "border-destructive/30"
                      : ""
                  }`}
                  onClick={() => onView(unit.id)}
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
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
