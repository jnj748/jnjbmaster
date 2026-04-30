// [Task #708] 업무기록(QuickEntry / 타임라인 수정 다이얼로그) 메모 입력 중
// 호실 칩 미리보기 + 수동 추가/제거.
//
// 흐름:
//   1) 메모 텍스트가 바뀌면 250ms 디바운스 후 lib/shared 의 결정적 파서를 돌려
//      자동 매칭된 호실(auto) 을 칩으로 미리 보여 준다.
//   2) 사용자는 칩에서 X 를 눌러 자동 매칭을 빼거나(수동 제거 = excludedAutoIds),
//      검색창에서 호실을 골라 추가(manualIds) 할 수 있다.
//   3) 부모는 onChange 로 최종 unitIds = (autoIds - excluded) ∪ manualIds 를 받아
//      POST/PATCH /work-logs 의 unitIds 배열로 보낸다. 서버는 이 배열을 "사용자
//      검토 완료" 권위적 집합으로 취급하므로, 사용자가 X 로 뺀 호실은 자동 매칭
//      이라도 다시 끼워 넣지 않는다.
//
// 편집 모드:
//   - `initialUnitIds` 가 주어지면(타임라인 수정) 다이얼로그가 열릴 때 그 값이
//     현재 링크 상태로 seed 된다. 즉 메모 파서로는 auto 였지만 사용자가 이전에
//     제거해 둔 호실은 다시 켜지지 않고, 메모와 무관하게 manual 로 추가돼 있던
//     호실은 manual 칩으로 보존된다.
//
// 디자인 메모:
//   - 빌딩 호실 목록은 useListUnits 로 한 번 받아 메모리에서 매칭한다.
//     스토리지에 호실 수가 수천 단위로 늘어나면 가벼운 검색 인덱스로 바꾸자.
//   - false-positive 방지가 우선이므로 다동 빌딩에서 동 정보가 없는 모호한
//     "101호" 는 자동 매칭에 포함되지 않는다. 사용자는 검색창에서 직접 추가.

import { useEffect, useMemo, useState } from "react";
import { X, Plus, Search, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useListUnits, type Unit } from "@workspace/api-client-react";
import {
  matchUnitsInMemo,
  extractUnitTokens,
} from "@workspace/shared/unit-parser";
import { useAuth } from "@/contexts/auth-context";

interface Props {
  memo: string;
  /**
   * 부모가 받을 최종 호실 id 배열과 "권위적 전송 가능 여부".
   *  - `ready=true` 면 단위 목록도 로드됐고 디바운스도 끝나, 칩 UI 가 사용자에게
   *    의미 있게 보여진 상태다. 부모는 서버에 `unitIdsMode: "authoritative"`
   *    로 보내도 안전.
   *  - `ready=false` 면 호실 목록이 아직 로드 중이거나 사용자가 입력 중인
   *    debounce 사이라 칩 표시가 일시적이다. 부모는 권위적 모드를 끄고 서버
   *    auto 매칭에 맡겨야 한다.
   */
  onChange: (unitIds: number[], ready: boolean) => void;
  /**
   * 편집 모드에서 다이얼로그가 열릴 때 사전 채울 호실 id 목록. 한 번만 시드되며
   * 이후엔 사용자 조작으로 갱신된다. 식별자(`initialKey`) 가 바뀌면 재시드된다.
   */
  initialUnitIds?: number[];
  /** initialUnitIds 재시드 트리거(보통 entry.id). */
  initialKey?: string | number;
}

function unitLabel(u: Pick<Unit, "dong" | "unitNumber">): string {
  return u.dong ? `${u.dong}동 ${u.unitNumber}호` : `${u.unitNumber}호`;
}

/** [Task #713] 서버 추천 응답 타입. */
interface SuggestedCandidate {
  unitId: number;
  dong: string;
  unitNumber: string;
  score: number;
  reasons: string[];
}
interface AmbiguousSuggestion {
  unitNumberRaw: string;
  candidates: SuggestedCandidate[];
}

