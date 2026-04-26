import { Router, type IRouter } from "express";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db,
  alertActionsTable,
  buildingsTable,
  taskTemplatesTable,
  taskTemplateAuditLogsTable,
  taskTemplateCategories,
  taskTemplateClassifications,
  taskTemplateFrequencyTypes,
  taskTemplateAnchorTypes,
  taskTemplateScopeTypes,
  taskTemplateTaskTypes,
  taskTemplateBuildingUsageScopes,
  taskTemplateEligibilityFields,
  taskTemplateEligibilityOps,
  usersTable,
  type TaskTemplate,
  type TaskTemplateEligibilityRule,
} from "@workspace/db";
import { requireRole } from "../middlewares/auth";
import { computeNextDueDate } from "../lib/taskTemplateCycle";

const router: IRouter = Router();

const categoryEnum = z.enum(taskTemplateCategories);
const classificationEnum = z.enum(taskTemplateClassifications);
const frequencyEnum = z.enum(taskTemplateFrequencyTypes);
const anchorTypeEnum = z.enum(taskTemplateAnchorTypes);
const scopeEnum = z.enum(taskTemplateScopeTypes);
const taskTypeEnum = z.enum(taskTemplateTaskTypes);
const buildingUsageEnum = z.enum(taskTemplateBuildingUsageScopes);
// [Task #305] 자격 기준 단일 규칙 스키마.
const eligibilityRuleSchema = z.object({
  field: z.enum(taskTemplateEligibilityFields),
  op: z.enum(taskTemplateEligibilityOps),
  value: z.number().finite(),
});

const CreateBody = z.object({
  title: z.string().min(1).max(200),
  description: z.string().nullable().optional(),
  category: categoryEnum,
  classification: classificationEnum.optional(),
  // [#297] 신규 입력. 신규 다이얼로그에서 필수, 기존 행은 NULL 허용.
  taskType: taskTypeEnum.nullable().optional(),
  iconName: z.string().nullable().optional(),
  color: z.string().nullable().optional(),
  // [Task #381] 업무 목적(한 줄). 빈 문자열 허용, 최대 80자.
  //   미입력 시 빈 문자열로 저장되며 알람 메시지는 기존 마감일 안내로 폴백된다.
  purpose: z.string().max(80).optional(),
  frequencyType: frequencyEnum,
  intervalValue: z.number().int().positive().nullable().optional(),
  fixedMonth: z.number().int().min(1).max(12).nullable().optional(),
  fixedDay: z.number().int().min(1).max(31).nullable().optional(),
  startDate: z.string().nullable().optional(),
  // [#297] 새 보조 입력값.
  weekdays: z.array(z.number().int().min(0).max(6)).nullable().optional(),
  dayOfMonth: z.number().int().min(1).max(31).nullable().optional(),
  yearInterval: z.number().int().min(1).max(50).nullable().optional(),
  // [Task #302] monthly_nth_weekday 보조 입력값.
  //   nthWeek: 1~5 (첫째~다섯째), -1 = 마지막 주
  //   nthWeekday: 0(일)~6(토)
  nthWeek: z.union([z.literal(-1), z.number().int().min(1).max(5)]).nullable().optional(),
  nthWeekday: z.number().int().min(0).max(6).nullable().optional(),
  // [Task #304] anchored frequency 보조 입력값.
  anchorType: anchorTypeEnum.nullable().optional(),
  anchorOffsetYears: z.number().int().min(0).max(50).nullable().optional(),
  // [Task #305] 자격 기준 (AND 조건). 빈 배열 = 자격 기준 없음.
  eligibility: z.array(eligibilityRuleSchema).optional(),
  scopeType: scopeEnum.optional(),
  scopeValues: z.array(z.string()).optional(),
  // [#297] 표제부 주용도 기준 적용 건물(다중 선택). 빈 배열 = 전체.
  buildingUsageScopes: z.array(buildingUsageEnum).optional(),
  priority: z.number().int().min(0).max(100).optional(),
  advanceAlertDays: z.number().int().min(0).max(365).optional(),
  isActive: z.boolean().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  // [Task #283] 역할별 템플릿 노출 대상. NULL/빈배열이면 전체 공통.
  targetRoles: z.array(z.string()).nullable().optional(),
  // [Task #393] 알림 발생 시 매니저가 작성·배포할 공고문 템플릿(building_notice_templates) 후보 ID.
  //   null/미지정 → 기존 자동 알림만 노출(공고문 작성 CTA 미노출). 양수 → 알림 다이얼로그에 CTA 추가.
  noticeTemplateId: z.number().int().positive().nullable().optional(),
});

