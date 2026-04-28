import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { ROLE_LABELS } from "@workspace/shared/role-labels";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import { Plus, Pencil, Trash2, AlertCircle, Check, X } from "lucide-react";
// [Task #393] 알림과 함께 띄울 공고문 템플릿 후보 드롭다운에 사용.
import { useListBuildingNoticeTemplates } from "@workspace/api-client-react";

type Frequency =
  | "one_time"
  | "daily"
  | "weekly"
  | "biweekly"
  | "monthly"
  | "monthly_nth_weekday"
  | "quarterly"
  | "semiannual"
  | "annual"
  // [Task #304] 사용승인일 + N년 (하자담보 등)
  | "anchored";
type AnchorType = "building_approval_date";
type Category = "mandatory" | "suggested";
type TaskType = "facility" | "fee" | "accounting" | "security" | "cleaning" | "etc";
// [Task #523] 시스템 표준 업무 상태(템플릿 "기본 상태" 입력) / 위험등급.
type TaskStatus = "발생" | "처리예정" | "처리완료" | "연기" | "취소";
type RiskLevel = "low" | "medium" | "high" | "critical";
interface LegalBasisItem {
  lawName?: string;
  article?: string;
  url?: string;
}
type BuildingUsage =
  | "공동주택"
  | "업무시설"
  | "근린생활시설"
  | "판매시설"
  | "교육연구시설"
  | "의료시설"
  | "숙박시설"
  | "문화및집회시설"
  | "복합건축물"
  | "기타";

