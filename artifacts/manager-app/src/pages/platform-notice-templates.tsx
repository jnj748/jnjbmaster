import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListAdminBuildingNoticeTemplates,
  createBuildingNoticeTemplate,
  updateBuildingNoticeTemplate,
  deleteBuildingNoticeTemplate,
  upsertNoticeLayout,
} from "@workspace/api-client-react";
import type {
  BuildingNoticeTemplate,
  UpsertBuildingNoticeTemplateBody,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogFooter,
} from "@/components/ui/responsive-dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { NoticeLayoutFrame } from "@/components/notice-layout-frame";
import { useNoticeLayout } from "@/hooks/use-notice-layout";
import { DEFAULT_NOTICE_LAYOUT, type NoticeLayoutSettings } from "@/lib/notice-layout";

// [Task #323] platform_admin 전용 — 공지문 템플릿 관리.
//   매니저가 사용하는 모든 템플릿(불조심/분리수거 등)을 여기서 추가/수정/삭제한다.

type ScheduleType = "none" | "yearly" | "monthly" | "before_inspection";

interface FormState {
  id?: number;
  title: string;
  category: string;
  icon: string;
  bodyHtml: string;
  customFieldLabelsCsv: string; // 사용자에게는 콤마로 입력받는다 (예: "기간,장소").
  sortOrder: number;
  isActive: boolean;
  // [Task #389] 정기 게시 자동알림 설정.
  scheduleType: ScheduleType;
  scheduleMonth: string; // yearly: 1-12
  scheduleDay: string; // yearly/monthly: 1-31
  scheduleInspectionName: string; // before_inspection
  leadDays: number;
  requiresReport: boolean;
}

function blank(): FormState {
  return {
    title: "",
    category: "일반",
    icon: "📄",
    bodyHtml:
      `<div style="font-family: 'Noto Sans KR','Malgun Gothic',sans-serif;color:#111827;">\n  <h2>{{buildingName}} 안내문</h2>\n  <p>본문을 작성하세요. 사용 가능한 토큰: {{buildingName}}, {{addressFull}}, {{managementOfficePhone}}, {{feeInquiryPhone}}, {{facilitySafetyPhone}}, {{date}}, {{customA}}, {{customB}}, {{customC}}.</p>\n</div>`,
    customFieldLabelsCsv: "",
    sortOrder: 100,
    isActive: true,
    scheduleType: "none",
    scheduleMonth: "",
    scheduleDay: "",
    scheduleInspectionName: "",
    leadDays: 7,
    requiresReport: false,
  };
}

