import { useState } from "react";
import {
  useListDocumentTemplates,
  useCreateDocumentTemplate,
  useUpdateDocumentTemplate,
  useDeleteDocumentTemplate,
  getListDocumentTemplatesQueryKey,
  type CreateDocumentTemplateBodyCategory,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

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
import { FileText, Plus, Edit, Trash2, Settings } from "lucide-react";

// 코드젠된 DocumentTemplateItem 을 단일 SoT 로 사용한다.
import type { DocumentTemplateItem as TemplateItem } from "@workspace/api-client-react";

const categoryLabels: Record<string, string> = {
  general: "일반",
  certificate: "증명서",
  absence: "부재 일정",
  salary: "급여",
  maintenance: "유지보수",
};

export default function DocumentTemplates() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: templates, isLoading } = useListDocumentTemplates();
  const createMutation = useCreateDocumentTemplate();
  const updateMutation = useUpdateDocumentTemplate();
  const deleteMutation = useDeleteDocumentTemplate();

  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [formName, setFormName] = useState("");
  const [formCategory, setFormCategory] = useState<CreateDocumentTemplateBodyCategory>("general");
  const [formDescription, setFormDescription] = useState("");
  const [formFields, setFormFields] = useState("");
  const [formBody, setFormBody] = useState("");

  function openCreate() {
    setEditId(null);
    setFormName("");
    setFormCategory("general");
    setFormDescription("");
    setFormFields("[]");
    setFormBody("");
    setEditOpen(true);
  }

  function openEdit(t: TemplateItem) {
    setEditId(t.id);
    setFormName(t.name);
    setFormCategory(t.category as CreateDocumentTemplateBodyCategory);
    setFormDescription(t.description || "");
    setFormFields(t.fields);
    setFormBody(t.bodyTemplate);
    setEditOpen(true);
  }

  async function handleSave() {
    if (!formName.trim() || !formBody.trim()) {
      toast({ title: "이름과 본문 템플릿을 입력해주세요", variant: "destructive" });
      return;
    }

    try {
      const data = {
        name: formName.trim(),
        category: formCategory,
        description: formDescription.trim() || null,
        fields: formFields || "[]",
        bodyTemplate: formBody.trim(),
      };

      if (editId) {
        await updateMutation.mutateAsync({ id: editId, data });
        toast({ title: "서식이 수정되었습니다" });
      } else {
        await createMutation.mutateAsync({ data });
        toast({ title: "서식이 추가되었습니다" });
      }
      queryClient.invalidateQueries({ queryKey: getListDocumentTemplatesQueryKey() });
      setEditOpen(false);
    } catch {
      toast({ title: "처리에 실패했습니다", variant: "destructive" });
    }
  }

  async function handleDelete(id: number) {
    try {
      await deleteMutation.mutateAsync({ id });
      queryClient.invalidateQueries({ queryKey: getListDocumentTemplatesQueryKey() });
      toast({ title: "서식이 삭제되었습니다" });
    } catch {
      toast({ title: "삭제에 실패했습니다", variant: "destructive" });
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">서식 템플릿 관리</h1>
          <p className="text-muted-foreground text-sm mt-1">
            결재 문서에 사용할 서식 템플릿을 관리합니다
          </p>
        </div>
        <Button size="sm" className="gap-1" onClick={openCreate}>
          <Plus className="w-4 h-4" />
          서식 추가
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">로딩 중...</div>
      ) : templates && templates.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {templates.map((t) => (
            <Card key={t.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className="p-2 rounded-lg bg-accent/10 shrink-0">
                      <FileText className="w-4 h-4 text-accent" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{t.name}</span>
                        <Badge variant="outline" className="text-xs">
                          {categoryLabels[t.category] || t.category}
                        </Badge>
                        {t.isSystem && (
                          <Badge variant="secondary" className="text-xs">기본</Badge>
                        )}
                      </div>
                      {t.description && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {t.description}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0 ml-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={() => openEdit(t)}
                    >
                      <Edit className="w-3.5 h-3.5" />
                    </Button>
                    {!t.isSystem && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-destructive"
                        onClick={() => handleDelete(t.id)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <Settings className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground">등록된 서식이 없습니다</p>
          </CardContent>
        </Card>
      )}

      <ResponsiveDialog open={editOpen} onOpenChange={setEditOpen}>
        <ResponsiveDialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>{editId ? "서식 수정" : "서식 추가"}</ResponsiveDialogTitle>
          </ResponsiveDialogHeader>
          <div className="space-y-4">
            <div>
              <Label>서식 이름 *</Label>
              <Input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="예: 일반 기안지"
              />
            </div>
            <div>
              <Label>분류</Label>
              <Select value={formCategory} onValueChange={(v: string) => setFormCategory(v as CreateDocumentTemplateBodyCategory)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="general">일반</SelectItem>
                  <SelectItem value="certificate">증명서</SelectItem>
                  <SelectItem value="absence">부재 일정</SelectItem>
                  <SelectItem value="salary">급여</SelectItem>
                  <SelectItem value="maintenance">유지보수</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>설명</Label>
              <Input
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="서식에 대한 간단한 설명"
              />
            </div>
            <div>
              <Label>필드 정의 (JSON)</Label>
              <Textarea
                value={formFields}
                onChange={(e) => setFormFields(e.target.value)}
                rows={4}
                className="font-mono text-xs"
                placeholder='[{"key": "subject", "label": "제목", "type": "text", "required": true}]'
              />
            </div>
            <div>
              <Label>본문 템플릿 *</Label>
              <Textarea
                value={formBody}
                onChange={(e) => setFormBody(e.target.value)}
                rows={8}
                className="font-mono text-sm"
                placeholder="기안지 본문 템플릿을 입력하세요. {{fieldKey}} 형식으로 필드를 참조할 수 있습니다."
              />
            </div>
          </div>
          <ResponsiveDialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              취소
            </Button>
            <Button onClick={handleSave} disabled={!formName.trim() || !formBody.trim()}>
              {editId ? "수정" : "추가"}
            </Button>
          </ResponsiveDialogFooter>
        </ResponsiveDialogContent>
      </ResponsiveDialog>
    </div>
  );
}
