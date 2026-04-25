import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Users,
  Building2,
  Shield,
  UserPlus,
  Wallet,
  Calculator,
  HardHat,
  Package,
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
import { ROLE_LABELS } from "@workspace/shared/role-labels";
import {
  MobileOnly,
  DesktopOnly,
  MobileTabPanels,
} from "@/components/dashboard-widgets/mobile-compact";

interface UserRecord {
  id: number;
  email: string;
  name: string;
  role: string;
  portalType: string;
  createdAt: string;
}

// [역할 라벨 SoT] @workspace/shared/role-labels 의 ROLE_LABELS 를 그대로 사용한다.
const roleLabels: Record<string, string> = ROLE_LABELS;

// [Task #267] 통합 대시보드 5-역할 카드 정의. 각 카드는 /platform/<role> 현황 페이지로 이동.
const ROLE_CARDS: {
  role: string;
  label: string;
  subtitle: string;
  href: string;
  icon: typeof Users;
  bg: string;
  color: string;
}[] = [
  {
    role: "manager",
    label: roleLabels.manager,
    subtitle: "현장 관리자",
    href: "/platform/managers",
    icon: Building2,
    bg: "bg-blue-500/10",
    color: "text-blue-500",
  },
  {
    role: "accountant",
    label: roleLabels.accountant,
    subtitle: "관리비·결재",
    href: "/platform/accountants",
    icon: Calculator,
    bg: "bg-amber-500/10",
    color: "text-amber-500",
  },
  {
    role: "facility_staff",
    label: roleLabels.facility_staff,
    subtitle: "점검·보수",
    href: "/platform/facility-staff",
    icon: HardHat,
    bg: "bg-teal-500/10",
    color: "text-teal-500",
  },
  {
    role: "hq_executive",
    label: roleLabels.hq_executive,
    subtitle: "운영 모니터링",
    href: "/platform/hq-executives",
    icon: Shield,
    bg: "bg-indigo-500/10",
    color: "text-indigo-500",
  },
  {
    role: "partner",
    label: roleLabels.partner,
    subtitle: "협력업체",
    href: "/platform/partners",
    icon: Package,
    bg: "bg-emerald-500/10",
    color: "text-emerald-500",
  },
];

export default function AdminDashboard() {
  const { token } = useAuth();
  const [, navigate] = useLocation();
  const [users, setUsers] = useState<UserRecord[]>([]);

  const BASE = import.meta.env.BASE_URL ?? "/";
  const API_BASE = `${BASE}api`;

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/users`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) setUsers(await res.json());
      } catch {
        /* noop */
      }
    })();
  }, [token, API_BASE]);

  const roleCounts = users.reduce<Record<string, number>>((acc, u) => {
    acc[u.role] = (acc[u.role] || 0) + 1;
    return acc;
  }, {});

  // [Task #267] 통합 대시보드는 5역할 카드 + 파트너 크레딧 패널만 단순 노출.
  //   기존 "역할별 사용자 현황", "최근 등록 사용자", 하단 퀵링크 3개는 제거.
  //   각 역할별 상세는 /platform/<role> 현황 페이지에서 다룬다.
  return (
    <>
      {/* [Task #327] 모바일 컴팩트 — 5역할 컴팩트 카드 + 탭(현황/크레딧) */}
      <MobileOnly>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            {ROLE_CARDS.map((card) => (
              <button
                key={card.role}
                type="button"
                onClick={() => navigate(card.href)}
                data-testid={`role-card-${card.role}`}
                className="rounded-lg border bg-card p-2.5 h-[68px] flex items-center gap-2 hover:bg-muted/30 transition-colors text-left"
              >
                <span className={`p-1.5 rounded ${card.bg} shrink-0`}>
                  <card.icon className={`w-3.5 h-3.5 ${card.color}`} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] text-muted-foreground leading-tight truncate">
                    {card.label}
                  </p>
                  <p className="text-[15px] font-bold leading-tight">
                    {roleCounts[card.role] || 0}
                  </p>
                  <p className="text-[9px] text-muted-foreground leading-tight truncate">
                    {card.subtitle}
                  </p>
                </div>
              </button>
            ))}
            <button
              type="button"
              onClick={() => navigate("/users")}
              data-testid="btn-user-mgmt-mobile"
              className="rounded-lg border-2 border-dashed border-primary/40 bg-primary/5 p-2.5 h-[68px] flex items-center gap-2 hover:bg-primary/10 transition-colors"
            >
              <span className="p-1.5 rounded bg-primary/20 shrink-0">
                <UserPlus className="w-3.5 h-3.5 text-primary" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] text-muted-foreground leading-tight">전체</p>
                <p className="text-[13px] font-semibold leading-tight">사용자 관리</p>
              </div>
            </button>
          </div>
          <MobileTabPanels
            sections={[
              {
                key: "credits",
                label: "파트너 크레딧",
                content: <VendorCreditsPanel />,
              },
            ]}
          />
        </div>
      </MobileOnly>

      <DesktopOnly>
        <div className="space-y-6">
          <div className="flex items-start justify-end flex-wrap gap-3">
            <Button onClick={() => navigate("/users")} className="gap-2">
              <UserPlus className="w-4 h-4" />
              사용자 관리
            </Button>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            {ROLE_CARDS.map((card) => (
              <Card
                key={card.role}
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => navigate(card.href)}
                data-testid={`role-card-desktop-${card.role}`}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground truncate">
                        {card.label}
                      </p>
                      <p className="text-2xl font-bold mt-1">
                        {roleCounts[card.role] || 0}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1 truncate">
                        {card.subtitle}
                      </p>
                    </div>
                    <div className={`p-2 rounded-lg ${card.bg}`}>
                      <card.icon className={`w-5 h-5 ${card.color}`} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <VendorCreditsPanel />
        </div>
      </DesktopOnly>
    </>
  );
}

export function VendorCreditsPanel() {
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
