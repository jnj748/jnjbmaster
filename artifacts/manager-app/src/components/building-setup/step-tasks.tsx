import type { RefObject } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  Search,
  Calendar,
  Plus,
  X,
  Loader2,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import {
  CATEGORY_LABELS,
  INSPECTION_TYPE_LABELS,
  SMART_DATE_HINTS,
  formatCycle,
} from "@/lib/page-constants/building-setup";
import type { PresetItem, SafetyResult, SelectedTask } from "./types";

interface Props {
  searchRef: RefObject<HTMLDivElement | null>;
  taskSearch: string;
  setTaskSearch: (v: string) => void;
  showSuggestions: boolean;
  setShowSuggestions: (v: boolean) => void;
  filteredSuggestions: () => PresetItem[];
  addPresetTask: (preset: PresetItem) => void;
  customTaskName: string;
  setCustomTaskName: (v: string) => void;
  customTaskCategory: string;
  setCustomTaskCategory: (v: string) => void;
  customTaskCycle: string;
  setCustomTaskCycle: (v: string) => void;
  addCustomTask: () => void;
  selectedTasks: SelectedTask[];
  safetyResult: SafetyResult | null;
  updateTaskDate: (name: string, value: string) => void;
  removeTask: (name: string) => void;
  inspectionsScheduled: boolean;
  scheduleInspections: () => void;
  schedulingInspections: boolean;
  existingId: number | null;
  // [Task #297] 사용승인일 기반 자동 산정 토글.
  useApprovalDateFallback: boolean;
  setUseApprovalDateFallback: (v: boolean) => void;
}

