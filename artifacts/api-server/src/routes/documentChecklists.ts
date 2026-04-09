import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, documentChecklistsTable } from "@workspace/db";
import {
  ListDocumentChecklistsQueryParams,
  ListDocumentChecklistsResponse,
  UpsertDocumentChecklistBody,
  UpsertDocumentChecklistResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/document-checklists", async (req, res): Promise<void> => {
  const params = ListDocumentChecklistsQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const items = await db
    .select()
    .from(documentChecklistsTable)
    .where(
      and(
        eq(documentChecklistsTable.entityType, params.data.entityType),
        eq(documentChecklistsTable.entityId, params.data.entityId)
      )
    )
    .orderBy(documentChecklistsTable.documentName);

  res.json(ListDocumentChecklistsResponse.parse(items));
});

router.post("/document-checklists", async (req, res): Promise<void> => {
  const parsed = UpsertDocumentChecklistBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const existing = await db
    .select()
    .from(documentChecklistsTable)
    .where(
      and(
        eq(documentChecklistsTable.entityType, parsed.data.entityType),
        eq(documentChecklistsTable.entityId, parsed.data.entityId),
        eq(documentChecklistsTable.documentName, parsed.data.documentName)
      )
    );

  let result;
  if (existing.length > 0) {
    [result] = await db
      .update(documentChecklistsTable)
      .set({
        isSubmitted: parsed.data.isSubmitted,
        submittedAt: parsed.data.isSubmitted ? new Date() : null,
        notes: parsed.data.notes ?? null,
      })
      .where(eq(documentChecklistsTable.id, existing[0].id))
      .returning();
  } else {
    [result] = await db
      .insert(documentChecklistsTable)
      .values({
        ...parsed.data,
        submittedAt: parsed.data.isSubmitted ? new Date() : null,
      })
      .returning();
  }

  res.json(UpsertDocumentChecklistResponse.parse(result));
});

export default router;