export function UnitChipPicker({ memo, onChange, initialUnitIds, initialKey }: Props) {
  const { token } = useAuth();
  // 빌딩 호실 — useListUnits 는 현재 사용자 빌딩 스코프로 알아서 필터됨.
  const { data: units } = useListUnits(undefined, {
    query: { staleTime: 60 * 1000 },
  }) as { data: Unit[] | undefined };

  // 디바운스된 메모. memo === debouncedMemo 일 때만 사용자 검토가 끝났다고 본다.
  const [debouncedMemo, setDebouncedMemo] = useState(memo);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedMemo(memo), 250);
    return () => clearTimeout(t);
  }, [memo]);
  const debounceSettled = memo === debouncedMemo;

  // 자동 매칭 ids — 호실/메모 변할 때마다 재계산.
  const autoIds = useMemo(() => {
    if (!units || units.length === 0) return [] as number[];
    return matchUnitsInMemo(
      debouncedMemo,
      units.map((u) => ({ id: u.id, dong: u.dong ?? "", unitNumber: u.unitNumber })),
    );
  }, [debouncedMemo, units]);

  const [excludedAutoIds, setExcludedAutoIds] = useState<Set<number>>(new Set());
  const [manualIds, setManualIds] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState("");
  // initialKey 가 바뀔 때만(=다이얼로그가 다른 entry 로 다시 열릴 때만) 시드.
  // 같은 entry 편집 중 메모 자동 매칭이 늘어났다고 해서 다시 시드하면 사용자
  // 편집이 사라져 버린다.
  const [seededFor, setSeededFor] = useState<string | number | undefined>(undefined);

  // 편집 모드 시드: initialUnitIds 와 현재 autoIds 를 비교해
  // manual = initialUnitIds - autoIds, excluded = autoIds - initialUnitIds 로 분리.
  // units 가 로드되기 전엔 autoIds 가 비어 있을 수 있어 한 번 더 보정.
  useEffect(() => {
    if (initialKey === undefined || initialUnitIds === undefined) return;
    if (seededFor === initialKey) return;
    if (!units || units.length === 0) return; // autoIds 가 의미를 가질 때까지 대기.
    const initialSet = new Set(initialUnitIds);
    const autoSet = new Set(autoIds);
    const nextManual = new Set<number>();
    for (const id of initialSet) if (!autoSet.has(id)) nextManual.add(id);
    const nextExcluded = new Set<number>();
    for (const id of autoSet) if (!initialSet.has(id)) nextExcluded.add(id);
    setManualIds(nextManual);
    setExcludedAutoIds(nextExcluded);
    setSeededFor(initialKey);
  }, [initialKey, initialUnitIds, autoIds, units, seededFor]);

  // 메모를 바꿔서 더 이상 자동 매칭에 포함되지 않게 된 id 는 excluded 에서도 자동 정리.
  useEffect(() => {
    setExcludedAutoIds((prev) => {
      const next = new Set<number>();
      for (const id of prev) if (autoIds.includes(id)) next.add(id);
      return next.size === prev.size ? prev : next;
    });
  }, [autoIds]);

  // [Task #713] 모호 호실 추천.
  //  - 메모에 동(棟) 정보 없이 호수만 적혀 있고, 같은 호번이 빌딩 내 여러 동에
  //    존재해 자동 매칭이 건너뛴 경우 서버에 추천 후보를 묻는다.
  //  - 응답은 회색 칩(추천: ㅇ동 ㅇ호) 으로 표시되고, 사용자가 탭하면 manual 로
  //    링크된다(=수동 추가).
  //  - 메모 디바운스가 끝났을 때만 호출 → 입력 중 매번 호출되는 것을 방지.
  //  - 클라이언트는 빌딩 내 호실 목록 캐시(useListUnits) 가 항상 최신이라고
  //    단정할 수 없으므로(staleTime/새 호실 임포트 직후 등), 모호 판정은 서버에
  //    맡긴다. 호출 게이트는 "메모에 동 미명시 토큰이 1개라도 있는가" 만 본다.
  const noDongTokenKey = useMemo(() => {
    const tokens = extractUnitTokens(debouncedMemo);
    const noDong = tokens
      .filter((t) => t.dongRaw === null)
      .map((t) => t.unitNumberRaw)
      .sort();
    return noDong.length > 0 ? noDong.join(",") : "";
  }, [debouncedMemo]);

  const [suggestions, setSuggestions] = useState<AmbiguousSuggestion[]>([]);
  // [Task #713] 사용자가 X 로 닫은 추천 unit id — 같은 메모로 다시 추천이 와도
  // 잡음을 만들지 않도록 세션 동안 유지한다(다이얼로그 닫고 다시 열면 초기화).
  const [dismissedSuggestionIds, setDismissedSuggestionIds] = useState<Set<number>>(
    new Set(),
  );
  useEffect(() => {
    if (!noDongTokenKey) {
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    const BASE = import.meta.env.BASE_URL ?? "/";
    const apiBase = `${BASE}api`.replace(/\/+/g, "/");
    (async () => {
      try {
        const res = await fetch(`${apiBase}/work-logs/unit-suggestions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ memo: debouncedMemo }),
        });
        if (!res.ok) {
          if (!cancelled) setSuggestions([]);
          return;
        }
        const data = (await res.json()) as { suggestions?: AmbiguousSuggestion[] };
        if (!cancelled) setSuggestions(data.suggestions ?? []);
      } catch {
        if (!cancelled) setSuggestions([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [noDongTokenKey, debouncedMemo, token]);

  // 부모 통지 — 합집합 + 권위적 전송 가능 여부(ready). 호실 목록이 로드되고
  // 디바운스도 끝났고(현재 입력 중 X) 편집 모드라면 시드도 완료된 상태여야
  // ready=true. ready=false 일 때 부모는 unitIdsMode 권위적 모드를 끄고 서버
  // auto 매칭으로 넘기도록 한다 — 이렇게 하지 않으면 사용자가 메모를 입력
  // 중인 짧은 순간(=빠른 제출 경합)에 빈 unitIds 가 권위적으로 전송돼 자동
  // 매칭이 사라진다.
  const seedingRequired = initialKey !== undefined && initialUnitIds !== undefined;
  const seedingDone = !seedingRequired || seededFor === initialKey;
  const ready =
    !!units && debounceSettled && seedingDone;
  useEffect(() => {
    const finalSet = new Set<number>();
    for (const id of autoIds) if (!excludedAutoIds.has(id)) finalSet.add(id);
    for (const id of manualIds) finalSet.add(id);
    onChange(Array.from(finalSet), ready);
    // onChange 는 부모에서 매 렌더 새 함수가 될 수 있어 의존성에서 의도적으로 제외.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoIds, excludedAutoIds, manualIds, ready]);

  const unitsById = useMemo(() => {
    const m = new Map<number, Unit>();
    for (const u of units ?? []) m.set(u.id, u);
    return m;
  }, [units]);

  const activeAutoIds = autoIds.filter((id) => !excludedAutoIds.has(id));
  const activeManualIds = Array.from(manualIds);

  // [Task #713] 화면에 그릴 추천 칩 — 이미 링크된 호실/사용자가 X 로 스킵한
  // 호실(dismissedSuggestionIds) 은 제외하고, 점수 순으로 토큰당 1~3개만 보여 준다.
  const visibleSuggestions = useMemo(() => {
    return suggestions
      .map((s) => ({
        unitNumberRaw: s.unitNumberRaw,
        candidates: s.candidates.filter(
          (c) =>
            !manualIds.has(c.unitId) &&
            !autoIds.includes(c.unitId) &&
            !dismissedSuggestionIds.has(c.unitId),
        ),
      }))
      .filter((s) => s.candidates.length > 0);
  }, [suggestions, manualIds, autoIds, dismissedSuggestionIds]);

  const searchResults = useMemo(() => {
    if (!search.trim() || !units) return [] as Unit[];
    const q = search.trim().toLowerCase();
    return units
      .filter((u) => {
        if (manualIds.has(u.id) || autoIds.includes(u.id)) return false;
        const label = unitLabel(u).toLowerCase();
        return label.includes(q) || u.unitNumber.toLowerCase().includes(q);
      })
      .slice(0, 8);
  }, [search, units, manualIds, autoIds]);

  if (!units || units.length === 0) return null;
  if (
    activeAutoIds.length === 0 &&
    activeManualIds.length === 0 &&
    visibleSuggestions.length === 0 &&
    !search
  ) {
    // 칩이 하나도 없으면 검색창만 작게 — 화면 잡음 최소화.
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground" data-testid="unit-chip-picker-empty">
        <Search className="w-3.5 h-3.5" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="관련 호실 추가 (예: 101호)"
          className="bg-transparent outline-none flex-1"
          data-testid="unit-chip-picker-search"
        />
      </div>
    );
  }

  return (
    <div className="space-y-2" data-testid="unit-chip-picker">
      <div className="flex flex-wrap gap-1.5">
        {activeAutoIds.map((id) => {
          const u = unitsById.get(id);
          if (!u) return null;
          return (
            <Badge
              key={`auto-${id}`}
              variant="secondary"
              className="gap-1 bg-emerald-100 text-emerald-700 hover:bg-emerald-100"
              data-testid={`unit-chip-auto-${id}`}
            >
              {unitLabel(u)}
              <button
                type="button"
                onClick={() =>
                  setExcludedAutoIds((prev) => {
                    const next = new Set(prev);
                    next.add(id);
                    return next;
                  })
                }
                className="hover:text-emerald-900"
                aria-label="자동 매칭 제거"
              >
                <X className="w-3 h-3" />
              </button>
            </Badge>
          );
        })}
        {activeManualIds.map((id) => {
          const u = unitsById.get(id);
          if (!u) return null;
          return (
            <Badge
              key={`manual-${id}`}
              variant="secondary"
              className="gap-1 bg-sky-100 text-sky-700 hover:bg-sky-100"
              data-testid={`unit-chip-manual-${id}`}
            >
              {unitLabel(u)}
              <button
                type="button"
                onClick={() =>
                  setManualIds((prev) => {
                    const next = new Set(prev);
                    next.delete(id);
                    return next;
                  })
                }
                className="hover:text-sky-900"
                aria-label="호실 제거"
              >
                <X className="w-3 h-3" />
              </button>
            </Badge>
          );
        })}
        {/* [Task #713] 모호 호실 추천 칩 — 회색. 탭하면 manual 로 추가, X 면 dismiss. */}
        {visibleSuggestions.map((s) =>
          s.candidates.map((c) => {
            const reason = c.reasons[0];
            return (
              <Badge
                key={`suggest-${s.unitNumberRaw}-${c.unitId}`}
                variant="secondary"
                className="gap-1 bg-muted text-muted-foreground hover:bg-muted/80 border border-dashed border-muted-foreground/30"
                data-testid={`unit-chip-suggestion-${c.unitId}`}
                title={reason ? `추천 근거: ${reason}` : "추천 호실"}
              >
                <Sparkles className="w-3 h-3" />
                <button
                  type="button"
                  onClick={() => {
                    setManualIds((prev) => {
                      const next = new Set(prev);
                      next.add(c.unitId);
                      return next;
                    });
                  }}
                  className="font-medium"
                  data-testid={`unit-chip-suggestion-accept-${c.unitId}`}
                  aria-label={`${c.dong ? `${c.dong}동 ` : ""}${c.unitNumber}호 로 연결`}
                >
                  {c.dong ? `${c.dong}동 ${c.unitNumber}호` : `${c.unitNumber}호`}
                  <span className="ml-1 text-[10px] opacity-70">추천</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setDismissedSuggestionIds((prev) => {
                      const next = new Set(prev);
                      next.add(c.unitId);
                      return next;
                    })
                  }
                  className="hover:text-foreground"
                  aria-label="추천 닫기"
                  data-testid={`unit-chip-suggestion-dismiss-${c.unitId}`}
                >
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            );
          }),
        )}
      </div>
      <div className="relative">
        <div className="flex items-center gap-2 border rounded px-2 py-1">
          <Plus className="w-3.5 h-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="관련 호실 추가 (예: 101호)"
            className="h-7 border-0 px-0 focus-visible:ring-0 text-sm"
            data-testid="unit-chip-picker-search"
          />
        </div>
        {searchResults.length > 0 && (
          <div className="absolute z-10 mt-1 w-full bg-popover border rounded shadow-sm max-h-48 overflow-auto">
            {searchResults.map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => {
                  setManualIds((prev) => {
                    const next = new Set(prev);
                    next.add(u.id);
                    return next;
                  });
                  setSearch("");
                }}
                className="w-full text-left px-2 py-1.5 text-sm hover:bg-accent"
                data-testid={`unit-chip-picker-option-${u.id}`}
              >
                {unitLabel(u)}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