export function StepTasks({
  searchRef,
  taskSearch,
  setTaskSearch,
  showSuggestions,
  setShowSuggestions,
  filteredSuggestions,
  addPresetTask,
  customTaskName,
  setCustomTaskName,
  customTaskCategory,
  setCustomTaskCategory,
  customTaskCycle,
  setCustomTaskCycle,
  addCustomTask,
  selectedTasks,
  safetyResult,
  updateTaskDate,
  removeTask,
  inspectionsScheduled,
  scheduleInspections,
  schedulingInspections,
  existingId,
  useApprovalDateFallback,
  setUseApprovalDateFallback,
}: Props) {
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            법정업무 선택
          </CardTitle>
          <CardDescription>
            관리 대상 법정업무를 검색하여 추가하거나 직접 입력하세요.
            최근 실시일을 입력하면 다음 점검일이 자동으로 계산됩니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div ref={searchRef} className="relative">
            <Label className="text-sm font-semibold">법정업무 검색</Label>
            <div className="relative mt-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="업무명, 분야, 유형으로 검색 (예: 소방, 전기, 승강기, 법정...)"
                value={taskSearch}
                onChange={(e) => {
                  setTaskSearch(e.target.value);
                  setShowSuggestions(true);
                }}
                onFocus={() => setShowSuggestions(true)}
                className="pl-9"
              />
            </div>
            {showSuggestions && (
              <div className="absolute z-50 w-full mt-1 bg-background border rounded-lg shadow-lg max-h-72 overflow-y-auto">
                {filteredSuggestions().length === 0 ? (
                  <div className="p-3 text-sm text-muted-foreground text-center">
                    {taskSearch ? "검색 결과가 없습니다. 아래에서 직접 입력할 수 있습니다." : "모든 업무가 이미 추가되었습니다."}
                  </div>
                ) : (
                  filteredSuggestions().map((preset) => (
                    <button
                      key={preset.name}
                      onClick={() => addPresetTask(preset)}
                      className="w-full text-left px-3 py-2.5 hover:bg-muted/50 transition-colors border-b last:border-b-0"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{preset.name}</span>
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                          {CATEGORY_LABELS[preset.category] || preset.category}
                        </Badge>
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                          {INSPECTION_TYPE_LABELS[preset.inspectionType] || preset.inspectionType}
                        </Badge>
                        <span className="text-xs text-muted-foreground ml-auto">
                          {formatCycle(preset.legalCycleMonths)}
                        </span>
                      </div>
                      {preset.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{preset.description}</p>
                      )}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          <div className="border rounded-lg p-3 bg-muted/30">
            <Label className="text-sm font-semibold">직접 입력</Label>
            <div className="flex flex-col desktop:flex-row gap-2 mt-2">
              <Input
                placeholder="업무명 입력"
                value={customTaskName}
                onChange={(e) => setCustomTaskName(e.target.value)}
                className="flex-1"
                onKeyDown={(e) => e.key === "Enter" && addCustomTask()}
              />
              <Select value={customTaskCategory} onValueChange={setCustomTaskCategory}>
                <SelectTrigger className="w-full desktop:w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={customTaskCycle} onValueChange={setCustomTaskCycle}>
                <SelectTrigger className="w-full desktop:w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">매월</SelectItem>
                  <SelectItem value="3">분기</SelectItem>
                  <SelectItem value="6">반기</SelectItem>
                  <SelectItem value="12">연 1회</SelectItem>
                  <SelectItem value="24">2년</SelectItem>
                  <SelectItem value="36">3년</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                onClick={addCustomTask}
                disabled={!customTaskName.trim()}
                className="shrink-0"
              >
                <Plus className="w-4 h-4 mr-1" />
                추가
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {selectedTasks.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center justify-between">
              <span>선택된 법정업무 ({selectedTasks.length}건)</span>
            </CardTitle>
            <CardDescription>
              각 업무의 최근 실시일을 입력하면 다음 점검일이 자동 계산됩니다
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {(() => {
              const sorted = [...selectedTasks].sort((a, b) => {
                const aReq = safetyResult?.requiredInspections?.includes(a.category) ? 0 : 1;
                const bReq = safetyResult?.requiredInspections?.includes(b.category) ? 0 : 1;
                return aReq - bReq;
              });
              const requiredCount = sorted.filter((t) => safetyResult?.requiredInspections?.includes(t.category)).length;
              let shownOptionalHeader = false;
              return sorted.map((task, idx) => {
              const isRequired = safetyResult?.requiredInspections?.includes(task.category);
              const dateHint = SMART_DATE_HINTS[task.name];
              const showOptionalHeader = !isRequired && !shownOptionalHeader && requiredCount > 0;
              if (showOptionalHeader) shownOptionalHeader = true;
              return (
              <div key={task.name}>
                {showOptionalHeader && (
                  <div className="text-xs text-muted-foreground font-medium py-1 border-t mt-2 pt-2 mb-1">추가 선택 업무</div>
                )}
                {idx === 0 && requiredCount > 0 && (
                  <div className="text-xs text-orange-600 font-medium pb-1 mb-1">필수 법정업무 ({requiredCount}건)</div>
                )}
              <div
                className={`flex flex-col desktop:flex-row desktop:items-center gap-2 p-3 border rounded-lg ${
                  isRequired ? "bg-orange-50/50 border-orange-200" : "bg-background"
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{task.name}</span>
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                      {CATEGORY_LABELS[task.category] || task.category}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {formatCycle(task.legalCycleMonths)}
                    </span>
                    {isRequired && (
                      <Badge variant="destructive" className="text-[10px] px-1.5 py-0">필수</Badge>
                    )}
                  </div>
                  {task.legalBasis && (
                    <p className="text-xs text-muted-foreground mt-0.5">{task.legalBasis}</p>
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <Label className="text-xs text-muted-foreground whitespace-nowrap">최근 실시일</Label>
                    <Input
                      type="date"
                      className="w-40"
                      value={task.lastDate}
                      onChange={(e) => updateTaskDate(task.name, e.target.value)}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="shrink-0 h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => removeTask(task.name)}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                  {dateHint && !task.lastDate && (
                    <p className="text-[10px] text-blue-600 ml-auto mr-10">💡 {dateHint}</p>
                  )}
                </div>
              </div>
              </div>
              );
            });
            })()}
          </CardContent>
        </Card>
      )}

      {selectedTasks.length === 0 && (
        <div className="text-center py-8 text-muted-foreground text-sm">
          위 검색창에서 법정업무를 검색하여 추가하거나, 직접 입력해주세요.
        </div>
      )}

      {inspectionsScheduled ? (
        <Card className="border-green-300 bg-green-50/50">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-6 h-6 text-green-600" />
              <div>
                <p className="font-semibold">법정점검 일정이 생성되었습니다</p>
                <p className="text-sm text-muted-foreground">
                  법정 점검 페이지에서 상세 일정을 확인할 수 있습니다.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {/* [Task #297] 다음 주기 시작일을 모를 때 사용승인일 기반으로 자동 산정. */}
          {selectedTasks.length > 0 && (
            <label
              className="flex items-start gap-2 p-3 border rounded-lg bg-blue-50/40 cursor-pointer text-sm"
              data-testid="toggle-approval-date-fallback"
            >
              <input
                type="checkbox"
                className="mt-0.5"
                checked={useApprovalDateFallback}
                onChange={(e) => setUseApprovalDateFallback(e.target.checked)}
              />
              <span>
                <span className="font-medium">다음 주기 시작일을 잘 모르겠음</span>
                <span className="block text-xs text-muted-foreground mt-0.5">
                  최근 실시일을 비워둔 항목은 표제부의 사용승인일을 기준으로 다음 실행일을 자동 계산합니다.
                </span>
              </span>
            </label>
          )}
          <Button
            onClick={scheduleInspections}
            disabled={
              schedulingInspections ||
              !existingId ||
              selectedTasks.length === 0 ||
              (!useApprovalDateFallback && selectedTasks.every((t) => !t.lastDate))
            }
            className="w-full"
            size="lg"
          >
            {schedulingInspections ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" />점검 일정 생성 중...</>
            ) : (
              <><Calendar className="w-4 h-4 mr-2" />법정점검 일정 자동 생성</>
            )}
          </Button>
        </div>
      )}

      {!existingId && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-sm text-yellow-800">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <p>먼저 "건물 정보 입력" 단계에서 건물 정보를 저장해주세요.</p>
          </div>
        </div>
      )}
    </>
  );
}
