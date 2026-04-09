import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, draftsTable } from "@workspace/db";
import {
  ListDraftsResponse,
  GetDraftParams,
  GetDraftResponse,
  UpdateDraftParams,
  UpdateDraftBody,
  UpdateDraftResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/drafts", async (_req, res): Promise<void> => {
  const drafts = await db
    .select()
    .from(draftsTable)
    .orderBy(desc(draftsTable.createdAt));

  res.json(ListDraftsResponse.parse(drafts));
});

router.get("/drafts/:id", async (req, res): Promise<void> => {
  const params = GetDraftParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [draft] = await db
    .select()
    .from(draftsTable)
    .where(eq(draftsTable.id, params.data.id));

  if (!draft) {
    res.status(404).json({ error: "Draft not found" });
    return;
  }

  res.json(GetDraftResponse.parse(draft));
});

router.patch("/drafts/:id", async (req, res): Promise<void> => {
  const params = UpdateDraftParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateDraftBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [draft] = await db
    .update(draftsTable)
    .set(parsed.data)
    .where(eq(draftsTable.id, params.data.id))
    .returning();

  if (!draft) {
    res.status(404).json({ error: "Draft not found" });
    return;
  }

  res.json(UpdateDraftResponse.parse(draft));
});

export default router;
