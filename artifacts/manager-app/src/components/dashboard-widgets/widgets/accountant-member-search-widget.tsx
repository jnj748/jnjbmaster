// [Task #660] 경리 대시보드 — 회원정보조회 위젯.
//
// 카드 내부에 검색 인풋을 두고, 200ms 디바운스 후 기존 세대/입주자 조회
// 엔드포인트(useListUnits / useListTenants)로 검색해 상위 결과를 카드 안
// 리스트로 보여준다. 결과 행 클릭 시 해당 세대/입주자 페이지로 이동한다.
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

  return (
    <Card data-testid="accountant-member-search">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Users className="w-4 h-4" />
          회원정보조회
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            placeholder="동/호수, 이름, 연락처 일부 입력"
            className="pl-8 h-9 text-sm"
            data-testid="member-search-input"
          />
        </div>

        {!enabled ? (
          <p className="text-xs text-muted-foreground py-2">
            동/호수, 입주자 이름 또는 연락처 일부를 입력하면 결과가 바로 보여집니다.
          </p>
        ) : isLoading ? (
          <div className="space-y-2">
            {[1, 2].map((i) => (
              <Skeleton key={i} className="h-10 rounded-lg" />
            ))}
          </div>
        ) : isEmpty ? (
          <p className="text-xs text-muted-foreground py-2">
            "{query}" 와 일치하는 세대/입주자가 없습니다.
          </p>
        ) : (
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {tenants.length > 0 && (
              <div className="space-y-1">
                <p className="text-[10px] font-semibold text-muted-foreground px-1">
                  입주자
                </p>
                {tenants.map((t) => (
                  <button
                    type="button"
                    key={`tenant-${t.id}`}
                    onClick={() => navigate(`/tenants?focus=${t.id}`)}
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

            {units.length > 0 && (
              <div className="space-y-1">
                <p className="text-[10px] font-semibold text-muted-foreground px-1">
                  세대(호실)
                </p>
                {units.map((u) => (
                  <button
                    type="button"
                    key={`unit-${u.id}`}
                    onClick={() => navigate(`/units?focus=${u.id}`)}
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
          </div>
        )}
      </CardContent>
    </Card>
  );
}
