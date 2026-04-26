import { Router, type IRouter } from "express";
import { eq, and, desc, lte, gte, isNotNull, inArray, type SQL } from "drizzle-orm";
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
// [역할 라벨 SoT] 알림 본문 등 한국어 역할 라벨은 단일 소스에서 가져온다.
import { ROLE_LABELS } from "@workspace/shared/role-labels";
// [Task #369] 갱신 알림 임계값(75일)·본문 포맷 단일 소스. 화면·서버 모두 같은 값.
import {
  RENEWAL_REVIEW_WINDOW_START_DAYS,
  RENEWAL_REVIEW_WINDOW_END_DAYS,
  formatContractRenewalReviewMessage,
} from "@workspace/shared/contract-renewal";
import { runContractOcr } from "../lib/contractOcr";
import { ObjectStorageService } from "../lib/objectStorage";
import { ObjectPermission } from "../lib/objectAcl";

const router: IRouter = Router();

// [Task #335] Partner 가 buildingRouter(파트너 차단)에 막히지 않고 호출할 수 있도록
// 별도의 라우터를 export 하여 routes/index.ts 에서 최상단에 마운트한다.
export const partnerContractsRouter: IRouter = Router();

// 매니저/HQ/회계 등 비-파트너 사용자가 /contracts 를 호출할 때, 이 라우터는 통째로 패스해
// 뒤에 마운트된 매니저용 contractsRouter 가 처리하도록 한다. (라우팅 우선순위 회귀 방지)
partnerContractsRouter.use((req, _res, next) => {
  if ((req.user as { role?: string } | undefined)?.role !== "partner") {
    return next("router");
  }
  next();
});

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
const DOC_READER_ROLES = new Set([
  "manager",
  "platform_admin",
  "hq_executive",
  "accountant",
  "facility_staff",
]);

// [Task #416 — code review #5] facility_staff 가 다른 건물의 계약/문서를 임의 ID 로
// 들춰보지 못하도록, 계약의 buildingId 가 사용자의 buildingId 와 같은지 강제한다.
// 다른 역할(manager/accountant/hq_executive/platform_admin) 은 본 헬퍼로는 통과시키고
// 기존 권한 체계(role check) 에 맡긴다.
async function assertContractInUserScope(
  user: { userId: number; role: string },
  contract: { buildingId: number | null },
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  if (user.role !== "facility_staff") return { ok: true };
  const [u] = await db
    .select({ buildingId: usersTable.buildingId })
    .from(usersTable)
    .where(eq(usersTable.id, user.userId));
  const userBuildingId = u?.buildingId ?? null;
  if (!userBuildingId) {
    return { ok: false, status: 403, error: "소속 건물이 지정되지 않았습니다" };
  }
  if (contract.buildingId !== userBuildingId) {
    return { ok: false, status: 403, error: "본인 건물의 계약만 조회할 수 있습니다" };
  }
  return { ok: true };
}

