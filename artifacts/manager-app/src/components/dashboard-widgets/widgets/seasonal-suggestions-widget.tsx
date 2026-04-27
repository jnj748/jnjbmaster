// [Task #495] dashboard-manager-legacy 에서 추출. 매니저 대시보드 하단의
//   계절별 영선 업무 제안 카드. /api/dashboard/seasonal-suggestions 응답이
//   비어 있으면 자체적으로 null 을 반환해 화면에서 사라진다.

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useCreateRfq,
  getListRfqsQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Wrench } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";

export function SeasonalSuggestionsCard() {
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { token } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createRfqMutation = useCreateRfq();

  const BASE = import.meta.env.BASE_URL ?? "/";
  const apiBase = `${BASE}api`.replace(/\/+/g, "/");

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`${apiBase}/dashboard/seasonal-suggestions`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        setSuggestions(Array.isArray(data) ? data : []);
      } catch {}
      setLoading(false);
    }
    load();
  }, []);

  if (loading || suggestions.length === 0) return null;

  const monthNames = ["", "1월", "2월", "3월", "4월", "5월", "6월", "7월", "8월", "9월", "10월", "11월", "12월"];
  const currentMonth = new Date().getMonth() + 1;

  const priorityColors: Record<string, string> = {
    high: "border-orange-300 bg-orange-50/50",
    normal: "border-blue-200 bg-blue-50/30",
    low: "border-gray-200",
  };

  const priorityBadge: Record<string, string> = {
    high: "bg-orange-100 text-orange-700",
    normal: "bg-blue-100 text-blue-700",
    low: "bg-gray-100 text-gray-700",
  };

  async function createRfqFromSuggestion(s: any) {
    try {
      const twoWeeks = new Date();
      twoWeeks.setDate(twoWeeks.getDate() + 14);
      await createRfqMutation.mutateAsync({
        data: {
          title: `[계절업무] ${s.title}`,
          category: (s.rfqCategory || s.category) as any,
          buildingName: "관리 건물",
          deadline: twoWeeks.toISOString().split("T")[0],
          description: s.description || "",
        },
      });
      queryClient.invalidateQueries({ queryKey: getListRfqsQueryKey() });
      toast({ title: "견적 요청이 생성되었습니다" });
    } catch {
      toast({ title: "견적 요청 생성 중 오류가 발생했습니다", variant: "destructive" });
    }
  }

  return (
    <Card className="border-green-200 bg-green-50/20">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2 mb-2">
          <Wrench className="w-5 h-5 text-green-600" />
          <h3 className="font-semibold text-sm">{monthNames[currentMonth]} 계절별 영선 업무 제안</h3>
        </div>
        <div className="space-y-2">
          {suggestions.map((s: any) => (
            <div key={s.id} className={`p-3 rounded-lg border ${priorityColors[s.priority] || priorityColors.normal}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-sm">{s.title}</span>
                    <Badge variant="outline" className={`text-[10px] h-4 ${priorityBadge[s.priority] || ""}`}>
                      {s.priority === "high" ? "긴급" : s.priority === "normal" ? "일반" : "참고"}
                    </Badge>
                  </div>
                  {s.description && (
                    <p className="text-xs text-muted-foreground">{s.description}</p>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs shrink-0"
                  onClick={() => createRfqFromSuggestion(s)}
                >
                  견적요청
                </Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
