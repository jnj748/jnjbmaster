import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  useListVotes,
  useCreateVote,
  useCastBallot,
  useGetVoteDetail,
  getListVotesQueryKey,
  getGetVoteDetailQueryKey,
} from "@workspace/api-client-react";
import type {
  CreateVoteBodyVoterType,
  CastBallotBodyChoice,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  Plus,
  Vote as VoteIcon,
  ThumbsUp,
  ThumbsDown,
  Minus,
  BarChart3,
  Users,
} from "lucide-react";

const VOTER_TYPES: Record<string, string> = {
  owner: "소유자",
  tenant: "입주민",
  all: "전체",
};

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  draft: { label: "준비중", color: "bg-gray-100 text-gray-700" },
  active: { label: "진행중", color: "bg-green-100 text-green-700" },
  closed: { label: "종료", color: "bg-red-100 text-red-700" },
};

export default function Voting() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [castOpen, setCastOpen] = useState<number | null>(null);

  const { data: votes = [] } = useListVotes();
  const createMutation = useCreateVote();
  const castMutation = useCastBallot();
  const { data: detail } = useGetVoteDetail(detailId ?? 0, { query: { enabled: detailId != null, queryKey: getGetVoteDetailQueryKey(detailId ?? 0) } });

  const [form, setForm] = useState({
    title: "",
    description: "",
    voterType: "all" as string,
    startDate: new Date().toISOString().slice(0, 10),
    endDate: "",
    totalEligible: "50",
  });

  const [castForm, setCastForm] = useState({
    unitNumber: "",
    voterName: "",
    choice: "for" as string,
  });

  async function handleCreate() {
    if (!form.title || !form.description || !form.endDate) {
      toast({ title: "필수 항목을 모두 입력하세요", variant: "destructive" });
      return;
    }
    try {
      await createMutation.mutateAsync({
        data: {
          title: form.title,
          description: form.description,
          voterType: form.voterType as CreateVoteBodyVoterType,
          startDate: form.startDate,
          endDate: form.endDate,
          totalEligible: Number(form.totalEligible),
        },
      });
      toast({ title: "안건이 등록되었습니다" });
      setCreateOpen(false);
      setForm({ title: "", description: "", voterType: "all", startDate: new Date().toISOString().slice(0, 10), endDate: "", totalEligible: "50" });
      queryClient.invalidateQueries({ queryKey: getListVotesQueryKey() });
    } catch {
      toast({ title: "등록에 실패했습니다", variant: "destructive" });
    }
  }

  async function handleCast(voteId: number) {
    if (!castForm.unitNumber || !castForm.voterName) {
      toast({ title: "호실과 이름을 입력하세요", variant: "destructive" });
      return;
    }
    try {
      const result = await castMutation.mutateAsync({
        id: voteId,
        data: {
          unitNumber: castForm.unitNumber,
          voterName: castForm.voterName,
          choice: castForm.choice as CastBallotBodyChoice,
        },
      });
      toast({ title: result.message || "투표 완료" });
      setCastOpen(null);
      setCastForm({ unitNumber: "", voterName: "", choice: "for" });
      queryClient.invalidateQueries({ queryKey: getListVotesQueryKey() });
      if (detailId === voteId) {
        queryClient.invalidateQueries({ queryKey: getGetVoteDetailQueryKey(voteId) });
      }
    } catch {
      toast({ title: "투표에 실패했습니다", variant: "destructive" });
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold">전자투표</h1>
          <p className="text-sm text-muted-foreground">입주민 안건에 대한 전자 투표를 관리합니다</p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="w-4 h-4 mr-1" />
              안건 등록
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>투표 안건 등록</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>안건 제목</Label>
                <Input value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} />
              </div>
              <div>
                <Label>안건 내용</Label>
                <Textarea value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} rows={3} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>투표 대상</Label>
                  <Select value={form.voterType} onValueChange={(v) => setForm((p) => ({ ...p, voterType: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="owner">소유자</SelectItem>
                      <SelectItem value="tenant">입주민</SelectItem>
                      <SelectItem value="all">전체</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>투표 인원</Label>
                  <Input type="number" value={form.totalEligible} onChange={(e) => setForm((p) => ({ ...p, totalEligible: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>시작일</Label>
                  <Input type="date" value={form.startDate} onChange={(e) => setForm((p) => ({ ...p, startDate: e.target.value }))} />
                </div>
                <div>
                  <Label>종료일</Label>
                  <Input type="date" value={form.endDate} onChange={(e) => setForm((p) => ({ ...p, endDate: e.target.value }))} />
                </div>
              </div>
              <Button className="w-full" onClick={handleCreate} disabled={createMutation.isPending}>등록하기</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-3">
        {votes.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">
              <VoteIcon className="w-8 h-8 mx-auto mb-2 opacity-30" />
              등록된 투표 안건이 없습니다
            </CardContent>
          </Card>
        ) : (
          votes.map((v) => {
            const statusInfo = STATUS_LABELS[v.status] || STATUS_LABELS.draft;
            const totalVoted = (v.forCount ?? 0) + (v.againstCount ?? 0) + (v.abstainCount ?? 0);
            const turnout = v.totalEligible ? Math.round((totalVoted / v.totalEligible) * 100) : 0;

            return (
              <Card key={v.id}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">{v.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {VOTER_TYPES[v.voterType] || v.voterType} 대상 · {v.startDate} ~ {v.endDate}
                      </p>
                    </div>
                    <Badge className={`text-[10px] shrink-0 ${statusInfo.color}`}>{statusInfo.label}</Badge>
                  </div>

                  <p className="text-sm text-muted-foreground line-clamp-2">{v.description}</p>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1">
                        <Users className="w-3 h-3" />
                        투표율: {turnout}% ({totalVoted}/{v.totalEligible})
                      </span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                      <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${turnout}%` }} />
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-center text-xs">
                      <div className="p-2 rounded bg-green-50">
                        <ThumbsUp className="w-3.5 h-3.5 mx-auto text-green-600" />
                        <p className="font-medium text-green-700 mt-1">찬성 {v.forCount ?? 0}</p>
                      </div>
                      <div className="p-2 rounded bg-red-50">
                        <ThumbsDown className="w-3.5 h-3.5 mx-auto text-red-600" />
                        <p className="font-medium text-red-700 mt-1">반대 {v.againstCount ?? 0}</p>
                      </div>
                      <div className="p-2 rounded bg-gray-50">
                        <Minus className="w-3.5 h-3.5 mx-auto text-gray-500" />
                        <p className="font-medium text-gray-600 mt-1">기권 {v.abstainCount ?? 0}</p>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    {v.status === "active" && (
                      <Dialog open={castOpen === v.id} onOpenChange={(open) => setCastOpen(open ? v.id : null)}>
                        <DialogTrigger asChild>
                          <Button variant="outline" size="sm" className="text-xs">투표 참여</Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>투표: {v.title}</DialogTitle>
                          </DialogHeader>
                          <div className="space-y-3">
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <Label>호실</Label>
                                <Input value={castForm.unitNumber} onChange={(e) => setCastForm((p) => ({ ...p, unitNumber: e.target.value }))} placeholder="101" />
                              </div>
                              <div>
                                <Label>이름</Label>
                                <Input value={castForm.voterName} onChange={(e) => setCastForm((p) => ({ ...p, voterName: e.target.value }))} />
                              </div>
                            </div>
                            <div>
                              <Label>의견</Label>
                              <div className="grid grid-cols-3 gap-2 mt-1">
                                {[
                                  { value: "for", label: "찬성", icon: ThumbsUp, color: "border-green-500 bg-green-50 text-green-700" },
                                  { value: "against", label: "반대", icon: ThumbsDown, color: "border-red-500 bg-red-50 text-red-700" },
                                  { value: "abstain", label: "기권", icon: Minus, color: "border-gray-400 bg-gray-50 text-gray-600" },
                                ].map((opt) => {
                                  const Icon = opt.icon;
                                  return (
                                    <button
                                      key={opt.value}
                                      onClick={() => setCastForm((p) => ({ ...p, choice: opt.value }))}
                                      className={`p-3 rounded-lg border-2 flex flex-col items-center gap-1 transition-all ${castForm.choice === opt.value ? opt.color : "border-muted"}`}
                                    >
                                      <Icon className="w-5 h-5" />
                                      <span className="text-xs font-medium">{opt.label}</span>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                            <Button className="w-full" onClick={() => handleCast(v.id)} disabled={castMutation.isPending}>
                              투표하기
                            </Button>
                          </div>
                        </DialogContent>
                      </Dialog>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs"
                      onClick={() => setDetailId(detailId === v.id ? null : v.id)}
                    >
                      <BarChart3 className="w-3.5 h-3.5 mr-1" />
                      상세보기
                    </Button>
                  </div>

                  {detailId === v.id && detail && (
                    <div className="border-t pt-3 space-y-2">
                      <p className="text-xs font-medium">투표 현황 (투표율: {detail.turnoutRate}%)</p>
                      {detail.ballots && detail.ballots.length > 0 ? (
                        <div className="max-h-40 overflow-y-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="border-b text-muted-foreground">
                                <th className="p-1 text-left">호실</th>
                                <th className="p-1 text-left">이름</th>
                                <th className="p-1 text-center">의견</th>
                              </tr>
                            </thead>
                            <tbody>
                              {detail.ballots.map((b, i) => (
                                <tr key={i} className="border-b">
                                  <td className="p-1">{b.unitNumber}호</td>
                                  <td className="p-1">{b.voterName}</td>
                                  <td className="p-1 text-center">
                                    {b.choice === "for" ? "찬성" : b.choice === "against" ? "반대" : "기권"}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">아직 투표한 사람이 없습니다</p>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