// [Task #302] frequencyType 별 필수 보조값 검증 (defense-in-depth).
//   UI 가 이미 보장하지만 API 에서도 일관성 강제.
function refineFrequencyFields<T extends z.ZodTypeAny>(schema: T) {
  return schema.superRefine((val, ctx) => {
    const v = val as Partial<z.infer<typeof CreateBody>>;
    if (v.frequencyType === "biweekly") {
      if (!v.startDate) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["startDate"],
          message: "biweekly: startDate 가 필요합니다",
        });
      }
      if (!v.weekdays || v.weekdays.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["weekdays"],
          message: "biweekly: 요일을 1개 선택해야 합니다",
        });
      }
    }
    if (v.frequencyType === "anchored") {
      if (!v.anchorType) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["anchorType"],
          message: "anchored: anchorType 가 필요합니다",
        });
      }
      if (v.anchorOffsetYears == null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["anchorOffsetYears"],
          message: "anchored: anchorOffsetYears(N년) 가 필요합니다",
        });
      }
    }
    if (v.frequencyType === "monthly_nth_weekday") {
      if (v.nthWeek == null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["nthWeek"],
          message: "monthly_nth_weekday: nthWeek 가 필요합니다",
        });
      }
      if (v.nthWeekday == null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["nthWeekday"],
          message: "monthly_nth_weekday: nthWeekday 가 필요합니다",
        });
      }
    }
  });
}

const CreateBodyChecked = refineFrequencyFields(CreateBody);
// [Task #304] PATCH 도 frequency 별 필드 정합성을 동일하게 강제한다.
//   anchored 로 변경하면서 anchorType / anchorOffsetYears 를 누락하는 등의
//   부분 업데이트가 API 직접 호출로 들어와도 차단되도록 한다.
const UpdateBody = refineFrequencyFields(CreateBody.partial());

async function recordAudit(
  userId: number | undefined,
  action: "create" | "update" | "delete" | "toggle",
  template: Pick<TaskTemplate, "id" | "title">,
  changes: Record<string, unknown>,
): Promise<void> {
  let userName: string | null = null;
  if (userId) {
    const [u] = await db
      .select({ name: usersTable.name })
      .from(usersTable)
      .where(eq(usersTable.id, userId));
    userName = u?.name ?? null;
  }
  await db.insert(taskTemplateAuditLogsTable).values({
    templateId: template.id,
    templateTitle: template.title,
    action,
    changes,
    changedBy: userId ?? null,
    changedByName: userName,
  });
}

// --- Platform admin CRUD ---------------------------------------------------

router.get(
  "/platform/task-templates",
  requireRole("platform_admin"),
  async (req, res): Promise<void> => {
    const role = typeof req.query.role === "string" ? req.query.role : "";
    const rows = await db
      .select()
      .from(taskTemplatesTable)
      .orderBy(desc(taskTemplatesTable.priority), asc(taskTemplatesTable.title));
    // [Task #283] ?role= 컨텍스트가 있으면 targetRoles 가 비어있거나(전체 공통)
    //   해당 role 을 포함하는 템플릿만 노출한다.
    const filtered = role
      ? rows.filter((r) => {
          const tr = (r as { targetRoles?: string[] | null }).targetRoles;
          return !tr || tr.length === 0 || tr.includes(role);
        })
      : rows;
    res.json(filtered);
  },
);

