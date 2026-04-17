import { Router, type IRouter } from "express";
import { eq, and, desc, lte, gte, isNotNull, type SQL } from "drizzle-orm";
import {
  db,
  contractsTable,
  contractDocumentsTable,
  workReportsTable,
  settlementsTable,
  approvalsTable,
  approvalStepsTable,
  notificationsTable,
  quotesTable,
  rfqsTable,
  vendorsTable,
  usersTable,
} from "@workspace/db";
import { requireRole } from "../middlewares/auth";

const router: IRouter = Router();

const VALID_STATUSES = [
  "draft",
  "in_approval",
  "active",
  "in_progress",
  "completed",
  "terminated",
  "renewal_due",
] as const;
type ContractStatus = (typeof VALID_STATUSES)[number];

const ALLOWED_TRANSITIONS: Record<ContractStatus, ContractStatus[]> = {
  draft: ["in_approval", "active", "terminated"],
  in_approval: ["active", "draft", "terminated"],
  active: ["in_progress", "completed", "terminated", "renewal_due"],
  in_progress: ["active", "completed", "terminated", "renewal_due"],
  completed: ["renewal_due"],
  terminated: [],
  renewal_due: ["active", "completed", "terminated"],
};

export async function transitionContractStatus(
  contractId: number,
  target: ContractStatus,
): Promise<{ ok: boolean; error?: string }> {
  const [existing] = await db.select().from(contractsTable).where(eq(contractsTable.id, contractId));
  if (!existing) return { ok: false, error: "Contract not found" };
  if (existing.status === target) return { ok: true };
  const allowed = ALLOWED_TRANSITIONS[existing.status as ContractStatus] ?? [];
  if (!allowed.includes(target)) {
    return { ok: false, error: `Cannot transition from ${existing.status} to ${target}` };
  }
  await db.update(contractsTable).set({ status: target }).where(eq(contractsTable.id, contractId));
  return { ok: true };
}

const PRIVILEGED_ROLES = new Set(["manager", "platform_admin", "hq_executive", "accountant"]);

