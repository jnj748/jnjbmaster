import { useMemo, useState } from "react";
import { useSearch } from "wouter";
import {
  useListInspections,
  useCreateInspection,
  useUpdateInspection,
  useDeleteInspection,
  useListInspectionPresets,
  useCompleteInspection,
  useListInspectionLogs,
  useBulkRegisterInspections,
  getListInspectionsQueryKey,
  getGetFacilityWeeklyInspectionCountsQueryKey,
} from "@workspace/api-client-react";
import type { Inspection, InspectionPreset, CompleteInspectionBodyResult, BulkRegisterInspectionsResponse } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Shield, ClipboardList } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { InspectionNotice, CATEGORY_LEGAL_BASIS } from "@/components/inspection-notice";
import { useBuilding } from "@/contexts/building-context";
import {
  resultOptions,
  calculateNextDueDate,
} from "@/lib/page-constants/inspections";
import { InspectionFormDialog, type InspectionFormState } from "@/components/inspections/inspection-form-dialog";
import { BulkRegisterDialog } from "@/components/inspections/bulk-register-dialog";
import { CompleteDialog, type CompleteFormState } from "@/components/inspections/complete-dialog";
import { HistoryDialog } from "@/components/inspections/history-dialog";
import { InspectionCard } from "@/components/inspections/inspection-card";
import { detectFollowUp, type FollowUpDetection, type FollowUpSource } from "@/lib/follow-up-detection";
import { FollowUpSuggestionDialog } from "@/components/follow-up-suggestion-dialog";

// [Task #658] 시설담당 대시보드 "금주 안전점검 작성" 위젯에서 카테고리 버튼을 누르면
//   /inspections?category=<key> 로 진입한다. 위젯이 보내는 키는 inspections.category 와
//   동일한 값이며, 단 "other" 는 아래 5개 카테고리에 속하지 않는 모든 행을 의미한다.
const CATEGORY_KNOWN = new Set([
  "electrical",
  "fire_safety",
  "mechanical",
  "telecom",
  "elevator",
]);