router.post(
  "/platform/task-templates",
  requireRole("platform_admin"),
  async (req, res): Promise<void> => {
    const parsed = CreateBodyChecked.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const userId = req.user?.userId;
    const [author] = userId
      ? await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, userId))
      : [null as { name: string | null } | null];
    const d = parsed.data;
    const [created] = await db
      .insert(taskTemplatesTable)
      .values({
        title: d.title,
        description: d.description ?? null,
        category: d.category,
        // [#297] classification 은 신규 입력에서 제거됐다. 미입력 시 안전하게 internal.
        classification: d.classification ?? "internal",
        taskType: d.taskType ?? null,
        iconName: d.iconName ?? null,
        color: d.color ?? null,
        // [Task #381] 입력 미제공/null 은 빈 문자열로 정규화. NOT NULL 컬럼.
        purpose: d.purpose ?? "",
        frequencyType: d.frequencyType,
        intervalValue: d.intervalValue ?? null,
        fixedMonth: d.fixedMonth ?? null,
        fixedDay: d.fixedDay ?? null,
        startDate: d.startDate ?? null,
        weekdays: d.weekdays ?? null,
        dayOfMonth: d.dayOfMonth ?? null,
        yearInterval: d.yearInterval ?? null,
        nthWeek: d.nthWeek ?? null,
        nthWeekday: d.nthWeekday ?? null,
        // [Task #304]
        anchorType: d.anchorType ?? null,
        anchorOffsetYears: d.anchorOffsetYears ?? null,
        // [Task #305]
        eligibility: d.eligibility ?? [],
        scopeType: d.scopeType ?? "all",
        scopeValues: d.scopeValues ?? [],
        buildingUsageScopes: d.buildingUsageScopes ?? [],
        priority: d.priority ?? 50,
        // [#297] 사전 알림 디폴트는 카테고리에 따라 자동 세팅.
        //   클라이언트에서 별도로 보내지 않더라도 서버에서 안전하게 기본값을 적용.
        advanceAlertDays: d.advanceAlertDays ?? (d.category === "mandatory" ? 30 : 7),
        isActive: d.isActive ?? true,
        metadata: d.metadata ?? {},
        targetRoles: d.targetRoles ?? null,
        // [Task #393] 알림 처리 다이얼로그에서 매니저가 한 번에 공고문을 작성할 수 있도록
        //   본 task template 과 연결된 공고문 템플릿 ID 를 보관. NULL 이면 기존 동작 유지.
        noticeTemplateId: d.noticeTemplateId ?? null,
        createdBy: userId ?? null,
        createdByName: author?.name ?? null,
      } as never)
      .returning();
    await recordAudit(userId, "create", created, { after: created });
    res.status(201).json(created);
  },
);

router.patch(
  "/platform/task-templates/:id",
  requireRole("platform_admin"),
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "유효한 ID가 필요합니다" });
      return;
    }
    const parsed = UpdateBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const [before] = await db
      .select()
      .from(taskTemplatesTable)
      .where(eq(taskTemplatesTable.id, id));
    if (!before) {
      res.status(404).json({ error: "템플릿을 찾을 수 없습니다" });
      return;
    }
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    const d = parsed.data;
    for (const k of Object.keys(d) as Array<Extract<keyof typeof d, string>>) {
      const v = d[k];
      if (v !== undefined) {
        if (k === "scopeValues" && v == null) patch[k] = [];
        else if (k === "buildingUsageScopes" && v == null) patch[k] = [];
        // [Task #305] eligibility null/undefined 안전 처리.
        else if (k === "eligibility" && v == null) patch[k] = [];
        // [Task #381] purpose 는 NOT NULL — null 입력은 빈 문자열로 정규화.
        else if (k === "purpose" && v == null) patch[k] = "";
        else patch[k] = v;
      }
    }
    const [updated] = await db
      .update(taskTemplatesTable)
      .set(patch)
      .where(eq(taskTemplatesTable.id, id))
      .returning();

    const action: "toggle" | "update" =
      Object.keys(d).length === 1 && d.isActive !== undefined ? "toggle" : "update";
    await recordAudit(req.user?.userId, action, updated, {
      before,
      after: updated,
    });
    res.json(updated);
  },
);

