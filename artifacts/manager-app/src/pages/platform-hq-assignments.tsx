// [Task #596] platform_admin 전용 — 본부장(hq_executive) ↔ 건물 매핑 관리.
//
//   배경: 본부장은 더 이상 전 건물 가시성을 갖지 않으며, 매핑된 건물 묶음
//   안에서만 데이터를 본다(docs/user-roles SoT). 이 페이지는 그 매핑을 관리한다.
//
//   레이아웃:
//     - 좌: 본부장 목록(role=hq_executive). 한 명을 선택하면 우측 패널이 활성.
//     - 우: 전체 건물 체크리스트. 체크된 건물만 매핑으로 저장(set 동기화 PUT).
import { useEffect, useMemo, useState } from "react";
import { Loader2, ShieldCheck, Building2, Save, Search } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import { ROLE_LABELS } from "@workspace/shared/role-labels";

type HqUser = { id: number; name: string; email: string; approvalStatus: string | null };
type AdminAssignment = {
  id: number; hqUserId: number; hqUserName: string; hqUserEmail: string;
  buildingId: number; buildingName: string; addressFull: string | null;
  assignedByUserId: number | null; createdAt: string;
};
type BuildingRow = { id: number; name: string; addressFull?: string | null };

const BASE = import.meta.env.BASE_URL ?? "/";
const API_BASE = `${BASE}api`.replace(/\/+/g, "/");

function authHeaders(token: string | null): HeadersInit {
  const h: HeadersInit = { "Content-Type": "application/json" };
  if (token) (h as Record<string, string>).Authorization = `Bearer ${token}`;
  return h;
}

