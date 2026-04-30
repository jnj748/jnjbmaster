// [Task #516] 호실 관리 — 소유자 그리드 보기.
//
// 층별 카드 뷰(UnitsFloorList) 의 자매 컴포넌트.
// 동 / 층 / 호실 정렬, 동(棟) 필터, 출처 뱃지(대장/자동/수기/CSV) 를 한눈에 보여
// 다동 단지에서 소유자 마스터를 일괄 점검할 수 있게 한다.
//
// [Task #675] 행 클릭 = 인라인 펼침/접힘 (단일 선택). 같은 행 재클릭 시 닫힘.
import { Fragment, useMemo, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { Unit } from "@workspace/api-client-react";
import { UnitDetailInline } from "./unit-detail-inline";

interface Props {
  isLoading: boolean;
  units?: Unit[];
  // [Task #675] 행 클릭 = 인라인 펼침. 호출 측이 단일 선택 상태를 관리한다.
  expandedUnitId: number | null;
  onToggleExpand: (id: number) => void;
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

export function UnitsOwnerGrid({ isLoading, units, expandedUnitId, onToggleExpand }: Props) {
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
              <TableHead className="w-[40px]"></TableHead>
              <TableHead className="w-[80px]">동</TableHead>
              <TableHead className="w-[60px]">층</TableHead>
              <TableHead className="w-[100px]">호실</TableHead>
              <TableHead>소유자</TableHead>
              <TableHead>연락처</TableHead>
              <TableHead>주소</TableHead>
              <TableHead className="w-[110px]">출처</TableHead>
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
              const expanded = expandedUnitId === u.id;
              return (
                <Fragment key={u.id}>
                  <TableRow
                    role="button"
                    tabIndex={0}
                    aria-expanded={expanded}
                    aria-controls={`unit-detail-owner-${u.id}`}
                    data-testid={`row-owner-grid-${u.id}`}
                    onClick={() => onToggleExpand(u.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onToggleExpand(u.id);
                      }
                    }}
                    className="cursor-pointer hover:bg-muted/50"
                  >
                    <TableCell className="text-muted-foreground">
                      {expanded ? (
                        <ChevronDown className="w-4 h-4" />
                      ) : (
                        <ChevronRight className="w-4 h-4" />
                      )}
                    </TableCell>
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
                  </TableRow>
                  {expanded && (
                    <TableRow
                      id={`unit-detail-owner-${u.id}`}
                      className="bg-muted/20 hover:bg-muted/20"
                    >
                      <TableCell colSpan={8} className="p-2">
                        <UnitDetailInline unitId={u.id} />
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