// [Task #389] 다음 게시 예정일 미리보기 — dashboard.ts/scheduler 와 동일한 occurrence
//   계산을 클라이언트에서 수행해 본사 관리자가 저장 전에 결과를 확인할 수 있게 한다.
function pad2(n: number): string { return n < 10 ? `0${n}` : `${n}`; }
function ymd(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function previewNextOccurrence(form: Pick<FormState, "scheduleType" | "scheduleMonth" | "scheduleDay" | "scheduleInspectionName">): string | null {
  const todayStr = ymd(new Date());
  const today = new Date(todayStr);
  if (form.scheduleType === "yearly") {
    const m = Number(form.scheduleMonth);
    const d = Number(form.scheduleDay);
    if (!Number.isFinite(m) || m < 1 || m > 12 || !Number.isFinite(d) || d < 1 || d > 31) return null;
    let candidate = new Date(today.getFullYear(), m - 1, d);
    if (ymd(candidate) < todayStr) candidate = new Date(today.getFullYear() + 1, m - 1, d);
    return ymd(candidate);
  }
  if (form.scheduleType === "monthly") {
    const d = Number(form.scheduleDay);
    if (!Number.isFinite(d) || d < 1 || d > 31) return null;
    let candidate = new Date(today.getFullYear(), today.getMonth(), d);
    if (ymd(candidate) < todayStr) candidate = new Date(today.getFullYear(), today.getMonth() + 1, d);
    return ymd(candidate);
  }
  return null; // before_inspection 은 건물별 inspections 조회가 필요해 미리보기 불가.
}

function parseLabels(json: string | null | undefined): string[] {
  if (!json) return [];
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export default function PlatformNoticeTemplatesPage() {
  const { data, isLoading } = useListAdminBuildingNoticeTemplates();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(blank());
  const [saving, setSaving] = useState(false);
  const templates: BuildingNoticeTemplate[] = data?.templates ?? [];

  function startCreate() {
    setForm(blank());
    setOpen(true);
  }

  function startEdit(t: BuildingNoticeTemplate) {
    const cfg = (t.scheduleConfig as Record<string, unknown> | null) ?? null;
    setForm({
      id: t.id,
      title: t.title,
      category: t.category,
      icon: t.icon ?? "",
      bodyHtml: t.bodyHtml,
      customFieldLabelsCsv: parseLabels(t.customFieldLabels).join(","),
      sortOrder: t.sortOrder,
      isActive: t.isActive,
      scheduleType: ((t.scheduleType as ScheduleType) ?? "none"),
      scheduleMonth: cfg?.month != null ? String(cfg.month) : "",
      scheduleDay: cfg?.day != null ? String(cfg.day) : "",
      scheduleInspectionName: typeof cfg?.inspectionName === "string" ? cfg.inspectionName : "",
      leadDays: t.leadDays ?? 7,
      requiresReport: !!t.requiresReport,
    });
    setOpen(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const labels = form.customFieldLabelsCsv
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      // [Task #389] scheduleType 별로 필요한 필드만 직렬화.
      let scheduleConfig: Record<string, unknown> | null = null;
      if (form.scheduleType === "yearly") {
        const m = Number(form.scheduleMonth);
        const d = Number(form.scheduleDay);
        if (!Number.isFinite(m) || m < 1 || m > 12 || !Number.isFinite(d) || d < 1 || d > 31) {
          toast({ title: "월/일을 올바르게 입력해주세요", variant: "destructive" });
          setSaving(false);
          return;
        }
        scheduleConfig = { month: m, day: d };
      } else if (form.scheduleType === "monthly") {
        const d = Number(form.scheduleDay);
        if (!Number.isFinite(d) || d < 1 || d > 31) {
          toast({ title: "일(day)을 올바르게 입력해주세요", variant: "destructive" });
          setSaving(false);
          return;
        }
        scheduleConfig = { day: d };
      } else if (form.scheduleType === "before_inspection") {
        const name = form.scheduleInspectionName.trim();
        if (!name) {
          toast({ title: "점검명을 입력해주세요", variant: "destructive" });
          setSaving(false);
          return;
        }
        scheduleConfig = { inspectionName: name };
      }
      const body: UpsertBuildingNoticeTemplateBody = {
        title: form.title,
        category: form.category || "일반",
        icon: form.icon || null,
        bodyHtml: form.bodyHtml,
        customFieldLabels: labels.length > 0 ? labels : null,
        sortOrder: Number(form.sortOrder) || 100,
        isActive: form.isActive,
        scheduleType: form.scheduleType,
        scheduleConfig,
        leadDays: Number(form.leadDays) || 0,
        requiresReport: form.requiresReport,
      };
      if (form.id) {
        await updateBuildingNoticeTemplate(form.id, body);
      } else {
        await createBuildingNoticeTemplate(body);
      }
      toast({ title: "저장되었습니다" });
      setOpen(false);
      void qc.invalidateQueries({ queryKey: ["/api/building-notice-templates/admin"] });
      void qc.invalidateQueries({ queryKey: ["/api/building-notice-templates"] });
    } catch (err: any) {
      toast({ title: "저장 실패", description: err?.message ?? "", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(t: BuildingNoticeTemplate) {
    if (!window.confirm(`"${t.title}" 템플릿을 삭제하시겠습니까?`)) return;
    try {
      await deleteBuildingNoticeTemplate(t.id);
      toast({ title: "삭제되었습니다" });
      void qc.invalidateQueries({ queryKey: ["/api/building-notice-templates/admin"] });
      void qc.invalidateQueries({ queryKey: ["/api/building-notice-templates"] });
    } catch (err: any) {
      toast({ title: "삭제 실패", description: err?.message ?? "", variant: "destructive" });
    }
  }

  return (
    <div className="container mx-auto px-4 py-6 max-w-5xl space-y-4">
      <NoticeLayoutSettingsCard />
      <Card>
        <CardHeader className="pb-2 flex-row items-center justify-between">
          <CardTitle className="text-base">공지문 템플릿 관리</CardTitle>
          <Button size="sm" onClick={startCreate} data-testid="button-create-template">
            <Plus className="w-4 h-4 mr-1" />새 템플릿
          </Button>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs" data-testid="table-templates">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="text-left px-3 py-2">정렬</th>
                  <th className="text-left px-3 py-2">아이콘</th>
                  <th className="text-left px-3 py-2">분류</th>
                  <th className="text-left px-3 py-2">제목</th>
                  <th className="text-left px-3 py-2">입력칸</th>
                  <th className="text-center px-3 py-2">활성</th>
                  <th className="text-right px-3 py-2">작업</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={7} className="px-3 py-6 text-center text-slate-500">불러오는 중…</td></tr>
                ) : templates.length === 0 ? (
                  <tr><td colSpan={7} className="px-3 py-6 text-center text-slate-500">템플릿이 없습니다</td></tr>
                ) : templates.map((t) => (
                  <tr key={t.id} className="border-t border-slate-100" data-testid={`row-template-${t.id}`}>
                    <td className="px-3 py-2">{t.sortOrder}</td>
                    <td className="px-3 py-2 text-lg">{t.icon ?? ""}</td>
                    <td className="px-3 py-2"><Badge variant="outline">{t.category}</Badge></td>
                    <td className="px-3 py-2 font-medium">{t.title}</td>
                    <td className="px-3 py-2 text-slate-500">
                      {parseLabels(t.customFieldLabels).join(", ") || "-"}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {t.isActive ? <Badge>활성</Badge> : <Badge variant="outline">비활성</Badge>}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Button size="icon" variant="ghost" onClick={() => startEdit(t)} data-testid={`button-edit-template-${t.id}`}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => handleDelete(t)} data-testid={`button-delete-template-${t.id}`}>
                        <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <ResponsiveDialog open={open} onOpenChange={setOpen}>
        <ResponsiveDialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>{form.id ? "템플릿 편집" : "새 템플릿"}</ResponsiveDialogTitle>
          </ResponsiveDialogHeader>
          <div className="space-y-3 px-1">
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <Label>제목</Label>
                <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} data-testid="input-template-title" />
              </div>
              <div>
                <Label>아이콘 (이모지)</Label>
                <Input value={form.icon} onChange={(e) => setForm({ ...form, icon: e.target.value })} placeholder="🔥" data-testid="input-template-icon" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>분류 (예: 안전, 위생, 공지)</Label>
                <Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} data-testid="input-template-category" />
              </div>
              <div>
                <Label>정렬</Label>
                <Input type="number" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) })} />
              </div>
            </div>
            <div>
              <Label>사용자 입력칸 라벨 (콤마로 구분, 최대 3개)</Label>
              <Input
                value={form.customFieldLabelsCsv}
                onChange={(e) => setForm({ ...form, customFieldLabelsCsv: e.target.value })}
                placeholder="기간, 장소"
                data-testid="input-template-labels"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                여기 적은 라벨이 입력칸으로 노출되어 본문의 {"{{customA}} {{customB}} {{customC}}"} 위치에 채워집니다.
              </p>
            </div>
            <div>
              <Label>본문 HTML</Label>
              <Textarea
                value={form.bodyHtml}
                onChange={(e) => setForm({ ...form, bodyHtml: e.target.value })}
                rows={14}
                className="font-mono text-xs"
                data-testid="input-template-body"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                토큰: {"{{buildingName}} {{addressFull}} {{managementOfficePhone}} {{feeInquiryPhone}} {{facilitySafetyPhone}} {{date}} {{customA}} {{customB}} {{customC}}"}
              </p>
              {/* [Task #399] 신규 토큰 안내 — 관리비 문의/시설 방재실 전화번호. */}
              <p className="text-[11px] text-slate-500 mt-1">
                <b>{"{{feeInquiryPhone}}"}</b> 관리비문의 전화번호 · <b>{"{{facilitySafetyPhone}}"}</b> 시설방재실 전화번호
                (건물정보 수정 화면에서 입력한 값으로 치환됩니다)
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.isActive} onCheckedChange={(v) => setForm({ ...form, isActive: v })} />
              <Label>활성화</Label>
            </div>

            {/* [Task #389] 정기 게시 자동알림 설정 */}
            <div className="border-t pt-3 mt-2 space-y-3">
              <Label className="text-sm font-semibold">정기 게시 자동알림</Label>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">스케줄 종류</Label>
                  <select
                    className="w-full h-9 border rounded-md px-2 text-sm bg-background"
                    value={form.scheduleType}
                    onChange={(e) => setForm({ ...form, scheduleType: e.target.value as ScheduleType })}
                    data-testid="select-template-schedule-type"
                  >
                    <option value="none">없음 (수동)</option>
                    <option value="yearly">매년 동일일</option>
                    <option value="monthly">매월 동일일</option>
                    <option value="before_inspection">법정 점검 N일 전</option>
                  </select>
                </div>
                <div>
                  <Label className="text-xs">매니저 D-N (며칠 전부터 노출)</Label>
                  <Input
                    type="number"
                    min={0}
                    max={365}
                    value={form.leadDays}
                    onChange={(e) => setForm({ ...form, leadDays: Number(e.target.value) })}
                    data-testid="input-template-lead-days"
                  />
                </div>
              </div>
              {form.scheduleType === "yearly" && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">월 (1-12)</Label>
                    <Input
                      type="number"
                      min={1}
                      max={12}
                      value={form.scheduleMonth}
                      onChange={(e) => setForm({ ...form, scheduleMonth: e.target.value })}
                      data-testid="input-template-schedule-month"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">일 (1-31)</Label>
                    <Input
                      type="number"
                      min={1}
                      max={31}
                      value={form.scheduleDay}
                      onChange={(e) => setForm({ ...form, scheduleDay: e.target.value })}
                      data-testid="input-template-schedule-day-yearly"
                    />
                  </div>
                </div>
              )}
              {form.scheduleType === "monthly" && (
                <div>
                  <Label className="text-xs">일 (1-31)</Label>
                  <Input
                    type="number"
                    min={1}
                    max={31}
                    value={form.scheduleDay}
                    onChange={(e) => setForm({ ...form, scheduleDay: e.target.value })}
                    data-testid="input-template-schedule-day-monthly"
                  />
                </div>
              )}
              {form.scheduleType === "before_inspection" && (
                <div>
                  <Label className="text-xs">점검명 (inspections.name 과 동일)</Label>
                  <Input
                    value={form.scheduleInspectionName}
                    onChange={(e) => setForm({ ...form, scheduleInspectionName: e.target.value })}
                    placeholder="예: 소방시설 작동기능점검"
                    data-testid="input-template-schedule-inspection"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    각 건물 inspections 테이블의 동명 점검 nextDueDate 가 D-Day 가 됩니다.
                  </p>
                </div>
              )}
              {form.scheduleType !== "none" && (
                <div
                  className="text-[12px] bg-slate-50 border border-slate-200 rounded px-2 py-1.5 text-slate-700"
                  data-testid="text-template-next-occurrence-preview"
                >
                  {form.scheduleType === "before_inspection"
                    ? "다음 게시 예정일은 각 건물의 동일 점검 일정에 따라 자동 계산됩니다."
                    : (() => {
                        const next = previewNextOccurrence(form);
                        return next
                          ? `다음 게시 예정일: ${next} (D-${form.leadDays}일 전부터 매니저 대시보드에 노출)`
                          : "월/일을 입력하면 다음 게시 예정일이 표시됩니다.";
                      })()}
                </div>
              )}
              <div className="flex items-center gap-2">
                <Switch
                  checked={form.requiresReport}
                  onCheckedChange={(v) => setForm({ ...form, requiresReport: v })}
                  data-testid="switch-template-requires-report"
                />
                <Label className="text-xs">처리완료시 보고서 양식으로 열기 (체크 안 하면 입주민 공지문)</Label>
              </div>
            </div>
          </div>
          <ResponsiveDialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>취소</Button>
            <Button onClick={handleSave} disabled={saving || !form.title || !form.bodyHtml} data-testid="button-save-template">
              {saving ? "저장 중…" : "저장"}
            </Button>
          </ResponsiveDialogFooter>
        </ResponsiveDialogContent>
      </ResponsiveDialog>
    </div>
  );
}

