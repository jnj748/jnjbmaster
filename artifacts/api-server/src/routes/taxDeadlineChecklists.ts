import { Router, type IRouter } from "express";
import { eq, and, type SQL } from "drizzle-orm";
import { db, taxDeadlineChecklistsTable, taxSchedulesTable } from "@workspace/db";
import {
  ListTaxDeadlineChecklistsResponse,
  CreateTaxDeadlineChecklistBody,
  UpdateTaxDeadlineChecklistParams,
  UpdateTaxDeadlineChecklistBody,
  UpdateTaxDeadlineChecklistResponse,
  DeleteTaxDeadlineChecklistParams,
  InitTaxDeadlineChecklistParams,
} from "@workspace/api-zod";
import { requireRole } from "../middlewares/auth";

const router: IRouter = Router();

const DEFAULT_CHECKLIST_ITEMS = [
  { itemName: "매출 증빙 자료", description: "세금계산서, 현금영수증 등 매출 관련 증빙" },
  { itemName: "매입 증빙 자료", description: "매입 세금계산서, 영수증 등 매입 관련 증빙" },
  { itemName: "급여대장", description: "직원 급여 내역서" },
  { itemName: "4대보험 납부 내역", description: "국민연금, 건강보험, 고용보험, 산재보험" },
  { itemName: "통장 거래 내역", description: "관리비 수입/지출 통장 거래 내역" },
  { itemName: "관리비 부과 내역", description: "세대별 관리비 부과 명세" },
  { itemName: "공과금 납부 내역", description: "수도, 전기, 가스 등 공과금 납부 영수증" },
  { itemName: "기타 비용 영수증", description: "수선유지비, 소모품비 등 기타 영수증" },
];

router.get("/tax-deadline-checklists", async (req, res): Promise<void> => {
  const taxScheduleIdRaw = req.query.taxScheduleId;
  const dueDateRaw = req.query.dueDate;

  const conditions: SQL[] = [];
  if (taxScheduleIdRaw) {
    const id = Number(taxScheduleIdRaw);
    if (isNaN(id)) {
      res.status(400).json({ error: "taxScheduleId must be a number" });
      return;
    }
    conditions.push(eq(taxDeadlineChecklistsTable.taxScheduleId, id));
  }
  if (dueDateRaw && typeof dueDateRaw === "string") {
    conditions.push(eq(taxDeadlineChecklistsTable.dueDate, dueDateRaw));
  }

  const items = conditions.length > 0
    ? await db.select().from(taxDeadlineChecklistsTable).where(and(...conditions))
    : await db.select().from(taxDeadlineChecklistsTable);

  res.json(ListTaxDeadlineChecklistsResponse.parse(items));
});

router.post("/tax-deadline-checklists", requireRole("manager", "platform_admin", "accountant"), async (req, res): Promise<void> => {
  const parsed = CreateTaxDeadlineChecklistBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [item] = await db.insert(taxDeadlineChecklistsTable).values(parsed.data).returning();
  res.status(201).json(UpdateTaxDeadlineChecklistResponse.parse(item));
});

router.patch("/tax-deadline-checklists/:id", requireRole("manager", "platform_admin", "accountant"), async (req, res): Promise<void> => {
  const params = UpdateTaxDeadlineChecklistParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateTaxDeadlineChecklistBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [item] = await db
    .update(taxDeadlineChecklistsTable)
    .set(parsed.data as never)
    .where(eq(taxDeadlineChecklistsTable.id, params.data.id))
    .returning();

  if (!item) {
    res.status(404).json({ error: "Checklist item not found" });
    return;
  }

  res.json(UpdateTaxDeadlineChecklistResponse.parse(item));
});

router.delete("/tax-deadline-checklists/:id", requireRole("manager", "platform_admin", "accountant"), async (req, res): Promise<void> => {
  const params = DeleteTaxDeadlineChecklistParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [item] = await db
    .delete(taxDeadlineChecklistsTable)
    .where(eq(taxDeadlineChecklistsTable.id, params.data.id))
    .returning();

  if (!item) {
    res.status(404).json({ error: "Checklist item not found" });
    return;
  }

  res.sendStatus(204);
});

router.post("/tax-deadline-checklists/init/:taxScheduleId", requireRole("manager", "platform_admin", "accountant"), async (req, res): Promise<void> => {
  const params = InitTaxDeadlineChecklistParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [schedule] = await db
    .select()
    .from(taxSchedulesTable)
    .where(eq(taxSchedulesTable.id, params.data.taxScheduleId));

  if (!schedule) {
    res.status(404).json({ error: "Tax schedule not found" });
    return;
  }

  const existing = await db
    .select()
    .from(taxDeadlineChecklistsTable)
    .where(eq(taxDeadlineChecklistsTable.taxScheduleId, params.data.taxScheduleId));

  if (existing.length > 0) {
    res.status(200).json(ListTaxDeadlineChecklistsResponse.parse(existing));
    return;
  }

  const items = await db
    .insert(taxDeadlineChecklistsTable)
    .values(
      DEFAULT_CHECKLIST_ITEMS.map((item) => ({
        taxScheduleId: params.data.taxScheduleId,
        itemName: item.itemName,
        description: item.description,
        dueDate: schedule.dueDate,
      }))
    )
    .returning();

  res.status(201).json(ListTaxDeadlineChecklistsResponse.parse(items));
});

export default router;