export default function Inspections() {
  const { building } = useBuilding();
  // 위젯에서 들어온 카테고리 필터(선택). 빈 문자열/누락이면 필터 비활성.
  const search = useSearch();
  const filterCategory = useMemo(() => {
    const params = new URLSearchParams(search);
    const v = params.get("category");
    return v && v.length > 0 ? v : null;
  }, [search]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [completeDialogOpen, setCompleteDialogOpen] = useState(false);
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Inspection | null>(null);
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [noticeTarget, setNoticeTarget] = useState<Inspection | null>(null);
  const [completingId, setCompletingId] = useState<number | null>(null);
  const [historyId, setHistoryId] = useState<number | null>(null);
  const [bulkSelectedCategory, setBulkSelectedCategory] = useState<string>("fire_safety");
  const [bulkSelectedIds, setBulkSelectedIds] = useState<number[]>([]);
  const [bulkBaseDate, setBulkBaseDate] = useState(new Date().toISOString().split("T")[0]);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: inspections, isLoading } = useListInspections();
  // [Task #658] URL ?category= 쿼리에 따른 클라이언트 사이드 필터.
  //   - 알려진 5개 카테고리는 정확히 일치하는 행만 통과.
  //   - "other" 는 위 5개에 포함되지 않는 모든 카테고리(소화전 외 등)를 통과.
  const filteredInspections = useMemo(() => {
    if (!inspections) return inspections;
    if (!filterCategory) return inspections;
    if (filterCategory === "other") {
      return inspections.filter((it) => !CATEGORY_KNOWN.has(it.category));
    }
    return inspections.filter((it) => it.category === filterCategory);
  }, [inspections, filterCategory]);
  const { data: presets } = useListInspectionPresets();
  const createMutation = useCreateInspection();
  const updateMutation = useUpdateInspection();
  const deleteMutation = useDeleteInspection();
  const completeMutation = useCompleteInspection();
  const bulkRegisterMutation = useBulkRegisterInspections();

  const { data: logs } = useListInspectionLogs(historyId ?? 0, {
    query: { enabled: historyId !== null },
  });

  const [form, setForm] = useState<InspectionFormState>({
    name: "",
    category: "elevator",
    frequencyPerYear: 1,
    legalCycleMonths: null,
    lastInspectionDate: "",
    nextDueDate: "",
    notes: "",
    legalBasis: CATEGORY_LEGAL_BASIS["elevator"],
    advanceAlertDays: 30,
    inspectionType: "legal",
    intervalDays: null,
    fixedDay: null,
    recommendedMonths: null,
  });

  const [completeForm, setCompleteForm] = useState<CompleteFormState>({
    inspectionDate: new Date().toISOString().split("T")[0],
    result: "good",
    memo: "",
    inspector: "",
  });

  const [followUpOpen, setFollowUpOpen] = useState(false);
  const [followUpDetection, setFollowUpDetection] = useState<FollowUpDetection | null>(null);
  const [followUpSource, setFollowUpSource] = useState<FollowUpSource | null>(null);

  function resetForm() {
    setForm({ name: "", category: "elevator", frequencyPerYear: 1, legalCycleMonths: null, lastInspectionDate: "", nextDueDate: "", notes: "", legalBasis: CATEGORY_LEGAL_BASIS["elevator"], advanceAlertDays: 30, inspectionType: "legal", intervalDays: null, fixedDay: null, recommendedMonths: null });
    setEditing(null);
  }

  function handleCategoryChange(v: string) {
    const defaultLegal = CATEGORY_LEGAL_BASIS[v] || "";
    const oldDefault = CATEGORY_LEGAL_BASIS[form.category] || "";
    const shouldAutoFill = !form.legalBasis || form.legalBasis === oldDefault;
    setForm({ ...form, category: v, legalBasis: shouldAutoFill ? defaultLegal : form.legalBasis });
  }

  function handlePresetSelect(presetId: string) {
    if (!presets) return;
    const preset = presets.find((p) => p.id === parseInt(presetId));
    if (!preset) return;
    const cycleMonths = preset.legalCycleMonths;
    const inspType = preset.inspectionType || "legal";
    const intervalDays = inspType === "biweekly" ? 14 : null;
    const fixedDay = preset.seasonalNotes?.includes("매월 4일") ? 4 : null;
    let freq: number;
    if (inspType === "biweekly") {
      freq = 26;
    } else if (cycleMonths >= 12) {
      freq = Math.round(12 / cycleMonths) || 1;
    } else {
      freq = Math.round(12 / cycleMonths);
    }
    setForm((prev) => ({
      ...prev,
      name: preset.name,
      category: preset.category,
      frequencyPerYear: Math.max(1, freq),
      legalCycleMonths: cycleMonths,
      advanceAlertDays: preset.defaultAlertDays,
      legalBasis: preset.legalBasis || CATEGORY_LEGAL_BASIS[preset.category] || "",
      inspectionType: inspType,
      intervalDays,
      fixedDay,
      recommendedMonths: preset.recommendedMonths || null,
    }));
  }

  function getCycleLabel(preset: InspectionPreset): string {
    const type = preset.inspectionType || "legal";
    if (type === "biweekly") return "2주 1회";
    if (preset.legalCycleMonths === 1) return "매월";
    if (preset.legalCycleMonths === 3) return "분기";
    if (preset.legalCycleMonths === 6) return "반기";
    if (preset.legalCycleMonths === 12) return "연 1회";
    if (preset.legalCycleMonths === 24) return "2년 1회";
    if (preset.legalCycleMonths === 36) return "2~3년 1회";
    return `${preset.legalCycleMonths}개월`;
  }

  function handleLastDateChange(lastDate: string) {
    const newForm = { ...form, lastInspectionDate: lastDate };
    if (lastDate && form.legalCycleMonths) {
      newForm.nextDueDate = calculateNextDueDate(lastDate, form.legalCycleMonths);
    }
    setForm(newForm);
  }

  function openEdit(item: Inspection) {
    setEditing(item);
    setForm({
      name: item.name,
      category: item.category,
      frequencyPerYear: item.frequencyPerYear,
      legalCycleMonths: item.legalCycleMonths ?? null,
      lastInspectionDate: item.lastInspectionDate || "",
      nextDueDate: item.nextDueDate,
      notes: item.notes || "",
      legalBasis: item.legalBasis || CATEGORY_LEGAL_BASIS[item.category] || "",
      advanceAlertDays: item.advanceAlertDays,
      inspectionType: item.inspectionType || "legal",
      intervalDays: item.intervalDays ?? null,
      fixedDay: item.fixedDay ?? null,
      recommendedMonths: item.recommendedMonths ?? null,
    });
    setDialogOpen(true);
  }

  function openComplete(id: number) {
    setCompletingId(id);
    setCompleteForm({
      inspectionDate: new Date().toISOString().split("T")[0],
      result: "good",
      memo: "",
      inspector: "",
    });
    setCompleteDialogOpen(true);
  }

  function openHistory(id: number) {
    setHistoryId(id);
    setHistoryDialogOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const data = {
      name: form.name,
      category: form.category as Inspection["category"],
      frequencyPerYear: form.frequencyPerYear,
      legalCycleMonths: form.legalCycleMonths,
      lastInspectionDate: form.lastInspectionDate || null,
      nextDueDate: form.nextDueDate,
      notes: form.notes || null,
      legalBasis: form.legalBasis || null,
      advanceAlertDays: form.advanceAlertDays,
      inspectionType: form.inspectionType as Inspection["inspectionType"],
      intervalDays: form.intervalDays,
      fixedDay: form.fixedDay,
      recommendedMonths: form.recommendedMonths,
    };

    if (editing) {
      await updateMutation.mutateAsync({ id: editing.id, data });
      toast({ title: "점검 일정이 수정되었습니다" });
    } else {
      await createMutation.mutateAsync({ data });
      toast({ title: "점검 일정이 등록되었습니다" });
    }
    queryClient.invalidateQueries({ queryKey: getListInspectionsQueryKey() });
    setDialogOpen(false);
    resetForm();
  }

  async function handleComplete(e: React.FormEvent) {
    e.preventDefault();
    if (!completingId) return;
    const completedItem = inspections?.find((i) => i.id === completingId);
    await completeMutation.mutateAsync({
      id: completingId,
      data: {
        inspectionDate: completeForm.inspectionDate,
        result: completeForm.result as CompleteInspectionBodyResult,
        memo: completeForm.memo || null,
        inspector: completeForm.inspector || null,
      },
    });
    queryClient.invalidateQueries({ queryKey: getListInspectionsQueryKey() });
    // [Task #658] 시설담당 대시보드 "금주 안전점검 작성" 카운트도 즉시 갱신.
    queryClient.invalidateQueries({
      queryKey: getGetFacilityWeeklyInspectionCountsQueryKey(),
    });
    setCompleteDialogOpen(false);
    const resultLabel = resultOptions.find((r) => r.value === completeForm.result)?.label || completeForm.result;
    toast({
      title: "점검이 완료 처리되었습니다",
      description: completeForm.result === "poor"
        ? "불량 판정으로 수선유지비 기안이 자동 생성되었습니다."
        : `결과: ${resultLabel}`,
    });
    // [Task #197] 점검 메모 또는 불량 판정 시 후속 조치 제안.
    // 결과가 "poor"(불량) 이면 메모에 키워드가 없어도 후속 조치 키워드를 합성한다.
    const memoText =
      (completeForm.memo ?? "") +
      (completeForm.result === "poor" ? "\n점검불량" : "");
    const detection = detectFollowUp(memoText, { domainHint: "facility" });
    if (detection) {
      // 법정점검(필수)과 권장점검(제안)을 별도 출처로 구분해 추적/통계가 가능하도록 한다.
      const isLegal = completedItem?.inspectionType === "legal";
      setFollowUpSource({
        type: isLegal ? "inspection_legal_complete" : "inspection_suggested_complete",
        id: `${completingId}-${completeForm.inspectionDate}`,
        title: `${completedItem?.name ?? "점검"} (${resultLabel}) — ${detection.snippet.slice(0, 30)}`,
        occurredAt: completeForm.inspectionDate,
      });
      setFollowUpDetection(detection);
      setFollowUpOpen(true);
    }
  }

  async function handleDelete(id: number) {
    await deleteMutation.mutateAsync({ id });
    queryClient.invalidateQueries({ queryKey: getListInspectionsQueryKey() });
    toast({ title: "점검 일정이 삭제되었습니다" });
  }

  function openNotice(item: Inspection) {
    setNoticeTarget(item);
    setNoticeOpen(true);
  }

  async function handleBulkRegister() {
    try {
      const result = await bulkRegisterMutation.mutateAsync({
        data: {
          presetIds: bulkSelectedIds,
          baseDate: bulkBaseDate,
          category: bulkSelectedCategory,
        },
      });
      queryClient.invalidateQueries({ queryKey: getListInspectionsQueryKey() });
      setBulkDialogOpen(false);
      setBulkSelectedIds([]);
      toast({ title: `${(result as BulkRegisterInspectionsResponse).registeredCount}개 점검이 일괄 등록되었습니다` });
    } catch {
      toast({ title: "일괄 등록 실패", variant: "destructive" });
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">법정 점검 관리</h1>
          <p className="text-muted-foreground text-sm mt-1">
            승강기, 저수조, 소방 등 법정 점검 주기를 관리합니다
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setBulkDialogOpen(true)}>
            <ClipboardList className="w-4 h-4 mr-2" />
            일괄 등록
          </Button>
          <InspectionFormDialog
            open={dialogOpen}
            onOpenChange={(o) => { setDialogOpen(o); if (!o) resetForm(); }}
            editing={!!editing}
            form={form}
            setForm={setForm}
            presets={presets}
            onSubmit={handleSubmit}
            onPresetSelect={handlePresetSelect}
            onCategoryChange={handleCategoryChange}
            onLastDateChange={handleLastDateChange}
            getCycleLabel={getCycleLabel}
          />
        </div>
      </div>

      <BulkRegisterDialog
        open={bulkDialogOpen}
        onOpenChange={setBulkDialogOpen}
        bulkSelectedCategory={bulkSelectedCategory}
        setBulkSelectedCategory={setBulkSelectedCategory}
        bulkBaseDate={bulkBaseDate}
        setBulkBaseDate={setBulkBaseDate}
        bulkSelectedIds={bulkSelectedIds}
        setBulkSelectedIds={setBulkSelectedIds}
        presets={presets}
        isPending={bulkRegisterMutation.isPending}
        onSubmit={handleBulkRegister}
      />

      <CompleteDialog
        open={completeDialogOpen}
        onOpenChange={setCompleteDialogOpen}
        completeForm={completeForm}
        setCompleteForm={setCompleteForm}
        onSubmit={handleComplete}
      />

      <HistoryDialog
        open={historyDialogOpen}
        onOpenChange={(o) => { setHistoryDialogOpen(o); if (!o) setHistoryId(null); }}
        logs={logs}
      />

      <FollowUpSuggestionDialog
        open={followUpOpen}
        source={followUpSource}
        detection={followUpDetection}
        onClose={() => setFollowUpOpen(false)}
      />

      {/* [Task #658] 카테고리 필터 활성화 안내 + 해제 버튼. 위젯에서 진입했을 때만 노출. */}
      {filterCategory && (
        <div
          className="mb-3 flex items-center justify-between rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm"
          data-testid="inspections-category-filter-banner"
        >
          <span className="text-foreground">
            카테고리 필터:{" "}
            <strong>
              {filterCategory === "other" ? "기타" : filterCategory}
            </strong>{" "}
            항목만 보고 있습니다.
          </span>
          <a
            href="/inspections"
            className="text-primary underline-offset-2 hover:underline"
            data-testid="inspections-clear-category-filter"
          >
            전체 보기
          </a>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : filteredInspections && filteredInspections.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredInspections.map((item) => (
            <InspectionCard
              key={item.id}
              item={item}
              onComplete={openComplete}
              onHistory={openHistory}
              onEdit={openEdit}
              onDelete={handleDelete}
              onNotice={openNotice}
            />
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <Shield className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground">등록된 법정 점검이 없습니다</p>
            <p className="text-sm text-muted-foreground mt-1">
              "점검 등록" 버튼을 눌러 법정 점검 일정을 추가하세요
            </p>
          </CardContent>
        </Card>
      )}

      {noticeTarget && (
        <InspectionNotice
          key={noticeTarget.id}
          open={noticeOpen}
          onOpenChange={(o) => { setNoticeOpen(o); if (!o) setNoticeTarget(null); }}
          inspection={{
            name: noticeTarget.name,
            category: noticeTarget.category,
            nextDueDate: typeof noticeTarget.nextDueDate === "string" ? noticeTarget.nextDueDate : new Date(noticeTarget.nextDueDate).toISOString().split("T")[0],
            legalBasis: noticeTarget.legalBasis,
          }}
          buildingName={building?.name}
          officeContact={building?.managementOfficePhone ? `관리사무소 ☎ ${building.managementOfficePhone}` : undefined}
          logoUrl={building?.logoUrl ?? null}
        />
      )}
    </div>
  );
}
