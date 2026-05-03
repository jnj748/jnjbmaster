// [Task #776] 예산·집행통제 엔진 v01 — 편성·집행률·의결 버전 관리 화면.
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/auth-context";
import { useBuilding } from "@/contexts/building-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, CheckCircle2, Sparkles, Wand2, Save, Vote } from "lucide-react";

const CATEGORIES = [
  { key: "electricity", label: "전기" },
  { key: "water", label: "수도" },
  { key: "elevator", label: "승강기" },
  { key: "cleaning", label: "청소" },
  { key: "security", label: "경비" },
  { key: "insurance", label: "보험" },
  { key: "long_term_repair", label: "수선적립금" },
  { key: "other", label: "기타" },
] as const;
type CategoryKey = (typeof CATEGORIES)[number]["key"];

type Matrix = Record<CategoryKey, number[]>;

type BudgetVersion = {
  id: number;
  versionNo: number;
  note: string | null;
  sourceType: string | null;
  sourceId: number | null;
  approvedAt: string | null;
  approvedByName: string | null;
};

type Budget = {
  id: number;
  buildingId: number;
  year: number;
  activeVersionId: number | null;
};

type Resp = {
  buildingId: number;
  year: number;
  budget: Budget | null;
  activeVersion: BudgetVersion | null;
  versions: BudgetVersion[];
  budgetMatrix: Matrix;
  execMatrix: Matrix;
  suggested: Matrix;
};

function emptyMatrix(): Matrix {
  return Object.fromEntries(CATEGORIES.map((c) => [c.key, Array(12).fill(0)])) as Matrix;
}

function fmt(n: number): string {
  return Math.round(n).toLocaleString();
}

