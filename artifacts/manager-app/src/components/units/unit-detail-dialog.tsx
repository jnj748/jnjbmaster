import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@/components/ui/responsive-dialog";
import { Edit, Trash2, Users, UserCheck, Car, FileText } from "lucide-react";
import type { GetUnit200 } from "@workspace/api-client-react";

const STATUS_MAP: Record<string, { label: string; variant: "default" | "secondary" | "destructive" }> = {
  vacant: { label: "공실", variant: "secondary" },
  occupied: { label: "입주", variant: "default" },
  maintenance: { label: "정비중", variant: "destructive" },
};

// [Task #348] source 컬럼 한글 표기. 'register' = 건축물대장 출처.
const SOURCE_MAP: Record<string, { label: string; cls: string }> = {
  register: { label: "대장 출처", cls: "bg-emerald-100 text-emerald-700" },
  manual: { label: "직접 입력", cls: "bg-slate-100 text-slate-600" },
  csv: { label: "CSV 가져오기", cls: "bg-sky-100 text-sky-700" },
};

interface Props {
  detailUnitId: number | null;
  unitDetail: GetUnit200 | undefined;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export function UnitDetailDialog({ detailUnitId, unitDetail, onClose, onEdit, onDelete }: Props) {
  return (
    <ResponsiveDialog open={!!detailUnitId} onOpenChange={(o) => { if (!o) onClose(); }}>
      <ResponsiveDialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>호실 상세</ResponsiveDialogTitle>
        </ResponsiveDialogHeader>
        {unitDetail && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><span className="text-muted-foreground">호실번호:</span> <span className="font-medium">{unitDetail.unitNumber}</span></div>
              <div><span className="text-muted-foreground">층:</span> <span className="font-medium">{unitDetail.floor}층</span></div>
              <div>
                <span className="text-muted-foreground">상태:</span>{" "}
                <Badge variant={STATUS_MAP[unitDetail.status]?.variant || "secondary"}>
                  {STATUS_MAP[unitDetail.status]?.label || unitDetail.status}
                </Badge>
              </div>
              <div><span className="text-muted-foreground">용도:</span> {unitDetail.usage || "-"}</div>
              <div><span className="text-muted-foreground">전용면적:</span> {unitDetail.exclusiveArea ? `${unitDetail.exclusiveArea}m²` : "-"}</div>
              <div><span className="text-muted-foreground">공용면적:</span> {unitDetail.commonArea ? `${unitDetail.commonArea}m²` : "-"}</div>
              {/* [Task #348] 출처 / 마지막 동기화 시각. 어느 데이터가 대장에서 왔는지 한눈에 확인. */}
              <div className="col-span-2 flex flex-wrap items-center gap-2 pt-1">
                <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                <Badge className={SOURCE_MAP[unitDetail.source]?.cls || SOURCE_MAP.manual.cls}>
                  {SOURCE_MAP[unitDetail.source]?.label || unitDetail.source}
                </Badge>
                {unitDetail.lastRegisterSyncedAt && (
                  <span className="text-xs text-muted-foreground">
                    마지막 동기화 {new Date(unitDetail.lastRegisterSyncedAt).toLocaleString("ko-KR")}
                  </span>
                )}
              </div>
              {unitDetail.notes && (
                <div className="col-span-2"><span className="text-muted-foreground">비고:</span> {unitDetail.notes}</div>
              )}
            </div>

            <div className="border-t pt-3">
              <div className="flex items-center gap-2 mb-2">
                <Users className="w-4 h-4 text-muted-foreground" />
                <p className="text-sm font-medium">입주자</p>
              </div>
              {unitDetail.tenants && unitDetail.tenants.length > 0 ? (
                <div className="space-y-2">
                  {unitDetail.tenants.map((t, i) => (
                    <div key={i} className="flex items-center justify-between text-sm bg-muted/50 rounded p-2">
                      <span>{t.tenantName}</span>
                      <span className="text-muted-foreground">{t.phone || "-"}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">해당 호실에 등록된 입주자가 없습니다</p>
              )}
            </div>

            <div className="border-t pt-3">
              <div className="flex items-center gap-2 mb-2">
                <UserCheck className="w-4 h-4 text-muted-foreground" />
                <p className="text-sm font-medium">소유자</p>
              </div>
              {unitDetail.owners && unitDetail.owners.length > 0 ? (
                <div className="space-y-2">
                  {unitDetail.owners.map((o, i) => (
                    <div key={i} className="flex items-center justify-between text-sm bg-muted/50 rounded p-2">
                      <span>{o.ownerName}</span>
                      <span className="text-muted-foreground">{o.phone || "-"}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">해당 호실에 등록된 소유자가 없습니다</p>
              )}
            </div>

            <div className="border-t pt-3">
              <div className="flex items-center gap-2 mb-2">
                <Car className="w-4 h-4 text-muted-foreground" />
                <p className="text-sm font-medium">등록 차량</p>
              </div>
              {unitDetail.vehicles && unitDetail.vehicles.length > 0 ? (
                <div className="space-y-2">
                  {unitDetail.vehicles.map((v, i) => (
                    <div key={i} className="flex items-center justify-between text-sm bg-muted/50 rounded p-2">
                      <span className="font-medium">{v.vehicleNumber}</span>
                      <span className="text-muted-foreground">{v.vehicleType || ""} {v.ownerName ? `(${v.ownerName})` : ""}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">해당 호실에 등록된 차량이 없습니다</p>
              )}
            </div>

            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={onEdit}>
                <Edit className="w-4 h-4 mr-1" />
                수정
              </Button>
              <Button variant="destructive" className="flex-1" onClick={onDelete}>
                <Trash2 className="w-4 h-4 mr-1" />
                삭제
              </Button>
            </div>
          </div>
        )}
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
