// [Task #660] 경리 대시보드 — 호실정보조회 위젯.
//
// 카드 내부에 검색 인풋을 두고, 200ms 디바운스 후 기존 세대/입주자 조회
// 엔드포인트(useListUnits / useListTenants)로 검색해 상위 결과를 카드 안
// 리스트로 보여준다. 결과 행 클릭 시 호실관리(/units) 화면으로 이동하면서,
// 해당 호실 번호로 자동 검색되고 그 호실 행이 자동으로 펼쳐진다.
//
// [Task #675] 위젯 라벨을 "호실정보조회" 로 다듬고, 입주자 결과를 클릭해도
// 입주자 페이지가 아니라 그 입주자가 속한 호실로 이동하도록 동선을 일원화한다.
//
// 신규 백엔드 엔드포인트 없이 동작한다.

import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import {
  useListUnits,
  useListTenants,
  type Unit,
  type Tenant,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Search, Users, Home } from "lucide-react";

const MAX_ROWS = 6;

export default function AccountantMemberSearchWidget() {
  const [, navigate] = useLocation();
  const [raw, setRaw] = useState("");
  const [query, setQuery] = useState("");

  // 200ms 디바운스
  useEffect(() => {
    const t = setTimeout(() => setQuery(raw.trim()), 200);
    return () => clearTimeout(t);
  }, [raw]);

  const enabled = query.length > 0;

  const tenantsQ = useListTenants(
    enabled ? { search: query } : undefined,
    { query: { enabled, staleTime: 30 * 1000 } },
  );
  const unitsQ = useListUnits(
    enabled ? { search: query } : undefined,
    { query: { enabled, staleTime: 30 * 1000 } },
  );

  const tenants = useMemo<Tenant[]>(
    () => (tenantsQ.data ?? []).slice(0, MAX_ROWS),
    [tenantsQ.data],
  );
  const units = useMemo<Unit[]>(
    () => (unitsQ.data ?? []).slice(0, MAX_ROWS),
    [unitsQ.data],
  );

  const isLoading = enabled && (tenantsQ.isLoading || unitsQ.isLoading);
  const isEmpty = enabled && !isLoading && tenants.length === 0 && units.length === 0;

  // [Task #675] 호실 결과 → unitNumber 검색 + 해당 호실 자동 펼침.
  function goToUnitById(unit: Unit) {
    const sp = new URLSearchParams();
    sp.set("search", unit.unitNumber);
    sp.set("focusId", String(unit.id));
    navigate(`/units?${sp.toString()}`);
  }

  // [Task #675] 입주자 결과 → 입주자가 속한 호실 번호로 호실관리 이동.
  //   tenant.unit 은 백엔드가 채워 주는 unitNumber. 비어 있으면 입주자 이름으로
  //   검색해 빈 결과를 피하고, 사용자가 추가 검색어를 입력해 좁힐 수 있게 한다.
  function goToUnitFromTenant(t: Tenant) {
    const sp = new URLSearchParams();
    if (t.unit) {
      sp.set("search", t.unit);
      sp.set("focusUnit", t.unit);
    } else {
      sp.set("search", t.tenantName);
    }
    navigate(`/units?${sp.toString()}`);
  }

  return (
    <Card data-testid="accountant-member-search">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Home className="w-4 h-4" />
          호실정보조회
        </CardTitle>
      </CardHeader>
      <CardContent className={enabled ? "space-y-3" : "pb-4"}>
        <div className="relative">
          <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            placeholder="동/호수, 입주자 이름 또는 연락처 일부"
            className="pl-8 h-9 text-sm"
            data-testid="member-search-input"
          />
        </div>

        {/* [Task #706] 검색어 미입력 시 회색 안내 문장을 제거해 빈 카드 세로 길이를
            헤더 + 검색 인풋만큼으로 줄였다. 로딩/빈 결과/결과 분기는 그대로 유지. */}
        {!enabled ? null : isLoading ? (
          <div className="space-y-2">
            {[1, 2].map((i) => (
              <Skeleton key={i} className="h-10 rounded-lg" />
            ))}
          </div>
        ) : isEmpty ? (
          <p className="text-xs text-muted-foreground py-2">
            "{query}" 와 일치하는 호실/입주자가 없습니다.
          </p>
        ) : (
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {units.length > 0 && (
              <div className="space-y-1">
                <p className="text-[10px] font-semibold text-muted-foreground px-1">
                  호실
                </p>
                {units.map((u) => (
                  <button
                    type="button"
                    key={`unit-${u.id}`}
                    onClick={() => goToUnitById(u)}
                    className="w-full flex items-center gap-2 p-2 rounded-lg border hover-elevate active-elevate-2 text-left"
                    data-testid={`member-search-unit-${u.id}`}
                  >
                    <Home className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">
                        {u.unitNumber}
                        {u.ownerName ? (
                          <span className="text-xs text-muted-foreground font-normal ml-1.5">
                            소유자 {u.ownerName}
                          </span>
                        ) : null}
                      </p>
                      <p className="text-[11px] text-muted-foreground truncate">
                        {u.floor}층 · {u.usage ?? "-"}
                      </p>
                    </div>
                    <Badge variant="outline" className="text-[10px] shrink-0">
                      {u.status === "occupied"
                        ? "사용중"
                        : u.status === "vacant"
                          ? "공실"
                          : "수리"}
                    </Badge>
                  </button>
                ))}
              </div>
            )}

            {tenants.length > 0 && (
              <div className="space-y-1">
                <p className="text-[10px] font-semibold text-muted-foreground px-1">
                  입주자(호실로 이동)
                </p>
                {tenants.map((t) => (
                  <button
                    type="button"
                    key={`tenant-${t.id}`}
                    onClick={() => goToUnitFromTenant(t)}
                    className="w-full flex items-center gap-2 p-2 rounded-lg border hover-elevate active-elevate-2 text-left"
                    data-testid={`member-search-tenant-${t.id}`}
                  >
                    <Users className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">
                        {t.tenantName}
                        <span className="text-xs text-muted-foreground font-normal ml-1.5">
                          {t.unit}
                        </span>
                      </p>
                      {t.phone && (
                        <p className="text-[11px] text-muted-foreground truncate">
                          {t.phone}
                        </p>
                      )}
                    </div>
                    <Badge variant="outline" className="text-[10px] shrink-0">
                      {t.status === "active"
                        ? "거주중"
                        : t.status === "moved_out"
                          ? "퇴거"
                          : "삭제"}
                    </Badge>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
