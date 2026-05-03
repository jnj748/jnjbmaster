import { useState, useMemo, useEffect, lazy, Suspense } from "react";
import { Link } from "wouter";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/auth-context";

// [Task #141] 소유자 관리(/owners) 라우트 폐지 — 호실 관리 화면의 탭으로 흡수.
//   백엔드 /api/owners 가 manager/platform_admin 만 허용하므로, 동일 권한일 때만 탭 노출.
const Owners = lazy(() => import("@/pages/owners"));
import {
  useListUnits,
  useGetUnitsSummary,
} from "@workspace/api-client-react";
import type { Unit } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, Settings, ArrowRight } from "lucide-react";
import { UnitsSummaryCards } from "@/components/units/units-summary-cards";
import { UnitsFloorList } from "@/components/units/units-floor-list";
// [Task #516] 다동 단지 소유자 점검을 위한 그리드 보기 모드.
import { UnitsOwnerGrid } from "@/components/units/units-owner-grid";
import { UnitsImportDialog } from "@/components/units/units-import-dialog";
import { LayoutGrid, Rows3 } from "lucide-react";

const STATUS_MAP: Record<string, { label: string; variant: "default" | "secondary" | "destructive" }> = {
  vacant: { label: "공실", variant: "secondary" },
  occupied: { label: "입주", variant: "default" },
  maintenance: { label: "정비중", variant: "destructive" },
};

// [Task #675] URL 쿼리에서 검색어/포커스 호실을 한 번 읽어 초기 상태로 사용한다.
//   ?search=... → 검색 입력에 자동 반영
//   ?focusId=...  → 결과 목록에서 해당 호실 ID 행을 자동으로 펼침
//   ?focusUnit=... → focusId 가 없을 때 unitNumber 일치 행을 자동으로 펼침
function readInitialQuery(): { search: string; focusId: number | null; focusUnit: string | null } {
  if (typeof window === "undefined") return { search: "", focusId: null, focusUnit: null };
  const params = new URLSearchParams(window.location.search);
  const search = params.get("search") ?? "";
  const focusIdRaw = params.get("focusId");
  const focusId = focusIdRaw ? Number(focusIdRaw) : NaN;
  const focusUnit = params.get("focusUnit");
  return {
    search,
    focusId: Number.isFinite(focusId) ? focusId : null,
    focusUnit: focusUnit ?? null,
  };
}

