import { useState } from "react";
import { useListDrafts, useGetDraft, useUpdateDraft, getListDraftsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@/components/ui/responsive-dialog";
import { ClipboardList, FileText, CheckCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/utils";

const draftTypeLabels: Record<string, string> = {
  expense_approval: "지출품의서",
  vendor_selection: "용역업체 선정 기안",
  repair_maintenance: "수선유지비 지출 기안",
};

const statusLabels: Record<string, string> = {
  draft: "초안",
  confirmed: "확정",
};

export default function Drafts() {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [editBody, setEditBody] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: drafts, isLoading } = useListDrafts();
  const { data: selectedDraft } = useGetDraft(selectedId ?? 0, {
    query: { enabled: selectedId !== null },
  });
  const updateMutation = useUpdateDraft();

  function openDraft(id: number) {
    setSelectedId(id);
    setIsEditing(false);
  }

  function startEdit() {
    if (selectedDraft) {
      setEditBody(selectedDraft.body);
      setIsEditing(true);
    }
  }

  async function handleSave() {
    if (!selectedId) return;
    await updateMutation.mutateAsync({
      id: selectedId,
      data: { body: editBody },
    });
    queryClient.invalidateQueries({ queryKey: getListDraftsQueryKey() });
    setIsEditing(false);
    toast({ title: "기안서가 수정되었습니다" });
  }

  async function handleConfirm() {
    if (!selectedId) return;
    await updateMutation.mutateAsync({
      id: selectedId,
      data: { status: "confirmed" as any },
    });
    queryClient.invalidateQueries({ queryKey: getListDraftsQueryKey() });
    toast({ title: "기안서가 확정되었습니다" });
  }

  const statusColor = (s: string) => {
    switch (s) {
      case "draft": return "secondary";
      case "confirmed": return "outline";
      default: return "outline" as const;
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">기안서 관리</h1>
        <p className="text-muted-foreground text-sm mt-1">
          법정 점검에서 자동 생성된 기안서를 관리합니다
        </p>
      </div>

      <ResponsiveDialog open={selectedId !== null} onOpenChange={(o) => { if (!o) { setSelectedId(null); setIsEditing(false); } }}>
        <ResponsiveDialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>{selectedDraft?.title}</ResponsiveDialogTitle>
          </ResponsiveDialogHeader>
          {selectedDraft && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Badge variant={statusColor(selectedDraft.status) as any}>
                  {statusLabels[selectedDraft.status] || selectedDraft.status}
                </Badge>
                <Badge variant="outline">
                  {draftTypeLabels[selectedDraft.draftType] || selectedDraft.draftType}
                </Badge>
                <span className="text-xs text-muted-foreground ml-auto">
                  {formatDate(selectedDraft.createdAt)}
                </span>
              </div>

              {isEditing ? (
                <div className="space-y-3">
                  <Textarea
                    value={editBody}
                    onChange={(e) => setEditBody(e.target.value)}
                    className="min-h-[300px] font-mono text-sm"
                  />
                  <div className="flex gap-2">
                    <Button onClick={handleSave}>저장</Button>
                    <Button variant="outline" onClick={() => setIsEditing(false)}>취소</Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <pre className="whitespace-pre-wrap text-sm bg-muted/50 p-4 rounded-lg">
                    {selectedDraft.body}
                  </pre>
                  <div className="flex gap-2">
                    {selectedDraft.status === "draft" && (
                      <>
                        <Button variant="outline" onClick={startEdit}>
                          <FileText className="w-4 h-4 mr-2" />
                          수정
                        </Button>
                        <Button onClick={handleConfirm}>
                          <CheckCircle className="w-4 h-4 mr-2" />
                          확정
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </ResponsiveDialogContent>
      </ResponsiveDialog>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20" />)}
        </div>
      ) : drafts && drafts.length > 0 ? (
        <div className="space-y-3">
          {drafts.map((draft) => (
            <Card key={draft.id} className="cursor-pointer hover:bg-muted/30 transition-colors" onClick={() => openDraft(draft.id)}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-accent/10">
                      <ClipboardList className="w-4 h-4 text-accent" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">{draft.title}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant={statusColor(draft.status) as any} className="text-xs">
                          {statusLabels[draft.status] || draft.status}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {draftTypeLabels[draft.draftType] || draft.draftType}
                        </Badge>
                      </div>
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {formatDate(draft.createdAt)}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <ClipboardList className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground">생성된 기안서가 없습니다</p>
            <p className="text-sm text-muted-foreground mt-1">
              법정 점검 완료 시 불량 판정이나 사전 알림 시 자동으로 기안서가 생성됩니다
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