export default function PlatformHqAssignmentsPage() {
  const { token } = useAuth();
  const { toast } = useToast();
  const [hqUsers, setHqUsers] = useState<HqUser[]>([]);
  const [buildings, setBuildings] = useState<BuildingRow[]>([]);
  const [assignments, setAssignments] = useState<AdminAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedHqId, setSelectedHqId] = useState<number | null>(null);
  const [selectedBuildingIds, setSelectedBuildingIds] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState("");
  const [bSearch, setBSearch] = useState("");
  const [saving, setSaving] = useState(false);

  // 초기 로드: 본부장/건물/현재 매핑.
  useEffect(() => {
    if (!token) return;
    let aborted = false;
    (async () => {
      setLoading(true);
      try {
        const [hRes, bRes, aRes] = await Promise.all([
          fetch(`${API_BASE}/admin/hq-users`, { headers: authHeaders(token) }),
          fetch(`${API_BASE}/buildings/list`, { headers: authHeaders(token) }),
          fetch(`${API_BASE}/admin/hq-assignments`, { headers: authHeaders(token) }),
        ]);
        if (aborted) return;
        const hJson = hRes.ok ? await hRes.json() : { users: [] };
        const bJson = bRes.ok ? await bRes.json() : [];
        const aJson = aRes.ok ? await aRes.json() : { assignments: [] };
        setHqUsers(hJson.users ?? []);
        setBuildings(Array.isArray(bJson) ? bJson : (bJson.buildings ?? []));
        setAssignments(aJson.assignments ?? []);
      } catch {
        toast({ title: "데이터 로드 실패", variant: "destructive" });
      } finally {
        if (!aborted) setLoading(false);
      }
    })();
    return () => { aborted = true; };
  }, [token, toast]);

  // 선택된 본부장이 바뀌면 체크박스 상태를 현재 매핑으로 동기화.
  useEffect(() => {
    if (selectedHqId == null) { setSelectedBuildingIds(new Set()); return; }
    const ids = assignments
      .filter(a => a.hqUserId === selectedHqId)
      .map(a => a.buildingId);
    setSelectedBuildingIds(new Set(ids));
  }, [selectedHqId, assignments]);

  const filteredHq = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return hqUsers;
    return hqUsers.filter(u =>
      (u.name ?? "").toLowerCase().includes(q) ||
      (u.email ?? "").toLowerCase().includes(q)
    );
  }, [hqUsers, search]);

  const filteredBuildings = useMemo(() => {
    const q = bSearch.trim().toLowerCase();
    if (!q) return buildings;
    return buildings.filter(b =>
      (b.name ?? "").toLowerCase().includes(q) ||
      (b.addressFull ?? "").toLowerCase().includes(q)
    );
  }, [buildings, bSearch]);

  const assignedCountByHq = useMemo(() => {
    const m = new Map<number, number>();
    for (const a of assignments) m.set(a.hqUserId, (m.get(a.hqUserId) ?? 0) + 1);
    return m;
  }, [assignments]);

  function toggleBuilding(id: number, on: boolean) {
    setSelectedBuildingIds(prev => {
      const next = new Set(prev);
      if (on) next.add(id); else next.delete(id);
      return next;
    });
  }

  async function save() {
    if (selectedHqId == null) return;
    setSaving(true);
    try {
      const body = JSON.stringify({ buildingIds: Array.from(selectedBuildingIds) });
      const res = await fetch(`${API_BASE}/admin/hq-assignments/by-user/${selectedHqId}`, {
        method: "PUT",
        headers: authHeaders(token),
        body,
      });
      if (!res.ok) throw new Error(String(res.status));
      const reloaded = await fetch(`${API_BASE}/admin/hq-assignments`, { headers: authHeaders(token) });
      const json = reloaded.ok ? await reloaded.json() : { assignments: [] };
      setAssignments(json.assignments ?? []);
      toast({ title: "저장됨", description: `관할 건물 ${selectedBuildingIds.size}건이 저장되었습니다.` });
    } catch {
      toast({ title: "저장 실패", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> 불러오는 중…
      </div>
    );
  }

  const selectedHq = selectedHqId != null ? hqUsers.find(u => u.id === selectedHqId) : null;

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-4">
      <div className="flex items-start gap-3">
        <ShieldCheck className="w-6 h-6 text-indigo-600 mt-1 shrink-0" />
        <div>
          <h1 className="text-xl font-semibold">{ROLE_LABELS.hq_executive} 관할 건물 관리</h1>
          <p className="text-sm text-muted-foreground mt-1">
            본부장은 여기서 할당된 건물 묶음 안에서만 데이터를 볼 수 있습니다.
            플랫폼 관리자만 매핑을 변경할 수 있습니다.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldCheck className="w-4 h-4" /> 본부장 선택
              <Badge variant="outline" className="ml-auto">{hqUsers.length}명</Badge>
            </CardTitle>
            <div className="relative mt-2">
              <Search className="w-4 h-4 absolute left-2 top-2.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="이름·이메일 검색"
                className="pl-8 h-9"
              />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {filteredHq.length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground text-center">
                등록된 본부장이 없습니다
              </div>
            ) : (
              <ul className="divide-y max-h-[420px] overflow-y-auto">
                {filteredHq.map(u => {
                  const count = assignedCountByHq.get(u.id) ?? 0;
                  const active = selectedHqId === u.id;
                  return (
                    <li key={u.id}>
                      <button
                        onClick={() => setSelectedHqId(u.id)}
                        className={`w-full text-left px-4 py-3 hover:bg-muted/40 ${active ? "bg-indigo-50" : ""}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{u.name || u.email}</p>
                            <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                          </div>
                          <Badge variant={count > 0 ? "default" : "outline"} className="shrink-0">
                            {count}건
                          </Badge>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="w-4 h-4" /> 관할 건물
              {selectedHq && (
                <span className="text-xs text-muted-foreground font-normal ml-1">
                  — {selectedHq.name || selectedHq.email}
                </span>
              )}
              <Badge variant="outline" className="ml-auto">선택 {selectedBuildingIds.size}건</Badge>
            </CardTitle>
            <div className="relative mt-2">
              <Search className="w-4 h-4 absolute left-2 top-2.5 text-muted-foreground" />
              <Input
                value={bSearch}
                onChange={(e) => setBSearch(e.target.value)}
                placeholder="건물명·주소 검색"
                className="pl-8 h-9"
                disabled={selectedHqId == null}
              />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {selectedHqId == null ? (
              <div className="p-6 text-sm text-muted-foreground text-center">
                좌측에서 본부장을 먼저 선택하세요
              </div>
            ) : filteredBuildings.length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground text-center">
                등록된 건물이 없습니다
              </div>
            ) : (
              <ul className="divide-y max-h-[420px] overflow-y-auto">
                {filteredBuildings.map(b => {
                  const checked = selectedBuildingIds.has(b.id);
                  return (
                    <li key={b.id} className="px-4 py-3 hover:bg-muted/40 flex items-start gap-3">
                      <Checkbox
                        id={`b-${b.id}`}
                        checked={checked}
                        onCheckedChange={(v) => toggleBuilding(b.id, !!v)}
                      />
                      <label htmlFor={`b-${b.id}`} className="min-w-0 cursor-pointer flex-1">
                        <p className="text-sm font-medium truncate">{b.name}</p>
                        {b.addressFull ? (
                          <p className="text-xs text-muted-foreground truncate">{b.addressFull}</p>
                        ) : null}
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
          {selectedHqId != null ? (
            <div className="px-4 pb-4 pt-2 flex justify-end">
              <Button onClick={save} disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <Save className="w-4 h-4 mr-1.5" />}
                저장
              </Button>
            </div>
          ) : null}
        </Card>
      </div>
    </div>
  );
}
