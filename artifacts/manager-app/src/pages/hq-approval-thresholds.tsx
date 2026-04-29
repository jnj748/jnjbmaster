// [Task #611] 본부장 임계 금액 설정 — 본부장(hq_executive) / 관리자(platform_admin).
//
// 라인 결정 규칙:
//   - 안건의 estimatedAmount < threshold  →  관리인 1단계만 결재
//   - estimatedAmount >= threshold        →  본부장 → 관리인 2단계
//   - 임계 금액이 정의되지 않은 건물은 항상 본부장+관리인 2단계로 안전하게 흐른다.
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DollarSign } from "lucide-react";

interface ThresholdRow {
  id: number;
  hqUserId: number;
  buildingId: number | null;
  thresholdAmount: number | string;
  createdAt: string;
  updatedAt: string;
}

interface BuildingLite {
  id: number;
  name: string;
}

interface HqUserLite {
  id: number;
  name: string;
  role: string;
}

const BASE = import.meta.env.BASE_URL ?? "/";
const API_BASE = `${BASE}api`.replace(/\/+/g, "/");

export default function HqApprovalThresholdsPage() {
  const { user, token } = useAuth();
  const { toast } = useToast();
  const [rows, setRows] = useState<ThresholdRow[]>([]);
  const [buildings, setBuildings] = useState<BuildingLite[]>([]);
  const [hqUsers, setHqUsers] = useState<HqUserLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const [form, setForm] = useState<{
    buildingId: string;
    amount: string;
    hqUserId: string;
  }>({ buildingId: "all", amount: "", hqUserId: "" });

  const isPlatform = user?.role === "platform_admin";

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const [rRes, bRes, uRes] = await Promise.all([
          fetch(`${API_BASE}/hq-approval-thresholds`, {
            headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          }),
          fetch(`${API_BASE}/buildings`, {
            headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          }).catch(() => null),
          isPlatform
            ? fetch(`${API_BASE}/users`, {
                headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
              }).catch(() => null)
            : Promise.resolve(null),
        ]);
        if (!rRes.ok) throw new Error(`임계 금액 로드 실패 (${rRes.status})`);
        const rData: ThresholdRow[] = await rRes.json();
        const bData: BuildingLite[] = bRes && bRes.ok ? await bRes.json() : [];
        const uDataAll: { id: number; name: string; role: string }[] =
          uRes && uRes.ok ? await uRes.json() : [];
        if (cancelled) return;
        setRows(rData);
        setBuildings(bData);
        setHqUsers(uDataAll.filter((u) => u.role === "hq_executive"));
      } catch (e) {
        toast({
          title: "임계 금액 정보를 불러오지 못했습니다",
          description: e instanceof Error ? e.message : "잠시 후 다시 시도해 주세요.",
          variant: "destructive",
        });
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [token, toast, refreshKey, isPlatform]);

  const buildingNameOf = (id: number | null) => {
    if (id === null) return "전체 건물 (기본값)";
    const b = buildings.find((x) => x.id === id);
    return b ? b.name : `건물 #${id}`;
  };

  const hqNameOf = (id: number) => {
    const h = hqUsers.find((x) => x.id === id);
    return h ? h.name : `본부장 #${id}`;
  };

  const visibleRows = useMemo(
    () =>
      [...rows].sort((a, b) => {
        if (a.hqUserId !== b.hqUserId) return a.hqUserId - b.hqUserId;
        return (a.buildingId ?? 0) - (b.buildingId ?? 0);
      }),
    [rows],
  );

  const onSave = async () => {
    const numericAmount = Number(form.amount.replace(/,/g, ""));
    if (!Number.isFinite(numericAmount) || numericAmount < 0) {
      toast({ title: "임계 금액은 0 이상의 숫자여야 합니다", variant: "destructive" });
      return;
    }
    const payload: Record<string, unknown> = {
      buildingId: form.buildingId === "all" ? null : Number(form.buildingId),
      thresholdAmount: numericAmount,
    };
    if (isPlatform) {
      if (!form.hqUserId) {
        toast({ title: "대상 본부장을 선택해 주세요", variant: "destructive" });
        return;
      }
      payload.hqUserId = Number(form.hqUserId);
    }
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/hq-approval-thresholds`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error ?? `저장 실패 (${res.status})`);
      }
      toast({ title: "임계 금액이 저장되었습니다" });
      setForm((s) => ({ ...s, amount: "" }));
      setRefreshKey((k) => k + 1);
    } catch (e) {
      toast({
        title: "저장 실패",
        description: e instanceof Error ? e.message : "잠시 후 다시 시도해 주세요.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="container mx-auto max-w-3xl p-4 pb-32">
      <div className="mb-4 flex items-center gap-2">
        <DollarSign className="h-5 w-5 text-amber-600" />
        <h1 className="text-xl font-bold">본부장 임계 금액</h1>
      </div>
      <p className="mb-4 text-sm text-gray-600">
        지정 금액 미만 안건은 관리인 1단계만 결재하고, 그 이상은 본부장→관리인 2단계로
        흐릅니다. 건물별 임계 금액을 따로 두면 해당 건물에 우선 적용됩니다.
      </p>

      <Card className="mb-6">
        <CardContent className="space-y-3 p-4">
          <h2 className="text-sm font-semibold text-gray-700">새 임계 금액 등록 / 수정</h2>
          {isPlatform ? (
            <div className="space-y-1">
              <Label htmlFor="hqUser">본부장</Label>
              <Select
                value={form.hqUserId}
                onValueChange={(v) => setForm((s) => ({ ...s, hqUserId: v }))}
              >
                <SelectTrigger id="hqUser">
                  <SelectValue placeholder="본부장을 선택" />
                </SelectTrigger>
                <SelectContent>
                  {hqUsers.map((u) => (
                    <SelectItem key={u.id} value={String(u.id)}>
                      {u.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          <div className="space-y-1">
            <Label htmlFor="building">적용 건물</Label>
            <Select
              value={form.buildingId}
              onValueChange={(v) => setForm((s) => ({ ...s, buildingId: v }))}
            >
              <SelectTrigger id="building">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 건물 (기본값)</SelectItem>
                {buildings.map((b) => (
                  <SelectItem key={b.id} value={String(b.id)}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="amount">임계 금액 (원)</Label>
            <Input
              id="amount"
              inputMode="numeric"
              placeholder="예: 5000000"
              value={form.amount}
              onChange={(e) => setForm((s) => ({ ...s, amount: e.target.value }))}
            />
          </div>
          <Button onClick={onSave} disabled={saving}>
            {saving ? "저장 중…" : "저장"}
          </Button>
        </CardContent>
      </Card>

      <h2 className="mb-2 text-sm font-semibold text-gray-700">현재 적용 중</h2>
      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : visibleRows.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-gray-500">
            등록된 임계 금액이 없습니다. 임계가 없으면 모든 안건이 본부장→관리인
            2단계 라인으로 흐릅니다.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {visibleRows.map((r) => {
            const amount = typeof r.thresholdAmount === "string"
              ? Number(r.thresholdAmount)
              : r.thresholdAmount;
            return (
              <Card key={r.id}>
                <CardContent className="flex items-center justify-between p-4">
                  <div>
                    {isPlatform ? (
                      <p className="text-sm font-medium">{hqNameOf(r.hqUserId)}</p>
                    ) : null}
                    <p className="text-xs text-gray-600">
                      {buildingNameOf(r.buildingId)}
                    </p>
                  </div>
                  <p className="text-lg font-semibold">
                    {Number.isFinite(amount) ? amount.toLocaleString() : "-"} 원
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
