// [S1 스마트견적] 파트너 포털의 스마트견적 설정 화면.
//   - 토글(활성/일시정지) + 일일 캐시 예산 + 일일 최대 건수 + 대상 카테고리.
//   - 자동 제출 엔진은 S3 단계에서 켠다. 본 화면은 가입/설정 저장만.
//   - 캐시는 일반 견적 대비 0.9배 차감 (자동화 할인). 본문 안내문에 명시.
import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Sparkles, Info } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type SmartQuote = {
  vendorId: number | null;
  status: "active" | "paused";
  dailyCreditBudget: number;
  dailyMaxCount: number;
  targetCategories: string[];
  targetRegions: unknown | null;
  pausedReason: string | null;
  lastPausedAt: string | null;
};

interface Props {
  vendorSubCategories: string[]; // vendor.subCategories — 자동 제출 대상 카테고리 후보
  vendorName: string;
}

const DAILY_CAP_OPTIONS = [3000, 6000, 9000, 12000, 18000, 27000];

export function VendorSmartQuote({ vendorSubCategories, vendorName }: Props) {
  const { token } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState<SmartQuote | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const r = await fetch("/api/me/vendor/smart-quote", {
          headers: { Authorization: token ? `Bearer ${token}` : "" },
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = (await r.json()) as SmartQuote;
        if (alive) setData(j);
      } catch (e) {
        if (alive) {
          toast({
            title: "스마트견적 정보를 불러오지 못했습니다",
            description: e instanceof Error ? e.message : "잠시 후 다시 시도해주세요.",
            variant: "destructive",
          });
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [token, toast]);

  async function handleSave() {
    if (!data) return;
    setSaving(true);
    try {
      const r = await fetch("/api/me/vendor/smart-quote", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: token ? `Bearer ${token}` : "",
        },
        body: JSON.stringify({
          status: data.status,
          dailyCreditBudget: data.dailyCreditBudget,
          dailyMaxCount: data.dailyMaxCount,
          targetCategories: data.targetCategories,
          targetRegions: data.targetRegions,
        }),
      });
      if (!r.ok) {
        const txt = await r.text();
        throw new Error(txt || `HTTP ${r.status}`);
      }
      const j = (await r.json()) as SmartQuote;
      setData(j);
      toast({
        title: data.status === "active" ? "스마트견적이 켜졌습니다" : "스마트견적이 일시정지되었습니다",
        description:
          data.status === "active"
            ? `매일 최대 ${data.dailyMaxCount}건, ${data.dailyCreditBudget.toLocaleString()}캐시 한도로 자동 발송됩니다.`
            : "직접 켜기 전까지 자동 발송이 멈춥니다.",
      });
    } catch (e) {
      toast({
        title: "저장 실패",
        description: e instanceof Error ? e.message : "잠시 후 다시 시도해주세요.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  if (loading || !data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32" />
        <Skeleton className="h-48" />
      </div>
    );
  }

  const isActive = data.status === "active";

  return (
    <div className="space-y-5">
      <Card className="border-violet-200 bg-gradient-to-br from-violet-50 to-white">
        <CardContent className="py-5 px-5">
          <div className="flex items-start gap-3">
            <Sparkles className="w-6 h-6 text-violet-500 shrink-0 mt-0.5" />
            <div className="space-y-1.5">
              <h2 className="text-lg font-bold">바쁜 사장님을 대신해 자동으로 견적을 보내드려요</h2>
              <p className="text-sm text-muted-foreground">
                매칭된 견적 요청에 표준 견적이 자동 발송됩니다. 일반 견적 대비{" "}
                <span className="font-semibold text-violet-700">캐시 10% 할인</span>.
              </p>
              <p className="text-xs text-muted-foreground">
                ※ 현장 방문이 필요한 요청은 자동 발송 대상에서 제외됩니다.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            스마트견적
            {isActive ? (
              <Badge className="bg-emerald-500">활성</Badge>
            ) : (
              <Badge variant="secondary">일시정지</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between p-3 border rounded-lg">
            <div>
              <Label htmlFor="sq-toggle" className="font-semibold">
                자동 견적 발송
              </Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                {vendorName ? `${vendorName} 의 ` : ""}매칭된 요청에 자동 견적 발송
              </p>
            </div>
            <Switch
              id="sq-toggle"
              checked={isActive}
              onCheckedChange={(v) => setData({ ...data, status: v ? "active" : "paused" })}
            />
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-semibold">하루에 사용할 캐시</Label>
            <div className="flex flex-wrap gap-2">
              {DAILY_CAP_OPTIONS.map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setData({ ...data, dailyCreditBudget: v })}
                  className={`px-3 py-1.5 text-sm rounded-md border transition-colors ${
                    data.dailyCreditBudget === v
                      ? "border-violet-500 bg-violet-50 text-violet-700 font-semibold"
                      : "border-border hover:border-violet-300"
                  }`}
                >
                  {v.toLocaleString()}캐시
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              한도에 도달하면 그날은 자동 발송이 멈춥니다 (다음날 자동 재개).
            </p>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-semibold">하루 최대 발송 건수</Label>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setData({ ...data, dailyMaxCount: n })}
                  className={`flex-1 py-2 text-sm rounded-md border transition-colors ${
                    data.dailyMaxCount === n
                      ? "border-violet-500 bg-violet-50 text-violet-700 font-semibold"
                      : "border-border hover:border-violet-300"
                  }`}
                >
                  {n}건
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-semibold">자동 발송할 분야</Label>
            {vendorSubCategories.length === 0 ? (
              <div className="text-xs text-muted-foreground p-3 border rounded-md bg-muted/30">
                <Info className="w-3.5 h-3.5 inline mr-1" />
                가입 시 등록한 분야가 없습니다. 사업자정보 변경 신청에서 분야를 추가해주세요.
              </div>
            ) : (
              <div className="space-y-1.5">
                {vendorSubCategories.map((c) => {
                  const checked = data.targetCategories.includes(c);
                  return (
                    <label
                      key={c}
                      className="flex items-center gap-2 p-2.5 border rounded-md cursor-pointer hover:bg-muted/40"
                    >
                      <Input
                        type="checkbox"
                        className="w-4 h-4"
                        checked={checked}
                        onChange={(e) => {
                          const next = e.target.checked
                            ? [...data.targetCategories, c]
                            : data.targetCategories.filter((x) => x !== c);
                          setData({ ...data, targetCategories: next });
                        }}
                      />
                      <span className="text-sm">{c}</span>
                    </label>
                  );
                })}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              체크한 분야의 견적 요청에만 자동 발송됩니다. (가입 시 등록한 분야의 부분집합)
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button onClick={handleSave} disabled={saving} className="bg-violet-600 hover:bg-violet-700">
              {saving ? "저장 중..." : "저장"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