export default function BudgetsPage() {
  const { token } = useAuth();
  const { building } = useBuilding();
  const { toast } = useToast();
  const BASE = import.meta.env.BASE_URL ?? "/";
  const apiBase = `${BASE}api`.replace(/\/+/g, "/");

  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [data, setData] = useState<Resp | null>(null);
  const [matrix, setMatrix] = useState<Matrix>(emptyMatrix());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [versionNote, setVersionNote] = useState("");

  const buildingId = building?.id ?? null;

  async function load() {
    if (!token || !buildingId) return;
    setLoading(true);
    try {
      const r = await fetch(`${apiBase}/budgets?buildingId=${buildingId}&year=${year}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) throw new Error("예산을 불러오지 못했습니다");
      const j: Resp = await r.json();
      setData(j);
      setMatrix(j.budgetMatrix as Matrix);
    } catch (e) {
      toast({ title: "오류", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [token, buildingId, year]);

  const totals = useMemo(() => {
    const annual: Record<CategoryKey, number> = {} as Record<CategoryKey, number>;
    let grand = 0;
    for (const c of CATEGORIES) {
      const sum = matrix[c.key].reduce((s, v) => s + (Number(v) || 0), 0);
      annual[c.key] = sum;
      grand += sum;
    }
    return { annual, grand };
  }, [matrix]);

  const execTotals = useMemo(() => {
    const annual: Record<CategoryKey, number> = {} as Record<CategoryKey, number>;
    if (!data) return annual;
    for (const c of CATEGORIES) {
      annual[c.key] = (data.execMatrix[c.key] ?? []).reduce((s, v) => s + (Number(v) || 0), 0);
    }
    return annual;
  }, [data]);

  function setCell(cat: CategoryKey, monthIdx: number, value: number) {
    setMatrix((m) => {
      const next: Matrix = { ...m, [cat]: [...m[cat]] } as Matrix;
      next[cat][monthIdx] = Math.max(0, Math.round(value));
      return next;
    });
  }

  function applySuggested() {
    if (!data) return;
    setMatrix(data.suggested as Matrix);
    toast({ title: "AI 추천 적용", description: "최근 청구서 기준 월평균을 채웠습니다. 검토 후 저장하세요." });
  }

  async function save() {
    if (!token || !buildingId) return;
    setSaving(true);
    try {
      let budgetId = data?.budget?.id;
      if (!budgetId) {
        const r = await fetch(`${apiBase}/budgets`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ buildingId, year, lines: matrix }),
        });
        if (!r.ok) throw new Error("초안 생성 실패");
        const j = await r.json();
        budgetId = j.budget.id;
      } else {
        const r = await fetch(`${apiBase}/budgets/${budgetId}/lines`, {
          method: "PUT",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ lines: matrix }),
        });
        if (!r.ok) throw new Error("저장 실패");
      }
      toast({ title: "저장 완료", description: `${year}년 예산이 저장되었습니다.` });
      await load();
    } catch (e) {
      toast({ title: "오류", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function createNewVersion() {
    if (!token || !data?.budget) return;
    setSaving(true);
    try {
      const r = await fetch(`${apiBase}/budgets/${data.budget.id}/versions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ lines: matrix, note: versionNote || "관리단 의결", sourceType: "vote" }),
      });
      if (!r.ok) throw new Error("새 버전 생성 실패");
      toast({ title: "새 버전 생성됨", description: "관리단장/본부장이 의결 승인하면 활성 전환됩니다." });
      setVersionNote("");
      await load();
    } catch (e) {
      toast({ title: "오류", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function approveVersion(vid: number) {
    if (!token || !data?.budget) return;
    setSaving(true);
    try {
      const r = await fetch(`${apiBase}/budgets/${data.budget.id}/versions/${vid}/approve`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!r.ok) throw new Error("승인 실패");
      toast({ title: "활성 전환", description: "이번 버전이 적용 예산입니다." });
      await load();
    } catch (e) {
      toast({ title: "오류", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  if (!buildingId) {
    return <div className="container max-w-6xl py-10 text-center text-muted-foreground">건물을 먼저 선택하세요.</div>;
  }
  if (loading) {
    return <div className="container max-w-6xl py-10 text-center text-muted-foreground">불러오는 중...</div>;
  }
  if (!data) return null;

  return (
    <div className="container max-w-6xl py-6 space-y-5 pb-24">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold mb-1">예산·집행통제</h1>
          <p className="text-sm text-muted-foreground">
            {building?.name ?? "본 건물"} · {year}년 · 항목 × 월 매트릭스
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor="y" className="text-sm">연도</Label>
          <Input
            id="y"
            type="number"
            value={year}
            onChange={(e) => setYear(Number(e.target.value) || year)}
            className="w-28"
          />
          <Button variant="outline" size="sm" onClick={applySuggested}>
            <Wand2 className="w-4 h-4 mr-1" /> AI 추천 적용
          </Button>
          <Button onClick={save} disabled={saving}>
            <Save className="w-4 h-4 mr-1" /> 저장
          </Button>
        </div>
      </div>

      {/* 집행률 카드 */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">항목별 집행률</CardTitle>
          <CardDescription>예산 / 누계 집행 / 잔여 — 80% 경고, 100% 초과</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {CATEGORIES.map((c) => {
              const annual = totals.annual[c.key];
              const used = execTotals[c.key] ?? 0;
              const rate = annual > 0 ? Math.round((used / annual) * 1000) / 10 : 0;
              const level = rate >= 100 ? "over" : rate >= 80 ? "warn" : "ok";
              return (
                <div
                  key={c.key}
                  className={`rounded-lg border p-3 ${
                    level === "over"
                      ? "bg-red-50 border-red-300"
                      : level === "warn"
                        ? "bg-amber-50 border-amber-300"
                        : "bg-emerald-50/40 border-emerald-200"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="text-sm font-medium">{c.label}</div>
                    {level === "over" ? (
                      <AlertTriangle className="w-4 h-4 text-red-600" />
                    ) : level === "warn" ? (
                      <AlertTriangle className="w-4 h-4 text-amber-600" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    )}
                  </div>
                  <div className="text-lg font-bold">{rate}%</div>
                  <div className="text-xs text-muted-foreground">
                    예산 ₩{fmt(annual)} · 집행 ₩{fmt(used)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    잔여 ₩{fmt(annual - used)}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* 편성 매트릭스 */}
      <Card>
        <CardHeader className="pb-2 flex flex-row items-start justify-between">
          <div>
            <CardTitle className="text-base">월별 편성 매트릭스</CardTitle>
            <CardDescription>항목 × 월 셀에 직접 입력 (단위: 원)</CardDescription>
          </div>
          <Badge variant="outline" className="text-base">
            연 합계 ₩{fmt(totals.grand)}
          </Badge>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-muted/40">
                <th className="border p-2 text-left">항목</th>
                {Array.from({ length: 12 }, (_, i) => (
                  <th key={i} className="border p-1 text-center">{i + 1}월</th>
                ))}
                <th className="border p-2 text-right">연합계</th>
              </tr>
            </thead>
            <tbody>
              {CATEGORIES.map((c) => (
                <tr key={c.key}>
                  <td className="border p-2 font-medium">{c.label}</td>
                  {matrix[c.key].map((v, i) => (
                    <td key={i} className="border p-0">
                      <input
                        type="number"
                        value={v || ""}
                        onChange={(e) => setCell(c.key, i, Number(e.target.value) || 0)}
                        className="w-full h-9 px-1 text-right bg-transparent focus:bg-white focus:outline-primary"
                        min={0}
                      />
                    </td>
                  ))}
                  <td className="border p-2 text-right font-semibold">
                    ₩{fmt(totals.annual[c.key])}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* 버전·의결 */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Vote className="w-4 h-4" /> 버전·의결 이력
          </CardTitle>
          <CardDescription>
            관리단 의결로 예산을 변경할 때마다 새 버전을 만들고, 관리단장/본부장이 활성 승인합니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <Textarea
              value={versionNote}
              onChange={(e) => setVersionNote(e.target.value)}
              placeholder="의결 사유/요지 (예: 2026-1차 정기총회 — 수선적립금 5천만 → 7천만)"
              rows={2}
              className="flex-1"
            />
            <Button onClick={createNewVersion} disabled={saving || !data.budget}>
              <Sparkles className="w-4 h-4 mr-1" /> 새 버전 생성
            </Button>
          </div>
          <div className="space-y-2">
            {data.versions.length === 0 && (
              <div className="text-sm text-muted-foreground text-center py-3">
                아직 버전이 없습니다. 위에서 매트릭스를 입력하고 "저장"하면 v1 이 생성됩니다.
              </div>
            )}
            {data.versions
              .slice()
              .sort((a, b) => b.versionNo - a.versionNo)
              .map((v) => {
                const isActive = data.budget?.activeVersionId === v.id;
                return (
                  <div
                    key={v.id}
                    className={`flex items-center justify-between border rounded p-3 ${
                      isActive ? "bg-primary/5 border-primary/40" : ""
                    }`}
                  >
                    <div>
                      <div className="font-medium flex items-center gap-2">
                        v{v.versionNo}
                        {isActive && <Badge>활성</Badge>}
                        {v.sourceType === "vote" && <Badge variant="outline">의결</Badge>}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {v.note ?? "-"}
                        {v.approvedAt && (
                          <> · 승인 {new Date(v.approvedAt).toLocaleDateString("ko-KR")} {v.approvedByName ?? ""}</>
                        )}
                      </div>
                    </div>
                    {!isActive && (
                      <Button size="sm" variant="outline" onClick={() => approveVersion(v.id)} disabled={saving}>
                        활성 전환
                      </Button>
                    )}
                  </div>
                );
              })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
