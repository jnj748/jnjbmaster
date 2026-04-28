// [Task #516] 호실 관리 — 소유자 그리드 보기.
//
// 층별 카드 뷰(UnitsFloorList) 의 자매 컴포넌트.
// 동 / 층 / 호실 정렬, 동(棟) 필터, 출처 뱃지(대장/자동/수기/CSV) 를 한눈에 보여
// 다동 단지에서 소유자 마스터를 일괄 점검할 수 있게 한다.
//
// 행 클릭 = 상세, 편집/삭제는 액션 컬럼.
import { useMemo, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Edit, Eye, Trash2 } from "lucide-react";
import type { Unit } from "@workspace/api-client-react";

interface Props {
  isLoading: boolean;
  units?: Unit[];
  onView: (id: number) => void;
  onEdit: (unit: Unit) => void;
  onDelete: (id: number) => void;
}

const SOURCE_LABEL: Record<string, { label: string; variant: "default" | "secondary" | "outline" }> = {
  register: { label: "대장", variant: "default" },
  auto: { label: "자동(소유자)", variant: "default" },
  manual: { label: "수기", variant: "secondary" },
  csv: { label: "CSV", variant: "outline" },
};

function ownerSourceBadge(u: Unit) {
  const src = (u as Unit & { ownerSource?: string | null }).ownerSource;
  if (src && SOURCE_LABEL[src]) {
    const s = SOURCE_LABEL[src];
    return <Badge variant={s.variant} data-testid={`badge-owner-source-${u.id}`}>{s.label}</Badge>;
  }
  // 소유자 컬럼이 비어 있으면 "미입력"
  if (!u.ownerName) return <Badge variant="outline">미입력</Badge>;
  // ownerSource 가 없는 과거 데이터 — source 컬럼으로 추정
  const s = SOURCE_LABEL[u.source] ?? SOURCE_LABEL.manual;
  return <Badge variant={s.variant}>{s.label}</Badge>;
}

export function UnitsOwnerGrid({ isLoading, units, onView, onEdit, onDelete }: Props) {
  const [dongFilter, setDongFilter] = useState<string>("__all__");

  const dongs = useMemo(() => {
    const s = new Set<string>();
    (units ?? []).forEach((u) => {
      const d = (u as Unit & { dong?: string | null }).dong ?? "";
      s.add(d);
    });
    return Array.from(s).sort();
  }, [units]);

  const rows = useMemo(() => {
    const filtered = (units ?? []).filter((u) => {
      if (dongFilter === "__all__") return true;
      const d = (u as Unit & { dong?: string | null }).dong ?? "";
      return d === dongFilter;
    });
    return filtered.slice().sort((a, b) => {
      const da = (a as Unit & { dong?: string | null }).dong ?? "";
      const db = (b as Unit & { dong?: string | null }).dong ?? "";
      if (da !== db) return da.localeCompare(db, "ko", { numeric: true });
      const fa = parseInt(a.floor, 10);
      const fb = parseInt(b.floor, 10);
      if (Number.isFinite(fa) && Number.isFinite(fb) && fa !== fb) return fa - fb;
      return a.unitNumber.localeCompare(b.unitNumber, "ko", { numeric: true });
    });
  }, [units, dongFilter]);

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {dongs.length > 1 && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">동(棟) 필터</span>
          <Select value={dongFilter} onValueChange={setDongFilter}>
            <SelectTrigger className="w-[160px]" data-testid="select-owner-grid-dong">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">전체 ({dongs.length}개 동)</SelectItem>
              {dongs.map((d) => (
                <SelectItem key={d || "__blank__"} value={d}>
                  {d || "(동 없음)"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      <div className="border rounded-md overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[80px]">동</TableHead>
              <TableHead className="w-[60px]">층</TableHead>
              <TableHead className="w-[100px]">호실</TableHead>
              <TableHead>소유자</TableHead>
              <TableHead>연락처</TableHead>
              <TableHead>주소</TableHead>
              <TableHead className="w-[110px]">출처</TableHead>
              <TableHead className="w-[120px] text-right">작업</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                  표시할 호실이 없어요.
                </TableCell>
              </TableRow>
            )}
            {rows.map((u) => {
              const dong = (u as Unit & { dong?: string | null }).dong ?? "";
              const ownerAddress = (u as Unit & { ownerAddress?: string | null }).ownerAddress;
              return (
                <TableRow key={u.id} data-testid={`row-owner-grid-${u.id}`}>
                  <TableCell className="font-mono text-xs">{dong || "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{u.floor}</TableCell>
                  <TableCell className="font-medium">{u.unitNumber}</TableCell>
                  <TableCell>{u.ownerName || <span className="text-muted-foreground">—</span>}</TableCell>
                  <TableCell className="text-sm">
                    {u.ownerPhone || <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground truncate max-w-[280px]">
                    {ownerAddress || "—"}
                  </TableCell>
                  <TableCell>{ownerSourceBadge(u)}</TableCell>
                  <TableCell className="text-right">
                    <div className="inline-flex gap-1">
                      <Button size="icon" variant="ghost" onClick={() => onView(u.id)} data-testid={`btn-owner-grid-view-${u.id}`}>
                        <Eye className="w-4 h-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => onEdit(u)} data-testid={`btn-owner-grid-edit-${u.id}`}>
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => onDelete(u.id)} data-testid={`btn-owner-grid-delete-${u.id}`}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
