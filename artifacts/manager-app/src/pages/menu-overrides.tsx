import { Fragment, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/auth-context";
import { ROUTES, ROLE_LABELS, GROUP_TITLES, type Role, type Group } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Loader2, RotateCcw, Save } from "lucide-react";
import { refreshMenuOverridesCache } from "@/hooks/use-menu-overrides";

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "/api";

const TARGET_ROLES: Role[] = ["manager", "accountant", "facility_staff", "hq_executive", "partner"];

type Override = { role: string; blockId: string; enabled: boolean };

interface BlockRow {
  blockId: string;
  label: string;
  group: Group;
  eligibleRoles: Set<Role>;
}

function buildBlocks(): BlockRow[] {
  const rows: BlockRow[] = [];
  for (const r of ROUTES) {
    const eligible = TARGET_ROLES.filter((role) => r.access.includes(role));
    if (eligible.length === 0) continue;
    rows.push({
      blockId: r.path,
      label: r.label,
      group: r.group,
      eligibleRoles: new Set(eligible),
    });
  }
  return rows;
}

export default function MenuOverridesPage() {
  const { token, user } = useAuth();
  const isPlatformAdmin = user?.role === "platform_admin";
  const blocks = useMemo(buildBlocks, []);
  const grouped = useMemo(() => {
    const map = new Map<Group, BlockRow[]>();
    for (const b of blocks) {
      const arr = map.get(b.group) ?? [];
      arr.push(b);
      map.set(b.group, arr);
    }
    return map;
  }, [blocks]);

  const [overrides, setOverrides] = useState<Map<string, boolean>>(new Map());
  const [original, setOriginal] = useState<Map<string, boolean>>(new Map());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [info, setInfo] = useState("");
  const [error, setError] = useState("");

  function key(role: string, blockId: string) {
    return `${role}::${blockId}`;
  }

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/platform/menu-overrides`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("불러오기 실패");
      const list = (await res.json()) as Override[];
      const map = new Map<string, boolean>();
      for (const o of list) map.set(key(o.role, o.blockId), o.enabled);
      setOverrides(new Map(map));
      setOriginal(new Map(map));
    } catch (e) {
      setError(e instanceof Error ? e.message : "오류");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function isEnabled(role: Role, blockId: string): boolean {
    const v = overrides.get(key(role, blockId));
    return v === undefined ? true : v;
  }
  function toggle(role: Role, blockId: string) {
    const k = key(role, blockId);
    const next = new Map(overrides);
    const cur = next.get(k);
    if (cur === undefined) {
      next.set(k, false);
    } else if (cur === false) {
      next.delete(k);
    } else {
      next.set(k, false);
    }
    setOverrides(next);
  }
  function toggleGroup(role: Role, blocksInGroup: BlockRow[], turnOn: boolean) {
    const next = new Map(overrides);
    for (const b of blocksInGroup) {
      if (!b.eligibleRoles.has(role)) continue;
      const k = key(role, b.blockId);
      if (turnOn) next.delete(k);
      else next.set(k, false);
    }
    setOverrides(next);
  }

  const dirty = useMemo(() => {
    if (overrides.size !== original.size) return true;
    for (const [k, v] of overrides) if (original.get(k) !== v) return true;
    return false;
  }, [overrides, original]);

  async function save() {
    setSaving(true);
    setError("");
    setInfo("");
    try {
      // 모든 셀에 대해 현재 상태(체크 → enabled true, 미체크 → enabled false) 전송.
      const payload: Override[] = [];
      for (const b of blocks) {
        for (const role of TARGET_ROLES) {
          if (!b.eligibleRoles.has(role)) continue;
          payload.push({ role, blockId: b.blockId, enabled: isEnabled(role, b.blockId) });
        }
      }
      const res = await fetch(`${API_BASE}/platform/menu-overrides`, {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ overrides: payload }),
      });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(t || "저장 실패");
      }
      const list = (await res.json()) as Override[];
      const map = new Map<string, boolean>();
      for (const o of list) map.set(key(o.role, o.blockId), o.enabled);
      setOverrides(new Map(map));
      setOriginal(new Map(map));
      refreshMenuOverridesCache(list);
      setInfo("저장됐습니다. 사이드바·하단 네비에 즉시 반영됩니다.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "오류");
    } finally {
      setSaving(false);
    }
  }
  async function resetAll() {
    if (!confirm("모든 오버라이드를 삭제하고 기본값(전체 활성)으로 복원합니다.")) return;
    setSaving(true);
    setError("");
    setInfo("");
    try {
      const res = await fetch(`${API_BASE}/platform/menu-overrides`, {
        method: "DELETE",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("초기화 실패");
      setOverrides(new Map());
      setOriginal(new Map());
      refreshMenuOverridesCache([]);
      setInfo("기본값으로 복원됐습니다.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "오류");
    } finally {
      setSaving(false);
    }
  }

  if (!isPlatformAdmin) {
    return (
      <div className="p-6">
        <div className="text-sm text-slate-600">플랫폼만 접근할 수 있습니다.</div>
      </div>
    );
  }
  if (loading) {
    return (
      <div className="p-6 flex items-center gap-2 text-slate-500">
        <Loader2 className="w-4 h-4 animate-spin" /> 불러오는 중…
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-7xl">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-semibold">유저유형별 메뉴 활성화</h1>
          <p className="text-xs text-slate-500 mt-1">
            행 = 메뉴, 열 = 역할. 체크 해제 시 그 역할 사용자의 사이드바·하단 네비·대시보드에서 숨겨집니다.
            "—" 는 해당 역할에 권한이 없는 메뉴입니다.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={resetAll} disabled={saving}>
            <RotateCcw className="w-4 h-4 mr-1" /> 기본값으로 복원
          </Button>
          <Button size="sm" onClick={save} disabled={saving || !dirty}>
            {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
            저장
          </Button>
        </div>
      </div>
      {error && <div className="text-sm text-red-600">{error}</div>}
      {info && <div className="text-sm text-emerald-600">{info}</div>}

      <div className="border rounded-lg overflow-x-auto bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b text-xs">
            <tr>
              <th className="text-left p-2 font-medium w-72">메뉴</th>
              {TARGET_ROLES.map((r) => (
                <th key={r} className="text-center p-2 font-medium whitespace-nowrap">
                  {ROLE_LABELS[r]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from(grouped.entries()).map(([group, blocksInGroup]) => (
              <Fragment key={`g-${group}`}>
                <tr className="bg-slate-100/60">
                  <td className="px-2 py-1 font-medium text-xs text-slate-700">{GROUP_TITLES[group]}</td>
                  {TARGET_ROLES.map((r) => {
                    const eligibleCount = blocksInGroup.filter((b) => b.eligibleRoles.has(r)).length;
                    if (eligibleCount === 0) return <td key={r} className="text-center text-slate-300">—</td>;
                    const allOn = blocksInGroup
                      .filter((b) => b.eligibleRoles.has(r))
                      .every((b) => isEnabled(r, b.blockId));
                    return (
                      <td key={r} className="text-center">
                        <button
                          className="text-[10px] text-slate-500 hover:text-slate-800 underline"
                          onClick={() => toggleGroup(r, blocksInGroup, !allOn)}
                          type="button"
                        >
                          {allOn ? "그룹 끄기" : "그룹 켜기"}
                        </button>
                      </td>
                    );
                  })}
                </tr>
                {blocksInGroup.map((b) => (
                  <tr key={b.blockId} className="border-t hover:bg-slate-50">
                    <td className="p-2">
                      <div className="font-medium">{b.label}</div>
                      <div className="text-[10px] text-slate-400">{b.blockId}</div>
                    </td>
                    {TARGET_ROLES.map((r) => {
                      if (!b.eligibleRoles.has(r)) {
                        return <td key={r} className="text-center text-slate-300">—</td>;
                      }
                      const on = isEnabled(r, b.blockId);
                      return (
                        <td key={r} className="text-center">
                          <input
                            type="checkbox"
                            checked={on}
                            onChange={() => toggle(r, b.blockId)}
                            className="w-4 h-4 cursor-pointer accent-blue-600"
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
