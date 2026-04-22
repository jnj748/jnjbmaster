import { Router, type IRouter } from "express";
import { desc, eq } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db,
  platformKnowledgeDocsTable,
  usersTable,
} from "@workspace/db";
import { requireRole } from "../middlewares/auth";

const router: IRouter = Router();

// 플랫폼 관리자가 관리하는 공통 지식 자료(법령/개정안/가이드 등) CRUD.
// 관리소장 AI 비서가 공통 컨텍스트로 참조한다.

const CreateBody = z.object({
  title: z.string().min(1).max(200),
  category: z.string().min(1).max(60).default("기타"),
  summary: z.string().max(500).nullable().optional(),
  bodyText: z.string().default(""),
  fileUrl: z.string().nullable().optional(),
  fileName: z.string().nullable().optional(),
  effectiveDate: z.string().nullable().optional(),
  version: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
});

const UpdateBody = CreateBody.partial();

router.get(
  "/platform/knowledge-docs",
  requireRole("platform_admin", "hq_executive"),
  async (_req, res): Promise<void> => {
    const rows = await db
      .select()
      .from(platformKnowledgeDocsTable)
      .orderBy(desc(platformKnowledgeDocsTable.createdAt));
    res.json(rows);
  },
);

router.post(
  "/platform/knowledge-docs",
  requireRole("platform_admin", "hq_executive"),
  async (req, res): Promise<void> => {
    const parsed = CreateBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const d = parsed.data;
    const [author] = await db
      .select({ name: usersTable.name })
      .from(usersTable)
      .where(eq(usersTable.id, req.user!.userId));
    const [created] = await db
      .insert(platformKnowledgeDocsTable)
      .values({
        title: d.title,
        category: d.category,
        summary: d.summary ?? null,
        bodyText: d.bodyText ?? "",
        fileUrl: d.fileUrl ?? null,
        fileName: d.fileName ?? null,
        effectiveDate: d.effectiveDate ?? null,
        version: d.version ?? null,
        isActive: d.isActive ?? true,
        createdBy: req.user!.userId,
        createdByName: author?.name ?? null,
      })
      .returning();
    res.status(201).json(created);
  },
);

router.patch(
  "/platform/knowledge-docs/:id",
  requireRole("platform_admin", "hq_executive"),
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
    const d = parsed.data;
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (d.title !== undefined) patch.title = d.title;
    if (d.category !== undefined) patch.category = d.category;
    if (d.summary !== undefined) patch.summary = d.summary;
    if (d.bodyText !== undefined) patch.bodyText = d.bodyText;
    if (d.fileUrl !== undefined) patch.fileUrl = d.fileUrl;
    if (d.fileName !== undefined) patch.fileName = d.fileName;
    if (d.effectiveDate !== undefined) patch.effectiveDate = d.effectiveDate;
    if (d.version !== undefined) patch.version = d.version;
    if (d.isActive !== undefined) patch.isActive = d.isActive;

    const [updated] = await db
      .update(platformKnowledgeDocsTable)
      .set(patch)
      .where(eq(platformKnowledgeDocsTable.id, id))
      .returning();
    if (!updated) {
      res.status(404).json({ error: "자료를 찾을 수 없습니다" });
      return;
    }
    res.json(updated);
  },
);

router.delete(
  "/platform/knowledge-docs/:id",
  requireRole("platform_admin", "hq_executive"),
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "유효한 ID가 필요합니다" });
      return;
    }
    const result = await db
      .delete(platformKnowledgeDocsTable)
      .where(eq(platformKnowledgeDocsTable.id, id))
      .returning({ id: platformKnowledgeDocsTable.id });
    if (result.length === 0) {
      res.status(404).json({ error: "자료를 찾을 수 없습니다" });
      return;
    }
    res.json({ ok: true });
  },
);

export default router;