interface TaskTemplate {
  id: number;
  title: string;
  description: string | null;
  category: Category;
  classification: "legal" | "internal";
  taskType: TaskType | null;
  iconName: string | null;
  color: string | null;
  // [Task #381] 관리자가 입력하는 업무 목적(한 줄). 빈 문자열 가능.
  //   값이 있으면 모바일 대시보드 "제안업무" 알람 카드 둘째 줄에 노출된다.
  purpose: string;
  frequencyType: Frequency;
  intervalValue: number | null;
  fixedMonth: number | null;
  fixedDay: number | null;
  startDate: string | null;
  weekdays: number[] | null;
  dayOfMonth: number | null;
  yearInterval: number | null;
  nthWeek: number | null;
  nthWeekday: number | null;
  // [Task #304]
  anchorType: AnchorType | null;
  anchorOffsetYears: number | null;
  // [Task #305] 자격 기준 (AND 조건). 빈 배열 = 전체 빌딩 적용.
  eligibility: EligibilityRule[];
  scopeType: "all" | "building_ids" | "user_ids";
  scopeValues: string[];
  buildingUsageScopes: BuildingUsage[];
  priority: number;
  advanceAlertDays: number;
  isActive: boolean;
  metadata: Record<string, unknown>;
  createdBy: number | null;
  createdByName: string | null;
  targetRoles?: string[] | null;
  // [Task #393] 알림 발생 시 매니저가 작성·배포할 공고문 템플릿 ID. NULL = 미연결(기존 자동 알림만).
  noticeTemplateId: number | null;
  // [Task #523] 공고문 출력 항목(입주민 노출, 포괄적). 모두 선택.
  scheduleNotice: string | null;
  legalBasis: LegalBasisItem[];
  defaultStatus: TaskStatus;
  // [Task #523] 보고서·기안서 출력 항목(내부, 상세). 모두 선택.
  responsibleDepartment: string | null;
  procedureSteps: string[];
  requiredAttachments: string[];
  reportItems: string[];
  riskLevel: RiskLevel | null;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

// [Task #523] 표준 상태/위험등급 라벨.
const TASK_STATUS_OPTIONS: TaskStatus[] = ["발생", "처리예정", "처리완료", "연기", "취소"];
const RISK_LEVEL_OPTIONS: { value: RiskLevel; label: string }[] = [
  { value: "low", label: "낮음" },
  { value: "medium", label: "보통" },
  { value: "high", label: "높음" },
  { value: "critical", label: "심각" },
];

const CATEGORY_LABEL: Record<Category, string> = {
  mandatory: "법정업무",
  suggested: "제안업무",
};

const TASK_TYPE_LABEL: Record<TaskType, string> = {
  facility: "시설",
  fee: "관리비",
  accounting: "회계",
  security: "경비",
  cleaning: "미화",
  etc: "기타",
};

const FREQUENCY_LABEL: Record<Frequency, string> = {
  one_time: "1회성",
  daily: "매일",
  weekly: "매주",
  biweekly: "격주(2주마다)",
  monthly: "매월",
  monthly_nth_weekday: "매월 N째 요일",
  quarterly: "분기",
  semiannual: "반기",
  annual: "연간",
  // [Task #304] 사용승인일 + N년 (하자담보 만료 등)
  anchored: "사용승인일 + N년",
};

const ANCHOR_TYPE_LABEL: Record<AnchorType, string> = {
  building_approval_date: "사용승인일",
};

// [Task #302] N째 주 라벨. -1 = 마지막 주.
const NTH_WEEK_OPTIONS: { value: number; label: string }[] = [
  { value: 1, label: "첫째" },
  { value: 2, label: "둘째" },
  { value: 3, label: "셋째" },
  { value: 4, label: "넷째" },
  { value: 5, label: "다섯째" },
  { value: -1, label: "마지막" },
];

function nthWeekLabel(n: number): string {
  return NTH_WEEK_OPTIONS.find((o) => o.value === n)?.label ?? `${n}째`;
}

const BUILDING_USAGES: BuildingUsage[] = [
  "공동주택",
  "업무시설",
  "근린생활시설",
  "판매시설",
  "교육연구시설",
  "의료시설",
  "숙박시설",
  "문화및집회시설",
  "복합건축물",
  "기타",
];

const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

// [Task #305] 자격 기준(Eligibility) 입력용 메타데이터.
type EligibilityField = "electricCapacityKw" | "totalArea" | "totalUnits" | "fireGrade" | "gasUsageMonthly";
type EligibilityOp = ">=" | ">" | "<=" | "<" | "=" | "!=";
interface EligibilityRule {
  field: EligibilityField;
  op: EligibilityOp;
  value: number;
}
const ELIGIBILITY_FIELD_OPTIONS: { value: EligibilityField; label: string; unit: string }[] = [
  { value: "electricCapacityKw",  label: "수전용량",   unit: "kW" },
  { value: "totalArea",           label: "연면적",     unit: "㎡" },
  { value: "totalUnits",          label: "세대수",     unit: "세대" },
  { value: "fireGrade",           label: "소방등급",   unit: "급" },
  { value: "gasUsageMonthly",     label: "가스사용량", unit: "㎥/월" },
];
const ELIGIBILITY_OPS: EligibilityOp[] = [">=", ">", "<=", "<", "=", "!="];

function eligibilityFieldLabel(f: EligibilityField): string {
  return ELIGIBILITY_FIELD_OPTIONS.find((o) => o.value === f)?.label ?? f;
}
function eligibilityFieldUnit(f: EligibilityField): string {
  return ELIGIBILITY_FIELD_OPTIONS.find((o) => o.value === f)?.unit ?? "";
}
function formatEligibilityRule(r: EligibilityRule): string {
  return `${eligibilityFieldLabel(r.field)} ${r.op} ${r.value}${eligibilityFieldUnit(r.field)}`;
}

const BASE = import.meta.env.BASE_URL ?? "/";
const API_BASE = `${BASE}api`.replace(/\/+/g, "/");

// [Task #283] 역할별 노출 옵션 (UI). 빈 배열 = 전체 공통.
const ROLE_OPTIONS: { value: string; label: string }[] = [
  { value: "manager", label: ROLE_LABELS.manager },
  { value: "accountant", label: ROLE_LABELS.accountant },
  { value: "facility_staff", label: ROLE_LABELS.facility_staff },
  { value: "partner", label: ROLE_LABELS.partner },
  { value: "hq_executive", label: ROLE_LABELS.hq_executive },
];

type DraftType = Omit<TaskTemplate, "id" | "createdAt" | "updatedAt" | "createdBy" | "createdByName" | "targetRoles"> & {
  targetRoles: string[];
};

function defaultAlertDaysFor(category: Category): number {
  return category === "mandatory" ? 30 : 7;
}

function emptyDraft(defaultRole?: string): DraftType {
  const category: Category = "mandatory";
  return {
    title: "",
    description: "",
    category,
    classification: "internal",
    taskType: "facility",
    iconName: null,
    color: null,
    // [Task #381] 신규 입력 시 빈 문자열로 시작.
    purpose: "",
    frequencyType: "annual",
    intervalValue: null,
    fixedMonth: null,
    fixedDay: null,
    startDate: null,
    weekdays: null,
    dayOfMonth: null,
    yearInterval: 1,
    nthWeek: null,
    nthWeekday: null,
    anchorType: null,
    anchorOffsetYears: null,
    eligibility: [],
    scopeType: "all",
    scopeValues: [],
    buildingUsageScopes: [],
    priority: 50,
    advanceAlertDays: defaultAlertDaysFor(category),
    isActive: true,
    metadata: {},
    targetRoles: defaultRole ? [defaultRole] : [],
    // [Task #393] 신규 입력 시 미연결로 시작. 폼에서 선택해 연결 가능.
    noticeTemplateId: null,
    // [Task #523] 문서 출력용 분류 항목 — 신규 입력 시 모두 빈 상태에서 시작.
    scheduleNotice: "",
    legalBasis: [],
    defaultStatus: "발생",
    responsibleDepartment: "",
    procedureSteps: [],
    requiredAttachments: [],
    reportItems: [],
    riskLevel: null,
    tags: [],
  };
}

// [Task #393] 알림과 함께 띄울 공고문 템플릿 후보 선택 드롭다운.
//   - 신규/편집 폼 양쪽에서 공유.
//   - "연결 안 함" 시 noticeTemplateId 를 null 로 저장 (기존 자동 알림만 노출).
//   - 한 번 로드한 목록은 useListBuildingNoticeTemplates 캐시(공통 훅)에 의존.
function NoticeTemplateLink({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (next: number | null) => void;
}) {
  const { data, isLoading } = useListBuildingNoticeTemplates();
  const list = data?.templates ?? [];
  const selectValue = value == null ? "__none__" : String(value);
  return (
    <div data-testid="form-notice-template-link">
      <Label>알림 시 띄울 공고문</Label>
      <p className="text-[11px] text-muted-foreground mb-1.5">
        알림이 뜨면 매니저에게 함께 보여줄 공고문 템플릿을 선택하세요.
        선택하지 않으면 기존 자동 알림만 표시됩니다.
      </p>
      <Select
        value={selectValue}
        onValueChange={(v) => onChange(v === "__none__" ? null : Number(v))}
        disabled={isLoading}
      >
        <SelectTrigger className="w-full" data-testid="select-notice-template">
          <SelectValue placeholder={isLoading ? "불러오는 중..." : "연결 안 함(기본)"} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__" data-testid="option-notice-none">연결 안 함(기본)</SelectItem>
          {list.map((t) => (
            <SelectItem
              key={t.id}
              value={String(t.id)}
              data-testid={`option-notice-${t.id}`}
            >
              {(t.icon ? `${t.icon} ` : "") + t.title}
              {t.category ? ` · ${t.category}` : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

// [Task #523] 공고문 / 보고서·기안서 출력 항목을 신규/수정 화면에서 입력하기 위한 공용 섹션.
//   - 신규 다이얼로그 / 인라인 수정 폼 양쪽에서 동일하게 사용해 일관된 입력 경험을 제공.
//   - 모든 필드는 선택. 입력 옆에 "공고문에 노출 / 보고서·기안서에만 사용" 안내를 표시해
//     관리자가 노출 범위를 헷갈리지 않도록 한다.
function DocumentOutputSections({
  draft,
  setDraft,
}: {
  draft: DraftType;
  setDraft: (next: DraftType) => void;
}) {
  function setField<K extends keyof DraftType>(k: K, v: DraftType[K]) {
    setDraft({ ...draft, [k]: v });
  }
  function addLegalBasis() {
    setField("legalBasis", [...draft.legalBasis, { lawName: "", article: "", url: "" }]);
  }
  function updateLegalBasis(i: number, patch: Partial<LegalBasisItem>) {
    const next = draft.legalBasis.map((row, idx) => (idx === i ? { ...row, ...patch } : row));
    setField("legalBasis", next);
  }
  function removeLegalBasis(i: number) {
    setField("legalBasis", draft.legalBasis.filter((_, idx) => idx !== i));
  }
  function addListItem(key: "procedureSteps" | "requiredAttachments" | "reportItems") {
    setField(key, [...draft[key], ""]);
  }
  function updateListItem(
    key: "procedureSteps" | "requiredAttachments" | "reportItems",
    i: number,
    v: string,
  ) {
    const next = draft[key].map((row, idx) => (idx === i ? v : row));
    setField(key, next);
  }
  function removeListItem(
    key: "procedureSteps" | "requiredAttachments" | "reportItems",
    i: number,
  ) {
    setField(key, draft[key].filter((_, idx) => idx !== i));
  }
  // [Task #523] 태그 입력은 쉼표 구분으로 받아 trim+빈값 제거 후 저장.
  function setTagsFromText(text: string) {
    const list = text
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    setField("tags", list);
  }

  return (
    <div className="space-y-4">
      {/* 공고문 출력 항목 (입주민 노출, 포괄적) */}
      <section
        className="rounded border border-blue-200 bg-blue-50/40 p-3 space-y-3"
        data-testid="section-doc-notice"
      >
        <div>
          <h3 className="text-sm font-semibold text-blue-900">공고문 출력 항목</h3>
          <p className="text-[11px] text-blue-700/80 mt-0.5">
            입주민에게 노출되는 공고문에 사용됩니다. 업무명·시기·법정근거·상태 4가지만
            포괄적으로 노출하므로, 처리기한 같은 약속이 깨질 수 있는 항목은 입력하지 마세요.
          </p>
        </div>
        <div>
          <Label className="text-xs">시기 안내문</Label>
          <p className="text-[10px] text-muted-foreground mb-1">
            공고문에 노출되는 시기 표현 한 줄 (예: "매년 5월 정기점검")
          </p>
          <Input
            value={draft.scheduleNotice ?? ""}
            onChange={(e) => setField("scheduleNotice", e.target.value)}
            maxLength={200}
            placeholder='예: "매년 5월 1일~31일 사이 시행"'
            data-testid="input-schedule-notice"
          />
        </div>
        <div>
          <div className="flex items-center justify-between">
            <Label className="text-xs">법정근거</Label>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 px-2 text-[11px]"
              onClick={addLegalBasis}
              data-testid="btn-add-legal-basis"
            >
              <Plus className="w-3.5 h-3.5 mr-1" />근거 추가
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground mb-1">
            공고문에 함께 노출됩니다. 법령명·조문 중 하나만 입력해도 저장 가능, URL은 선택.
          </p>
          {draft.legalBasis.length === 0 ? (
            <p className="text-[11px] text-muted-foreground border border-dashed rounded p-2 text-center">
              법정근거 없음
            </p>
          ) : (
            <div className="space-y-1.5" data-testid="list-legal-basis">
              {draft.legalBasis.map((row, idx) => (
                <div key={idx} className="flex items-center gap-1.5" data-testid={`legal-basis-row-${idx}`}>
                  <Input
                    className="flex-1 h-8 text-xs"
                    value={row.lawName ?? ""}
                    onChange={(e) => updateLegalBasis(idx, { lawName: e.target.value })}
                    placeholder="법령명 (예: 전기사업법)"
                    data-testid={`input-legal-basis-law-${idx}`}
                  />
                  <Input
                    className="w-32 h-8 text-xs"
                    value={row.article ?? ""}
                    onChange={(e) => updateLegalBasis(idx, { article: e.target.value })}
                    placeholder="조문 (예: 제73조)"
                    data-testid={`input-legal-basis-article-${idx}`}
                  />
                  <Input
                    className="w-44 h-8 text-xs"
                    value={row.url ?? ""}
                    onChange={(e) => updateLegalBasis(idx, { url: e.target.value })}
                    placeholder="URL (선택)"
                    data-testid={`input-legal-basis-url-${idx}`}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 p-0"
                    onClick={() => removeLegalBasis(idx)}
                    data-testid={`btn-remove-legal-basis-${idx}`}
                  >
                    <X className="w-3.5 h-3.5 text-red-500" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
        <div>
          <Label className="text-xs">기본 상태</Label>
          <p className="text-[10px] text-muted-foreground mb-1">
            공고문·보고서 자동 작성 시 사용되는 시작 상태입니다 (시스템 표준 5종 고정).
          </p>
          <Select
            value={draft.defaultStatus}
            onValueChange={(v) => setField("defaultStatus", v as TaskStatus)}
          >
            <SelectTrigger className="w-40 h-8 text-xs" data-testid="select-default-status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TASK_STATUS_OPTIONS.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </section>

      {/* 보고서·기안서 출력 항목 (내부, 상세) */}
      <section
        className="rounded border border-emerald-200 bg-emerald-50/40 p-3 space-y-3"
        data-testid="section-doc-report"
      >
        <div>
          <h3 className="text-sm font-semibold text-emerald-900">보고서·기안서 출력 항목</h3>
          <p className="text-[11px] text-emerald-700/80 mt-0.5">
            본사·관리소 내부 보고서/기안서 자동 작성에만 사용됩니다. 입주민 공고문에는 노출되지 않습니다.
          </p>
        </div>
        <div>
          <Label className="text-xs">담당부서</Label>
          <Input
            value={draft.responsibleDepartment ?? ""}
            onChange={(e) => setField("responsibleDepartment", e.target.value)}
            maxLength={100}
            placeholder='예: "시설팀", "관리지원팀"'
            data-testid="input-responsible-department"
          />
        </div>
        {(["procedureSteps", "requiredAttachments", "reportItems"] as const).map((key) => {
          const labels = {
            procedureSteps: { title: "처리절차", placeholder: "예: 1차 사전점검 → 2차 본점검 → 결과보고" },
            requiredAttachments: { title: "첨부서류 종류", placeholder: "예: 점검결과서, 시정조치 사진" },
            reportItems: { title: "결과보고 항목", placeholder: "예: 점검일자, 시정 필요사항, 다음 점검일" },
          } as const;
          const meta = labels[key];
          const list = draft[key];
          return (
            <div key={key}>
              <div className="flex items-center justify-between">
                <Label className="text-xs">{meta.title}</Label>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-[11px]"
                  onClick={() => addListItem(key)}
                  data-testid={`btn-add-${key}`}
                >
                  <Plus className="w-3.5 h-3.5 mr-1" />항목 추가
                </Button>
              </div>
              {list.length === 0 ? (
                <p className="text-[11px] text-muted-foreground border border-dashed rounded p-2 text-center mt-1">
                  항목 없음
                </p>
              ) : (
                <div className="space-y-1.5 mt-1" data-testid={`list-${key}`}>
                  {list.map((v, idx) => (
                    <div key={idx} className="flex items-center gap-1.5">
                      <Input
                        className="flex-1 h-8 text-xs"
                        value={v}
                        onChange={(e) => updateListItem(key, idx, e.target.value)}
                        placeholder={meta.placeholder}
                        data-testid={`input-${key}-${idx}`}
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0"
                        onClick={() => removeListItem(key, idx)}
                        data-testid={`btn-remove-${key}-${idx}`}
                      >
                        <X className="w-3.5 h-3.5 text-red-500" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">위험등급</Label>
            <Select
              value={draft.riskLevel ?? "__none__"}
              onValueChange={(v) =>
                setField("riskLevel", v === "__none__" ? null : (v as RiskLevel))
              }
            >
              <SelectTrigger className="h-8 text-xs" data-testid="select-risk-level">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">미지정</SelectItem>
                {RISK_LEVEL_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">관련 키워드(태그)</Label>
            <Input
              className="h-8 text-xs"
              value={draft.tags.join(", ")}
              onChange={(e) => setTagsFromText(e.target.value)}
              placeholder="쉼표로 구분 (예: 화재, 점검, 자체점검)"
              data-testid="input-tags"
            />
          </div>
        </div>
      </section>
    </div>
  );
}

// [Task #297] 반복주기 텍스트를 사람이 읽기 좋은 형태로 표시.
//   예: "매주(월,수)", "매월 15일", "매년", "2년마다"
function formatFrequency(t: TaskTemplate): string {
  switch (t.frequencyType) {
    case "weekly": {
      const wds = t.weekdays && t.weekdays.length > 0 ? t.weekdays : null;
      if (!wds) return "매주";
      const labels = wds.map((d) => WEEKDAY_LABELS[d] ?? "?").join(",");
      return `매주(${labels})`;
    }
    case "biweekly": {
      const wd = t.weekdays && t.weekdays.length > 0 ? t.weekdays[0] : null;
      const wdLabel = wd != null ? `(${WEEKDAY_LABELS[wd]})` : "";
      let anchor = "";
      if (t.startDate) {
        const d = new Date(t.startDate);
        if (!Number.isNaN(d.getTime())) {
          anchor = ` · 기준 ${d.getMonth() + 1}/${d.getDate()}`;
        }
      }
      return `격주${wdLabel}${anchor}`;
    }
    case "monthly": {
      const day = t.dayOfMonth ?? t.fixedDay;
      return day ? `매월 ${day}일` : "매월";
    }
    case "monthly_nth_weekday": {
      if (t.nthWeek != null && t.nthWeekday != null) {
        return `매월 ${nthWeekLabel(t.nthWeek)} ${WEEKDAY_LABELS[t.nthWeekday]}요일`;
      }
      return "매월 N째 요일";
    }
    case "annual": {
      const yr = t.yearInterval ?? 1;
      if (yr === 1) {
        if (t.fixedMonth && t.fixedDay) return `매년 ${t.fixedMonth}월 ${t.fixedDay}일`;
        return "매년";
      }
      return `${yr}년마다`;
    }
    case "anchored": {
      // [Task #304] "사용승인일 + N년"
      const anchor = t.anchorType ? ANCHOR_TYPE_LABEL[t.anchorType] : "기준일";
      const yr = t.anchorOffsetYears ?? 0;
      return `${anchor} + ${yr}년`;
    }
    default:
      return FREQUENCY_LABEL[t.frequencyType];
  }
}

export default function TaskTemplatesPage() {
  const { token, user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isAdmin = user?.role === "platform_admin";

  const [search, setSearch] = useState("");
  // [Task #297] 탭 순서: 전체 보기 → 법정업무 → 제안업무. 기본값은 "전체 보기".
  const [filterCategory, setFilterCategory] = useState<"all" | Category>("all");
  const [editing, setEditing] = useState<TaskTemplate | null>(null);
  const [draft, setDraft] = useState<DraftType | null>(null);

  const headers = useMemo(
    () => ({
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    }),
    [token],
  );

  // [Task #283] ?role= 컨텍스트가 있으면 서버 측에서 targetRoles 기준으로 필터된
  //   템플릿만 반환받는다.
  const _roleFromUrl = typeof window !== "undefined"
    ? new URLSearchParams(window.location.search).get("role") ?? ""
    : "";
  const { data: templates = [], isLoading } = useQuery<TaskTemplate[]>({
    queryKey: ["task-templates", _roleFromUrl],
    queryFn: async () => {
      const url = _roleFromUrl
        ? `${API_BASE}/platform/task-templates?role=${encodeURIComponent(_roleFromUrl)}`
        : `${API_BASE}/platform/task-templates`;
      const res = await fetch(url, { headers });
      if (!res.ok) throw new Error("템플릿 목록을 불러올 수 없습니다");
      return res.json();
    },
    enabled: isAdmin,
  });

  const createMutation = useMutation({
    mutationFn: async (body: DraftType) => {
      const res = await fetch(`${API_BASE}/platform/task-templates`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "생성 실패");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["task-templates"] });
      toast({ title: "템플릿이 생성되었습니다" });
      setDraft(null);
      setEditing(null);
    },
    onError: (e: Error) => toast({ title: "생성 실패", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, body }: { id: number; body: Partial<TaskTemplate> }) => {
      const res = await fetch(`${API_BASE}/platform/task-templates/${id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "수정 실패");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["task-templates"] });
      toast({ title: "템플릿이 수정되었습니다" });
      setDraft(null);
      setEditing(null);
    },
    onError: (e: Error) => toast({ title: "수정 실패", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${API_BASE}/platform/task-templates/${id}`, {
        method: "DELETE",
        headers,
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "삭제 실패");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["task-templates"] });
      toast({ title: "템플릿이 삭제되었습니다" });
    },
    onError: (e: Error) => toast({ title: "삭제 실패", description: e.message, variant: "destructive" }),
  });

  function startCreate() {
    setEditing(null);
    const base = emptyDraft(_roleFromUrl || undefined);
    // 현재 활성화된 섹션(법정/제안)이 기본 카테고리로 채워지도록.
    if (filterCategory === "suggested") {
      base.category = "suggested";
      base.advanceAlertDays = defaultAlertDaysFor("suggested");
    }
    setDraft(base);
  }

  function startEdit(t: TaskTemplate) {
    setEditing(t);
    setDraft({
      title: t.title,
      description: t.description ?? "",
      category: t.category,
      classification: t.classification,
      taskType: t.taskType ?? "etc",
      iconName: t.iconName,
      color: t.color,
      // [Task #381] 기존 행은 NOT NULL DEFAULT '' 로 비어있을 수 있음.
      purpose: t.purpose ?? "",
      frequencyType: t.frequencyType,
      intervalValue: t.intervalValue,
      fixedMonth: t.fixedMonth,
      fixedDay: t.fixedDay,
      startDate: t.startDate,
      weekdays: t.weekdays,
      dayOfMonth: t.dayOfMonth ?? t.fixedDay ?? null,
      yearInterval: t.yearInterval ?? (t.frequencyType === "annual" ? 1 : null),
      nthWeek: t.nthWeek ?? null,
      nthWeekday: t.nthWeekday ?? null,
      anchorType: t.anchorType ?? null,
      anchorOffsetYears: t.anchorOffsetYears ?? null,
      eligibility: Array.isArray((t as { eligibility?: EligibilityRule[] }).eligibility)
        ? (t as { eligibility: EligibilityRule[] }).eligibility
        : [],
      scopeType: t.scopeType,
      scopeValues: t.scopeValues,
      buildingUsageScopes: t.buildingUsageScopes ?? [],
      priority: t.priority,
      advanceAlertDays: t.advanceAlertDays,
      isActive: t.isActive,
      metadata: t.metadata,
      targetRoles: t.targetRoles ?? [],
      // [Task #393] 기존 행은 NULL 가능. 폼에서 변경 시 PATCH 로 함께 전송.
      noticeTemplateId: t.noticeTemplateId ?? null,
      // [Task #523] 기존 행은 마이그레이션으로 schedule_notice=NULL,
      //   legal_basis=[], default_status='발생' 등 안전한 기본값을 가진다.
      scheduleNotice: t.scheduleNotice ?? "",
      legalBasis: Array.isArray(t.legalBasis) ? t.legalBasis : [],
      defaultStatus: (t.defaultStatus ?? "발생") as TaskStatus,
      responsibleDepartment: t.responsibleDepartment ?? "",
      procedureSteps: Array.isArray(t.procedureSteps) ? t.procedureSteps : [],
      requiredAttachments: Array.isArray(t.requiredAttachments) ? t.requiredAttachments : [],
      reportItems: Array.isArray(t.reportItems) ? t.reportItems : [],
      riskLevel: t.riskLevel ?? null,
      tags: Array.isArray(t.tags) ? t.tags : [],
    });
  }

  function handleSave() {
    if (!draft) return;
    if (!draft.title.trim()) {
      toast({ title: "제목을 입력해주세요", variant: "destructive" });
      return;
    }
    // [#297] 반복주기 보조 입력값 검증
    if (draft.frequencyType === "weekly" && (!draft.weekdays || draft.weekdays.length === 0)) {
      toast({ title: "반복할 요일을 1개 이상 선택해 주세요", variant: "destructive" });
      return;
    }
    if (draft.frequencyType === "monthly" && !draft.dayOfMonth) {
      toast({ title: "매월 며칠에 반복할지 입력해 주세요", variant: "destructive" });
      return;
    }
    if (draft.frequencyType === "annual" && (!draft.yearInterval || draft.yearInterval < 1)) {
      toast({ title: "몇 년마다 반복할지 입력해 주세요", variant: "destructive" });
      return;
    }
    // [Task #302] biweekly: 단일 요일 + 기준일 필수
    if (draft.frequencyType === "biweekly") {
      if (!draft.weekdays || draft.weekdays.length === 0) {
        toast({ title: "격주 반복 요일을 선택해 주세요", variant: "destructive" });
        return;
      }
      if (!draft.startDate) {
        toast({ title: "격주 기준일을 입력해 주세요", variant: "destructive" });
        return;
      }
    }
    // [Task #304] anchored: anchorType + anchorOffsetYears 필수
    if (draft.frequencyType === "anchored") {
      if (!draft.anchorType) {
        toast({ title: "기준일 종류를 선택해 주세요", variant: "destructive" });
        return;
      }
      if (draft.anchorOffsetYears == null || draft.anchorOffsetYears < 0) {
        toast({ title: "기준일로부터 몇 년 후인지 입력해 주세요", variant: "destructive" });
        return;
      }
    }
    // [Task #302] monthly_nth_weekday: nthWeek + nthWeekday 필수
    if (draft.frequencyType === "monthly_nth_weekday") {
      if (draft.nthWeek == null || draft.nthWeekday == null) {
        toast({ title: "N째 주와 요일을 선택해 주세요", variant: "destructive" });
        return;
      }
    }
    const body: DraftType = { ...draft, description: draft.description || null };
    if (editing) {
      updateMutation.mutate({ id: editing.id, body });
    } else {
      createMutation.mutate(body);
    }
  }

  function handleToggleActive(t: TaskTemplate) {
    updateMutation.mutate({ id: t.id, body: { isActive: !t.isActive } });
  }

  function handleDelete(t: TaskTemplate) {
    if (!confirm(`"${t.title}" 템플릿을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`)) return;
    deleteMutation.mutate(t.id);
  }

  // [#297] 카테고리 변경 시 사전알림 디폴트를 자동 세팅. 사용자가 직접 바꾼 값이
  //   (이전 디폴트와 다르게) 들어 있을 때는 덮어쓰지 않는다.
  function handleCategoryChange(next: Category) {
    if (!draft) return;
    const prevDefault = defaultAlertDaysFor(draft.category);
    const userOverridden = draft.advanceAlertDays !== prevDefault;
    setDraft({
      ...draft,
      category: next,
      advanceAlertDays: userOverridden ? draft.advanceAlertDays : defaultAlertDaysFor(next),
    });
  }

  function handleFrequencyChange(next: Frequency) {
    if (!draft) return;
    let nextWeekdays: number[] | null = null;
    let nextStartDate = draft.startDate;
    if (next === "weekly") {
      nextWeekdays = draft.weekdays ?? [];
    } else if (next === "biweekly") {
      // [Task #302] biweekly 는 startDate 가 캐노니컬 anchor.
      //   기본 startDate = 오늘, weekdays = [today.getDay()] 로 항상 동기.
      const start = draft.startDate ?? new Date().toISOString().slice(0, 10);
      nextStartDate = start;
      const startDay = new Date(start).getDay();
      nextWeekdays = [startDay];
    }
    setDraft({
      ...draft,
      frequencyType: next,
      weekdays: nextWeekdays,
      dayOfMonth: next === "monthly" ? draft.dayOfMonth ?? 1 : null,
      yearInterval: next === "annual" ? draft.yearInterval ?? 1 : null,
      nthWeek: next === "monthly_nth_weekday" ? draft.nthWeek ?? 1 : null,
      nthWeekday: next === "monthly_nth_weekday" ? draft.nthWeekday ?? 1 : null,
      // [Task #304] anchored 로 전환 시 기본값(사용승인일 + 2년).
      anchorType: next === "anchored" ? draft.anchorType ?? "building_approval_date" : null,
      anchorOffsetYears: next === "anchored" ? draft.anchorOffsetYears ?? 2 : null,
      startDate: nextStartDate,
    });
  }

  // [Task #302] biweekly 의 weekday<>startDate 동기화 헬퍼.
  //   - weekday 토글: startDate 를 그 요일에 가장 가까운 미래 일자로 스냅.
  //   - startDate 변경: weekdays 를 [startDate.getDay()] 로 보정.
  function setBiweeklyWeekday(idx: number) {
    if (!draft) return;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const cand = new Date(today);
    cand.setDate(cand.getDate() + ((idx - cand.getDay() + 7) % 7));
    const iso = cand.toISOString().slice(0, 10);
    setDraft({ ...draft, weekdays: [idx], startDate: iso });
  }
  function setBiweeklyStartDate(iso: string) {
    if (!draft) return;
    if (!iso) {
      setDraft({ ...draft, startDate: null });
      return;
    }
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) {
      setDraft({ ...draft, startDate: iso });
      return;
    }
    setDraft({ ...draft, startDate: iso, weekdays: [d.getDay()] });
  }

  const filtered = useMemo(() => {
    return templates.filter((t) => {
      if (filterCategory !== "all" && t.category !== filterCategory) return false;
      if (search && !t.title.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [templates, search, filterCategory]);

  if (!isAdmin) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          <AlertCircle className="w-8 h-8 mx-auto mb-2 text-amber-500" />
          이 화면은 플랫폼 전용입니다.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold">업무 템플릿 관리</h1>
            {(() => {
              if (typeof window === "undefined") return null;
              const r = new URLSearchParams(window.location.search).get("role") ?? "";
              const map: Record<string, string> = {
                manager: ROLE_LABELS.manager,
                accountant: ROLE_LABELS.accountant,
                facility_staff: ROLE_LABELS.facility_staff,
                hq_executive: ROLE_LABELS.hq_executive,
              };
              const label = map[r];
              if (!label) return null;
              return (
                <span className="px-2 py-0.5 text-xs rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                  {label} 컨텍스트
                </span>
              );
            })()}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            관리소장 대시보드의 법정업무·제안업무 항목을 본사가 일괄 관리합니다.
          </p>
        </div>
        <Button onClick={startCreate} data-testid="btn-create-template">
          <Plus className="w-4 h-4 mr-1" />새 템플릿
        </Button>
      </div>

      {/* [Task #297] 상단 탭: 전체 보기 → 법정업무 → 제안업무. 변경 이력 탭은 제거. */}
      <Tabs
        value={filterCategory}
        onValueChange={(v) => setFilterCategory(v as typeof filterCategory)}
      >
        <TabsList>
          <TabsTrigger value="all" data-testid="tab-category-all">전체 보기</TabsTrigger>
          <TabsTrigger value="mandatory" data-testid="tab-category-mandatory">
            {CATEGORY_LABEL.mandatory}
          </TabsTrigger>
          <TabsTrigger value="suggested" data-testid="tab-category-suggested">
            {CATEGORY_LABEL.suggested}
          </TabsTrigger>
        </TabsList>

        <TabsContent value={filterCategory} className="space-y-3 mt-4">
          <div className="flex gap-2">
            <Input
              placeholder="제목으로 검색"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-sm"
            />
          </div>

          {isLoading ? (
            <p className="text-sm text-muted-foreground">불러오는 중...</p>
          ) : filtered.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                등록된 템플릿이 없습니다.
              </CardContent>
            </Card>
          ) : (
            (() => {
              const renderRow = (t: TaskTemplate) => {
                const isEditingThis = editing?.id === t.id && draft;
                if (isEditingThis && draft) {
                  return (
                    <Card
                      key={t.id}
                      data-testid={`template-row-edit-${t.id}`}
                      className="border-primary/40 ring-1 ring-primary/20"
                    >
                      <CardContent className="p-3 space-y-2">
                        {/* 1행: 제목 + 저장/취소 */}
                        <div className="flex items-center gap-2">
                          <Input
                            value={draft.title}
                            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                            placeholder="제목"
                            className="flex-1 h-9"
                            data-testid="input-template-title-inline"
                          />
                          <Button
                            size="sm"
                            onClick={handleSave}
                            disabled={updateMutation.isPending}
                            data-testid={`btn-save-inline-${t.id}`}
                          >
                            <Check className="w-4 h-4 mr-1" />저장
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => { setEditing(null); setDraft(null); }}
                            data-testid={`btn-cancel-inline-${t.id}`}
                          >
                            <X className="w-4 h-4 mr-1" />취소
                          </Button>
                        </div>

                        {/* 2행: 옵션을 가로로 나열 */}
                        <div className="flex flex-wrap items-end gap-2">
                          <div className="flex flex-col">
                            <span className="text-[10px] text-muted-foreground">카테고리</span>
                            <Select
                              value={draft.category}
                              onValueChange={(v) => handleCategoryChange(v as Category)}
                            >
                              <SelectTrigger className="h-8 w-28 text-xs"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="mandatory">{CATEGORY_LABEL.mandatory}</SelectItem>
                                <SelectItem value="suggested">{CATEGORY_LABEL.suggested}</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="flex flex-col">
                            <span className="text-[10px] text-muted-foreground">업무유형</span>
                            <Select
                              value={draft.taskType ?? "etc"}
                              onValueChange={(v) => setDraft({ ...draft, taskType: v as TaskType })}
                            >
                              <SelectTrigger className="h-8 w-24 text-xs"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {(Object.keys(TASK_TYPE_LABEL) as TaskType[]).map((k) => (
                                  <SelectItem key={k} value={k}>{TASK_TYPE_LABEL[k]}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="flex flex-col">
                            <span className="text-[10px] text-muted-foreground">반복주기</span>
                            <Select
                              value={draft.frequencyType}
                              onValueChange={(v) => handleFrequencyChange(v as Frequency)}
                            >
                              <SelectTrigger className="h-8 w-24 text-xs"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {(Object.keys(FREQUENCY_LABEL) as Frequency[]).map((k) => (
                                  <SelectItem key={k} value={k}>{FREQUENCY_LABEL[k]}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          {draft.frequencyType === "weekly" && (
                            <div className="flex flex-col">
                              <span className="text-[10px] text-muted-foreground">요일</span>
                              <div className="flex gap-1 h-8 items-center">
                                {WEEKDAY_LABELS.map((label, idx) => {
                                  const checked = (draft.weekdays ?? []).includes(idx);
                                  return (
                                    <button
                                      type="button"
                                      key={idx}
                                      onClick={() => {
                                        const cur = draft.weekdays ?? [];
                                        const next = checked
                                          ? cur.filter((d) => d !== idx)
                                          : [...cur, idx].sort((a, b) => a - b);
                                        setDraft({ ...draft, weekdays: next });
                                      }}
                                      className={`text-[11px] w-6 h-6 rounded border ${
                                        checked
                                          ? "bg-primary text-primary-foreground border-primary"
                                          : "bg-white border-slate-300"
                                      }`}
                                    >
                                      {label}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                          {draft.frequencyType === "biweekly" && (
                            <>
                              <div className="flex flex-col">
                                <span className="text-[10px] text-muted-foreground">요일</span>
                                <div className="flex gap-1 h-8 items-center">
                                  {WEEKDAY_LABELS.map((label, idx) => {
                                    const checked = (draft.weekdays?.[0] ?? -1) === idx;
                                    return (
                                      <button
                                        type="button"
                                        key={idx}
                                        onClick={() => setBiweeklyWeekday(idx)}
                                        className={`text-[11px] w-6 h-6 rounded border ${
                                          checked
                                            ? "bg-primary text-primary-foreground border-primary"
                                            : "bg-white border-slate-300"
                                        }`}
                                      >
                                        {label}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                              <div className="flex flex-col">
                                <span className="text-[10px] text-muted-foreground">기준일</span>
                                <Input
                                  type="date"
                                  className="h-8 w-36 text-xs"
                                  value={draft.startDate ?? ""}
                                  onChange={(e) => setBiweeklyStartDate(e.target.value)}
                                />
                              </div>
                            </>
                          )}
                          {draft.frequencyType === "monthly" && (
                            <div className="flex flex-col">
                              <span className="text-[10px] text-muted-foreground">며칠</span>
                              <Input
                                type="number" min={1} max={31}
                                className="h-8 w-16 text-xs"
                                value={draft.dayOfMonth ?? ""}
                                onChange={(e) =>
                                  setDraft({
                                    ...draft,
                                    dayOfMonth: e.target.value ? Number(e.target.value) : null,
                                  })
                                }
                              />
                            </div>
                          )}
                          {draft.frequencyType === "monthly_nth_weekday" && (
                            <>
                              <div className="flex flex-col">
                                <span className="text-[10px] text-muted-foreground">N째</span>
                                <Select
                                  value={String(draft.nthWeek ?? 1)}
                                  onValueChange={(v) => setDraft({ ...draft, nthWeek: Number(v) })}
                                >
                                  <SelectTrigger className="h-8 w-20 text-xs"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    {NTH_WEEK_OPTIONS.map((o) => (
                                      <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="flex flex-col">
                                <span className="text-[10px] text-muted-foreground">요일</span>
                                <div className="flex gap-1 h-8 items-center">
                                  {WEEKDAY_LABELS.map((label, idx) => {
                                    const checked = (draft.nthWeekday ?? -1) === idx;
                                    return (
                                      <button
                                        type="button"
                                        key={idx}
                                        onClick={() => setDraft({ ...draft, nthWeekday: idx })}
                                        className={`text-[11px] w-6 h-6 rounded border ${
                                          checked
                                            ? "bg-primary text-primary-foreground border-primary"
                                            : "bg-white border-slate-300"
                                        }`}
                                      >
                                        {label}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            </>
                          )}
                          {draft.frequencyType === "anchored" && (
                            <>
                              <div className="flex flex-col">
                                <span className="text-[10px] text-muted-foreground">기준일</span>
                                <Select
                                  value={draft.anchorType ?? "building_approval_date"}
                                  onValueChange={(v) =>
                                    setDraft({ ...draft, anchorType: v as AnchorType })
                                  }
                                >
                                  <SelectTrigger className="h-8 w-28 text-xs"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    {(Object.keys(ANCHOR_TYPE_LABEL) as AnchorType[]).map((k) => (
                                      <SelectItem key={k} value={k}>{ANCHOR_TYPE_LABEL[k]}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="flex flex-col">
                                <span className="text-[10px] text-muted-foreground">+ N년 후</span>
                                <Input
                                  type="number" min={0} max={50}
                                  className="h-8 w-16 text-xs"
                                  value={draft.anchorOffsetYears ?? ""}
                                  onChange={(e) =>
                                    setDraft({
                                      ...draft,
                                      anchorOffsetYears: e.target.value ? Number(e.target.value) : null,
                                    })
                                  }
                                  data-testid="input-anchor-offset-years"
                                />
                              </div>
                            </>
                          )}
                          {draft.frequencyType === "annual" && (
                            <div className="flex flex-col">
                              <span className="text-[10px] text-muted-foreground">몇 년마다</span>
                              <Input
                                type="number" min={1} max={50}
                                className="h-8 w-16 text-xs"
                                value={draft.yearInterval ?? ""}
                                onChange={(e) =>
                                  setDraft({
                                    ...draft,
                                    yearInterval: e.target.value ? Number(e.target.value) : null,
                                  })
                                }
                              />
                            </div>
                          )}

                          <div className="flex flex-col">
                            <span className="text-[10px] text-muted-foreground">우선순위</span>
                            <Input
                              type="number" min={0} max={100}
                              className="h-8 w-16 text-xs"
                              value={draft.priority}
                              onChange={(e) => setDraft({ ...draft, priority: Number(e.target.value) })}
                            />
                          </div>
                          <div className="flex flex-col">
                            <span className="text-[10px] text-muted-foreground">사전알림 D-</span>
                            <Input
                              type="number" min={0} max={365}
                              className="h-8 w-16 text-xs"
                              value={draft.advanceAlertDays}
                              onChange={(e) => setDraft({ ...draft, advanceAlertDays: Number(e.target.value) })}
                            />
                          </div>
                          <div className="flex flex-col">
                            <span className="text-[10px] text-muted-foreground">활성</span>
                            <div className="h-8 flex items-center">
                              <Switch
                                checked={draft.isActive}
                                onCheckedChange={(c) => setDraft({ ...draft, isActive: c })}
                              />
                            </div>
                          </div>
                        </div>

                        {/* 3행: 노출 대상 역할 */}
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-[10px] text-muted-foreground mr-1">노출 대상:</span>
                          {ROLE_OPTIONS.map((opt) => {
                            const checked = draft.targetRoles.includes(opt.value);
                            return (
                              <button
                                type="button"
                                key={opt.value}
                                onClick={() => {
                                  const next = checked
                                    ? draft.targetRoles.filter((r) => r !== opt.value)
                                    : [...draft.targetRoles, opt.value];
                                  setDraft({ ...draft, targetRoles: next });
                                }}
                                className={`text-[11px] px-2 py-0.5 rounded border ${
                                  checked
                                    ? "bg-primary text-primary-foreground border-primary"
                                    : "bg-white border-slate-300"
                                }`}
                              >
                                {opt.label}
                              </button>
                            );
                          })}
                        </div>

                        {/* 4행: 적용 건물 */}
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-[10px] text-muted-foreground mr-1">적용 건물:</span>
                          {BUILDING_USAGES.map((u) => {
                            const checked = draft.buildingUsageScopes.includes(u);
                            return (
                              <button
                                type="button"
                                key={u}
                                onClick={() => {
                                  const next = checked
                                    ? draft.buildingUsageScopes.filter((x) => x !== u)
                                    : [...draft.buildingUsageScopes, u];
                                  setDraft({ ...draft, buildingUsageScopes: next });
                                }}
                                className={`text-[11px] px-2 py-0.5 rounded border ${
                                  checked
                                    ? "bg-primary text-primary-foreground border-primary"
                                    : "bg-white border-slate-300"
                                }`}
                              >
                                {u}
                              </button>
                            );
                          })}
                        </div>

                        {/* [Task #305] 5행: 자격 기준(Eligibility) — 빌딩 속성 매칭 규칙 */}
                        <div className="rounded border border-slate-200 bg-slate-50 p-2">
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                              <span className="text-[11px] font-medium">자격 기준 (선임 의무 임계)</span>
                              <span className="text-[10px] text-muted-foreground">
                                모두 충족(AND) · 비워두면 전체 빌딩 적용
                              </span>
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-6 px-2 text-[11px]"
                              onClick={() =>
                                setDraft({
                                  ...draft,
                                  eligibility: [
                                    ...draft.eligibility,
                                    { field: "totalArea", op: ">=", value: 0 },
                                  ],
                                })
                              }
                              data-testid={`btn-add-eligibility-${t.id}`}
                            >
                              <Plus className="w-3 h-3 mr-1" />규칙 추가
                            </Button>
                          </div>
                          {draft.eligibility.length === 0 ? (
                            <p className="text-[11px] text-muted-foreground px-1">자격 기준 없음 (전체 빌딩)</p>
                          ) : (
                            <div className="space-y-1.5">
                              {draft.eligibility.map((rule, idx) => (
                                <div key={idx} className="flex items-center gap-1.5">
                                  <Select
                                    value={rule.field}
                                    onValueChange={(v) => {
                                      const next = [...draft.eligibility];
                                      next[idx] = { ...rule, field: v as EligibilityField };
                                      setDraft({ ...draft, eligibility: next });
                                    }}
                                  >
                                    <SelectTrigger className="h-7 w-28 text-xs"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                      {ELIGIBILITY_FIELD_OPTIONS.map((o) => (
                                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  <Select
                                    value={rule.op}
                                    onValueChange={(v) => {
                                      const next = [...draft.eligibility];
                                      next[idx] = { ...rule, op: v as EligibilityOp };
                                      setDraft({ ...draft, eligibility: next });
                                    }}
                                  >
                                    <SelectTrigger className="h-7 w-16 text-xs"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                      {ELIGIBILITY_OPS.map((op) => (
                                        <SelectItem key={op} value={op}>{op}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  <Input
                                    type="number"
                                    className="h-7 w-24 text-xs"
                                    value={rule.value}
                                    onChange={(e) => {
                                      const next = [...draft.eligibility];
                                      next[idx] = { ...rule, value: Number(e.target.value) };
                                      setDraft({ ...draft, eligibility: next });
                                    }}
                                  />
                                  <span className="text-[11px] text-muted-foreground w-12">
                                    {eligibilityFieldUnit(rule.field)}
                                  </span>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 w-7 p-0"
                                    onClick={() =>
                                      setDraft({
                                        ...draft,
                                        eligibility: draft.eligibility.filter((_, i) => i !== idx),
                                      })
                                    }
                                  >
                                    <X className="w-3 h-3 text-red-500" />
                                  </Button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* 6행: 설명 */}
                        <Textarea
                          value={draft.description ?? ""}
                          onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                          rows={2}
                          placeholder="설명 (선택)"
                          className="text-xs"
                        />

                        {/* [Task #381] 7행: 목적 — 모바일 "제안업무" 알람 카드 둘째 줄에
                            노출되는 한 줄 문구. 인라인 편집/생성 다이얼로그 양쪽에서 동일하게 보여
                            기존 행도 편집 시 이미 저장된 값을 확인·수정할 수 있게 한다. */}
                        <Input
                          value={draft.purpose}
                          onChange={(e) => setDraft({ ...draft, purpose: e.target.value })}
                          maxLength={80}
                          placeholder='목적 (선택, 예: "화재 발생 시 인명 피해 예방")'
                          className="text-xs"
                          data-testid={`input-template-purpose-inline-${t.id}`}
                        />

                        {/* [Task #523] 8행: 공고문 / 보고서·기안서 출력 항목 — 인라인 편집에서도
                            신규 다이얼로그와 동일한 입력 UI 를 제공해 본사 관리자가 어느 경로로
                            진입하든 같은 항목을 편집할 수 있게 한다. */}
                        <DocumentOutputSections draft={draft} setDraft={setDraft} />
                      </CardContent>
                    </Card>
                  );
                }
                return (
                <Card key={t.id} data-testid={`template-row-${t.id}`}>
                  <CardContent className="p-4 flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge
                          variant={t.category === "mandatory" ? "default" : "secondary"}
                          data-testid={`badge-category-${t.id}`}
                        >
                          {CATEGORY_LABEL[t.category]}
                        </Badge>
                        {/* [#297] 분류(법정/내부) 배지 제거. 대신 업무유형 배지 노출. */}
                        <Badge variant="outline" data-testid={`badge-task-type-${t.id}`}>
                          {TASK_TYPE_LABEL[(t.taskType as TaskType) ?? "etc"]}
                        </Badge>
                        <Badge variant="outline" data-testid={`badge-frequency-${t.id}`}>
                          {formatFrequency(t)}
                        </Badge>
                        {t.buildingUsageScopes && t.buildingUsageScopes.length > 0 && (
                          <span className="text-xs text-muted-foreground">
                            적용 건물: {t.buildingUsageScopes.join(", ")}
                          </span>
                        )}
                        {/* [Task #305] 자격 기준이 1개 이상이면 칩으로 노출. */}
                        {Array.isArray((t as { eligibility?: EligibilityRule[] }).eligibility) &&
                          ((t as { eligibility: EligibilityRule[] }).eligibility.length > 0) && (
                            <span
                              className="text-[10px] px-1.5 py-0.5 rounded border border-amber-300 bg-amber-50 text-amber-700"
                              data-testid={`badge-eligibility-${t.id}`}
                              title="이 자격 기준을 충족하는 빌딩에서만 알림 노출"
                            >
                              자격: {(t as { eligibility: EligibilityRule[] }).eligibility
                                .map(formatEligibilityRule).join(" · ")}
                            </span>
                          )}
                        <span className="text-xs text-muted-foreground">우선순위 {t.priority}</span>
                        <span className="text-xs text-muted-foreground">사전알림 D-{t.advanceAlertDays}</span>
                        {/* [Task #523] 문서 출력용 분류 항목이 채워졌는지 한눈에 확인할 수 있도록
                             간단한 카운트 배지를 노출. 입력값이 없으면 배지 자체를 숨긴다. */}
                        {Array.isArray(t.legalBasis) && t.legalBasis.length > 0 && (
                          <span
                            className="text-[10px] px-1.5 py-0.5 rounded border border-blue-300 bg-blue-50 text-blue-700"
                            data-testid={`badge-legal-basis-${t.id}`}
                            title="공고문 법정근거 입력 건수"
                          >
                            법정근거 {t.legalBasis.length}건
                          </span>
                        )}
                        {Array.isArray(t.procedureSteps) && t.procedureSteps.length > 0 && (
                          <span
                            className="text-[10px] px-1.5 py-0.5 rounded border border-emerald-300 bg-emerald-50 text-emerald-700"
                            data-testid={`badge-procedure-steps-${t.id}`}
                            title="보고서·기안서 처리절차 단계 수"
                          >
                            처리절차 {t.procedureSteps.length}단계
                          </span>
                        )}
                        {!t.isActive && <Badge variant="destructive">비활성</Badge>}
                      </div>
                      <h3 className="text-sm font-semibold mt-1">{t.title}</h3>
                      {t.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{t.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Switch
                        checked={t.isActive}
                        onCheckedChange={() => handleToggleActive(t)}
                        aria-label="활성화"
                      />
                      <Button size="sm" variant="ghost" onClick={() => startEdit(t)} data-testid={`btn-edit-${t.id}`}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => handleDelete(t)}>
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
                );
              };

              if (filterCategory !== "all") {
                return <div className="space-y-2">{filtered.map(renderRow)}</div>;
              }

              const groups: { key: Category; items: TaskTemplate[] }[] = [
                { key: "mandatory", items: filtered.filter((t) => t.category === "mandatory") },
                { key: "suggested", items: filtered.filter((t) => t.category === "suggested") },
              ];
              return (
                <div className="space-y-6">
                  {groups.map((g) => (
                    <section key={g.key} data-testid={`group-${g.key}`}>
                      <h2 className="text-sm font-semibold mb-2 flex items-center gap-2">
                        <Badge variant={g.key === "mandatory" ? "default" : "secondary"}>
                          {CATEGORY_LABEL[g.key]}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {g.items.length}건
                        </span>
                      </h2>
                      {g.items.length === 0 ? (
                        <p className="text-xs text-muted-foreground pl-1">
                          해당 카테고리의 템플릿이 없습니다.
                        </p>
                      ) : (
                        <div className="space-y-2">{g.items.map(renderRow)}</div>
                      )}
                    </section>
                  ))}
                </div>
              );
            })()
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={!!draft && !editing} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>새 업무 템플릿</DialogTitle>
            <DialogDescription>
              관리소장·본부관리자 대시보드에 표시될 업무 항목을 정의합니다.
            </DialogDescription>
          </DialogHeader>
          {draft && (
            <div className="space-y-3">
              <div>
                <Label>제목</Label>
                <Input
                  value={draft.title}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                  data-testid="input-template-title"
                />
              </div>
              <div>
                <Label>설명</Label>
                <Textarea
                  value={draft.description ?? ""}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                  rows={2}
                />
              </div>
              {/* [Task #381] 업무 목적 — 모바일 "제안업무" 알람 카드 둘째 줄에
                  노출되는 한 줄 문구. 비워두면 기존 마감일 안내로 폴백된다. */}
              <div>
                <Label>목적 (선택)</Label>
                <Input
                  value={draft.purpose}
                  onChange={(e) => setDraft({ ...draft, purpose: e.target.value })}
                  maxLength={80}
                  placeholder="예: 화재 발생 시 인명 피해 예방"
                  data-testid="input-template-purpose"
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  관리소장 모바일 대시보드의 "제안업무" 카드 둘째 줄에 표시됩니다 (최대 80자).
                </p>
              </div>

              {/* [#297] 카테고리 + 업무유형 (분류는 제거됨). */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>카테고리</Label>
                  <Select
                    value={draft.category}
                    onValueChange={(v) => handleCategoryChange(v as Category)}
                  >
                    <SelectTrigger data-testid="select-category"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mandatory">{CATEGORY_LABEL.mandatory}</SelectItem>
                      <SelectItem value="suggested">{CATEGORY_LABEL.suggested}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>업무유형</Label>
                  <Select
                    value={draft.taskType ?? "etc"}
                    onValueChange={(v) => setDraft({ ...draft, taskType: v as TaskType })}
                  >
                    <SelectTrigger data-testid="select-task-type"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(Object.keys(TASK_TYPE_LABEL) as TaskType[]).map((k) => (
                        <SelectItem key={k} value={k}>{TASK_TYPE_LABEL[k]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* [Task #523] 공고문 / 보고서·기안서 출력 항목 — 기본 정보와 반복 주기 사이.
                   공고문 자동 작성에서는 시기 안내·법정근거·기본 상태만 노출하고, 보고서·기안서
                   자동 작성에서는 담당부서·처리절차·첨부서류·결과보고·위험등급·태그 등
                   상세 항목을 사용한다. 모두 선택 입력. */}
              <DocumentOutputSections draft={draft} setDraft={setDraft} />

              {/* [#297] 반복주기 + 동적 보조 입력. 지정월/지정일/시작일은 모두 제거. */}
              <div className="grid grid-cols-2 gap-3 items-start">
                <div>
                  <Label>반복주기</Label>
                  <Select
                    value={draft.frequencyType}
                    onValueChange={(v) => handleFrequencyChange(v as Frequency)}
                  >
                    <SelectTrigger data-testid="select-frequency"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(Object.keys(FREQUENCY_LABEL) as Frequency[]).map((k) => (
                        <SelectItem key={k} value={k}>{FREQUENCY_LABEL[k]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {draft.frequencyType === "weekly" && (
                  <div>
                    <Label>요일 선택</Label>
                    <div className="flex flex-wrap gap-1.5 mt-1.5" data-testid="frequency-weekdays">
                      {WEEKDAY_LABELS.map((label, idx) => {
                        const checked = (draft.weekdays ?? []).includes(idx);
                        return (
                          <button
                            type="button"
                            key={idx}
                            onClick={() => {
                              const cur = draft.weekdays ?? [];
                              const next = checked
                                ? cur.filter((d) => d !== idx)
                                : [...cur, idx].sort((a, b) => a - b);
                              setDraft({ ...draft, weekdays: next });
                            }}
                            className={`text-xs px-2.5 py-1 rounded border ${
                              checked
                                ? "bg-primary text-primary-foreground border-primary"
                                : "bg-white border-slate-300"
                            }`}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {draft.frequencyType === "biweekly" && (
                  <div>
                    <Label>요일 / 기준일</Label>
                    <div className="flex flex-wrap gap-1.5 mt-1.5" data-testid="frequency-biweekly">
                      {WEEKDAY_LABELS.map((label, idx) => {
                        const checked = (draft.weekdays?.[0] ?? -1) === idx;
                        return (
                          <button
                            type="button"
                            key={idx}
                            onClick={() => setBiweeklyWeekday(idx)}
                            className={`text-xs px-2.5 py-1 rounded border ${
                              checked
                                ? "bg-primary text-primary-foreground border-primary"
                                : "bg-white border-slate-300"
                            }`}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                    <Input
                      type="date"
                      className="mt-2"
                      value={draft.startDate ?? ""}
                      onChange={(e) => setBiweeklyStartDate(e.target.value)}
                      data-testid="input-biweekly-start"
                    />
                  </div>
                )}

                {draft.frequencyType === "monthly" && (
                  <div>
                    <Label>며칠</Label>
                    <Input
                      type="number"
                      min={1}
                      max={31}
                      value={draft.dayOfMonth ?? ""}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          dayOfMonth: e.target.value ? Number(e.target.value) : null,
                        })
                      }
                      data-testid="input-day-of-month"
                      placeholder="1~31"
                    />
                  </div>
                )}

                {draft.frequencyType === "monthly_nth_weekday" && (
                  <div>
                    <Label>N째 주 / 요일</Label>
                    <div className="flex items-center gap-2 mt-1.5">
                      <Select
                        value={String(draft.nthWeek ?? 1)}
                        onValueChange={(v) => setDraft({ ...draft, nthWeek: Number(v) })}
                      >
                        <SelectTrigger className="w-28" data-testid="select-nth-week"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {NTH_WEEK_OPTIONS.map((o) => (
                            <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <div className="flex flex-wrap gap-1.5" data-testid="frequency-nth-weekday">
                        {WEEKDAY_LABELS.map((label, idx) => {
                          const checked = (draft.nthWeekday ?? -1) === idx;
                          return (
                            <button
                              type="button"
                              key={idx}
                              onClick={() => setDraft({ ...draft, nthWeekday: idx })}
                              className={`text-xs px-2.5 py-1 rounded border ${
                                checked
                                  ? "bg-primary text-primary-foreground border-primary"
                                  : "bg-white border-slate-300"
                              }`}
                            >
                              {label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

                {draft.frequencyType === "anchored" && (
                  <div>
                    <Label>기준일 + N년</Label>
                    <p className="text-[11px] text-muted-foreground mb-1.5">
                      예: 사용승인일 + 2년 (마감 하자담보 만료)
                    </p>
                    <div className="flex items-center gap-2">
                      <Select
                        value={draft.anchorType ?? "building_approval_date"}
                        onValueChange={(v) =>
                          setDraft({ ...draft, anchorType: v as AnchorType })
                        }
                      >
                        <SelectTrigger className="w-40" data-testid="select-anchor-type">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(Object.keys(ANCHOR_TYPE_LABEL) as AnchorType[]).map((k) => (
                            <SelectItem key={k} value={k}>{ANCHOR_TYPE_LABEL[k]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <span className="text-sm">+</span>
                      <Input
                        type="number" min={0} max={50}
                        className="w-20"
                        value={draft.anchorOffsetYears ?? ""}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            anchorOffsetYears: e.target.value ? Number(e.target.value) : null,
                          })
                        }
                        data-testid="input-anchor-offset-years-create"
                        placeholder="N"
                      />
                      <span className="text-sm">년</span>
                    </div>
                  </div>
                )}

                {draft.frequencyType === "annual" && (
                  <div>
                    <Label>몇 년마다</Label>
                    <Input
                      type="number"
                      min={1}
                      max={50}
                      value={draft.yearInterval ?? ""}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          yearInterval: e.target.value ? Number(e.target.value) : null,
                        })
                      }
                      data-testid="input-year-interval"
                      placeholder="예: 1, 2, 3"
                    />
                  </div>
                )}
              </div>

              {/* [#297] 적용 건물(주용도 다중 선택). 빈 선택 = 전체 건물. */}
              <div>
                <Label>적용 건물</Label>
                <p className="text-[11px] text-muted-foreground mb-1.5">
                  표제부 주용도 기준. 선택하지 않으면 전체 건물에 적용됩니다.
                </p>
                <div className="flex flex-wrap gap-1.5" data-testid="building-usage-scopes">
                  {BUILDING_USAGES.map((u) => {
                    const checked = draft.buildingUsageScopes.includes(u);
                    return (
                      <button
                        type="button"
                        key={u}
                        onClick={() => {
                          const next = checked
                            ? draft.buildingUsageScopes.filter((x) => x !== u)
                            : [...draft.buildingUsageScopes, u];
                          setDraft({ ...draft, buildingUsageScopes: next });
                        }}
                        className={`text-xs px-2.5 py-1 rounded border ${
                          checked
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-white border-slate-300"
                        }`}
                      >
                        {u}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label>우선순위 (0-100)</Label>
                  <Input
                    type="number" min={0} max={100}
                    value={draft.priority}
                    onChange={(e) => setDraft({ ...draft, priority: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <Label>
                    사전 알림 (D-)
                    <span className="text-[10px] text-muted-foreground ml-1">
                      (디폴트 {defaultAlertDaysFor(draft.category)}일)
                    </span>
                  </Label>
                  <Input
                    type="number" min={0} max={365}
                    value={draft.advanceAlertDays}
                    onChange={(e) => setDraft({ ...draft, advanceAlertDays: Number(e.target.value) })}
                    data-testid="input-advance-alert-days"
                  />
                </div>
                <div className="flex items-end gap-2">
                  <Switch
                    checked={draft.isActive}
                    onCheckedChange={(c) => setDraft({ ...draft, isActive: c })}
                  />
                  <Label>활성</Label>
                </div>
              </div>

              {/* [Task #393] 알림 처리 다이얼로그에서 함께 띄울 공고문 템플릿 후보 선택.
                   - "연결 안 함(기본)" = 기존 자동 알림만 노출.
                   - 특정 템플릿 선택 시 모바일 대시보드 알림 다이얼로그에 "공고문 작성" CTA 노출,
                     클릭 시 /notices/templates?templateId=N 으로 prefill 진입.
                   필수업무/제안업무 모든 카테고리에서 동일하게 노출된다(점검업무도 향후 제안업무로 편입 예정). */}
              <NoticeTemplateLink
                value={draft.noticeTemplateId ?? null}
                onChange={(v) => setDraft({ ...draft, noticeTemplateId: v })}
              />

              {/* [Task #283] 노출 대상 역할 (미선택 = 전체 공통). */}
              <div>
                <Label>노출 대상 역할 (선택 안 하면 전체 공통)</Label>
                <div className="flex flex-wrap gap-2 mt-1.5">
                  {ROLE_OPTIONS.map((opt) => {
                    const checked = draft.targetRoles.includes(opt.value);
                    return (
                      <label
                        key={opt.value}
                        className={`text-xs px-2 py-1 rounded border cursor-pointer ${
                          checked ? "bg-primary text-primary-foreground border-primary" : "bg-white border-slate-300"
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="hidden"
                          checked={checked}
                          onChange={() => {
                            const next = checked
                              ? draft.targetRoles.filter((r) => r !== opt.value)
                              : [...draft.targetRoles, opt.value];
                            setDraft({ ...draft, targetRoles: next });
                          }}
                        />
                        {opt.label}
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* [Task #305] 자격 기준 — 빌딩 속성과 매칭되는 AND 규칙. 비우면 전체 빌딩 적용. */}
              <div>
                <div className="flex items-center justify-between">
                  <Label>자격 기준 (선임 의무 임계)</Label>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setDraft({
                        ...draft,
                        eligibility: [
                          ...draft.eligibility,
                          { field: "totalArea", op: ">=", value: 0 },
                        ],
                      })
                    }
                    data-testid="btn-add-eligibility-create"
                  >
                    <Plus className="w-3.5 h-3.5 mr-1" />규칙 추가
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground mb-1.5">
                  모든 규칙을 충족(AND)하는 빌딩에서만 알림이 노출됩니다. 비워두면 전체 빌딩 적용.
                </p>
                {draft.eligibility.length === 0 ? (
                  <p className="text-xs text-muted-foreground border border-dashed rounded p-2 text-center">
                    자격 기준 없음 (전체 빌딩에 적용)
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {draft.eligibility.map((rule, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <Select
                          value={rule.field}
                          onValueChange={(v) => {
                            const next = [...draft.eligibility];
                            next[idx] = { ...rule, field: v as EligibilityField };
                            setDraft({ ...draft, eligibility: next });
                          }}
                        >
                          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {ELIGIBILITY_FIELD_OPTIONS.map((o) => (
                              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Select
                          value={rule.op}
                          onValueChange={(v) => {
                            const next = [...draft.eligibility];
                            next[idx] = { ...rule, op: v as EligibilityOp };
                            setDraft({ ...draft, eligibility: next });
                          }}
                        >
                          <SelectTrigger className="w-20"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {ELIGIBILITY_OPS.map((op) => (
                              <SelectItem key={op} value={op}>{op}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input
                          type="number"
                          className="w-28"
                          value={rule.value}
                          onChange={(e) => {
                            const next = [...draft.eligibility];
                            next[idx] = { ...rule, value: Number(e.target.value) };
                            setDraft({ ...draft, eligibility: next });
                          }}
                        />
                        <span className="text-xs text-muted-foreground w-14">
                          {eligibilityFieldUnit(rule.field)}
                        </span>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            setDraft({
                              ...draft,
                              eligibility: draft.eligibility.filter((_, i) => i !== idx),
                            })
                          }
                        >
                          <X className="w-4 h-4 text-red-500" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* [Task #221] 대시보드 알림에 노출될 아이콘/색상 (선택). */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>아이콘 이름 (선택)</Label>
                  <Input
                    placeholder="예: shield, calendar, alert-triangle"
                    value={draft.iconName ?? ""}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        iconName: e.target.value.trim() === "" ? null : e.target.value,
                      })
                    }
                    data-testid="input-template-icon"
                  />
                </div>
                <div>
                  <Label>색상 (선택)</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="color"
                      className="h-9 w-14 p-1"
                      value={draft.color ?? "#3b82f6"}
                      onChange={(e) => setDraft({ ...draft, color: e.target.value })}
                    />
                    <Input
                      placeholder="#3b82f6"
                      value={draft.color ?? ""}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          color: e.target.value.trim() === "" ? null : e.target.value,
                        })
                      }
                      data-testid="input-template-color"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDraft(null)}>취소</Button>
            <Button onClick={handleSave} data-testid="btn-save-template">저장</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
