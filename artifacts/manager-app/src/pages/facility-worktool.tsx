import { useState, useRef } from "react";
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
  Image,
} from "lucide-react";
import { OfficialDocumentTriggers } from "@/components/official-document-triggers";
import { useAuth } from "@/contexts/auth-context";
import type { OfficialDocumentInput } from "@/lib/official-document";

type CheckResult = "good" | "caution" | "bad" | null;

interface ChecklistItem {
  id: string;
  category: string;
  label: string;
  result: CheckResult;
  photo?: string;
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
  const { user } = useAuth();
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

  const photoInputRef = useRef<HTMLInputElement>(null);
  const [activePhotoId, setActivePhotoId] = useState<string | null>(null);

  function setResult(id: string, result: CheckResult) {
    setChecklist((prev) => prev.map((item) => item.id === id ? { ...item, result } : item));
  }

  function handlePhotoClick(id: string) {
    setActivePhotoId(id);
    photoInputRef.current?.click();
  }

  function handlePhotoCapture(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !activePhotoId) return;
    const MAX_BYTES = 10 * 1024 * 1024;
    if (file.size > MAX_BYTES) {
      toast({
        title: "사진 용량이 너무 큽니다",
        description: "최대 10MB까지 첨부할 수 있습니다. 사진 크기를 줄여 다시 시도해주세요.",
        variant: "destructive",
      });
      setActivePhotoId(null);
      return;
    }
    const targetId = activePhotoId;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        setChecklist((prev) =>
          prev.map((item) =>
            item.id === targetId ? { ...item, photo: reader.result as string } : item
          )
        );
      } catch (err) {
        console.error("[facility-worktool] photo state update failed:", err);
        toast({ title: "사진 처리에 실패했습니다", variant: "destructive" });
      } finally {
        setActivePhotoId(null);
      }
    };
    reader.onerror = () => {
      console.error("[facility-worktool] FileReader error:", reader.error);
      toast({
        title: "사진을 읽지 못했습니다",
        description: "다른 사진으로 다시 시도해주세요.",
        variant: "destructive",
      });
      setActivePhotoId(null);
    };
    try {
      reader.readAsDataURL(file);
    } catch (err) {
      console.error("[facility-worktool] readAsDataURL threw:", err);
      toast({ title: "사진을 읽지 못했습니다", variant: "destructive" });
      setActivePhotoId(null);
    }
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
      {/* [Task #142] 페이지 헤더는 DashboardShell 이 일괄 렌더링한다. */}

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
            <div className="space-y-4">
              <div className="text-center py-6 space-y-3">
                <CheckCircle className="w-12 h-12 text-green-500 mx-auto" />
                <p className="font-medium">점검표가 제출되었습니다</p>
                <p className="text-sm text-muted-foreground">
                  양호 {checklist.filter((c) => c.result === "good").length} · 주의 {cautionCount} · 불량 {badCount}
                </p>
                <Button variant="outline" onClick={() => setSubmitted(false)}>다시 작성</Button>
              </div>
              <OfficialDocumentTriggers
                buildInput={(): OfficialDocumentInput => ({
                  source: "facility-worktool",
                  sourceLabel: "시설담당자 일일 점검",
                  title: `시설담당자 일일 점검표 (${new Date().toISOString().slice(0, 10)})`,
                  date: new Date().toISOString(),
                  authorName: user?.name,
                  summary: [
                    { label: "총 항목", value: `${checklist.length}건` },
                    { label: "양호", value: `${checklist.filter((c) => c.result === "good").length}건` },
                    { label: "주의", value: `${cautionCount}건` },
                    { label: "불량", value: `${badCount}건` },
                  ],
                  items: checklist.map((c) => ({
                    label: `[${c.category}] ${c.label}`,
                    status: c.result ?? "info",
                  })),
                  notes: notes || undefined,
                  photos: checklist.map((c) => c.photo).filter((p): p is string => !!p),
                })}
              />
            </div>
          ) : (
            <>
              {categories.map((cat) => (
                <div key={cat} className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{cat}</p>
                  {checklist.filter((c) => c.category === cat).map((item) => (
                    <div key={item.id} className="rounded-lg border bg-card overflow-hidden">
                      <div className="flex items-center justify-between p-2.5 min-h-[48px]">
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
                      {(item.result === "caution" || item.result === "bad") && (
                        <div className="px-2.5 pb-2.5">
                          {item.photo ? (
                            <div className="relative">
                              <img src={item.photo} alt="점검 사진" className="w-full h-24 object-cover rounded-md" />
                              <button
                                onClick={() => handlePhotoClick(item.id)}
                                className="absolute top-1 right-1 p-1 bg-black/50 rounded text-white"
                              >
                                <Camera className="w-3 h-3" />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => handlePhotoClick(item.id)}
                              className="w-full flex items-center justify-center gap-2 p-2 rounded-md border border-dashed text-xs text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                            >
                              <Camera className="w-3.5 h-3.5" />
                              사진 첨부
                            </button>
                          )}
                        </div>
                      )}
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
      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handlePhotoCapture}
      />
    </div>
  );
}
