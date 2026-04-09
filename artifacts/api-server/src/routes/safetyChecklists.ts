import { Router, type IRouter } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db, safetyChecklistsTable, safetyChecklistItemsTable } from "@workspace/db";
import {
  ListSafetyChecklistsQueryParams,
  ListSafetyChecklistsResponse,
  CreateSafetyChecklistBody,
  GetSafetyChecklistParams,
  GetSafetyChecklistResponse,
  UpdateSafetyChecklistParams,
  UpdateSafetyChecklistBody,
  UpdateSafetyChecklistResponse,
  DeleteSafetyChecklistParams,
  AddSafetyChecklistItemParams,
  AddSafetyChecklistItemBody,
  UpdateSafetyChecklistItemParams,
  UpdateSafetyChecklistItemBody,
  UpdateSafetyChecklistItemResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/safety-checklists", async (req, res): Promise<void> => {
  const params = ListSafetyChecklistsQueryParams.safeParse(req.query);
  const conditions = [];

  if (params.success) {
    if (params.data.category) {
      conditions.push(eq(safetyChecklistsTable.category, params.data.category));
    }
    if (params.data.status) {
      conditions.push(eq(safetyChecklistsTable.status, params.data.status));
    }
  }

  const checklists = await db
    .select()
    .from(safetyChecklistsTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(safetyChecklistsTable.inspectionDate));

  res.json(ListSafetyChecklistsResponse.parse(checklists));
});

router.post("/safety-checklists", async (req, res): Promise<void> => {
  const parsed = CreateSafetyChecklistBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { items, ...checklistData } = parsed.data;

  const [checklist] = await db.insert(safetyChecklistsTable).values(checklistData).returning();

  if (items && items.length > 0) {
    await db.insert(safetyChecklistItemsTable).values(
      items.map((item) => ({
        checklistId: checklist.id,
        itemName: item.itemName,
        checked: item.checked ?? false,
        result: item.result ?? null,
        notes: item.notes ?? null,
      }))
    );
  }

  res.status(201).json(UpdateSafetyChecklistResponse.parse(checklist));
});

router.get("/safety-checklists/:id", async (req, res): Promise<void> => {
  const params = GetSafetyChecklistParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [checklist] = await db
    .select()
    .from(safetyChecklistsTable)
    .where(eq(safetyChecklistsTable.id, params.data.id));

  if (!checklist) {
    res.status(404).json({ error: "Checklist not found" });
    return;
  }

  const items = await db
    .select()
    .from(safetyChecklistItemsTable)
    .where(eq(safetyChecklistItemsTable.checklistId, params.data.id));

  res.json(GetSafetyChecklistResponse.parse({ ...checklist, items }));
});

router.patch("/safety-checklists/:id", async (req, res): Promise<void> => {
  const params = UpdateSafetyChecklistParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateSafetyChecklistBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [checklist] = await db
    .update(safetyChecklistsTable)
    .set(parsed.data)
    .where(eq(safetyChecklistsTable.id, params.data.id))
    .returning();

  if (!checklist) {
    res.status(404).json({ error: "Checklist not found" });
    return;
  }

  res.json(UpdateSafetyChecklistResponse.parse(checklist));
});

router.delete("/safety-checklists/:id", async (req, res): Promise<void> => {
  const params = DeleteSafetyChecklistParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  await db.delete(safetyChecklistItemsTable).where(eq(safetyChecklistItemsTable.checklistId, params.data.id));
  const [checklist] = await db.delete(safetyChecklistsTable).where(eq(safetyChecklistsTable.id, params.data.id)).returning();

  if (!checklist) {
    res.status(404).json({ error: "Checklist not found" });
    return;
  }

  res.sendStatus(204);
});

router.post("/safety-checklists/:id/items", async (req, res): Promise<void> => {
  const params = AddSafetyChecklistItemParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = AddSafetyChecklistItemBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [item] = await db
    .insert(safetyChecklistItemsTable)
    .values({ ...parsed.data, checklistId: params.data.id })
    .returning();

  res.status(201).json(UpdateSafetyChecklistItemResponse.parse(item));
});

router.patch("/safety-checklists/items/:itemId", async (req, res): Promise<void> => {
  const params = UpdateSafetyChecklistItemParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateSafetyChecklistItemBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [item] = await db
    .update(safetyChecklistItemsTable)
    .set(parsed.data)
    .where(eq(safetyChecklistItemsTable.id, params.data.itemId))
    .returning();

  if (!item) {
    res.status(404).json({ error: "Item not found" });
    return;
  }

  res.json(UpdateSafetyChecklistItemResponse.parse(item));
});

export default router;
