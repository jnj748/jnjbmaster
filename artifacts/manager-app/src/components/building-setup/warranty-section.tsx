import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Shield, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Warranty {
  id: number;
  tradeName: string;
  tradeCategory: string;
  warrantyYears: number;
  expiryDate: string;
  status: string;
}

const tradeCategoryLabels: Record<string, string> = {
  waterproofing: "방수공사",
  exterior: "외벽",
  painting: "도장",
  tiling: "타일",
  window: "창호",
  mechanical: "기계설비",
  electrical: "전기",
  elevator: "승강기",
  plumbing: "배관",
  structure: "구조체",
  parking: "주차장",
};

const statusLabels: Record<string, string> = {
  active: "유효",
  expiring_soon: "만료 임박",
  expired: "만료됨",
};

const statusColors: Record<string, string> = {
  active: "bg-green-100 text-green-800",
  expiring_soon: "bg-orange-100 text-orange-800",
  expired: "bg-red-100 text-red-800",
};

export function WarrantySection({
  buildingId,
  approvalDate,
  token,
}: {
  buildingId: number;
  approvalDate: string;
  token: string | null;
}) {
  const [warranties, setWarranties] = useState<Warranty[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const { toast } = useToast();
  const BASE = import.meta.env.BASE_URL ?? "/";
  const apiBase = `${BASE}api`.replace(/\/+/g, "/");

  async function loadWarranties() {
    try {
      const res = await fetch(`${apiBase}/warranties/building/${buildingId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setWarranties(Array.isArray(data) ? data : []);
    } catch {
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadWarranties(); }, [buildingId]);

  async function createWarranties() {
    setCreating(true);
    try {
      const res = await fetch(`${apiBase}/warranties/building/${buildingId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ approvalDate }),
      });
      const data = await res.json();
      setWarranties(Array.isArray(data) ? data : []);
      toast({ title: "하자담보 기간이 자동 생성되었습니다" });
    } catch {
      toast({ title: "생성 중 오류가 발생했습니다", variant: "destructive" });
    } finally {
      setCreating(false);
    }
  }

  return (
    <Card className="border-blue-200">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-blue-600" />
          하자담보 기간 관리
        </CardTitle>
        <CardDescription>
          사용승인일({approvalDate}) 기준으로 공종별 하자담보 만료일을 자동 계산합니다.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : warranties.length === 0 ? (
          <div className="text-center py-4">
            <p className="text-sm text-muted-foreground mb-4">
              아직 하자담보 기간이 설정되지 않았습니다. 사용승인일 기준으로 자동 생성하세요.
            </p>
            <Button onClick={createWarranties} disabled={creating}>
              {creating ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />생성 중...</>
              ) : (
                <><Shield className="w-4 h-4 mr-2" />하자담보 기간 자동 생성</>
              )}
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {warranties.map((w) => {
              const daysLeft = Math.ceil(
                (new Date(w.expiryDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
              );
              return (
                <div key={w.id} className="flex items-center justify-between p-3 rounded-lg border bg-card">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{w.tradeName}</span>
                      <Badge variant="outline" className={statusColors[w.status] || ""}>
                        {statusLabels[w.status] || w.status}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {tradeCategoryLabels[w.tradeCategory] || w.tradeCategory} | 보증기간: {w.warrantyYears}년 | 만료: {w.expiryDate}
                      {daysLeft > 0 ? ` (${daysLeft}일 남음)` : " (만료됨)"}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