function serializeContract(c: typeof contractsTable.$inferSelect) {
  return {
    ...c,
    renewalAlertSent: c.renewalAlertSent?.toISOString() ?? null,
    partnerAgreedAt: c.partnerAgreedAt?.toISOString() ?? null,
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
  const { status, vendorId, buildingId, expiringWithinDays, quoteId } = req.query;
  const conditions: SQL[] = [];
  if (typeof status === "string" && VALID_STATUSES.includes(status as ContractStatus)) {
    conditions.push(eq(contractsTable.status, status as ContractStatus));
  }
  if (vendorId) conditions.push(eq(contractsTable.vendorId, Number(vendorId)));
  if (buildingId) conditions.push(eq(contractsTable.buildingId, Number(buildingId)));
  // [Task #335] 견적 채택 직후 매니저 RFQ 페이지가 단일 quoteId 로 자동 생성된 계약을
  // 즉시 찾기 위한 필터. 클라이언트가 전체 목록을 스캔하는 비효율을 제거한다.
  if (quoteId) conditions.push(eq(contractsTable.quoteId, Number(quoteId)));

  // [Task #416 — code review #7] facility_staff 가 buildingId 쿼리를 변조하거나
  // 미지정 호출로 다른 건물 계약을 열거하지 못하도록, 서버 단에서 본인
  // buildingId 로 강제 필터링한다. 본인 건물이 없으면 빈 배열 반환.
  const user = req.user!;
  if (user.role === "facility_staff") {
    const [u] = await db
      .select({ buildingId: usersTable.buildingId })
      .from(usersTable)
      .where(eq(usersTable.id, user.userId));
    const userBuildingId = u?.buildingId ?? null;
    if (!userBuildingId) {
      res.json([]);
      return;
    }
    if (buildingId && Number(buildingId) !== userBuildingId) {
      res.status(403).json({ error: "본인 건물의 계약만 조회할 수 있습니다" });
      return;
    }
    conditions.push(eq(contractsTable.buildingId, userBuildingId));
  }

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
  // [Task #416] 만료 30일 → 75일 단일 임계값 → 90일~60일 "검토 윈도우" 로 전환.
  //   - 윈도우 시작(만료 90일 전) ~ 윈도우 종료(만료 60일 전) 안에 들어온 활성 계약만
  //     알림 대상으로 한정한다. 60일 이내는 별도 트랙(촉박 결재) 으로 다루므로 검토 알림에서 제외.
  //   - 상수는 @workspace/shared/contract-renewal 단일 소스에서 import.
  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];
  const windowStart = new Date(today);
  windowStart.setDate(windowStart.getDate() + RENEWAL_REVIEW_WINDOW_END_DAYS + 1); // 60일 초과 = 61일 이상
  const windowStartStr = windowStart.toISOString().split("T")[0];
  const windowEnd = new Date(today);
  windowEnd.setDate(windowEnd.getDate() + RENEWAL_REVIEW_WINDOW_START_DAYS);
  const windowEndStr = windowEnd.toISOString().split("T")[0];

  // [Task #369 — code review] 갱신 임박 후보는 "현재 이행 중인" 활성 계약만으로
  //   한정한다. draft / in_approval / renewal_due / completed / terminated 는
  //   각각 (1) 아직 체결 전, (2) 결재 진행 중, (3) 이미 알림이 흘러간 상태,
  //   (4)(5) 종결된 계약이라 다시 renewal_due 로 전이시킬 이유가 없다. 사후
  //   continue 로 거르던 로직을 SQL 단계로 끌어올려 의도를 명확히 한다.
  const candidates = await db
    .select()
    .from(contractsTable)
    .where(
      and(
        isNotNull(contractsTable.endDate),
        gte(contractsTable.endDate, todayStr),
        gte(contractsTable.endDate, windowStartStr),
        lte(contractsTable.endDate, windowEndStr),
        inArray(contractsTable.status, ["active", "in_progress"]),
      ),
    );

  let alertsGenerated = 0;
  const updated: (typeof contractsTable.$inferSelect)[] = [];

  for (const c of candidates) {
    if (c.renewalAlertSent) continue;

    await db.insert(notificationsTable).values({
      recipientType: "admin",
      notificationType: "contract_renewal_due",
      title: `[계약 갱신] ${c.vendorName} - ${c.title}`,
      // [Task #369] 본문 포맷 통일:
      //   "○○계약이 연장여부 검토해야 합니다. YYYY-MM-DD 기준으로 자동 연장됩니다"
      message: formatContractRenewalReviewMessage({
        title: c.title,
        endDate: c.endDate ?? "",
      }),
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

// [Task #369] 계약서 OCR 미리보기. 업로드된 파일(PDF/이미지)에서 vendor/사업자번호/
// 대표자/기간/금액/카테고리/자동갱신/제목 후보를 추출해 JSON+신뢰도로 반환만 한다.
// DB에는 쓰지 않고, 사용자가 검토/수정 후 별도의 POST /contracts + POST
// /contracts/:id/documents 호출로 저장한다. billOcr.ts 와 동일한 ACL/권한 패턴.
router.post(
  "/contracts/ocr-preview",
  requireRole("manager", "platform_admin", "accountant"),
  async (req, res): Promise<void> => {
    const { objectPath, fileName } = req.body ?? {};
    if (!objectPath || typeof objectPath !== "string") {
      res.status(400).json({ error: "objectPath가 필요합니다" });
      return;
    }
    try {
      const storage = new ObjectStorageService();
      const objectFile = await storage.getObjectEntityFile(objectPath);
      const allowed = await storage.canAccessObjectEntity({
        userId: req.user?.userId ? String(req.user.userId) : undefined,
        objectFile,
        requestedPermission: ObjectPermission.READ,
      });
      if (!allowed) {
        res.status(403).json({ error: "해당 파일에 접근할 권한이 없습니다" });
        return;
      }
    } catch {
      res.status(404).json({ error: "파일을 찾지 못했습니다" });
      return;
    }
    try {
      const result = await runContractOcr({ objectPath, fileName: fileName ?? null });
      res.json(result);
    } catch (err) {
      req.log.error({ err, objectPath }, "contract ocr-preview failed");
      res.status(500).json({
        error: err instanceof Error ? err.message : "OCR 처리 실패",
      });
    }
  },
);

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
  const scope = await assertContractInUserScope(user, contract);
  if (!scope.ok) {
    res.status(scope.status).json({ error: scope.error });
    return;
  }
  const canSeeDocs = DOC_READER_ROLES.has(user.role);

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

// [Task #335] 파트너가 자신이 소속된 vendor 의 계약만 조회할 수 있는 read endpoint.
// vendorId 파라미터가 본인 vendor 와 일치하지 않으면 403, 미지정이면 본인 vendor 로 강제.
async function getPartnerVendorIdOrFail(
  req: import("express").Request,
  res: import("express").Response,
): Promise<number | null> {
  const user = req.user!;
  const [u] = await db.select({ vendorId: usersTable.vendorId }).from(usersTable).where(eq(usersTable.id, user.userId));
  const partnerVendorId = u?.vendorId ?? null;
  if (!partnerVendorId) {
    res.status(403).json({ error: "연결된 업체가 없습니다" });
    return null;
  }
  return partnerVendorId;
}

partnerContractsRouter.get("/contracts", requireRole("partner"), async (req, res): Promise<void> => {
  const partnerVendorId = await getPartnerVendorIdOrFail(req, res);
  if (partnerVendorId == null) return;

  const requestedVendorId = req.query.vendorId != null ? Number(req.query.vendorId) : partnerVendorId;
  if (requestedVendorId !== partnerVendorId) {
    res.status(403).json({ error: "본인 업체의 계약만 조회할 수 있습니다" });
    return;
  }

  const conditions: SQL[] = [eq(contractsTable.vendorId, partnerVendorId)];
  const status = req.query.status;
  if (typeof status === "string" && VALID_STATUSES.includes(status as ContractStatus)) {
    conditions.push(eq(contractsTable.status, status as ContractStatus));
  }
  const rows = await db
    .select()
    .from(contractsTable)
    .where(and(...conditions))
    .orderBy(desc(contractsTable.createdAt));
  res.json(rows.map(serializeContract));
});

partnerContractsRouter.get("/contracts/:id", requireRole("partner"), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const partnerVendorId = await getPartnerVendorIdOrFail(req, res);
  if (partnerVendorId == null) return;

  const [row] = await db.select().from(contractsTable).where(eq(contractsTable.id, id));
  if (!row) {
    res.status(404).json({ error: "Contract not found" });
    return;
  }
  if (row.vendorId !== partnerVendorId) {
    res.status(403).json({ error: "본인 업체의 계약만 조회할 수 있습니다" });
    return;
  }
  res.json(serializeContract(row));
});

// [Task #335] 파트너가 계약 내용에 동의하는 인앱 액션. 외부 매직 URL 없이 vendor portal 안에서만 호출된다.
// partnerContractsRouter 에 등록해 buildingRouter 의 파트너 차단을 우회한다.
partnerContractsRouter.post("/contracts/:id/agree", requireRole("partner"), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const user = req.user!;
  const [u] = await db.select().from(usersTable).where(eq(usersTable.id, user.userId));
  const partnerVendorId = u?.vendorId ?? null;
  if (!partnerVendorId) {
    res.status(403).json({ error: "연결된 업체가 없습니다" });
    return;
  }
  const [existing] = await db.select().from(contractsTable).where(eq(contractsTable.id, id));
  if (!existing) {
    res.status(404).json({ error: "Contract not found" });
    return;
  }
  if (existing.vendorId !== partnerVendorId) {
    res.status(403).json({ error: "본인 업체의 계약만 동의할 수 있습니다" });
    return;
  }
  if (existing.partnerAgreedAt) {
    res.json(serializeContract(existing));
    return;
  }
  const [row] = await db
    .update(contractsTable)
    .set({ partnerAgreedAt: new Date() })
    .where(eq(contractsTable.id, id))
    .returning();

  // 매니저(건물 단위)에게 인앱 알림. 건물 ID 가 없으면 hq 로 폴백.
  await db.insert(notificationsTable).values({
    recipientType: row.buildingId ? `manager:${row.buildingId}` : "hq",
    notificationType: "contract_partner_agreed",
    title: "[계약] 파트너가 계약 내용에 동의했습니다",
    message: `${row.vendorName} - ${row.title}: 파트너가 계약 내용에 동의했습니다. ${ROLE_LABELS.hq_executive} 결재를 진행해주세요.`,
    relatedEntityType: "contract",
    relatedEntityId: row.id,
  });

  res.json(serializeContract(row));
});

router.get("/contracts/:id/documents", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const user = req.user!;
  if (!DOC_READER_ROLES.has(user.role)) {
    res.status(403).json({ error: "권한이 없습니다" });
    return;
  }
  // [Task #416 — code review #5] facility_staff 의 임의 contractId 조회를 막기 위해
  // 먼저 계약을 들고 와 buildingId 스코프를 확인한다. 다른 역할은 헬퍼가 ok 로 통과시킨다.
  const [contract] = await db.select().from(contractsTable).where(eq(contractsTable.id, id));
  if (!contract) {
    res.status(404).json({ error: "Contract not found" });
    return;
  }
  const scope = await assertContractInUserScope(user, contract);
  if (!scope.ok) {
    res.status(scope.status).json({ error: scope.error });
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