// [Task #504] 공고문 레이아웃 시스템 기본값 편집 카드.
//   - GET /notice-layout 으로 현재값을 가져와 폼에 채우고, PUT 으로 저장한다.
//   - 우측에 NoticeLayoutFrame 인라인 미리보기를 두어 즉시 결과를 확인할 수 있다.
//   - 본 카드는 platform_admin 만 접근 가능한 라우트에서만 노출되므로 별도
//     역할 가드는 두지 않는다(서버가 PUT 권한을 강제).
function NoticeLayoutSettingsCard() {
  const { layout, isLoading } = useNoticeLayout();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [draft, setDraft] = useState<NoticeLayoutSettings>(DEFAULT_NOTICE_LAYOUT);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isLoading) setDraft(layout);
  }, [isLoading, layout]);

  function patch(part: Partial<NoticeLayoutSettings>): void {
    setDraft((d) => ({ ...d, ...part }));
  }

  async function handleSave(): Promise<void> {
    setSaving(true);
    try {
      await upsertNoticeLayout(draft);
      toast({ title: "공고문 레이아웃이 저장되었습니다" });
      void qc.invalidateQueries({ queryKey: ["/api/notice-layout"] });
    } catch (err: any) {
      toast({ title: "저장 실패", description: err?.message ?? "", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  function handleReset(): void {
    setDraft(DEFAULT_NOTICE_LAYOUT);
  }

  return (
    <Card data-testid="card-notice-layout-settings">
      <CardHeader className="pb-2 flex-row items-center justify-between">
        <CardTitle className="text-base">공고문 레이아웃 설정</CardTitle>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={handleReset} disabled={saving} data-testid="button-reset-notice-layout">
            기본값
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving} data-testid="button-save-notice-layout">
            {saving ? "저장 중…" : "저장"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <p className="text-xs text-slate-500 mb-3">
          이 설정은 모든 건물의 공지문 미리보기/처리완료 모달의 "공고문" 탭에서 공통으로 사용됩니다.
          토큰: <code>{"{{buildingName}}"}</code>, <code>{"{{managementOfficePhone}}"}</code>,
          <code>{" {{feeInquiryPhone}}"}</code>, <code>{" {{facilitySafetyPhone}}"}</code>.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-3">
            <div>
              <Label className="text-xs">상단 큰 제목</Label>
              <Input
                value={draft.documentTitle}
                onChange={(e) => patch({ documentTitle: e.target.value })}
                data-testid="input-layout-document-title"
              />
            </div>
            <div>
              <Label className="text-xs">기본 게시기간 문구</Label>
              <Input
                value={draft.defaultPostingPeriod}
                onChange={(e) => patch({ defaultPostingPeriod: e.target.value })}
                data-testid="input-layout-posting-period"
              />
            </div>
            <div>
              <Label className="text-xs">연락처 행 템플릿</Label>
              <Input
                value={draft.contactTemplate}
                onChange={(e) => patch({ contactTemplate: e.target.value })}
                data-testid="input-layout-contact-template"
              />
            </div>
            <div>
              <Label className="text-xs">푸터 텍스트 템플릿</Label>
              <Input
                value={draft.footerTemplate}
                onChange={(e) => patch({ footerTemplate: e.target.value })}
                data-testid="input-layout-footer-template"
              />
            </div>
            <div>
              <Label className="text-xs">직인 미사용시 표기</Label>
              <Input
                value={draft.sealOmittedText}
                onChange={(e) => patch({ sealOmittedText: e.target.value })}
                data-testid="input-layout-seal-omitted"
              />
            </div>
            <div className="grid grid-cols-2 gap-2 pt-1">
              <label className="flex items-center gap-2 text-xs">
                <Switch
                  checked={draft.showNoticeNoRow}
                  onCheckedChange={(v) => patch({ showNoticeNoRow: v })}
                  data-testid="switch-layout-show-notice-no"
                />
                공고NO 칸
              </label>
              <label className="flex items-center gap-2 text-xs">
                <Switch
                  checked={draft.showBuildingRow}
                  onCheckedChange={(v) => patch({ showBuildingRow: v })}
                  data-testid="switch-layout-show-building"
                />
                건물명 칸
              </label>
              <label className="flex items-center gap-2 text-xs">
                <Switch
                  checked={draft.showDateRow}
                  onCheckedChange={(v) => patch({ showDateRow: v })}
                  data-testid="switch-layout-show-date"
                />
                공고일 칸
              </label>
              <label className="flex items-center gap-2 text-xs">
                <Switch
                  checked={draft.showContactRow}
                  onCheckedChange={(v) => patch({ showContactRow: v })}
                  data-testid="switch-layout-show-contact"
                />
                연락처 행
              </label>
              <label className="flex items-center gap-2 text-xs col-span-2">
                <Switch
                  checked={draft.showTitleBox}
                  onCheckedChange={(v) => patch({ showTitleBox: v })}
                  data-testid="switch-layout-show-title-box"
                />
                본문 위 큰 제목 박스 (예: "고지/공지 사항")
              </label>
            </div>
          </div>

          <div className="border rounded bg-white p-3 overflow-x-auto" data-testid="container-layout-preview">
            <div
              className="bg-white p-4"
              style={{ fontFamily: "'Noto Sans KR','Malgun Gothic',sans-serif", minWidth: 480 }}
            >
              <NoticeLayoutFrame
                settings={draft}
                buildingName="샘플 건물"
                managementOfficePhone="02-1234-5678"
                feeInquiryPhone="02-1234-5679"
                facilitySafetyPhone="02-1234-5680"
                logoUrl={null}
                sealUrl={null}
                noticeNo="2026-0428-0001"
                noticeDate="2026-04-28"
                title="공지 제목 예시"
              >
                <p className="whitespace-pre-line">
                  여기는 본문 영역입니다. 공지문 본문(템플릿)은 이 자리에 들어가며,
                  처리완료 모달의 "공고문" 탭에서는 처리 항목/완료 일자/사진이 함께 표시됩니다.
                </p>
              </NoticeLayoutFrame>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
