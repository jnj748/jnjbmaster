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
import { getUserBuildingId, isBuildingScopedRole } from "../middlewares/buildingScope";

const router: IRouter = Router();
router.use("/work-reports", requireRole("manager", "platform_admin"));

// [Task #558] rfqs.ts 의 serializeRfqRow 와 동일한 의도. drizzle 의 timestamp/
//   date 컬럼은 Date 객체로 돌아오는 반면 응답 zod 스키마는 ISO string 을
//   기대하므로, .parse() 직전에 Date → ISO string / 'YYYY-MM-DD' 로 정규화한다.
function _toIsoDay(d: Date | string | null | undefined): string | null {
  if (d == null) return null;
  if (d instanceof Date) return isNaN(d.getTime()) ? null : d.toISOString().split("T")[0];
  return d;
}
function _toIsoDateTime(d: Date | string | null | undefined): string | null {
  if (d == null) return null;
  return d instanceof Date ? d.toISOString() : d;
}
type WorkReportDateFields = {
  completionDate?: Date | string | null;
  reviewedAt?: Date | string | null;
  createdAt?: Date | string | null;
  updatedAt?: Date | string | null;
};
function serializeWorkReportRow<T extends WorkReportDateFields>(row: T): T {
  return {
    ...row,
    completionDate: _toIsoDay(row.completionDate),
    reviewedAt: _toIsoDateTime(row.reviewedAt),
    createdAt: _toIsoDateTime(row.createdAt),
    updatedAt: _toIsoDateTime(row.updatedAt),
  };
}

router.get("/work-reports", async (req, res): Promise<void> => {
  const params = ListWorkReportsQueryParams.safeParse(req.query);
  const conditions = [];

  // [Task #558] 건물 단위 매니저는 본인 소속 건물의 완료보고서만 노출.
  //   buildingId 미지정 매니저는 빈 배열(에러 아님). platform_admin 은 전체.
  if (isBuildingScopedRole(req.user?.role)) {
    const userBuildingId = await getUserBuildingId(req);
    if (userBuildingId == null) {
      res.json(ListWorkReportsResponse.parse([]));
      return;
    }
    conditions.push(eq(workReportsTable.buildingId, userBuildingId));
  }

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

  res.json(ListWorkReportsResponse.parse(reports.map(serializeWorkReportRow)));
});

// [Task #558] 단건 핸들러 공통 게이트.
async function assertOwnReportOr404(
  req: import("express").Request,
  reportId: number,
): Promise<{ ok: true; report: typeof workReportsTable.$inferSelect } | { ok: false }> {
  const [report] = await db
    .select()
    .from(workReportsTable)
    .where(eq(workReportsTable.id, reportId));
  if (!report) return { ok: false };
  if (!isBuildingScopedRole(req.user?.role)) return { ok: true, report };
  const userBuildingId = await getUserBuildingId(req);
  if (userBuildingId == null || report.buildingId == null || report.buildingId !== userBuildingId) {
    return { ok: false };
  }
  return { ok: true, report };
}

router.get("/work-reports/:id", async (req, res): Promise<void> => {
  const params = GetWorkReportParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const gate = await assertOwnReportOr404(req, params.data.id);
  if (!gate.ok) {
    res.status(404).json({ error: "Work report not found" });
    return;
  }

  res.json(GetWorkReportResponse.parse(serializeWorkReportRow(gate.report)));
});

router.post("/work-reports", async (req, res): Promise<void> => {
  const parsed = CreateWorkReportBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [report] = await db.insert(workReportsTable).values(parsed.data).returning();
  res.status(201).json(UpdateWorkReportResponse.parse(serializeWorkReportRow(report)));
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

  const gate = await assertOwnReportOr404(req, params.data.id);
  if (!gate.ok) {
    res.status(404).json({ error: "Work report not found" });
    return;
  }

  const updateData: any = { ...parsed.data };
  if (parsed.data.status === "approved" || parsed.data.status === "rejected") {
    updateData.reviewedAt = new Date();
    // [Task #339] 검수자 본인이 별점·한줄평을 작성하므로 승인/반려 시 user id 를 기록한다.
    if (req.user?.userId) {
      updateData.reviewerUserId = req.user.userId;
    }
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

  res.json(UpdateWorkReportResponse.parse(serializeWorkReportRow(report)));
});

export default router;
