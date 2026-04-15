import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  useGetTodayAttendance,
  useCheckAttendance,
  getGetTodayAttendanceQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  LogIn,
  LogOut,
  Clock,
  ClipboardCheck,
  Camera,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Send,
} from "lucide-react";

type CheckResult = "good" | "caution" | "bad" | null;

interface ChecklistItem {
  id: string;
  category: string;
  label: string;
  result: CheckResult;
}

const INITIAL_CHECKLIST: ChecklistItem[] = [
  { id: "elevator", category: "승강기", label: "승강기 운행 상태", result: null },
  { id: "fire_ext", category: "소방", label: "소화기 비치 상태", result: null },
  { id: "fire_door", category: "소방", label: "방화문 개폐 상태", result: null },
  { id: "parking", category: "주차", label: "주차장 바닥/조명", result: null },
  { id: "entrance", category: "출입", label: "출입문 잠금장치", result: null },
  { id: "cctv", category: "보안", label: "CCTV 작동 상태", result: null },
  { id: "water_tank", category: "급수", label: "저수조 외관 점검", result: null },
  { id: "garbage", category: "청결", label: "쓰레기 분리수거장", result: null },
  { id: "landscape", category: "환경", label: "외부 조경/청결", result: null },
  { id: "lighting", category: "전기", label: "공용부 조명 상태", result: null },
];

const resultIcons: Record<string, { icon: typeof CheckCircle; color: string; label: string }> = {
  good: { icon: CheckCircle, color: "text-green-500", label: "○ 양호" },
  caution: { icon: AlertTriangle, color: "text-amber-500", label: "△ 주의" },
  bad: { icon: XCircle, color: "text-destructive", label: "× 불량" },
};

export default function FacilityWorktool() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const checkMutation = useCheckAttendance();
  const { data: todayRecords } = useGetTodayAttendance();
  const hasCheckedIn = todayRecords?.some((r) => r.checkType === "check_in");
  const hasCheckedOut = todayRecords?.some((r) => r.checkType === "check_out");

  const [checklist, setChecklist] = useState<ChecklistItem[]>(INITIAL_CHECKLIST);
  const [notes, setNotes] = useState("");
  const [submitted, setSubmitted] = useState(false);

  async function handleCheck(checkType: "check_in" | "check_out") {
    try {
      await checkMutation.mutateAsync({ data: { checkType } });
      queryClient.invalidateQueries({ queryKey: getGetTodayAttendanceQueryKey() });
      toast({ title: checkType === "check_in" ? "출근 체크 완료" : "퇴근 체크 완료" });
    } catch {
      toast({ title: "오류가 발생했습니다", variant: "destructive" });
    }
  }

  function setResult(id: string, result: CheckResult) {
    setChecklist((prev) => prev.map((item) => item.id === id ? { ...item, result } : item));
  }

  function handleSubmit() {
    const incomplete = checklist.filter((c) => c.result === null);
    if (incomplete.length > 0) {
      toast({ title: `${incomplete.length}개 항목이 미체크입니다`, variant: "destructive" });
      return;
    }
    setSubmitted(true);
    toast({ title: "일일 점검표가 제출되었습니다" });
  }

  const completedCount = checklist.filter((c) => c.result !== null).length;
  const cautionCount = checklist.filter((c) => c.result === "caution").length;
  const badCount = checklist.filter((c) => c.result === "bad").length;

  const categories = [...new Set(checklist.map((c) => c.category))];

  return (
    <div className="space-y-4 max-w-lg mx-auto">
      <div>
        <h1 className="text-xl font-bold">일일 업무</h1>
        <p className="text-muted-foreground text-sm mt-1">
          출퇴근 체크와 일일 점검표를 작성합니다
        </p>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Clock className="w-4 h-4" />
            <span className="text-sm font-medium">출퇴근 체크</span>
          </div>
          <div className="flex gap-3">
            <Button
              className="flex-1"
              onClick={() => handleCheck("check_in")}
              disabled={hasCheckedIn || checkMutation.isPending}
            >
              <LogIn className="w-4 h-4 mr-2" />
              {hasCheckedIn ? "출근 완료" : "출근"}
            </Button>
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => handleCheck("check_out")}
              disabled={!hasCheckedIn || hasCheckedOut || checkMutation.isPending}
            >
              <LogOut className="w-4 h-4 mr-2" />
              {hasCheckedOut ? "퇴근 완료" : "퇴근"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <ClipboardCheck className="w-4 h-4" />
              일일 점검표
            </CardTitle>
            <Badge variant={completedCount === checklist.length ? "default" : "secondary"}>
              {completedCount}/{checklist.length}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {submitted ? (
            <div className="text-center py-8 space-y-3">
              <CheckCircle className="w-12 h-12 text-green-500 mx-auto" />
              <p className="font-medium">점검표가 제출되었습니다</p>
              <p className="text-sm text-muted-foreground">
                양호 {checklist.filter((c) => c.result === "good").length} · 주의 {cautionCount} · 불량 {badCount}
              </p>
              <Button variant="outline" onClick={() => setSubmitted(false)}>다시 작성</Button>
            </div>
          ) : (
            <>
              {categories.map((cat) => (
                <div key={cat} className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{cat}</p>
                  {checklist.filter((c) => c.category === cat).map((item) => (
                    <div key={item.id} className="flex items-center justify-between p-2.5 rounded-lg border bg-card min-h-[48px]">
                      <span className="text-sm font-medium">{item.label}</span>
                      <div className="flex gap-1.5">
                        {(["good", "caution", "bad"] as CheckResult[]).map((r) => {
                          const cfg = resultIcons[r!];
                          const Icon = cfg.icon;
                          const isSelected = item.result === r;
                          return (
                            <button
                              key={r}
                              onClick={() => setResult(item.id, r)}
                              className={`p-2 rounded-lg border transition-all min-w-[44px] min-h-[44px] flex items-center justify-center ${
                                isSelected
                                  ? `${cfg.color} border-current bg-current/10 scale-110`
                                  : "text-muted-foreground/40 border-transparent hover:border-muted"
                              }`}
                            >
                              <Icon className="w-5 h-5" />
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              ))}

              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">특이사항 및 민원사항</p>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="특이사항을 입력하세요..."
                  rows={3}
                />
              </div>

              <Button
                className="w-full"
                size="lg"
                onClick={handleSubmit}
                disabled={completedCount === 0}
              >
                <Send className="w-4 h-4 mr-2" />
                점검표 제출
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
