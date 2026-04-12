import { useState, useEffect } from "react";
import {
  useListDocumentTemplates,
  useGetDocumentTemplate,
  useSaveApprovalDraft,
  useCreateApproval,
  getListApprovalsQueryKey,
  getGetApprovalStatsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import { useLocation } from "wouter";
import {
  FileText,
  Plus,
  Save,
  Send,
  Users,
  ArrowLeft,
  X,
} from "lucide-react";

const categories = [
  { value: "maintenance", label: "유지보수" },
  { value: "inspection", label: "법정점검" },
  { value: "facility", label: "시설관리" },
  { value: "equipment", label: "장비" },
  { value: "other", label: "기타" },
];

const templateCategoryLabels: Record<string, string> = {
  general: "일반",
  certificate: "증명서",
  absence: "부재 일정",
  salary: "급여",
  maintenance: "유지보수",
};

interface UserRecord {
  id: number;
  name: string;
  email: string;
  role: string;
}

interface ApprovalStepInput {
  approverId: number;
  approverName: string;
  approverRole: string;
}

interface RecipientInput {
  userId: number;
  userName: string;
  type: "recipient" | "cc";
}

interface TemplateItem {
  id: number;
  name: string;
  category: string;
  description: string | null;
  isSystem: boolean;
  bodyTemplate: string;
}

export default function ApprovalCreate() {
  const { user, token } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const BASE = import.meta.env.BASE_URL ?? "/";
  const API_BASE = `${BASE}api`;

  const urlParams = new URLSearchParams(window.location.search);
  const draftId = urlParams.get("draftId");

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("other");
  const [estimatedAmount, setEstimatedAmount] = useState("");
  const [vendorName, setVendorName] = useState("");
  const [vendorQuoteDetails, setVendorQuoteDetails] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);

  const [approvalSteps, setApprovalSteps] = useState<ApprovalStepInput[]>([]);
  const [selectedApproverId, setSelectedApproverId] = useState("");

  const [recipients, setRecipients] = useState<RecipientInput[]>([]);
  const [selectedRecipientId, setSelectedRecipientId] = useState("");
  const [newRecipientType, setNewRecipientType] = useState<"recipient" | "cc">("recipient");

  const [userList, setUserList] = useState<UserRecord[]>([]);

  const { data: templates } = useListDocumentTemplates();
  const { data: selectedTemplate } = useGetDocumentTemplate(
    selectedTemplateId ?? 0,
    { query: { enabled: selectedTemplateId !== null } }
  );

  const createMutation = useCreateApproval();
  const saveDraftMutation = useSaveApprovalDraft();

  useEffect(() => {
    async function fetchUsers() {
      try {
        const res = await fetch(`${API_BASE}/users`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data: UserRecord[] = await res.json();
          setUserList(data);
        }
      } catch {
      }
    }
    fetchUsers();
  }, [API_BASE, token]);

  useEffect(() => {
    if (!draftId || !token) return;
    async function loadDraft() {
      try {
        const res = await fetch(`${API_BASE}/approvals/${draftId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        setTitle(data.title || "");
        setDescription(data.description || "");
        setCategory(data.category || "other");
        setEstimatedAmount(data.estimatedAmount ? String(data.estimatedAmount) : "");
        setVendorName(data.vendorName || "");
        setVendorQuoteDetails(data.vendorQuoteDetails || "");
        if (data.templateId) setSelectedTemplateId(data.templateId);

        const stepsRes = await fetch(`${API_BASE}/approvals/${draftId}/steps`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (stepsRes.ok) {
          const stepsData = await stepsRes.json();
          setApprovalSteps(stepsData.map((s: { approverId: number; approverName: string; approverRole: string }) => ({
            approverId: s.approverId,
            approverName: s.approverName,
            approverRole: s.approverRole,
          })));
        }

        const recipientsRes = await fetch(`${API_BASE}/approvals/${draftId}/recipients`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (recipientsRes.ok) {
          const recipientsData = await recipientsRes.json();
          setRecipients(recipientsData.map((r: { userId: number; userName: string; type: "recipient" | "cc" }) => ({
            userId: r.userId,
            userName: r.userName,
            type: r.type,
          })));
        }
      } catch {
      }
    }
    loadDraft();
  }, [draftId, API_BASE, token]);

  useEffect(() => {
    if (selectedTemplate) {
      setTitle(selectedTemplate.name);
      setDescription(selectedTemplate.bodyTemplate);
    }
  }, [selectedTemplate]);

  function addStep() {
    const userId = Number(selectedApproverId);
    if (!userId) return;
    const selectedUser = userList.find((u) => u.id === userId);
    if (!selectedUser) return;
    if (approvalSteps.some((s) => s.approverId === userId)) {
      toast({ title: "이미 결재선에 추가된 사용자입니다", variant: "destructive" });
      return;
    }
    setApprovalSteps([
      ...approvalSteps,
      {
        approverId: selectedUser.id,
        approverName: selectedUser.name,
        approverRole: selectedUser.role,
      },
    ]);
    setSelectedApproverId("");
  }

  function removeStep(index: number) {
    setApprovalSteps(approvalSteps.filter((_, i) => i !== index));
  }

  function addRecipient() {
    const userId = Number(selectedRecipientId);
    if (!userId) return;
    const selectedUser = userList.find((u) => u.id === userId);
    if (!selectedUser) return;
    if (recipients.some((r) => r.userId === userId)) {
      toast({ title: "이미 수신자에 추가된 사용자입니다", variant: "destructive" });
      return;
    }
    setRecipients([
      ...recipients,
      {
        userId: selectedUser.id,
        userName: selectedUser.name,
        type: newRecipientType,
      },
    ]);
    setSelectedRecipientId("");
  }

  function removeRecipient(index: number) {
    setRecipients(recipients.filter((_, i) => i !== index));
  }

  function buildPayload() {
    return {
      title: title.trim(),
      description: description.trim(),
      category,
      templateId: selectedTemplateId,
      estimatedAmount: estimatedAmount ? Number(estimatedAmount) : null,
      vendorName: vendorName.trim() || null,
      vendorQuoteDetails: vendorQuoteDetails.trim() || null,
      approvalSteps: approvalSteps.length > 0 ? approvalSteps : undefined,
      recipients: recipients.length > 0 ? recipients : undefined,
    };
  }

  async function handleSubmit() {
    if (!title.trim() || !description.trim()) {
      toast({ title: "제목과 내용을 입력해주세요", variant: "destructive" });
      return;
    }

    try {
      const payload = buildPayload();
      const url = draftId ? `${API_BASE}/approvals/draft/${draftId}/submit` : `${API_BASE}/approvals`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        toast({ title: err?.error || "결재 요청 제출에 실패했습니다", variant: "destructive" });
        return;
      }
      queryClient.invalidateQueries({ queryKey: getListApprovalsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetApprovalStatsQueryKey() });
      toast({ title: "결재 요청이 제출되었습니다" });
      setLocation("/approvals");
    } catch {
      toast({ title: "결재 요청 제출에 실패했습니다", variant: "destructive" });
    }
  }

  async function handleSaveDraft() {
    try {
      const payload = buildPayload();
      payload.title = payload.title || "임시 저장";
      const url = draftId ? `${API_BASE}/approvals/draft/${draftId}` : `${API_BASE}/approvals/draft`;
      const method = draftId ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        toast({ title: err?.error || "임시 저장에 실패했습니다", variant: "destructive" });
        return;
      }
      toast({ title: "임시 저장되었습니다" });
      setLocation("/approvals");
    } catch {
      toast({ title: "임시 저장에 실패했습니다", variant: "destructive" });
    }
  }

  const roleLabels: Record<string, string> = {
    manager: "관리소장",
    partner: "파트너사",
    platform_admin: "플랫폼 관리자",
  };

  const availableApprovers = userList.filter(
    (u) => !approvalSteps.some((s) => s.approverId === u.id) && u.id !== user?.userId
  );

  const availableRecipients = userList.filter(
    (u) => !recipients.some((r) => r.userId === u.id)
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => setLocation("/approvals")}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">결재 문서 작성</h1>
          <p className="text-muted-foreground text-sm mt-1">
            서식을 선택하고 결재선을 설정하여 결재를 올리세요
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="w-4 h-4" />
                서식 선택
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={() => setTemplateDialogOpen(true)}
              >
                {selectedTemplate
                  ? `${selectedTemplate.name} (${templateCategoryLabels[selectedTemplate.category] || selectedTemplate.category})`
                  : "서식을 선택하세요 (선택사항)"}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">문서 내용</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>제목 *</Label>
                <Input
                  placeholder="결재 문서 제목"
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
                  placeholder="결재 내용을 상세히 작성하세요"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={10}
                  className="font-mono text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
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
                    placeholder="관련 업체명"
                    value={vendorName}
                    onChange={(e) => setVendorName(e.target.value)}
                  />
                </div>
              </div>
              <div>
                <Label>견적 상세</Label>
                <Textarea
                  placeholder="견적 비교 내역"
                  value={vendorQuoteDetails}
                  onChange={(e) => setVendorQuoteDetails(e.target.value)}
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="w-4 h-4" />
                결재선 설정
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">
                결재선을 추가하면 순차적으로 결재가 진행됩니다 (최대 5단계)
              </p>
              {approvalSteps.map((step, i) => (
                <div
                  key={step.approverId}
                  className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg"
                >
                  <Badge variant="outline" className="shrink-0">
                    {i + 1}단계
                  </Badge>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{step.approverName}</p>
                    <p className="text-xs text-muted-foreground">
                      {roleLabels[step.approverRole] || step.approverRole}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={() => removeStep(i)}
                  >
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              ))}
              {approvalSteps.length < 5 && (
                <div className="space-y-2 pt-2 border-t">
                  <Select value={selectedApproverId} onValueChange={setSelectedApproverId}>
                    <SelectTrigger className="text-sm">
                      <SelectValue placeholder="결재자를 선택하세요" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableApprovers.map((u) => (
                        <SelectItem key={u.id} value={String(u.id)}>
                          {u.name} ({roleLabels[u.role] || u.role})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    className="w-full"
                    onClick={addStep}
                    disabled={!selectedApproverId}
                  >
                    <Plus className="w-3 h-3 mr-1" />
                    결재자 추가
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">수신처 / 공유</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">
                결재 완료 후 문서가 공유될 대상을 지정합니다
              </p>
              {recipients.map((r, i) => (
                <div
                  key={r.userId}
                  className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg"
                >
                  <Badge
                    variant={r.type === "recipient" ? "default" : "secondary"}
                    className="shrink-0 text-xs"
                  >
                    {r.type === "recipient" ? "수신" : "참조"}
                  </Badge>
                  <span className="text-sm flex-1">{r.userName}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={() => removeRecipient(i)}
                  >
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              ))}
              <div className="space-y-2 pt-2 border-t">
                <Select value={selectedRecipientId} onValueChange={setSelectedRecipientId}>
                  <SelectTrigger className="text-sm">
                    <SelectValue placeholder="수신자를 선택하세요" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableRecipients.map((u) => (
                      <SelectItem key={u.id} value={String(u.id)}>
                        {u.name} ({roleLabels[u.role] || u.role})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex gap-2">
                  <Select
                    value={newRecipientType}
                    onValueChange={(v: string) => {
                      if (v === "recipient" || v === "cc") {
                        setNewRecipientType(v);
                      }
                    }}
                  >
                    <SelectTrigger className="text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="recipient">수신</SelectItem>
                      <SelectItem value="cc">참조(CC)</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    onClick={addRecipient}
                    disabled={!selectedRecipientId}
                  >
                    <Plus className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex flex-col gap-2">
            <Button onClick={handleSubmit} disabled={!title.trim() || !description.trim()}>
              <Send className="w-4 h-4 mr-2" />
              결재 요청 제출
            </Button>
            <Button variant="outline" onClick={handleSaveDraft}>
              <Save className="w-4 h-4 mr-2" />
              임시 저장
            </Button>
          </div>
        </div>
      </div>

      <ResponsiveDialog open={templateDialogOpen} onOpenChange={setTemplateDialogOpen}>
        <ResponsiveDialogContent className="max-w-lg">
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>서식 선택</ResponsiveDialogTitle>
          </ResponsiveDialogHeader>
          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            {templates?.map((t: TemplateItem) => (
              <div
                key={t.id}
                className="p-3 border rounded-lg cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => {
                  setSelectedTemplateId(t.id);
                  setTemplateDialogOpen(false);
                }}
              >
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{t.name}</span>
                  <Badge variant="outline" className="text-xs">
                    {templateCategoryLabels[t.category] || t.category}
                  </Badge>
                  {t.isSystem && (
                    <Badge variant="secondary" className="text-xs">
                      기본
                    </Badge>
                  )}
                </div>
                {t.description && (
                  <p className="text-xs text-muted-foreground mt-1">{t.description}</p>
                )}
              </div>
            ))}
            {(!templates || templates.length === 0) && (
              <p className="text-center text-muted-foreground py-4">
                등록된 서식이 없습니다
              </p>
            )}
          </div>
          <ResponsiveDialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setSelectedTemplateId(null);
                setTemplateDialogOpen(false);
              }}
            >
              서식 없이 작성
            </Button>
          </ResponsiveDialogFooter>
        </ResponsiveDialogContent>
      </ResponsiveDialog>
    </div>
  );
}