router.delete(
  "/platform/task-templates/:id",
  requireRole("platform_admin"),
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "유효한 ID가 필요합니다" });
      return;
    }
    const [before] = await db
      .select()
      .from(taskTemplatesTable)
      .where(eq(taskTemplatesTable.id, id));
    if (!before) {
      res.status(404).json({ error: "템플릿을 찾을 수 없습니다" });
      return;
    }
    await db.delete(taskTemplatesTable).where(eq(taskTemplatesTable.id, id));
    await recordAudit(req.user?.userId, "delete", before, { before });
    res.json({ ok: true });
  },
);

// [#297] 변경 이력 UI 는 화면에서 제거되었다. 감사용 API 자체는 보존(타 시스템/감사
// 추적용)하지만 신규 화면에서는 사용되지 않는다.
router.get(
  "/platform/task-templates/:id/audit-logs",
  requireRole("platform_admin"),
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "유효한 ID가 필요합니다" });
      return;
    }
    const rows = await db
      .select()
      .from(taskTemplateAuditLogsTable)
      .where(eq(taskTemplateAuditLogsTable.templateId, id))
      .orderBy(desc(taskTemplateAuditLogsTable.createdAt))
      .limit(100);
    res.json(rows);
  },
);

router.get(
  "/platform/task-templates/audit-logs",
  requireRole("platform_admin"),
  async (_req, res): Promise<void> => {
    const rows = await db
      .select()
      .from(taskTemplateAuditLogsTable)
      .orderBy(desc(taskTemplateAuditLogsTable.createdAt))
      .limit(200);
    res.json(rows);
  },
);

// --- Active templates resolved into dashboard alerts ----------------------

function templateAppliesTo(
  t: TaskTemplate,
  ctx: { userId?: number | null; buildingId?: number | null; userRole?: string | null; buildingUsage?: string | null },
): boolean {
  // [Task #283+] targetRoles 가 지정된 템플릿은 해당 역할에게만 노출.
  // null/빈 배열은 전체 공통(기존 동작 유지).
  const tr = (t as { targetRoles?: string[] | null }).targetRoles;
  if (tr && tr.length > 0) {
    if (!ctx.userRole || !tr.includes(ctx.userRole)) return false;
  }
  // [#297] buildingUsageScopes 가 지정되어 있으면 사용자 건물의 주용도가 일치해야 노출.
  const usageScopes = (t as { buildingUsageScopes?: string[] | null }).buildingUsageScopes;
  if (usageScopes && usageScopes.length > 0) {
    if (!ctx.buildingUsage) return false;
    const matches = usageScopes.some((s) => ctx.buildingUsage!.includes(s));
    if (!matches) return false;
  }
  switch (t.scopeType) {
    case "all":
      return true;
    case "building_ids": {
      const ids = (t.scopeValues ?? []).map((v) => String(v));
      if (ids.length === 0) return true;
      return !!ctx.buildingId && ids.includes(String(ctx.buildingId));
    }
    case "user_ids": {
      const ids = (t.scopeValues ?? []).map((v) => String(v));
      if (ids.length === 0) return true;
      return !!ctx.userId && ids.includes(String(ctx.userId));
    }
    default:
      return true;
  }
}

export interface ResolvedTemplateAlert {
  id: number;
  type: "task_template_mandatory" | "task_template_suggested";
  templateId: number;
  templateCategory: "mandatory" | "suggested";
  classification: "legal" | "internal";
  title: string;
  message: string;
  severity: "critical" | "warning" | "info";
  relatedId: number | null;
  hasDraft: boolean;
  actionStatus: string | null;
  dueDate: string | null;
  penaltyInfo: string | null;
  inspectionType: string | null;
  createdAt: string;
  iconName: string | null;
  color: string | null;
  priority: number;
  // [Task #393] 알림 처리 다이얼로그에서 매니저가 한 번에 공고문을 작성할 수 있도록
  //   해당 task template 에 미리 연결된 공고문 템플릿 ID. 없으면 null.
  noticeTemplateId: number | null;
}

export interface TemplateAlertContext {
  userId?: number | null;
  buildingId?: number | null;
  userRole?: string | null;
  buildingUsage?: string | null;
  // [Task #304] anchored frequency 계산용. 빌딩 사용승인일(approval_date).
  //   주입되지 않은 경우 resolveActiveTemplateAlerts 가 buildingId 로 자동 조회한다.
  buildingApprovalDate?: Date | null;
  // [Task #305] 자격 기준(eligibility) 매칭용 빌딩 속성 스냅샷.
  //   주입되지 않은 경우 resolveActiveTemplateAlerts 가 buildingId 로 자동 조회한다.
  buildingAttrs?: BuildingEligibilityAttrs | null;
}

