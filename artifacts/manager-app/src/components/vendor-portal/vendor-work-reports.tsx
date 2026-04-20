import { useState } from "react";
import {
  getListWorkReportsQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@/components/ui/responsive-dialog";
import { Textarea } from "@/components/ui/textarea";
import { ClipboardCheck } from "lucide-react";
import { formatDate } from "@/lib/utils";

export function VendorWorkReports({ reports, quotes, vendorId, vendorName, queryClient, createReportMutation, toast }: any) {
  const [reportDialog, setReportDialog] = useState(false);
  const [reportForm, setReportForm] = useState({
    quoteId: "",
    title: "",
    description: "",
    completedDate: "",
  });

  async function handleSubmitReport(e: React.FormEvent) {
    e.preventDefault();
    const selectedQuote = quotes.find((q: any) => q.id === parseInt(reportForm.quoteId));
    if (!selectedQuote) return;

    await createReportMutation.mutateAsync({
      data: {
        rfqId: selectedQuote.rfqId,
        vendorId,
        vendorName,
        quoteId: selectedQuote.id,
        title: reportForm.title,
        description: reportForm.description || null,
        completedDate: reportForm.completedDate,
      },
    });
    queryClient.invalidateQueries({ queryKey: getListWorkReportsQueryKey() });
    toast({ title: "작업 보고서가 제출되었습니다" });
    setReportDialog(false);
    setReportForm({ quoteId: "", title: "", description: "", completedDate: "" });
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setReportDialog(true)} disabled={quotes.length === 0}>
          <ClipboardCheck className="w-4 h-4 mr-1" />
          작업 보고
        </Button>
      </div>

      {reports.length > 0 ? (
        <div className="space-y-3">
          {reports.map((r: any) => (
            <Card key={r.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-medium text-sm">{r.title}</h3>
                    <p className="text-xs text-muted-foreground mt-1">완료일: {formatDate(r.completedDate)}</p>
                    {r.description && <p className="text-sm text-muted-foreground mt-1">{r.description}</p>}
                  </div>
                  <Badge variant={r.status === "approved" ? "default" : r.status === "rejected" ? "destructive" : "secondary"}>
                    {r.status === "approved" ? "승인" : r.status === "rejected" ? "반려" : "검수중"}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <ClipboardCheck className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground">작업 보고가 없습니다</p>
          </CardContent>
        </Card>
      )}

      <ResponsiveDialog open={reportDialog} onOpenChange={setReportDialog}>
        <ResponsiveDialogContent className="max-w-lg">
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>작업 완료 보고</ResponsiveDialogTitle>
          </ResponsiveDialogHeader>
          <form onSubmit={handleSubmitReport} className="space-y-4">
            <div>
              <Label>채택된 견적 선택</Label>
              <select
                className="w-full border rounded-md p-2 text-sm"
                value={reportForm.quoteId}
                onChange={(e) => setReportForm({ ...reportForm, quoteId: e.target.value })}
                required
              >
                <option value="">선택하세요</option>
                {quotes.map((q: any) => (
                  <option key={q.id} value={q.id}>
                    RFQ #{q.rfqId} - {q.totalAmount.toLocaleString()}원
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>보고서 제목</Label>
              <Input
                value={reportForm.title}
                onChange={(e) => setReportForm({ ...reportForm, title: e.target.value })}
                required
              />
            </div>
            <div>
              <Label>작업 내용</Label>
              <Textarea
                value={reportForm.description}
                onChange={(e) => setReportForm({ ...reportForm, description: e.target.value })}
              />
            </div>
            <div>
              <Label>완료일</Label>
              <Input
                type="date"
                value={reportForm.completedDate}
                onChange={(e) => setReportForm({ ...reportForm, completedDate: e.target.value })}
                required
              />
            </div>
            <Button type="submit" className="w-full">보고서 제출</Button>
          </form>
        </ResponsiveDialogContent>
      </ResponsiveDialog>
    </div>
  );
}
