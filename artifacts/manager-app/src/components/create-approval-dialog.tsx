import { useState } from "react";
import {
  useCreateApproval,
  getListApprovalsQueryKey,
  getGetApprovalStatsQueryKey,
  getGetExecutiveKpiQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogFooter,
  ResponsiveDialogTrigger,
} from "@/components/ui/responsive-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus } from "lucide-react";

const categories = [
  { value: "maintenance", label: "유지보수" },
  { value: "inspection", label: "법정점검" },
  { value: "facility", label: "시설관리" },
  { value: "equipment", label: "장비" },
  { value: "other", label: "기타" },
];

export function CreateApprovalDialog() {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("other");
  const [estimatedAmount, setEstimatedAmount] = useState("");
  const [vendorName, setVendorName] = useState("");
  const [vendorQuoteDetails, setVendorQuoteDetails] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createMutation = useCreateApproval();

  function resetForm() {
    setTitle("");
    setDescription("");
    setCategory("other");
    setEstimatedAmount("");
    setVendorName("");
    setVendorQuoteDetails("");
  }

  async function handleSubmit() {
    if (!title.trim() || !description.trim()) return;

    try {
      await createMutation.mutateAsync({
        data: {
          title: title.trim(),
          description: description.trim(),
          category,
          estimatedAmount: estimatedAmount ? Number(estimatedAmount) : null,
          vendorName: vendorName.trim() || null,
          vendorQuoteDetails: vendorQuoteDetails.trim() || null,
        },
      });
      queryClient.invalidateQueries({ queryKey: getListApprovalsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetApprovalStatsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetExecutiveKpiQueryKey() });
      toast({ title: "결재 요청이 제출되었습니다" });
      resetForm();
      setOpen(false);
    } catch {
      toast({ title: "결재 요청 제출에 실패했습니다", variant: "destructive" });
    }
  }

  return (
    <ResponsiveDialog open={open} onOpenChange={setOpen}>
      <ResponsiveDialogTrigger asChild>
        <Button size="sm" className="gap-1">
          <Plus className="w-4 h-4" />
          결재 요청
        </Button>
      </ResponsiveDialogTrigger>
      <ResponsiveDialogContent className="max-w-lg">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>결재 요청 올리기</ResponsiveDialogTitle>
        </ResponsiveDialogHeader>
        <div className="space-y-4">
          <div>
            <Label>제목 *</Label>
            <Input
              placeholder="결재 요청 제목"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div>
            <Label>분류 *</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>내용 *</Label>
            <Textarea
              placeholder="결재 요청 내용을 상세히 작성하세요"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
            />
          </div>
          <div>
            <Label>예상 금액 (원)</Label>
            <Input
              type="number"
              placeholder="0"
              value={estimatedAmount}
              onChange={(e) => setEstimatedAmount(e.target.value)}
            />
          </div>
          <div>
            <Label>업체명</Label>
            <Input
              placeholder="관련 업체명 (선택)"
              value={vendorName}
              onChange={(e) => setVendorName(e.target.value)}
            />
          </div>
          <div>
            <Label>견적 상세</Label>
            <Textarea
              placeholder="견적 비교 내역이나 상세 정보를 입력하세요 (선택)"
              value={vendorQuoteDetails}
              onChange={(e) => setVendorQuoteDetails(e.target.value)}
              rows={3}
            />
          </div>
        </div>
        <ResponsiveDialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            취소
          </Button>
          <Button
            disabled={!title.trim() || !description.trim()}
            onClick={handleSubmit}
          >
            결재 요청 제출
          </Button>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
