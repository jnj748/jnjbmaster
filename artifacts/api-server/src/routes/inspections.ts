import { Router, type IRouter } from "express";
import { eq, and, lte, gte, sql } from "drizzle-orm";
import { db, inspectionsTable } from "@workspace/db";
import {
  ListInspectionsResponse,
  CreateInspectionBody,
  UpdateInspectionParams,
  UpdateInspectionBody,
  UpdateInspectionResponse,
  DeleteInspectionParams,
  GetUpcomingInspectionsResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/inspections", async (_req, res): Promise<void> => {
  const inspections = await db
    .select()
    .from(inspectionsTable)
    .orderBy(inspectionsTable.nextDueDate);

  res.json(ListInspectionsResponse.parse(inspections));
});

router.post("/inspections", async (req, res): Promise<void> => {
  const parsed = CreateInspectionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const data = {
    ...parsed.data,
    advanceAlertDays: parsed.data.advanceAlertDays ?? 30,
  };

  const [inspection] = await db.insert(inspectionsTable).values(data).returning();
  res.status(201).json(UpdateInspectionResponse.parse(inspection));
});

router.patch("/inspections/:id", async (req, res): Promise<void> => {
  const params = UpdateInspectionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateInspectionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [inspection] = await db
    .update(inspectionsTable)
    .set(parsed.data)
    .where(eq(inspectionsTable.id, params.data.id))
    .returning();

  if (!inspection) {
    res.status(404).json({ error: "Inspection not found" });
    return;
  }

  res.json(UpdateInspectionResponse.parse(inspection));
});

router.delete("/inspections/:id", async (req, res): Promise<void> => {
  const params = DeleteInspectionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [inspection] = await db
    .delete(inspectionsTable)
    .where(eq(inspectionsTable.id, params.data.id))
    .returning();

  if (!inspection) {
    res.status(404).json({ error: "Inspection not found" });
    return;
  }

  res.sendStatus(204);
});

router.get("/inspections/upcoming", async (_req, res): Promise<void> => {
  const today = new Date();
  const thirtyDaysFromNow = new Date();
  thirtyDaysFromNow.setDate(today.getDate() + 30);

  const todayStr = today.toISOString().split("T")[0];
  const futureStr = thirtyDaysFromNow.toISOString().split("T")[0];

  const inspections = await db
    .select()
    .from(inspectionsTable)
    .where(
      and(
        lte(inspectionsTable.nextDueDate, futureStr),
        gte(inspectionsTable.nextDueDate, todayStr)
      )
    )
    .orderBy(inspectionsTable.nextDueDate);

  res.json(GetUpcomingInspectionsResponse.parse(inspections));
});

export default router;