// [Task #305] eligibility 평가에 사용하는 빌딩 속성. numeric 컬럼은 string|number 로
//   올 수 있어 toNum 유틸로 통일 처리한다. NULL 인 필드는 0(=대부분의 임계값을 통과
//   못함) 으로 취급하므로, 자격 기준 미충족으로 안전하게 스킵된다.
export interface BuildingEligibilityAttrs {
  electricCapacityKw?: number | string | null;
  totalArea?: number | string | null;
  totalUnits?: number | null;
  fireGrade?: number | null;
  gasUsageMonthly?: number | string | null;
}

// [Task #305] 빌딩 속성값을 숫자로 정규화. 미지(unknown)는 null 로 반환해
//   호출 측이 "값 없음 = 자격 미충족" 으로 판단할 수 있게 한다. 0 으로 강제하면
//   `<`/`<=`/`!=` 규칙에서 잘못 통과될 위험이 있어 명시적으로 분리한다.
function attrToNum(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

// [Task #305] 자격 기준(AND) 평가. 규칙이 비어 있으면 항상 true.
//   - attrs 자체가 없으면(빌딩 컨텍스트 부재) false.
//   - 특정 필드 값이 없으면(unknown) 해당 규칙은 항상 fail → 보수적으로 노출 안 함.
//     (예: gasUsageMonthly 가 입력되지 않았는데 `< 100` 규칙을 두는 경우, 0 으로
//      간주해 잘못 통과되는 것을 방지)
export function evaluateEligibility(
  rules: TaskTemplateEligibilityRule[] | null | undefined,
  attrs: BuildingEligibilityAttrs | null | undefined,
): boolean {
  if (!rules || rules.length === 0) return true;
  if (!attrs) return false;
  for (const r of rules) {
    const lhs = attrToNum((attrs as Record<string, unknown>)[r.field]);
    if (lhs === null) return false;
    const rhs = r.value;
    let ok: boolean;
    switch (r.op) {
      case ">=": ok = lhs >= rhs; break;
      case ">":  ok = lhs > rhs;  break;
      case "<=": ok = lhs <= rhs; break;
      case "<":  ok = lhs < rhs;  break;
      case "=":  ok = lhs === rhs; break;
      case "!=": ok = lhs !== rhs; break;
      default: ok = false;
    }
    if (!ok) return false;
  }
  return true;
}

// [Task #221] 활성 템플릿을 사용자 컨텍스트(소속 건물/사용자 ID)로 필터링한 뒤
// 발생 예정일·사전알림일 윈도우에 들어오는 항목만 알림으로 변환한다.
// scope=all 은 모두에게, scope=building_ids 는 scopeValues 에 본인 buildingId
// 가 포함된 경우에만, scope=user_ids 는 본인 userId 가 포함된 경우에만 노출한다.
export async function resolveActiveTemplateAlerts(
  todayIso: string,
  startId: number,
  ctx: TemplateAlertContext = {},
): Promise<ResolvedTemplateAlert[]> {
  const today = new Date(todayIso);

  const templates = await db
    .select()
    .from(taskTemplatesTable)
    .where(eq(taskTemplatesTable.isActive, true));

  // [Task #304/#305] anchored frequency 의 사용승인일과, eligibility 매칭에 쓰일
  //   빌딩 속성을 한 번의 조회로 묶어서 가져온다.
  let anchorDate: Date | null = ctx.buildingApprovalDate ?? null;
  let buildingAttrs: BuildingEligibilityAttrs | null = ctx.buildingAttrs ?? null;
  const hasAnchored = templates.some((t) => t.frequencyType === "anchored");
  const hasEligibility = templates.some(
    (t) => Array.isArray((t as { eligibility?: unknown }).eligibility) &&
      ((t as { eligibility?: unknown[] }).eligibility?.length ?? 0) > 0,
  );
  const needBuildingFetch =
    ctx.buildingId != null &&
    ((hasAnchored && anchorDate == null) || (hasEligibility && buildingAttrs == null));
  if (needBuildingFetch && ctx.buildingId) {
    const [b] = await db
      .select({
        approvalDate: buildingsTable.approvalDate,
        electricCapacityKw: buildingsTable.electricCapacityKw,
        totalArea: buildingsTable.totalArea,
        totalUnits: buildingsTable.totalUnits,
        fireGrade: buildingsTable.fireGrade,
        gasUsageMonthly: buildingsTable.gasUsageMonthly,
      })
      .from(buildingsTable)
      .where(eq(buildingsTable.id, ctx.buildingId));
    if (anchorDate == null) {
      anchorDate = b?.approvalDate ? new Date(b.approvalDate) : null;
      if (hasAnchored && !anchorDate) {
        console.warn(
          `[task-templates] 빌딩 ${ctx.buildingId} 에 사용승인일이 없어 하자담보 등 anchored 템플릿을 스킵합니다`,
        );
      }
    }
    if (buildingAttrs == null) {
      buildingAttrs = b
        ? {
            electricCapacityKw: b.electricCapacityKw,
            totalArea: b.totalArea,
            totalUnits: b.totalUnits,
            fireGrade: b.fireGrade,
            gasUsageMonthly: b.gasUsageMonthly,
          }
        : null;
    }
  }

  // [Task #221+] 사용자가 처리완료/연기한 템플릿 알림은 동일 사이클 동안
  // 다시 노출하지 않는다. 키는 (alertType, templateId). 다른 사용자의
  // 액션이 본인 알림을 가리지 않도록 ctx.userId 로 스코프한다.
  const completedTemplateActions = ctx.userId
    ? await db
        .select()
        .from(alertActionsTable)
        .where(
          and(
            inArray(alertActionsTable.alertType, ["task_template_mandatory", "task_template_suggested"]),
            eq(alertActionsTable.relatedEntityType, "task_template"),
            eq(alertActionsTable.userId, ctx.userId),
          ),
        )
    : [];
  const completedActionMap = new Map<string, typeof completedTemplateActions[0]>();
  for (const a of completedTemplateActions) {
    const key = `${a.alertType}:${a.relatedEntityId}`;
    const prev = completedActionMap.get(key);
    if (!prev || new Date(a.createdAt) > new Date(prev.createdAt)) {
      completedActionMap.set(key, a);
    }
  }

  const alerts: ResolvedTemplateAlert[] = [];
  let id = startId;

  for (const t of templates) {
    if (!templateAppliesTo(t, ctx)) continue;
    // [Task #305] 자격 기준이 있으면 빌딩 속성과 매칭. 미충족이면 스킵.
    const elig = (t as { eligibility?: TaskTemplateEligibilityRule[] | null }).eligibility ?? null;
    if (elig && elig.length > 0 && !evaluateEligibility(elig, buildingAttrs)) continue;
    // [Task #304] anchored 템플릿은 빌딩 사용승인일을 컨텍스트로 전달.
    const due = computeNextDueDate(
      t,
      today,
      t.frequencyType === "anchored" ? { anchorDate } : undefined,
    );
    if (!due) continue;
    const alertWindowStart = new Date(due);
    alertWindowStart.setDate(alertWindowStart.getDate() - t.advanceAlertDays);
    if (today < alertWindowStart) continue;

    const tplCategory = t.category as "mandatory" | "suggested";
    const alertTypeKey = tplCategory === "mandatory" ? "task_template_mandatory" : "task_template_suggested";
    const recentAction = completedActionMap.get(`${alertTypeKey}:${t.id}`);
    if (recentAction) {
      // 처리완료: 현재 사이클의 due 보다 같거나 늦은 시점에 완료 처리되었으면 숨김.
      if (recentAction.actionType === "completed") {
        const completedAt = recentAction.completedDate
          ? new Date(recentAction.completedDate)
          : new Date(recentAction.createdAt);
        if (completedAt >= alertWindowStart) continue;
      }
      // 연기: 연기 일수만큼 알림 윈도우 진입 자체를 미룸.
      if (recentAction.actionType === "postponed" && recentAction.postponeDays) {
        const postponedUntil = new Date(recentAction.createdAt);
        postponedUntil.setDate(postponedUntil.getDate() + recentAction.postponeDays);
        if (today < postponedUntil) continue;
      }
    }

    const dueIso = due.toISOString().split("T")[0];
    const daysLeft = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    const severity: ResolvedTemplateAlert["severity"] =
      daysLeft < 0 ? "critical" : daysLeft <= 7 ? "critical" : daysLeft <= 30 ? "warning" : "info";

    const dDayLabel =
      daysLeft < 0
        ? `기한 ${Math.abs(daysLeft)}일 경과`
        : daysLeft === 0
        ? "오늘 마감"
        : `${daysLeft}일 남음`;

    const category = t.category as "mandatory" | "suggested";
    // [Task #381] 제안업무 카드 둘째 줄에는 관리자가 입력한 "목적" 을 우선 노출.
    //   - purpose 가 비어 있으면 기존 마감일 안내 메시지로 폴백.
    //   - 필수업무 카드는 클라이언트에서 고정 문구("미처리시 과태료 발생") 로
    //     덮어쓰므로 message 값과 무관하지만, 일관성을 위해 동일 규칙을 적용한다.
    const tplPurpose = (t as { purpose?: string | null }).purpose;
    const purposeTrimmed = typeof tplPurpose === "string" ? tplPurpose.trim() : "";
    const fallbackMessage = `${t.description ?? t.title} — ${dueIso} (${dDayLabel})`;
    const message = purposeTrimmed.length > 0 ? purposeTrimmed : fallbackMessage;
    alerts.push({
      id: id++,
      type:
        category === "mandatory"
          ? "task_template_mandatory"
          : "task_template_suggested",
      templateId: t.id,
      templateCategory: category,
      classification: t.classification as "legal" | "internal",
      title: t.title,
      message,
      severity,
      relatedId: t.id,
      hasDraft: false,
      actionStatus: null,
      dueDate: dueIso,
      penaltyInfo: null,
      inspectionType: null,
      createdAt: new Date().toISOString(),
      iconName: t.iconName,
      color: t.color,
      priority: t.priority,
      // [Task #393] 클라이언트(매니저앱) 알림 처리 다이얼로그가 "공고문 작성" CTA 표시 여부를
      //   결정할 수 있도록 그대로 흘려보낸다.
      noticeTemplateId: (t as { noticeTemplateId?: number | null }).noticeTemplateId ?? null,
    });
  }

  alerts.sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    return (a.dueDate ?? "").localeCompare(b.dueDate ?? "");
  });
  return alerts;
}

