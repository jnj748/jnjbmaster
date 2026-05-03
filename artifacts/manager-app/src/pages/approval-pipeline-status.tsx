// [Task #775] 결재 라인 진행상황 화면 — 어디서 멈춰있는지, 며칠째 지연 중인지,
//   그리고 정체된 결재자에게 독촉을 보낼 수 있는 단일 통로.
//   진입: 결재함 카드의 "진행상황" 또는 /approvals/:id/pipeline-status?id=N.
import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Activity, AlertCircle, Bell } from "lucide-react";
import { useLocation, useSearch } from "wouter";

interface PipelineStep {
  id: number;
  stepOrder: number;
  approverId: number | null;
  approverName: string | null;
  approverRole: string | null;
  status: string;
  decidedAt: string | null;
}

interface PipelineStatus {
  approvalId: number;
  title: string;
  status: string;
  isDraft: boolean;
  awaitingContractEvidence: boolean;
  currentStep: number;
  totalSteps: number;
  progress: { total: number; approved: number; rejected: boolean };
  stalledStep: {
    id: number;
    stepOrder: number;
    approverId: number | null;
    approverName: string | null;
    approverRole: string | null;
    status: string;
    path: string | null;
    stalledDays: number | null;
  } | null;
  avgDays: number | null;
  steps: PipelineStep[];
}

const BASE = import.meta.env.BASE_URL ?? "/";
const API_BASE = `${BASE}api`.replace(/\/+/g, "/");

export default function ApprovalPipelineStatusPage() {
  const { token } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const approvalId = Number(params.get("id"));
  const [data, setData] = useState<PipelineStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [nudging, setNudging] = useState(false);

  useEffect(() => {
    if (!approvalId || !Number.isFinite(approvalId)) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const res = await fetch(`${API_BASE}/approvals/${approvalId}/pipeline-status`, {
          headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        });
        if (!res.ok) throw new Error(`로드 실패 (${res.status})`);
        const j: PipelineStatus = await res.json();
        if (!cancelled) setData(j);
      } catch (e) {
        toast({
          title: "결재 진행상황을 불러오지 못했습니다",
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
  }, [approvalId, token, toast]);

  const onNudge = async () => {
    if (!data) return;
    setNudging(true);
    try {
      const res = await fetch(`${API_BASE}/approvals/${data.approvalId}/notify-stalled`, {
        method: "POST",
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error ?? `독촉 실패 (${res.status})`);
      }
      const j = await res.json();
      toast({
        title: "독촉 알림을 보냈습니다",
        description: `${j.approverName ?? "해당 결재자"}에게 알림이 발송되었습니다.`,
      });
    } catch (e) {
      toast({
        title: "독촉 실패",
        description: e instanceof Error ? e.message : "잠시 후 다시 시도해 주세요.",
        variant: "destructive",
      });
    } finally {
      setNudging(false);
    }
  };

  if (!approvalId || !Number.isFinite(approvalId)) {
    return (
      <div className="container mx-auto max-w-3xl p-4">
        <Card>
          <CardContent className="py-12 text-center text-sm text-gray-500">
            결재 ID 가 필요합니다. 결재함에서 항목을 선택해 주세요.
            <div className="mt-3">
              <Button variant="outline" onClick={() => setLocation("/approvals")}>결재함으로</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-3xl p-4 pb-32">
      <div className="mb-4 flex items-center gap-2">
        <Activity className="h-5 w-5 text-blue-600" />
        <h1 className="text-xl font-bold">결재 진행상황</h1>
      </div>

      {loading || !data ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : (
        <>
          <Card className="mb-4">
            <CardContent className="space-y-3 p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium">{data.title}</p>
                  <p className="text-xs text-gray-500">결재 #{data.approvalId}</p>
                </div>
                <StatusBadge status={data.status} isDraft={data.isDraft} />
              </div>
              <div>
                <div className="mb-1 flex items-center justify-between text-xs text-gray-600">
                  <span>
                    {data.progress.approved} / {data.progress.total} 단계 완료
                  </span>
                  {data.avgDays != null ? (
                    <span>평균 {data.avgDays.toFixed(1)} 일 소요</span>
                  ) : null}
                </div>
                <Progress
                  value={data.progress.total > 0 ? (data.progress.approved / data.progress.total) * 100 : 0}
                  className="h-2"
                  data-testid="pipeline-progress"
                />
              </div>
              {data.awaitingContractEvidence ? (
                <div className="rounded-md bg-amber-50 p-2 text-xs text-amber-900">
                  계약·증빙 등록 대기 중입니다. 계약서·세금계산서 첨부 후 발행이 트리거됩니다.
                </div>
              ) : null}
            </CardContent>
          </Card>

          {data.stalledStep ? (
            <Card className="mb-4 border-amber-300 bg-amber-50/40">
              <CardContent className="space-y-2 p-4">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-amber-600" />
                  <p className="font-medium text-amber-900">정체 단계</p>
                </div>
                <p className="text-sm">
                  {data.stalledStep.stepOrder}단계 — {data.stalledStep.approverName ?? "결재자 미지정"}
                  {data.stalledStep.approverRole ? ` (${data.stalledStep.approverRole})` : ""}
                </p>
                {data.stalledStep.stalledDays != null ? (
                  <p className="text-xs text-gray-600">
                    {data.stalledStep.stalledDays}일째 대기 중 ({data.stalledStep.status})
                  </p>
                ) : null}
                <div>
                  <Button
                    onClick={onNudge}
                    disabled={nudging}
                    size="sm"
                    data-testid="pipeline-nudge"
                  >
                    <Bell className="mr-1 h-3.5 w-3.5" />
                    {nudging ? "발송 중…" : "독촉 알림 보내기"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardContent className="p-4">
              <p className="mb-2 text-sm font-medium">전체 단계</p>
              <ol className="space-y-2">
                {data.steps.map((s) => (
                  <li
                    key={s.id}
                    className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                    data-testid={`pipeline-step-${s.stepOrder}`}
                  >
                    <span>
                      {s.stepOrder}. {s.approverName ?? "(미지정)"}{" "}
                      <span className="text-xs text-gray-500">{s.approverRole ?? ""}</span>
                    </span>
                    <Badge variant="outline">{s.status}</Badge>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function StatusBadge({ status, isDraft }: { status: string; isDraft: boolean }) {
  if (isDraft) return <Badge variant="outline">임시저장</Badge>;
  if (status === "approved") return <Badge className="bg-emerald-600">승인 완료</Badge>;
  if (status === "rejected") return <Badge variant="destructive">반려</Badge>;
  if (status === "in_progress") return <Badge className="bg-blue-600">진행 중</Badge>;
  return <Badge variant="outline">{status}</Badge>;
}
