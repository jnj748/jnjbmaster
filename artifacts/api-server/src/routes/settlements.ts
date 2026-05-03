import { Router, type IRouter } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db, settlementsTable, contractsTable, workReportsTable } from "@workspace/db";
import {
  ListSettlementsQueryParams,
  ListSettlementsResponse,
  CreateSettlementBody,
  UpdateSettlementParams,
  UpdateSettlementBody,
  UpdateSettlementResponse,
} from "@workspace/api-zod";
import { requireRole } from "../middlewares/auth";

// Drizzle 의 timestamp 컬럼은 Date 객체로 반환되지만 Zod 응답 스키마(`UpdateSettlementResponse`,
// `ListSettlementsResponseItem`)는 createdAt/updatedAt 을 ISO 문자열로 기대한다. 이 미스매치로
// `*.parse(row)` 가 ZodError 를 던져 200 응답 대신 500 이 나가는 회귀(Task #771)를 막기 위해
// 직렬화 직전 Date 를 ISO 문자열로 정규화한다. paidAt 은 `date` 컬럼이라 이미 문자열이다.
function serializeSettlement<T extends { createdAt: Date | string; updatedAt: Date | string }>(row: T) {
  return {
    ...row,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : row.updatedAt,
  };
}

const router: IRouter = Router();
router.use("/settlements", requireRole("manager", "platform_admin", "accountant"));
router.get("/settlements", async (req, res): Promise<void> => {
  const params = ListSettlementsQueryParams.safeParse(req.query);
  const conditions = [];

  if (params.success && params.data.vendorId) {
    conditions.push(eq(settlementsTable.vendorId, params.data.vendorId));
  }
  if (params.success && params.data.status) {
    conditions.push(eq(settlementsTable.status, params.data.status));
  }

  const settlements = await db
    .select()
    .from(settlementsTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(settlementsTable.createdAt));

  res.json(ListSettlementsResponse.parse(settlements.map(serializeSettlement)));
});

router.post("/settlements", async (req, res): Promise<void> => {
  const parsed = CreateSettlementBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const data = parsed.data as Record<string, unknown> & { contractId?: number | null };
  if (data.contractId) {
    const [contract] = await db.select().from(contractsTable).where(eq(contractsTable.id, data.contractId));
    if (!contract) {
      res.status(400).json({ error: "연결된 계약을 찾을 수 없습니다" });
      return;
    }
    if (!["active", "in_progress", "completed", "renewal_due"].includes(contract.status)) {
      res.status(400).json({ error: `계약이 활성 상태가 아닙니다 (현재: ${contract.status}). 결재 완료 후 정산하세요.` });
      return;
    }
    const approvedReports = await db
      .select()
      .from(workReportsTable)
      .where(and(eq(workReportsTable.contractId, data.contractId), eq(workReportsTable.status, "approved")));
    if (approvedReports.length === 0) {
      res.status(400).json({ error: "승인된 작업보고서(검수완료)가 1건 이상 있어야 정산할 수 있습니다" });
      return;
    }
  }

  const [settlement] = await db.insert(settlementsTable).values(parsed.data).returning();
  res.status(201).json(UpdateSettlementResponse.parse(serializeSettlement(settlement)));
});

router.patch("/settlements/:id", async (req, res): Promise<void> => {
  const params = UpdateSettlementParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateSettlementBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [settlement] = await db
    .update(settlementsTable)
    .set(parsed.data)
    .where(eq(settlementsTable.id, params.data.id))
    .returning();

  if (!settlement) {
    res.status(404).json({ error: "Settlement not found" });
    return;
  }

  res.json(UpdateSettlementResponse.parse(serializeSettlement(settlement)));
});

export default router;
