import { Router, type IRouter } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db, workReportsTable, commissionsTable, commissionEventsTable } from "@workspace/db";
import { isAutoCommissionEnabled } from "../lib/credits";
import {
  ListWorkReportsQueryParams,
  ListWorkReportsResponse,
  CreateWorkReportBody,
  GetWorkReportParams,
  GetWorkReportResponse,
  UpdateWorkReportParams,
  UpdateWorkReportBody,
  UpdateWorkReportResponse,
} from "@workspace/api-zod";
import { requireRole } from "../middlewares/auth";

const router: IRouter = Router();
router.use(requireRole("manager", "platform_admin"));

router.get("/work-reports", async (req, res): Promise<void> => {
  const params = ListWorkReportsQueryParams.safeParse(req.query);
  const conditions = [];

  if (params.success && params.data.vendorId) {
    conditions.push(eq(workReportsTable.vendorId, params.data.vendorId));
  }
  if (params.success && params.data.status) {
    conditions.push(eq(workReportsTable.status, params.data.status));
  }

  const reports = await db
    .select()
    .from(workReportsTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(workReportsTable.createdAt));

  res.json(ListWorkReportsResponse.parse(reports));
});

router.get("/work-reports/:id", async (req, res): Promise<void> => {
  const params = GetWorkReportParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [report] = await db
    .select()
    .from(workReportsTable)
    .where(eq(workReportsTable.id, params.data.id));

  if (!report) {
    res.status(404).json({ error: "Work report not found" });
    return;
  }

  res.json(GetWorkReportResponse.parse(report));
});

router.post("/work-reports", async (req, res): Promise<void> => {
  const parsed = CreateWorkReportBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [report] = await db.insert(workReportsTable).values(parsed.data).returning();
  res.status(201).json(UpdateWorkReportResponse.parse(report));
});

router.patch("/work-reports/:id", async (req, res): Promise<void> => {
  const params = UpdateWorkReportParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateWorkReportBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updateData: any = { ...parsed.data };
  if (parsed.data.status === "approved" || parsed.data.status === "rejected") {
    updateData.reviewedAt = new Date();
  }

  const [prev] = await db.select().from(workReportsTable).where(eq(workReportsTable.id, params.data.id));

  const [report] = await db
    .update(workReportsTable)
    .set(updateData)
    .where(eq(workReportsTable.id, params.data.id))
    .returning();

  if (!report) {
    res.status(404).json({ error: "Work report not found" });
    return;
  }

  // Transition commission pending -> billed on approval
  const becameApproved = prev && prev.status !== "approved" && report.status === "approved";
  if (becameApproved && (await isAutoCommissionEnabled())) {
    const [commission] = await db
      .select()
      .from(commissionsTable)
      .where(and(eq(commissionsTable.quoteId, report.quoteId), eq(commissionsTable.status, "pending")));
    if (commission) {
      const now = new Date();
      const invoiceNumber = commission.invoiceNumber
        ?? `INV-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}-${String(commission.id).padStart(6, "0")}`;
      await db
        .update(commissionsTable)
        .set({
          status: "billed",
          billedAt: now,
          invoiceNumber,
          invoiceIssuedAt: commission.invoiceIssuedAt ?? now,
        })
        .where(eq(commissionsTable.id, commission.id))
        .returning();
      await db.insert(commissionEventsTable).values({
        commissionId: commission.id,
        fromStatus: "pending",
        toStatus: "billed",
        reason: "완료보고서 검수 승인 → 수수료 청구 발행",
        actorId: req.user?.userId ?? null,
        actorName: req.user?.email ?? null,
      });
    }
  }

  res.json(UpdateWorkReportResponse.parse(report));
});

export default router;
