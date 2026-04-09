import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, commissionsTable } from "@workspace/db";
import {
  ListCommissionsResponse,
  CreateCommissionBody,
  UpdateCommissionParams,
  UpdateCommissionBody,
  UpdateCommissionResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/commissions", async (_req, res): Promise<void> => {
  const commissions = await db
    .select()
    .from(commissionsTable)
    .orderBy(commissionsTable.createdAt);

  res.json(ListCommissionsResponse.parse(commissions));
});

router.post("/commissions", async (req, res): Promise<void> => {
  const parsed = CreateCommissionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [commission] = await db.insert(commissionsTable).values(parsed.data).returning();
  res.status(201).json(UpdateCommissionResponse.parse(commission));
});

router.patch("/commissions/:id", async (req, res): Promise<void> => {
  const params = UpdateCommissionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateCommissionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [commission] = await db
    .update(commissionsTable)
    .set(parsed.data)
    .where(eq(commissionsTable.id, params.data.id))
    .returning();

  if (!commission) {
    res.status(404).json({ error: "Commission not found" });
    return;
  }

  res.json(UpdateCommissionResponse.parse(commission));
});

export default router;
