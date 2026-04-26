import { Router, type IRouter } from "express";
import { eq, asc } from "drizzle-orm";
import { z } from "zod/v4";
import { db, buildingNoticeTemplatesTable } from "@workspace/db";
import { requireRole } from "../middlewares/auth";

// [Task #323] 관리소장 공지문 템플릿 — 플랫폼이 관리, 매니저가 사용.
const router: IRouter = Router();
const platformAdminOnly = requireRole("platform_admin");
//   템플릿 카탈로그는 건물 운영 인력만 조회 (입주민/파트너는 제외).
const buildingStaffOnly = requireRole(
  "manager",
  "accountant",
  "facility_staff",
  "hq_executive",
  "platform_admin",
);

// ── 매니저(건물 운영 인력) 활성 템플릿 목록 ───────────────
router.get("/building-notice-templates", buildingStaffOnly, async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(buildingNoticeTemplatesTable)
    .where(eq(buildingNoticeTemplatesTable.isActive, true))
    .orderBy(asc(buildingNoticeTemplatesTable.sortOrder), asc(buildingNoticeTemplatesTable.id));
  res.json({ templates: rows });
});

// ── 관리자 전체 목록 ───────────────────────────────────────
router.get(
  "/building-notice-templates/admin",
  platformAdminOnly,
  async (_req, res): Promise<void> => {
    const rows = await db
      .select()
      .from(buildingNoticeTemplatesTable)
      .orderBy(asc(buildingNoticeTemplatesTable.sortOrder), asc(buildingNoticeTemplatesTable.id));
    res.json({ templates: rows });
  },
);

// [Task #389] scheduleConfig 의 자유 형식 — yearly/monthly/before_inspection 별로 키가 다르다.
const ScheduleConfigSchema = z
  .object({
    month: z.number().int().min(1).max(12).optional(),
    day: z.number().int().min(1).max(31).optional(),
    inspectionName: z.string().min(1).max(200).optional(),
  })
  .nullable()
  .optional();

const UpsertBody = z.object({
  title: z.string().min(1).max(200),
  category: z.string().min(1).max(50).default("일반"),
  icon: z.string().max(8).nullable().optional(),
  bodyHtml: z.string().min(1),
  // 사용자 정의 입력 라벨. UI 가 string[] 로 보내는 것을 JSON 문자열로 직렬화.
  customFieldLabels: z.array(z.string().max(40)).max(6).nullable().optional(),
  sortOrder: z.number().int().min(0).max(10000).default(100),
  isActive: z.boolean().default(true),
  // [Task #389] 정기 게시 스케줄.
  scheduleType: z.enum(["none", "yearly", "monthly", "before_inspection"]).default("none"),
  scheduleConfig: ScheduleConfigSchema,
  leadDays: z.number().int().min(0).max(365).default(7),
  requiresReport: z.boolean().default(false),
});

router.post(
  "/building-notice-templates/admin",
  platformAdminOnly,
  async (req, res): Promise<void> => {
    const parsed = UpsertBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const [row] = await db
      .insert(buildingNoticeTemplatesTable)
      .values({
        title: parsed.data.title,
        category: parsed.data.category,
        icon: parsed.data.icon ?? null,
        bodyHtml: parsed.data.bodyHtml,
        customFieldLabels: parsed.data.customFieldLabels
          ? JSON.stringify(parsed.data.customFieldLabels)
          : null,
        sortOrder: parsed.data.sortOrder,
        isActive: parsed.data.isActive,
        scheduleType: parsed.data.scheduleType,
        scheduleConfig: parsed.data.scheduleConfig ?? null,
        leadDays: parsed.data.leadDays,
        requiresReport: parsed.data.requiresReport,
      })
      .returning();
    res.json({ template: row });
  },
);

router.put(
  "/building-notice-templates/admin/:id",
  platformAdminOnly,
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "잘못된 id" });
      return;
    }
    const parsed = UpsertBody.partial().safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const patch: Record<string, unknown> = {};
    if (parsed.data.title !== undefined) patch.title = parsed.data.title;
    if (parsed.data.category !== undefined) patch.category = parsed.data.category;
    if (parsed.data.icon !== undefined) patch.icon = parsed.data.icon;
    if (parsed.data.bodyHtml !== undefined) patch.bodyHtml = parsed.data.bodyHtml;
    if (parsed.data.customFieldLabels !== undefined) {
      patch.customFieldLabels = parsed.data.customFieldLabels
        ? JSON.stringify(parsed.data.customFieldLabels)
        : null;
    }
    if (parsed.data.sortOrder !== undefined) patch.sortOrder = parsed.data.sortOrder;
    if (parsed.data.isActive !== undefined) patch.isActive = parsed.data.isActive;
    if (parsed.data.scheduleType !== undefined) patch.scheduleType = parsed.data.scheduleType;
    if (parsed.data.scheduleConfig !== undefined) patch.scheduleConfig = parsed.data.scheduleConfig ?? null;
    if (parsed.data.leadDays !== undefined) patch.leadDays = parsed.data.leadDays;
    if (parsed.data.requiresReport !== undefined) patch.requiresReport = parsed.data.requiresReport;
    const [row] = await db
      .update(buildingNoticeTemplatesTable)
      .set(patch)
      .where(eq(buildingNoticeTemplatesTable.id, id))
      .returning();
    if (!row) {
      res.status(404).json({ error: "템플릿을 찾을 수 없습니다" });
      return;
    }
    res.json({ template: row });
  },
);

router.delete(
  "/building-notice-templates/admin/:id",
  platformAdminOnly,
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "잘못된 id" });
      return;
    }
    await db.delete(buildingNoticeTemplatesTable).where(eq(buildingNoticeTemplatesTable.id, id));
    res.json({ ok: true });
  },
);

export default router;