function serializeContract(c: typeof contractsTable.$inferSelect) {
  return {
    ...c,
    renewalAlertSent: c.renewalAlertSent?.toISOString() ?? null,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

function serializeDocument(d: typeof contractDocumentsTable.$inferSelect) {
  return {
    ...d,
    createdAt: d.createdAt.toISOString(),
  };
}

router.get("/contracts", async (req, res): Promise<void> => {
  const { status, vendorId, buildingId, expiringWithinDays } = req.query;
  const conditions: SQL[] = [];
  if (typeof status === "string" && VALID_STATUSES.includes(status as ContractStatus)) {
    conditions.push(eq(contractsTable.status, status as ContractStatus));
  }
  if (vendorId) conditions.push(eq(contractsTable.vendorId, Number(vendorId)));
  if (buildingId) conditions.push(eq(contractsTable.buildingId, Number(buildingId)));

  let rows = await db
    .select()
    .from(contractsTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(contractsTable.createdAt));

  if (expiringWithinDays) {
    const days = Number(expiringWithinDays);
    const today = new Date();
    const future = new Date();
    future.setDate(future.getDate() + days);
    const todayStr = today.toISOString().split("T")[0];
    const futureStr = future.toISOString().split("T")[0];
    rows = rows.filter((r) => r.endDate && r.endDate >= todayStr && r.endDate <= futureStr);
  }

  res.json(rows.map(serializeContract));
});

router.post("/contracts", requireRole("manager", "platform_admin", "accountant"), async (req, res): Promise<void> => {
  const body = req.body || {};
  if (!body.vendorId || !body.vendorName || !body.category || !body.title) {
    res.status(400).json({ error: "vendorId, vendorName, category, title are required" });
    return;
  }
  const [row] = await db
    .insert(contractsTable)
    .values({
      buildingId: body.buildingId ?? null,
      buildingName: body.buildingName ?? null,
      vendorId: body.vendorId,
      vendorName: body.vendorName,
      category: body.category,
      title: body.title,
      rfqId: body.rfqId ?? null,
      quoteId: body.quoteId ?? null,
      approvalId: body.approvalId ?? null,
      contractAmount: body.contractAmount ?? null,
      startDate: body.startDate ?? null,
      endDate: body.endDate ?? null,
      status: body.status ?? "draft",
      isRecurring: body.isRecurring ?? false,
      notes: body.notes ?? null,
    })
    .returning();
  res.status(201).json(serializeContract(row));
});

router.get("/contracts/check-renewal-alerts", async (_req, res): Promise<void> => {
  res.status(405).json({ error: "Use POST" });
});

router.post("/contracts/check-renewal-alerts", requireRole("manager", "platform_admin", "hq_executive", "accountant"), async (_req, res): Promise<void> => {
  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];
  const thirtyDays = new Date(today);
  thirtyDays.setDate(thirtyDays.getDate() + 30);
  const thirtyStr = thirtyDays.toISOString().split("T")[0];

  const candidates = await db
    .select()
    .from(contractsTable)
    .where(
      and(
        isNotNull(contractsTable.endDate),
        gte(contractsTable.endDate, todayStr),
        lte(contractsTable.endDate, thirtyStr),
      ),
    );

  let alertsGenerated = 0;
  const updated: (typeof contractsTable.$inferSelect)[] = [];

  for (const c of candidates) {
    if (c.status === "terminated" || c.status === "completed") continue;
    if (c.renewalAlertSent) continue;

    await db.insert(notificationsTable).values({
      recipientType: "admin",
      notificationType: "contract_renewal_due",
      title: `[계약 갱신] ${c.vendorName} 만료 임박`,
      message: `${c.buildingName ?? "건물"} - ${c.title} 계약이 ${c.endDate}에 만료됩니다. 갱신 또는 재입찰을 검토하세요.`,
      relatedEntityType: "contract",
      relatedEntityId: c.id,
    });

    const [up] = await db
      .update(contractsTable)
      .set({ renewalAlertSent: new Date(), status: "renewal_due" })
      .where(eq(contractsTable.id, c.id))
      .returning();

    updated.push(up);
    alertsGenerated++;
  }

  res.json({ alertsGenerated, contracts: updated.map(serializeContract) });
});

router.post("/contracts/from-quote/:quoteId", requireRole("manager", "platform_admin", "accountant"), async (req, res): Promise<void> => {
  const quoteId = Number(req.params.quoteId);
  if (Number.isNaN(quoteId)) {
    res.status(400).json({ error: "Invalid quote id" });
    return;
  }
  const user = req.user!;

  const [quote] = await db.select().from(quotesTable).where(eq(quotesTable.id, quoteId));
  if (!quote) {
    res.status(404).json({ error: "Quote not found" });
    return;
  }
  const [rfq] = await db.select().from(rfqsTable).where(eq(rfqsTable.id, quote.rfqId));
  const [vendor] = await db.select().from(vendorsTable).where(eq(vendorsTable.id, quote.vendorId));

  const userName = await db
    .select({ name: usersTable.name })
    .from(usersTable)
    .where(eq(usersTable.id, user.userId))
    .then((rows) => rows[0]?.name ?? user.email);

  const body = req.body || {};
  const title = body.title ?? `[업체선정] ${rfq?.title ?? "RFQ"} - ${quote.vendorName}`;
  const category = body.category ?? rfq?.category ?? "other";
  const buildingName = body.buildingName ?? rfq?.buildingName ?? null;
  const steps = Array.isArray(body.approvalSteps) ? body.approvalSteps : [];

  const [approval] = await db
    .insert(approvalsTable)
    .values({
      title,
      description: `업체 선정 결재 — ${quote.vendorName} (RFQ #${quote.rfqId}, 견적 #${quote.id})`,
      category: "other",
      status: steps.length > 0 ? "in_progress" : "pending",
      isDraft: false,
      requesterId: user.userId,
      requesterName: userName,
      estimatedAmount: quote.totalAmount,
      vendorName: quote.vendorName,
      vendorQuoteDetails: quote.itemBreakdown ?? null,
      totalSteps: Math.max(steps.length, 1),
      currentStep: 1,
    })
    .returning();

  for (let i = 0; i < steps.length; i++) {
    await db.insert(approvalStepsTable).values({
      approvalId: approval.id,
      stepOrder: i + 1,
      approverId: steps[i].approverId,
      approverName: steps[i].approverName,
      approverRole: steps[i].approverRole ?? null,
      status: "pending",
    });
  }

  const [contract] = await db
    .insert(contractsTable)
    .values({
      buildingId: body.buildingId ?? null,
      buildingName,
      vendorId: quote.vendorId,
      vendorName: quote.vendorName,
      category,
      title,
      rfqId: quote.rfqId,
      quoteId: quote.id,
      approvalId: approval.id,
      contractAmount: quote.totalAmount,
      startDate: body.startDate ?? null,
      endDate: body.endDate ?? null,
      status: "in_approval",
      isRecurring: false,
      notes: vendor ? `대표자: ${vendor.representativeName ?? "-"} / 사업자번호: ${vendor.businessRegNumber ?? "-"}` : null,
    })
    .returning();

  if (steps.length > 0) {
    await db.insert(notificationsTable).values({
      recipientType: `user:${steps[0].approverId}`,
      notificationType: "approval_step_pending",
      title: "결재 요청 (업체선정)",
      message: `업체선정 결재가 도착했습니다: ${title}`,
      relatedEntityType: "approval",
      relatedEntityId: approval.id,
    });
  }

  res.status(201).json({ contract: serializeContract(contract), approvalId: approval.id });
});

router.get("/contracts/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [contract] = await db.select().from(contractsTable).where(eq(contractsTable.id, id));
  if (!contract) {
    res.status(404).json({ error: "Contract not found" });
    return;
  }
  const user = req.user!;
  const canSeeDocs = PRIVILEGED_ROLES.has(user.role);

  const documents = canSeeDocs
    ? await db.select().from(contractDocumentsTable).where(eq(contractDocumentsTable.contractId, id)).orderBy(desc(contractDocumentsTable.createdAt))
    : [];

  const workReports = await db.select().from(workReportsTable).where(eq(workReportsTable.contractId, id)).orderBy(desc(workReportsTable.createdAt));
  const settlements = await db.select().from(settlementsTable).where(eq(settlementsTable.contractId, id)).orderBy(desc(settlementsTable.createdAt));

  res.json({
    contract: serializeContract(contract),
    documents: documents.map(serializeDocument),
    workReports: workReports.map((w) => ({
      ...w,
      reviewedAt: w.reviewedAt?.toISOString() ?? null,
      createdAt: w.createdAt.toISOString(),
      updatedAt: w.updatedAt.toISOString(),
    })),
    settlements: settlements.map((s) => ({
      ...s,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
    })),
  });
});

