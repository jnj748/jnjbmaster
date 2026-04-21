import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShieldAlert } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";

const API_BASE = "/api";

const TIERS: Array<{ years: number; label: string; scope: string }> = [
  { years: 2, label: "2년", scope: "마감공사·도배·타일 등" },
  { years: 3, label: "3년", scope: "방수·창호·전기설비 등" },
  { years: 5, label: "5년", scope: "대지조성·옹벽·철근콘크리트 등" },
  { years: 10, label: "10년", scope: "내력구조부·지붕·기둥 등" },
];

function addYears(d: Date, y: number) {
  const x = new Date(d);
  x.setFullYear(x.getFullYear() + y);
  return x;
}
function diffDays(a: Date, b: Date) {
  return Math.ceil((a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24));
}

export default function WarrantyDdayWidget() {
  const { token } = useAuth();
  const [completion, setCompletion] = useState<string | null>(null);

  useEffect(() => {
    let aborted = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/buildings/my`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const j = await res.json();
        if (!aborted) setCompletion(j?.building?.completionDate ?? null);
      } catch {/* ignore */}
    })();
    return () => { aborted = true; };
  }, [token]);

  if (!completion) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldAlert className="w-4 h-4 text-primary" /> 하자담보책임 D-Day
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          준공일이 확인되면 2·3·5·10년 만료까지 남은 일수를 안내해 드립니다.
        </CardContent>
      </Card>
    );
  }

  const today = new Date();
  const compDate = new Date(completion);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldAlert className="w-4 h-4 text-primary" /> 하자담보책임 D-Day
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3">
          {TIERS.map((t) => {
            const expiry = addYears(compDate, t.years);
            const days = diffDays(expiry, today);
            const expired = days < 0;
            const urgent = !expired && days <= 60;
            const tone = expired
              ? "border-muted bg-muted/40 text-muted-foreground"
              : urgent
                ? "border-amber-300 bg-amber-50 text-amber-800"
                : "border-border bg-card text-foreground";
            return (
              <div key={t.years} className={`rounded-lg border p-3 ${tone}`}>
                <div className="flex items-center justify-between">
                  <Badge variant="outline">{t.label}</Badge>
                  <span className="text-xs">
                    {expired ? "만료" : `D-${days}`}
                  </span>
                </div>
                <p className="mt-2 text-xs leading-snug">{t.scope}</p>
                <p className="mt-1 text-[11px] opacity-80">
                  만료일 {expiry.toISOString().slice(0, 10)}
                </p>
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-[11px] text-muted-foreground">
          준공일 기준 산정. 사업주체 청구 시점 안내용 — 실제 보증범위는 계약·법령에 따릅니다.
        </p>
      </CardContent>
    </Card>
  );
}
