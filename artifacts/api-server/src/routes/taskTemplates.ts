import { Router, type IRouter } from "express";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db,
  alertActionsTable,
  taskTemplatesTable,
  taskTemplateAuditLogsTable,
  taskTemplateCategories,
  taskTemplateClassifications,
  taskTemplateFrequencyTypes,
  taskTemplateScopeTypes,
  usersTable,
  type TaskTemplate,
} from "@workspace/db";
import { requireRole } from "../middlewares/auth";
import { computeNextDueDate } from "../lib/taskTemplateCycle";

const router: IRouter = Router();

const categoryEnum = z.enum(taskTemplateCategories);
const classificationEnum = z.enum(taskTemplateClassifications);
const frequencyEnum = z.enum(taskTemplateFrequencyTypes);
const scopeEnum = z.enum(taskTemplateScopeTypes);

const CreateBody = z.object({
  title: z.string().min(1).max(200),
  description: z.string().nullable().optional(),
  category: categoryEnum,
  classification: classificationEnum.optional(),
  iconName: z.string().nullable().optional(),
  color: z.string().nullable().optional(),
  frequencyType: frequencyEnum,
  intervalValue: z.number().int().positive().nullable().optional(),
  fixedMonth: z.number().int().min(1).max(12).nullable().optional(),
  fixedDay: z.number().int().min(1).max(31).nullable().optional(),
  startDate: z.string().nullable().optional(),
  scopeType: scopeEnum.optional(),
  scopeValues: z.array(z.string()).optional(),
  priority: z.number().int().min(0).max(100).optional(),
  advanceAlertDays: z.number().int().min(0).max(365).optional(),
  isActive: z.boolean().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const UpdateBody = CreateBody.partial();

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
  async (_req, res): Promise<void> => {
    const rows = await db
      .select()
      .from(taskTemplatesTable)
      .orderBy(desc(taskTemplatesTable.priority), asc(taskTemplatesTable.title));
    res.json(rows);
  },
);

router.post(
  "/platform/task-templates",
  requireRole("platform_admin"),
  async (req, res): Promise<void> => {
    const parsed = CreateBody.safeParse(req.body);
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
        classification: d.classification ?? "internal",
        iconName: d.iconName ?? null,
        color: d.color ?? null,
        frequencyType: d.frequencyType,
        intervalValue: d.intervalValue ?? null,
        fixedMonth: d.fixedMonth ?? null,
        fixedDay: d.fixedDay ?? null,
        startDate: d.startDate ?? null,
        scopeType: d.scopeType ?? "all",
        scopeValues: d.scopeValues ?? [],
        priority: d.priority ?? 50,
        advanceAlertDays: d.advanceAlertDays ?? 7,
        isActive: d.isActive ?? true,
        metadata: d.metadata ?? {},
        createdBy: userId ?? null,
        createdByName: author?.name ?? null,
      })
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
    for (const k of Object.keys(d) as (keyof typeof d)[]) {
      const v = d[k];
      if (v !== undefined) {
        if (k === "scopeValues" && v == null) patch[k] = [];
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
  ctx: { userId?: number | null; buildingId?: number | null },
): boolean {
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
}

export interface TemplateAlertContext {
  userId?: number | null;
  buildingId?: number | null;
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
    const due = computeNextDueDate(t, today);
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
      message: `${t.description ?? t.title} — ${dueIso} (${dDayLabel})`,
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
    if (userId) {
      const [u] = await db
        .select({ buildingId: usersTable.buildingId })
        .from(usersTable)
        .where(eq(usersTable.id, userId));
      buildingId = u?.buildingId ?? null;
    }
    const list = await resolveActiveTemplateAlerts(today, 100000, {
      userId,
      buildingId,
    });
    res.json(list);
  },
);

export default router;