// Public-ish endpoint (any authenticated building-portal user) returning
// active templates resolved into dashboard-friendly alerts. The dashboard
// widget merges these with /dashboard/alerts client-side so the existing
// alert response schema does not need to change.
router.get(
  "/dashboard/task-template-alerts",
  requireRole("manager", "platform_admin", "hq_executive", "accountant", "facility_staff"),
  async (req, res): Promise<void> => {
    const today = new Date().toISOString();
    const userId = req.user?.userId ?? null;
    let buildingId: number | null = null;
    let buildingUsage: string | null = null;
    if (userId) {
      const [u] = await db
        .select({ buildingId: usersTable.buildingId })
        .from(usersTable)
        .where(eq(usersTable.id, userId));
      buildingId = u?.buildingId ?? null;
    }
    if (buildingId) {
      // [#297] 적용 건물 필터링을 위해 표제부 주용도를 함께 조회.
      const [b] = await db
        .select({ buildingUsage: buildingsTable.buildingUsage })
        .from(buildingsTable)
        .where(eq(buildingsTable.id, buildingId));
      buildingUsage = b?.buildingUsage ?? null;
    }
    // [Task #305] eligibility 매칭에 필요한 빌딩 속성은 resolveActiveTemplateAlerts
    //   내부에서 buildingId 로 자동 조회된다.
    const list = await resolveActiveTemplateAlerts(today, 100000, {
      userId,
      buildingId,
      userRole: req.user?.role ?? null,
      buildingUsage,
    });
    res.json(list);
  },
);

export default router;
