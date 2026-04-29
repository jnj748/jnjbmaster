import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/contexts/auth-context";
import { useBuilding } from "@/contexts/building-context";
import { useToast } from "@/hooks/use-toast";
import { AuthImage } from "@/components/auth-image";
import { CompletionNotice } from "@/components/completion-notice";
import { FileText } from "lucide-react";
import { formatKoreanDate } from "@/lib/official-document";
import {
  CATEGORY_ICON_CLASS,
  CATEGORY_BG_CLASS,
  WORK_LOG_CATEGORY_TOKEN,
} from "@/lib/category-colors";
import {
  useApi,
  CATEGORY_LABEL,
  CATEGORY_ICON,
  getCategoriesFor,
  useCurrentRole,
  type Category,
  type WorkLogEntry,
} from "./shared";

export function TimelineTab({ onGoDaily }: { onGoDaily: () => void }) {
  const { call } = useApi();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  const { building } = useBuilding();
  const role = useCurrentRole();
  const filterChips = useMemo(
    () => [
      { value: "all" as const, label: "전체" },
      ...getCategoriesFor(role).map((c) => ({ value: c.value, label: c.label })),
    ],
    [role],
  );
  const [filter, setFilter] = useState<"all" | Category>("all");
  const [editing, setEditing] = useState<WorkLogEntry | null>(null);
  const [editMemo, setEditMemo] = useState("");
  // [Task #318] 카드별 "문서로만들기" — 필수업무 처리완료에서 쓰는 CompletionNotice
  // 모달을 그대로 띄워 공고문/보고서/기안서 흐름을 일원화한다.
  const [docEntry, setDocEntry] = useState<WorkLogEntry | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["work-logs", filter],
    queryFn: () => call<WorkLogEntry[]>(
      `/work-logs${filter === "all" ? "" : `?category=${filter}`}`,
    ),
  });

  const removeMut = useMutation({
    mutationFn: (id: number) => call<null>(`/work-logs/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "삭제되었습니다" });
      qc.invalidateQueries({ queryKey: ["work-logs"] });
    },
  });
  const editMut = useMutation({
    mutationFn: ({ id, memo }: { id: number; memo: string }) =>
      call<WorkLogEntry>(`/work-logs/${id}`, { method: "PATCH", body: JSON.stringify({ memo }) }),
    onSuccess: () => {
      toast({ title: "수정되었습니다" });
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["work-logs"] });
    },
  });

  const grouped = useMemo(() => {
    const map = new Map<string, WorkLogEntry[]>();
    (data ?? []).forEach((e) => {
      const arr = map.get(e.occurredDate) ?? [];
      arr.push(e);
      map.set(e.occurredDate, arr);
    });
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [data]);

  return (
    <div className="space-y-3 pt-3">
      <Button onClick={onGoDaily} className="w-full" data-testid="timeline-goto-daily">
        오늘 업무일지 만들기
      </Button>
      <div className="flex gap-2 overflow-x-auto">
        {filterChips.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => setFilter(value)}
            data-testid={`filter-${value}`}
            className={`px-3 py-1.5 rounded-full text-xs whitespace-nowrap border ${
              filter === value ? "bg-accent text-accent-foreground border-accent" : "bg-background"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10"><Spinner /></div>
      ) : grouped.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            아직 기록이 없습니다. 가운데 + 버튼으로 빠르게 추가해보세요.
          </CardContent>
        </Card>
      ) : (
        grouped.map(([date, items]) => (
          <div key={date} className="space-y-2">
            <div className="text-xs font-semibold text-muted-foreground sticky top-0 z-10 bg-background py-1">
              {formatKoreanDate(date)}
            </div>
            {items.map((e) => {
              const Icon = CATEGORY_ICON[e.category];
              // [Task #256] 카테고리별 5색 팔레트 토큰 — 시설=teal, 관리비=orange,
              // 민원=violet. 한 화면에 섞여 있을 때 색만 봐도 카테고리가 구분된다.
              const catToken = WORK_LOG_CATEGORY_TOKEN[e.category];
              const iconColor = CATEGORY_ICON_CLASS[catToken];
              const iconBg = CATEGORY_BG_CLASS[catToken];
              return (
                <Card key={e.id} id={`entry-${e.id}`} data-testid={`entry-${e.id}`}>
                  <CardContent className="p-3 flex gap-3">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${iconBg}`}>
                      <Icon className={`w-4 h-4 ${iconColor}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Badge variant="outline" className="text-[10px]">{CATEGORY_LABEL[e.category]}</Badge>
                        <span>{e.authorName}</span>
                      </div>
                      <p className="text-sm whitespace-pre-wrap mt-1 break-words">{e.memo}</p>
                      {e.photoUrl ? (
                        <AuthImage src={e.photoUrl} alt="" className="mt-2 max-h-40 rounded-md border" />
                      ) : null}
                    </div>
                    {/* [Task #318] 액션 영역: 기안/견적 두 진입을 단일 "문서로만들기"
                        로 통합. 클릭 시 필수업무 처리완료에서 사용하는 동일한 공식
                        문서 프로세스(공고문/보고서/기안서)로 이어진다. 수정/삭제는 유지. */}
                    <div className="flex flex-col gap-1 shrink-0 text-[11px] items-start">
                      <button
                        type="button"
                        onClick={() => setDocEntry(e)}
                        title="이 기록으로 공고문·보고서·기안서 만들기"
                        className={`inline-flex items-center gap-1 ${CATEGORY_ICON_CLASS.residents} hover:opacity-80`}
                        data-testid={`make-doc-${e.id}`}
                      >
                        <FileText className="w-3.5 h-3.5" />
                        <span>문서로만들기</span>
                      </button>
                      <div className="flex gap-2 pt-0.5">
                        <button
                          onClick={() => { setEditing(e); setEditMemo(e.memo); }}
                          className="text-muted-foreground hover:text-foreground text-left"
                          data-testid={`edit-${e.id}`}
                        >
                          수정
                        </button>
                        <button
                          onClick={() => { if (confirm("삭제할까요?")) removeMut.mutate(e.id); }}
                          className="text-muted-foreground hover:text-destructive text-left"
                          data-testid={`delete-${e.id}`}
                        >
                          삭제
                        </button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ))
      )}

      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>업무 기록 수정</DialogTitle></DialogHeader>
          <Textarea
            value={editMemo}
            onChange={(e) => setEditMemo(e.target.value)}
            rows={4}
            data-testid="edit-memo-input"
          />
          <Button
            onClick={() => editing && editMut.mutate({ id: editing.id, memo: editMemo.trim() })}
            disabled={editMut.isPending || !editMemo.trim()}
            data-testid="edit-save"
          >
            저장
          </Button>
        </DialogContent>
      </Dialog>

      {/* [Task #318] 문서로만들기 — 필수업무 처리완료/제안업무 처리에서 사용하는
          CompletionNotice 모달을 그대로 띄운다. 풀페이지 /documents/preview 가 아닌
          모달 UI(상단 탭 + 하단 외부공유/이미지저장/문서로저장 + 우상단 수정)와
          빌딩명·공고NO·연락처가 포함된 정형문 빌더를 그대로 공유한다. */}
      {docEntry ? (
        <CompletionNotice
          open={!!docEntry}
          onOpenChange={(v) => { if (!v) setDocEntry(null); }}
          alertTitle={`[${CATEGORY_LABEL[docEntry.category]}] ${(docEntry.memo.split("\n")[0] || "업무일지 기록").slice(0, 80)}`}
          alertMessage={docEntry.memo}
          completedDate={docEntry.occurredDate || (docEntry.occurredAt ?? new Date().toISOString()).slice(0, 10)}
          notes={null}
          closeUpPhotoUrl={docEntry.photoUrl ?? null}
          widePhotoUrl={null}
          buildingName={building?.name}
          managementOfficePhone={building?.managementOfficePhone ?? null}
          feeInquiryPhone={building?.feeInquiryPhone ?? null}
          facilitySafetyPhone={building?.facilitySafetyPhone ?? null}
          logoUrl={building?.logoUrl ?? null}
          authorName={user?.name ?? docEntry.authorName ?? null}
          initialDocKind="notice"
        />
      ) : null}
    </div>
  );
}