router.patch("/contracts/:id", requireRole("manager", "platform_admin", "accountant"), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const body = req.body || {};
  const updateData: Record<string, unknown> = {};
  for (const k of ["buildingId", "buildingName", "category", "title", "contractAmount", "startDate", "endDate", "isRecurring", "notes"]) {
    if (body[k] !== undefined && body[k] !== null) updateData[k] = body[k];
  }
  if (body.status !== undefined) {
    res.status(400).json({ error: "status는 /contracts/:id/transition 으로만 변경할 수 있습니다" });
    return;
  }
  if (Object.keys(updateData).length === 0) {
    res.status(400).json({ error: "No fields to update" });
    return;
  }
  const [row] = await db.update(contractsTable).set(updateData).where(eq(contractsTable.id, id)).returning();
  if (!row) {
    res.status(404).json({ error: "Contract not found" });
    return;
  }
  res.json(serializeContract(row));
});

router.post("/contracts/:id/transition", requireRole("manager", "platform_admin", "accountant"), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const target = req.body?.status as ContractStatus | undefined;
  if (!target || !VALID_STATUSES.includes(target)) {
    res.status(400).json({ error: "Invalid target status" });
    return;
  }
  const [existing] = await db.select().from(contractsTable).where(eq(contractsTable.id, id));
  if (!existing) {
    res.status(404).json({ error: "Contract not found" });
    return;
  }
  const allowed = ALLOWED_TRANSITIONS[existing.status as ContractStatus] ?? [];
  if (!allowed.includes(target)) {
    res.status(400).json({ error: `Cannot transition from ${existing.status} to ${target}` });
    return;
  }
  const [row] = await db.update(contractsTable).set({ status: target }).where(eq(contractsTable.id, id)).returning();
  res.json(serializeContract(row));
});

router.get("/contracts/:id/documents", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const user = req.user!;
  if (!PRIVILEGED_ROLES.has(user.role)) {
    res.status(403).json({ error: "권한이 없습니다 (소장 이상만 열람 가능)" });
    return;
  }
  const docs = await db.select().from(contractDocumentsTable).where(eq(contractDocumentsTable.contractId, id)).orderBy(desc(contractDocumentsTable.createdAt));
  res.json(docs.map(serializeDocument));
});

router.post("/contracts/:id/documents", requireRole("manager", "platform_admin", "accountant"), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const body = req.body || {};
  if (!body.fileName || !body.fileUrl || !body.docType) {
    res.status(400).json({ error: "docType, fileName, fileUrl required" });
    return;
  }
  const user = req.user!;
  const [contract] = await db.select().from(contractsTable).where(eq(contractsTable.id, id));
  if (!contract) {
    res.status(404).json({ error: "Contract not found" });
    return;
  }

  const existing = await db
    .select()
    .from(contractDocumentsTable)
    .where(and(eq(contractDocumentsTable.contractId, id), eq(contractDocumentsTable.docType, body.docType)));
  const nextVersion = existing.length > 0 ? Math.max(...existing.map((e) => e.version)) + 1 : 1;

  const userName = await db
    .select({ name: usersTable.name })
    .from(usersTable)
    .where(eq(usersTable.id, user.userId))
    .then((rows) => rows[0]?.name ?? user.email);

  const [doc] = await db
    .insert(contractDocumentsTable)
    .values({
      contractId: id,
      docType: body.docType,
      fileName: body.fileName,
      fileUrl: body.fileUrl,
      version: nextVersion,
      uploadedBy: user.userId,
      uploadedByName: userName,
      notes: body.notes ?? null,
    })
    .returning();

  await db.insert(notificationsTable).values({
    recipientType: "hq",
    notificationType: "contract_document_uploaded",
    title: "[계약문서] 새 증빙 업로드",
    message: `${contract.vendorName} 계약(${contract.title})에 ${body.docType} 문서가 업로드되었습니다 (v${nextVersion}).`,
    relatedEntityType: "contract",
    relatedEntityId: id,
  });

  res.status(201).json(serializeDocument(doc));
});

export default router;
