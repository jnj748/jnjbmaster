import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Users,
  Building2,
  Shield,
  Settings,
  UserPlus,
  Activity,
  ChevronRight,
  Wallet,
} from "lucide-react";
import { useLocation } from "wouter";
import {
  useListAdminCreditWallets,
  useAdjustCredits,
  getListAdminCreditWalletsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

interface UserRecord {
  id: number;
  email: string;
  name: string;
  role: string;
  portalType: string;
  createdAt: string;
}

const roleLabels: Record<string, string> = {
  manager: "관리소장",
  partner: "파트너사",
  platform_admin: "플랫폼 관리자",
  hq_executive: "총괄책임자",
  accountant: "회계/행정",
  facility_staff: "시설관리",
};

const roleBadgeColors: Record<string, string> = {
  manager: "bg-blue-100 text-blue-700",
  partner: "bg-emerald-100 text-emerald-700",
  platform_admin: "bg-purple-100 text-purple-700",
  hq_executive: "bg-indigo-100 text-indigo-700",
  accountant: "bg-amber-100 text-amber-700",
  facility_staff: "bg-teal-100 text-teal-700",
};

export default function AdminDashboard() {
  const { token } = useAuth();
  const [, navigate] = useLocation();
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const BASE = import.meta.env.BASE_URL ?? "/";
  const API_BASE = `${BASE}api`;

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/users`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) setUsers(await res.json());
      } catch {} finally {
        setLoading(false);
      }
    })();
  }, [token, API_BASE]);

  const roleCounts = users.reduce<Record<string, number>>((acc, u) => {
    acc[u.role] = (acc[u.role] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      {/* [Task #142] 페이지 헤더는 DashboardShell 이 일괄 렌더링한다.
          사용자 관리 진입 버튼만 남긴다. */}
      <div className="flex items-start justify-end flex-wrap gap-3">
        <Button onClick={() => navigate("/users")} className="gap-2">
          <UserPlus className="w-4 h-4" />
          사용자 관리
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-muted-foreground">전체 사용자</p>
                <p className="text-2xl font-bold mt-1">{users.length}</p>
                <p className="text-xs text-muted-foreground mt-1">등록된 계정</p>
              </div>
              <div className="p-2 rounded-lg bg-accent/10"><Users className="w-5 h-5 text-accent" /></div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-muted-foreground">관리소장</p>
                <p className="text-2xl font-bold mt-1">{roleCounts["manager"] || 0}</p>
                <p className="text-xs text-muted-foreground mt-1">현장 관리자</p>
              </div>
              <div className="p-2 rounded-lg bg-blue-500/10"><Building2 className="w-5 h-5 text-blue-500" /></div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-muted-foreground">총괄/관리자</p>
                <p className="text-2xl font-bold mt-1">{(roleCounts["hq_executive"] || 0) + (roleCounts["platform_admin"] || 0)}</p>
                <p className="text-xs text-muted-foreground mt-1">본사 인원</p>
              </div>
              <div className="p-2 rounded-lg bg-purple-500/10"><Shield className="w-5 h-5 text-purple-500" /></div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-muted-foreground">파트너사</p>
                <p className="text-2xl font-bold mt-1">{roleCounts["partner"] || 0}</p>
                <p className="text-xs text-muted-foreground mt-1">협력업체</p>
              </div>
              <div className="p-2 rounded-lg bg-emerald-500/10"><Activity className="w-5 h-5 text-emerald-500" /></div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="w-4 h-4" />
              역할별 사용자 현황
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {Object.entries(roleLabels).map(([role, label]) => (
              <div key={role} className="flex items-center justify-between p-3 rounded-lg border">
                <div className="flex items-center gap-3">
                  <Badge className={`text-xs ${roleBadgeColors[role]}`}>{label}</Badge>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-bold">{roleCounts[role] || 0}명</span>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="w-4 h-4" />
              최근 등록 사용자
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              <p className="text-sm text-muted-foreground text-center py-4">로딩 중...</p>
            ) : users.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">등록된 사용자가 없습니다</p>
            ) : (
              users.slice(-5).reverse().map((u) => (
                <div key={u.id} className="flex items-center justify-between p-3 rounded-lg border">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{u.name}</p>
                    <p className="text-xs text-muted-foreground">{u.email}</p>
                  </div>
                  <Badge className={`text-[10px] ${roleBadgeColors[u.role]}`}>
                    {roleLabels[u.role] || u.role}
                  </Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <VendorCreditsPanel />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate("/users")}>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-accent/10"><Users className="w-5 h-5 text-accent" /></div>
            <div>
              <p className="text-sm font-medium">사용자 관리</p>
              <p className="text-xs text-muted-foreground">계정 생성 · 역할 변경</p>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground ml-auto" />
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate("/settings?tab=building")}>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/10"><Building2 className="w-5 h-5 text-blue-500" /></div>
            <div>
              <p className="text-sm font-medium">건물 설정</p>
              <p className="text-xs text-muted-foreground">건물 정보 · 사용자 배정</p>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground ml-auto" />
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate("/vendors")}>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-500/10"><Settings className="w-5 h-5 text-emerald-500" /></div>
            <div>
              <p className="text-sm font-medium">협력업체 관리</p>
              <p className="text-xs text-muted-foreground">업체 등록 · 계약 관리</p>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground ml-auto" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function VendorCreditsPanel() {
  const { data: wallets } = useListAdminCreditWallets();
  const adjustMutation = useAdjustCredits();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [editing, setEditing] = useState<number | null>(null);
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");

  async function handleAdjust(vendorId: number) {
    const amt = Number(amount);
    if (!amt) return;
    await adjustMutation.mutateAsync({
      data: {
        vendorId,
        amount: amt,
        kind: amt > 0 ? "manual_credit" : "manual_debit",
        notes: notes || "관리자 수동 조정",
      },
    });
    qc.invalidateQueries({ queryKey: getListAdminCreditWalletsQueryKey() });
    toast({ title: "크레딧이 조정되었습니다" });
    setEditing(null);
    setAmount("");
    setNotes("");
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Wallet className="w-4 h-4 text-indigo-500" />
          파트너 크레딧 관리
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!wallets || wallets.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">지갑 데이터가 없습니다</p>
        ) : (
          <div className="space-y-2">
            {wallets.map((w) => (
              <div key={w.vendorId} className="border rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{w.vendorName}</p>
                    <p className="text-xs text-muted-foreground">
                      잔액 <span className="font-semibold text-foreground">{w.balance} C</span>
                      {" · "}포인트 <span className="font-semibold text-foreground">{w.pointsBalance} P</span>
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setEditing(editing === w.vendorId ? null : w.vendorId)}
                  >
                    {editing === w.vendorId ? "닫기" : "충전/차감"}
                  </Button>
                </div>
                {editing === w.vendorId && (
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <Input
                      placeholder="금액 (+ 충전 / - 차감)"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      className="h-9"
                    />
                    <Input
                      placeholder="메모"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      className="h-9"
                    />
                    <Button size="sm" onClick={() => handleAdjust(w.vendorId)}>
                      적용
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
