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

// [Task #796] XpBIZ 호실관리 그리드 7개 신규 컬럼.
type UnitExt = Unit & {
  dong?: string | null;
  ownerAddress?: string | null;
  unitUsage?: string | null;
  residenceUsage?: string | null;
  ownershipType?: string | null;
  keySentAt?: string | null;
  vendorName?: string | null;
  representativeName?: string | null;
  postalCode?: string | null;
  businessNumber?: string | null;
  entryDate?: string | null;
  supplyArea?: string | null;
};

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
  // [Task #796] XpBIZ 필터 6종.
  const [unitUsageFilter, setUnitUsageFilter] = useState<string>("__all__");
  const [residenceUsageFilter, setResidenceUsageFilter] = useState<string>("__all__");
  const [ownershipFilter, setOwnershipFilter] = useState<string>("__all__");
  const [statusFilter, setStatusFilter] = useState<string>("__all__");
  const [vendorFilter, setVendorFilter] = useState<string>("__all__");
  const [keySentFilter, setKeySentFilter] = useState<string>("__all__");

  const ext = (u: Unit) => u as UnitExt;
  const distinct = (key: keyof UnitExt) => {
    const s = new Set<string>();
    (units ?? []).forEach((u) => {
      const v = ext(u)[key];
      if (typeof v === "string" && v) s.add(v);
    });
    return Array.from(s).sort();
  };

  const dongs = useMemo(() => {
    const s = new Set<string>();
    (units ?? []).forEach((u) => s.add(ext(u).dong ?? ""));
    return Array.from(s).sort();
  }, [units]);
  const unitUsages = useMemo(() => distinct("unitUsage"), [units]); // eslint-disable-line react-hooks/exhaustive-deps
  const residenceUsages = useMemo(() => distinct("residenceUsage"), [units]); // eslint-disable-line react-hooks/exhaustive-deps
  const ownerships = useMemo(() => distinct("ownershipType"), [units]); // eslint-disable-line react-hooks/exhaustive-deps
  const vendors = useMemo(() => distinct("vendorName"), [units]); // eslint-disable-line react-hooks/exhaustive-deps

  const rows = useMemo(() => {
    const filtered = (units ?? []).filter((u) => {
      const x = ext(u);
      if (dongFilter !== "__all__" && (x.dong ?? "") !== dongFilter) return false;
      if (unitUsageFilter !== "__all__" && (x.unitUsage ?? "") !== unitUsageFilter) return false;
      if (residenceUsageFilter !== "__all__" && (x.residenceUsage ?? "") !== residenceUsageFilter) return false;
      if (ownershipFilter !== "__all__" && (x.ownershipType ?? "") !== ownershipFilter) return false;
      if (statusFilter !== "__all__" && u.status !== statusFilter) return false;
      if (vendorFilter !== "__all__" && (x.vendorName ?? "") !== vendorFilter) return false;
      if (keySentFilter === "yes" && !x.keySentAt) return false;
      if (keySentFilter === "no" && x.keySentAt) return false;
      return true;
    });
    return filtered.slice().sort((a, b) => {
      const da = ext(a).dong ?? "";
      const db = ext(b).dong ?? "";
      if (da !== db) return da.localeCompare(db, "ko", { numeric: true });
      const fa = parseInt(a.floor, 10);
      const fb = parseInt(b.floor, 10);
      if (Number.isFinite(fa) && Number.isFinite(fb) && fa !== fb) return fa - fb;
      return a.unitNumber.localeCompare(b.unitNumber, "ko", { numeric: true });
    });
  }, [units, dongFilter, unitUsageFilter, residenceUsageFilter, ownershipFilter, statusFilter, vendorFilter, keySentFilter]);

  // [Task #796] 면적 합계 — 필터 적용 후 행 기준 전용/공용/공급면적 합산.
  const areaTotals = useMemo(() => {
    let exclusive = 0, common = 0, supply = 0;
    rows.forEach((u) => {
      const x = ext(u);
      const e = parseFloat(u.exclusiveArea ?? "");
      const c = parseFloat(u.commonArea ?? "");
      const s = parseFloat(x.supplyArea ?? "");
      if (Number.isFinite(e)) exclusive += e;
      if (Number.isFinite(c)) common += c;
      if (Number.isFinite(s)) supply += s;
    });
    return { exclusive, common, supply };
  }, [rows]);

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  const FilterSelect = ({ label, value, setValue, options, allLabel, testId }: { label: string; value: string; setValue: (v: string) => void; options: string[]; allLabel: string; testId: string }) => (
    <div className="flex items-center gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <Select value={value} onValueChange={setValue}>
        <SelectTrigger className="w-[140px] h-8" data-testid={testId}><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">{allLabel}</SelectItem>
          {options.map((o) => <SelectItem key={o || "__blank__"} value={o}>{o || "(없음)"}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        {dongs.length > 1 && (
          <FilterSelect label="동" value={dongFilter} setValue={setDongFilter} options={dongs} allLabel={`전체 (${dongs.length})`} testId="select-owner-grid-dong" />
        )}
        {unitUsages.length > 0 && (
          <FilterSelect label="호실용도" value={unitUsageFilter} setValue={setUnitUsageFilter} options={unitUsages} allLabel="전체" testId="select-unit-usage" />
        )}
        {residenceUsages.length > 0 && (
          <FilterSelect label="주거용도" value={residenceUsageFilter} setValue={setResidenceUsageFilter} options={residenceUsages} allLabel="전체" testId="select-residence-usage" />
        )}
        {ownerships.length > 0 && (
          <FilterSelect label="소유구분" value={ownershipFilter} setValue={setOwnershipFilter} options={ownerships} allLabel="전체" testId="select-ownership" />
        )}
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground">상태</span>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[120px] h-8" data-testid="select-status-filter"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">전체</SelectItem>
              <SelectItem value="vacant">공실</SelectItem>
              <SelectItem value="occupied">입주</SelectItem>
              <SelectItem value="maintenance">정비</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {vendors.length > 0 && (
          <FilterSelect label="거래처" value={vendorFilter} setValue={setVendorFilter} options={vendors} allLabel="전체" testId="select-vendor" />
        )}
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground">열쇠전달</span>
          <Select value={keySentFilter} onValueChange={setKeySentFilter}>
            <SelectTrigger className="w-[110px] h-8" data-testid="select-key-sent"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">전체</SelectItem>
              <SelectItem value="yes">전달완료</SelectItem>
              <SelectItem value="no">미전달</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="ml-auto text-xs text-muted-foreground" data-testid="text-area-totals">
          전용 {areaTotals.exclusive.toFixed(2)} · 공용 {areaTotals.common.toFixed(2)} · 공급 {areaTotals.supply.toFixed(2)} m²
        </div>
      </div>
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
              <TableHead className="w-[80px]">호실용도</TableHead>
              <TableHead className="w-[80px]">주거용도</TableHead>
              <TableHead className="w-[80px]">소유구분</TableHead>
              <TableHead className="w-[100px]">열쇠전달</TableHead>
              <TableHead>거래처</TableHead>
              <TableHead>대표자</TableHead>
              <TableHead className="w-[80px]">우편번호</TableHead>
              <TableHead className="w-[110px]">출처</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={15} className="text-center text-muted-foreground py-8">
                  표시할 호실이 없어요.
                </TableCell>
              </TableRow>
            )}
            {rows.map((u) => {
              const x = ext(u);
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
                      {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{x.dong || "—"}</TableCell>
                    <TableCell className="font-mono text-xs">{u.floor}</TableCell>
                    <TableCell className="font-medium">{u.unitNumber}</TableCell>
                    <TableCell>{u.ownerName || <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell className="text-sm">{u.ownerPhone || <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell className="text-sm text-muted-foreground truncate max-w-[200px]">{x.ownerAddress || "—"}</TableCell>
                    <TableCell className="text-xs">{x.unitUsage || "—"}</TableCell>
                    <TableCell className="text-xs">{x.residenceUsage || "—"}</TableCell>
                    <TableCell className="text-xs">{x.ownershipType || "—"}</TableCell>
                    <TableCell className="text-xs">{x.keySentAt || "—"}</TableCell>
                    <TableCell className="text-xs truncate max-w-[140px]">{x.vendorName || "—"}</TableCell>
                    <TableCell className="text-xs">{x.representativeName || "—"}</TableCell>
                    <TableCell className="font-mono text-xs">{x.postalCode || "—"}</TableCell>
                    <TableCell>{ownerSourceBadge(u)}</TableCell>
                  </TableRow>
                  {expanded && (
                    <TableRow id={`unit-detail-owner-${u.id}`} className="bg-muted/20 hover:bg-muted/20">
                      <TableCell colSpan={15} className="p-2">
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