export default function UnitsPage() {
  const initial = useMemo(() => readInitialQuery(), []);
  const [filterStatus, setFilterStatus] = useState<string | undefined>();
  const [searchTerm, setSearchTerm] = useState(initial.search);
  // [Task #469] 빈 상태에서 페이지 이동 없이 호실 가져오기 마법사를 모달로 띄운다.
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  // [Task #516] 호실 목록 보기 모드 — 층별 카드(기본) / 소유자 그리드.
  const [viewMode, setViewMode] = useState<"floor" | "owner">("floor");
  // [Task #675] 인라인 펼침 상태 — 단일 선택. URL 의 focusId 로 사전 설정한다.
  const [expandedUnitId, setExpandedUnitId] = useState<number | null>(initial.focusId);
  // [Task #675] focusUnit 으로만 진입한 경우(입주자 결과 클릭 등)는 결과 목록이
  //   로드된 후 unitNumber 일치 행을 한 번 펼친다. 한 번 적용된 후엔 다시 자동
  //   펼침을 시도하지 않는다.
  const [pendingFocusUnit, setPendingFocusUnit] = useState<string | null>(initial.focusUnit);
  const { user } = useAuth();
  const canManageOwners = user?.role === "manager" || user?.role === "platform_admin";
  // [Task #141] /owners 레거시 진입은 /units?tab=owners 로 리디렉트되어 오므로 초기 탭에 반영.
  const initialUnitsTab = (() => {
    if (typeof window === "undefined") return "units";
    const t = new URLSearchParams(window.location.search).get("tab");
    return t === "owners" && canManageOwners ? "owners" : "units";
  })();

  const { data: units, isLoading } = useListUnits(
    {
      ...(filterStatus && filterStatus !== "all" ? { status: filterStatus as "vacant" | "occupied" | "maintenance" } : {}),
      ...(searchTerm ? { search: searchTerm } : {}),
    }
  );
  const { data: summary } = useGetUnitsSummary();

  // [Task #675] 검색 결과가 들어오면 pendingFocusUnit 일치 행을 자동으로 펼친다.
  //   이미 expandedUnitId 가 잡혀 있으면(예: focusId 진입) 건너뛴다.
  useEffect(() => {
    if (!pendingFocusUnit) return;
    if (!units || units.length === 0) return;
    const match = units.find((u) => u.unitNumber === pendingFocusUnit);
    if (match) {
      setExpandedUnitId(match.id);
      setPendingFocusUnit(null);
    }
  }, [pendingFocusUnit, units]);

  // [Task #675] 검색어가 비워지면 자동 펼침 상태도 함께 해제한다.
  useEffect(() => {
    if (!searchTerm) setExpandedUnitId(null);
  }, [searchTerm]);

  const floorGroups = useMemo(() => {
    if (!units) return [];
    const grouped = new Map<string, Unit[]>();
    for (const u of units) {
      const arr = grouped.get(u.floor) || [];
      arr.push(u);
      grouped.set(u.floor, arr);
    }
    return Array.from(grouped.entries())
      .sort((a, b) => {
        const numA = parseInt(a[0]);
        const numB = parseInt(b[0]);
        const isNumA = !isNaN(numA);
        const isNumB = !isNaN(numB);
        if (isNumA && isNumB) return numB - numA;
        if (isNumA) return -1;
        if (isNumB) return 1;
        return a[0].localeCompare(b[0]);
      });
  }, [units]);

  function handleToggleExpand(id: number) {
    setExpandedUnitId((prev) => (prev === id ? null : id));
  }

  return (
    <Tabs defaultValue={initialUnitsTab} className="space-y-6">
      <TabsList>
        <TabsTrigger value="units">호실 관리</TabsTrigger>
        {canManageOwners && <TabsTrigger value="owners">소유자 관리</TabsTrigger>}
      </TabsList>
      <TabsContent value="units" className="space-y-6 mt-0">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">호실 관리</h1>
          <p className="text-muted-foreground text-sm mt-1">
            건물 호실 정보를 조회하고, 행을 클릭해 상세를 확인합니다.
          </p>
        </div>
        {/* [Task #675] 호실 추가/CSV 업로드/자동 생성 버튼은 설정 메뉴로 이관되었다.
            행의 보기/수정/삭제 액션도 모두 사라지고, 행 클릭 = 인라인 펼침으로 통일한다. */}
      </div>

      {/* [Task #675] 호실 기초정보 변경은 설정 메뉴에서 진행하도록 안내. */}
      <Alert data-testid="alert-units-edit-moved-to-settings">
        <Settings className="w-4 h-4" />
        <AlertTitle>호실 기초정보 변경은 설정 메뉴에서</AlertTitle>
        <AlertDescription className="flex flex-wrap items-center gap-2">
          <span>
            호실 추가·수정·삭제, CSV 업로드, 자동 생성은 [설정 → 건물정보 수정]에서 진행해 주세요.
          </span>
          <Link href="/settings/building">
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1"
              data-testid="btn-go-building-settings"
            >
              건물정보 수정으로 이동
              <ArrowRight className="w-3.5 h-3.5" />
            </Button>
          </Link>
        </AlertDescription>
      </Alert>

      {summary && <UnitsSummaryCards summary={summary} />}

      <div className="flex gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="호실번호, 용도 검색..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
            data-testid="input-units-search"
          />
        </div>
        <Select value={filterStatus || "all"} onValueChange={(v) => setFilterStatus(v === "all" ? undefined : v)}>
          <SelectTrigger className="w-[120px]"><SelectValue placeholder="상태" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체</SelectItem>
            <SelectItem value="vacant">공실</SelectItem>
            <SelectItem value="occupied">입주</SelectItem>
            <SelectItem value="maintenance">정비중</SelectItem>
          </SelectContent>
        </Select>
        {/* [Task #516] 보기 모드 — 층별 카드 / 소유자 그리드 */}
        <div className="ml-auto inline-flex rounded-md border bg-background p-0.5">
          <Button
            type="button"
            size="sm"
            variant={viewMode === "floor" ? "default" : "ghost"}
            onClick={() => setViewMode("floor")}
            className="h-8"
            data-testid="btn-view-mode-floor"
          >
            <Rows3 className="w-4 h-4 mr-1.5" /> 층별
          </Button>
          <Button
            type="button"
            size="sm"
            variant={viewMode === "owner" ? "default" : "ghost"}
            onClick={() => setViewMode("owner")}
            className="h-8"
            data-testid="btn-view-mode-owner"
          >
            <LayoutGrid className="w-4 h-4 mr-1.5" /> 소유자
          </Button>
        </div>
      </div>

      {viewMode === "owner" ? (
        <UnitsOwnerGrid
          isLoading={isLoading}
          units={units}
          expandedUnitId={expandedUnitId}
          onToggleExpand={handleToggleExpand}
        />
      ) : (
      <UnitsFloorList
        isLoading={isLoading}
        units={units}
        floorGroups={floorGroups}
        statusMap={STATUS_MAP}
        expandedUnitId={expandedUnitId}
        onToggleExpand={handleToggleExpand}
        // [Task #437] 호실 0건 빈 상태에서 노출되는 "AI 호실데이터 로딩하기" 버튼.
        //   아직 한 번도 호실이 등록되지 않은 경우(summary.total === 0) 에만
        //   버튼이 보이도록 totalUnits 도 함께 전달한다. summary 가 아직 로드
        //   되지 않은 사이에 일시적으로 버튼이 잘못 노출되는 깜빡임을 막기 위해
        //   기본값(?? 0)을 부여하지 않고 undefined 그대로 내려보낸다.
        totalUnits={summary?.total}
        // [Task #469] 페이지 이동 대신 모달 다이얼로그로 호실 가져오기 마법사를 띄운다.
        onSyncFromRegister={() => setImportDialogOpen(true)}
      />
      )}

      <UnitsImportDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
      />
      </TabsContent>
      {canManageOwners && (
        <TabsContent value="owners" className="mt-0">
          <Suspense fallback={<div className="space-y-3"><Skeleton className="h-12" /><Skeleton className="h-32" /></div>}>
            <Owners />
          </Suspense>
        </TabsContent>
      )}
    </Tabs>
  );
}
