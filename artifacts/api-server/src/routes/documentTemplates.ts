import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, documentTemplatesTable } from "@workspace/db";
import { requireRole } from "../middlewares/auth";

const router: IRouter = Router();

function serialize(r: typeof documentTemplatesTable.$inferSelect) {
  return {
    ...r,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

router.get("/document-templates", async (_req, res): Promise<void> => {
  const templates = await db
    .select()
    .from(documentTemplatesTable)
    .orderBy(documentTemplatesTable.sortOrder);

  res.json(templates.map(serialize));
});

router.get("/document-templates/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [row] = await db
    .select()
    .from(documentTemplatesTable)
    .where(eq(documentTemplatesTable.id, id));

  if (!row) {
    res.status(404).json({ error: "서식 템플릿을 찾을 수 없습니다" });
    return;
  }

  res.json(serialize(row));
});

router.post("/document-templates", requireRole("manager"), async (req, res): Promise<void> => {
  const { name, category, description, fields, bodyTemplate, sortOrder } = req.body;

  if (!name || !category || !fields || !bodyTemplate) {
    res.status(400).json({ error: "필수 항목을 입력해주세요" });
    return;
  }

  const [row] = await db
    .insert(documentTemplatesTable)
    .values({
      name,
      category,
      description: description ?? null,
      fields,
      bodyTemplate,
      sortOrder: sortOrder ?? 0,
      isSystem: false,
    })
    .returning();

  res.status(201).json(serialize(row));
});

router.put("/document-templates/:id", requireRole("manager"), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const { name, category, description, fields, bodyTemplate, sortOrder } = req.body;

  const [existing] = await db
    .select()
    .from(documentTemplatesTable)
    .where(eq(documentTemplatesTable.id, id));

  if (!existing) {
    res.status(404).json({ error: "서식 템플릿을 찾을 수 없습니다" });
    return;
  }

  const [row] = await db
    .update(documentTemplatesTable)
    .set({
      name: name ?? existing.name,
      category: category ?? existing.category,
      description: description ?? existing.description,
      fields: fields ?? existing.fields,
      bodyTemplate: bodyTemplate ?? existing.bodyTemplate,
      sortOrder: sortOrder ?? existing.sortOrder,
    })
    .where(eq(documentTemplatesTable.id, id))
    .returning();

  res.json(serialize(row));
});

router.delete("/document-templates/:id", requireRole("manager"), async (req, res): Promise<void> => {
  const id = Number(req.params.id);

  const [existing] = await db
    .select()
    .from(documentTemplatesTable)
    .where(eq(documentTemplatesTable.id, id));

  if (!existing) {
    res.status(404).json({ error: "서식 템플릿을 찾을 수 없습니다" });
    return;
  }

  if (existing.isSystem) {
    res.status(400).json({ error: "시스템 기본 서식은 삭제할 수 없습니다" });
    return;
  }

  await db.delete(documentTemplatesTable).where(eq(documentTemplatesTable.id, id));

  res.json({ success: true });
});

export default router;
