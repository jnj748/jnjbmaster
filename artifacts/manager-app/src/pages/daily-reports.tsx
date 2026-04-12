import { useState } from "react";
import {
  useListDailyReports,
  useCreateDailyReport,
  useSubmitDailyReport,
  useReviewDailyReport,
  getListDailyReportsQueryKey,
  type CreateDailyReportBodyReportType,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogFooter,
} from "@/components/ui/responsive-dialog";
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/utils";
import {
  FileText,
  Plus,
  Send,
  CheckCircle,
  Eye,
  Calendar,
} from "lucide-react";

const reportTypeLabels: Record<string, string> = {
  expense: "경비 일지",
  cleaning: "미화 일지",
  maintenance: "유지보수",
  security: "보안 일지",
  other: "기타",
};

const statusLabels: Record<string, string> = {
  draft: "작성중",
  submitted: "제출됨",
  reviewed: "검토완료",
  forwarded: "전달됨",
};

const statusVariants: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  draft: "secondary",
  submitted: "outline",
  reviewed: "default",
  forwarded: "default",
};

export default function DailyReports() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isManager = user?.role === "manager";

  const [dateFilter, setDateFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);

  const [formDate, setFormDate] = useState(new Date().toISOString().split("T")[0]);
  const [formType, setFormType] = useState<CreateDailyReportBodyReportType>("expense");
  const [formTitle, setFormTitle] = useState("");
  const [formContent, setFormContent] = useState("");
  const [formPhotos, setFormPhotos] = useState("");

  const { data: reports, isLoading } = useListDailyReports(
    {
      ...(dateFilter ? { date: dateFilter } : {}),
      ...(typeFilter ? { type: typeFilter } : {}),
    }
  );

  const createMutation = useCreateDailyReport();
  const submitMutation = useSubmitDailyReport();
  const reviewMutation = useReviewDailyReport();

  const selectedReport = reports?.find((r) => r.id === detailId);

  function resetForm() {
    setFormDate(new Date().toISOString().split("T")[0]);
    setFormType("expense");
    setFormTitle("");
    setFormContent("");
    setFormPhotos("");
  }

  async function handleCreate() {
    if (!formTitle.trim() || !formContent.trim()) return;
    try {
      await createMutation.mutateAsync({
        data: {
          reportDate: formDate,
          reportType: formType,
          title: formTitle.trim(),
          content: formContent.trim(),
          photos: formPhotos.trim() || null,
        },
      });
      queryClient.invalidateQueries({ queryKey: getListDailyReportsQueryKey() });
      toast({ title: "일간 보고서가 작성 및 제출되었습니다" });
      resetForm();
      setCreateOpen(false);
    } catch {
      toast({ title: "작성에 실패했습니다", variant: "destructive" });
    }
  }

  async function handleSubmit(id: number) {
    try {
      await submitMutation.mutateAsync({ id });
      queryClient.invalidateQueries({ queryKey: getListDailyReportsQueryKey() });
      toast({ title: "보고서가 제출되었습니다" });
      setDetailId(null);
    } catch {
      toast({ title: "제출에 실패했습니다", variant: "destructive" });
    }
  }

  async function handleReview(id: number) {
    try {
      await reviewMutation.mutateAsync({ id, data: { comment: null } });
      queryClient.invalidateQueries({ queryKey: getListDailyReportsQueryKey() });
      toast({ title: "보고서가 검토 완료되었습니다" });
      setDetailId(null);
    } catch {
      toast({ title: "검토에 실패했습니다", variant: "destructive" });
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">일간 보고서</h1>
          <p className="text-muted-foreground text-sm mt-1">
            경비/미화 일지를 작성하고 관리합니다
          </p>
        </div>
        <Button size="sm" className="gap-1" onClick={() => setCreateOpen(true)}>
          <Plus className="w-4 h-4" />
          일간 보고서 작성
        </Button>
      </div>

      <div className="flex gap-3 flex-wrap">
        <div>
          <Input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="w-40"
            placeholder="날짜 필터"
          />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-32">
            <SelectValue placeholder="전체 유형" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">전체</SelectItem>
            <SelectItem value="expense">경비 일지</SelectItem>
            <SelectItem value="cleaning">미화 일지</SelectItem>
            <SelectItem value="maintenance">유지보수</SelectItem>
            <SelectItem value="security">보안 일지</SelectItem>
            <SelectItem value="other">기타</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20" />)}
        </div>
      ) : reports && reports.length > 0 ? (
        <div className="space-y-3">
          {reports.map((r) => (
            <Card
              key={r.id}
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => setDetailId(r.id)}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-sm">{r.title}</span>
                      <Badge variant={statusVariants[r.status] ?? "outline"} className="text-xs">
                        {statusLabels[r.status] || r.status}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        {reportTypeLabels[r.reportType] || r.reportType}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {r.reportDate}
                      </span>
                      <span>작성자: {r.authorName}</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground">일간 보고서가 없습니다</p>
          </CardContent>
        </Card>
      )}

      <ResponsiveDialog open={createOpen} onOpenChange={setCreateOpen}>
        <ResponsiveDialogContent className="max-w-lg">
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>일간 보고서 작성</ResponsiveDialogTitle>
          </ResponsiveDialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>보고일 *</Label>
                <Input
                  type="date"
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                />
              </div>
              <div>
                <Label>보고 유형 *</Label>
                <Select value={formType} onValueChange={(v: string) => setFormType(v as CreateDailyReportBodyReportType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="expense">경비 일지</SelectItem>
                    <SelectItem value="cleaning">미화 일지</SelectItem>
                    <SelectItem value="maintenance">유지보수</SelectItem>
                    <SelectItem value="security">보안 일지</SelectItem>
                    <SelectItem value="other">기타</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>제목 *</Label>
              <Input
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                placeholder="보고서 제목"
              />
            </div>
            <div>
              <Label>내용 *</Label>
              <Textarea
                value={formContent}
                onChange={(e) => setFormContent(e.target.value)}
                placeholder="보고 내용을 작성하세요"
                rows={6}
              />
            </div>
            <div>
              <Label>사진 URL (여러 장은 쉼표로 구분)</Label>
              <Input
                value={formPhotos}
                onChange={(e) => setFormPhotos(e.target.value)}
                placeholder="https://example.com/photo1.jpg, https://..."
              />
            </div>
          </div>
          <ResponsiveDialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              취소
            </Button>
            <Button
              onClick={handleCreate}
              disabled={!formTitle.trim() || !formContent.trim()}
            >
              <Send className="w-4 h-4 mr-1" />
              작성 및 제출
            </Button>
          </ResponsiveDialogFooter>
        </ResponsiveDialogContent>
      </ResponsiveDialog>

      <ResponsiveDialog
        open={detailId !== null}
        onOpenChange={(o) => !o && setDetailId(null)}
      >
        {selectedReport && (
          <ResponsiveDialogContent className="max-w-lg">
            <ResponsiveDialogHeader>
              <ResponsiveDialogTitle className="flex items-center gap-2">
                <Eye className="w-5 h-5" />
                보고서 상세
              </ResponsiveDialogTitle>
            </ResponsiveDialogHeader>
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <span className="font-semibold">{selectedReport.title}</span>
                <Badge variant={statusVariants[selectedReport.status] ?? "outline"}>
                  {statusLabels[selectedReport.status]}
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground">보고일</p>
                  <p>{selectedReport.reportDate}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">유형</p>
                  <p>{reportTypeLabels[selectedReport.reportType]}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">작성자</p>
                  <p>{selectedReport.authorName}</p>
                </div>
                {selectedReport.reviewerName && (
                  <div>
                    <p className="text-muted-foreground">검토자</p>
                    <p>{selectedReport.reviewerName}</p>
                  </div>
                )}
              </div>
              <div>
                <p className="text-muted-foreground text-sm mb-1">내용</p>
                <div className="p-3 bg-muted/50 rounded-lg text-sm whitespace-pre-wrap">
                  {selectedReport.content}
                </div>
              </div>
              {selectedReport.photos && (
                <div>
                  <p className="text-muted-foreground text-sm mb-1">첨부 사진</p>
                  <div className="flex flex-wrap gap-2">
                    {selectedReport.photos.split(",").map((url, i) => (
                      <a
                        key={i}
                        href={url.trim()}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-600 underline"
                      >
                        사진 {i + 1}
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <ResponsiveDialogFooter>
              {selectedReport.status === "draft" && (
                <Button onClick={() => handleSubmit(selectedReport.id)}>
                  <Send className="w-4 h-4 mr-1" />
                  제출
                </Button>
              )}
              {selectedReport.status === "submitted" && isManager && (
                <Button onClick={() => handleReview(selectedReport.id)}>
                  <CheckCircle className="w-4 h-4 mr-1" />
                  검토 완료
                </Button>
              )}
            </ResponsiveDialogFooter>
          </ResponsiveDialogContent>
        )}
      </ResponsiveDialog>
    </div>
  );
}
