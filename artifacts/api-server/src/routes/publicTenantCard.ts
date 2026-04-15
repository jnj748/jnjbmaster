import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import {
  db,
  tenantCardTokensTable,
  buildingsTable,
  managementContractTemplatesTable,
  tenantsTable,
  vehiclesTable,
} from "@workspace/db";
import {
  SubmitPublicTenantCardBody,
  GetManagementContractTemplateResponse,
} from "@workspace/api-zod";
import { ObjectStorageService } from "../lib/objectStorage";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

const DEFAULT_FEE_OBLIGATION = "입주자는 입주일 또는 인테리어 개시일 중 빠른 날부터 관리비를 부담하며, 관리규약 및 관리단 결의에 따른 관리비를 매월 정해진 기한 내에 납부하여야 합니다.";
const DEFAULT_PENALTY = "관리비를 2개월 이상 연체할 경우, 관리단은 단수·단전·주차권 회수 등 서비스를 제한할 수 있으며, 법적 조치를 취할 수 있습니다. 입주자는 이에 대해 이의를 제기하지 않을 것에 동의합니다.";
const DEFAULT_SPECIAL_FUND = "장기 미납으로 인해 건물의 정상적인 유지·관리가 어려울 경우, 관리단은 관리규약에 따라 특별충당금을 징수할 수 있으며, 입주자는 이에 동의합니다.";
const DEFAULT_PRIVACY_RETENTION = "관리 목적(비상 연락, 관리비 부과·수납, 체납 관리)으로 개인정보를 수집·이용하는 것에 동의하며, 퇴거 후 관리비 정산 완료일로부터 3년간 보관 후 폐기됩니다.";

router.get("/public/tenant-card/:token", async (req, res): Promise<void> => {
  const { token } = req.params;

  const [tokenRecord] = await db
    .select()
    .from(tenantCardTokensTable)
    .where(eq(tenantCardTokensTable.token, token));

  if (!tokenRecord) {
    res.status(404).json({ error: "유효하지 않은 링크입니다." });
    return;
  }

  if (new Date() > tokenRecord.expiresAt) {
    res.status(404).json({ error: "만료된 링크입니다. 관리사무소에 문의해 주세요." });
    return;
  }

  const [building] = await db
    .select()
    .from(buildingsTable)
    .where(eq(buildingsTable.id, tokenRecord.buildingId));

  let contractTemplate = null;
  const [template] = await db
    .select()
    .from(managementContractTemplatesTable)
    .where(eq(managementContractTemplatesTable.buildingId, tokenRecord.buildingId));

  if (template) {
    contractTemplate = GetManagementContractTemplateResponse.parse(template);
  }

  res.json({
    buildingName: building?.name || "건물",
    unitLabel: tokenRecord.unitLabel,
    tokenStatus: tokenRecord.status,
    specialFundEnabled: building?.specialFundEnabled ?? false,
    contractTemplate: contractTemplate || {
      id: 0,
      buildingId: tokenRecord.buildingId,
      feeObligationClause: DEFAULT_FEE_OBLIGATION,
      penaltyClause: DEFAULT_PENALTY,
      specialFundClause: DEFAULT_SPECIAL_FUND,
      privacyRetentionClause: DEFAULT_PRIVACY_RETENTION,
      createdAt: new Date().toISOString(),
    },
  });
});

router.post("/public/tenant-card/:token", async (req, res): Promise<void> => {
  const { token } = req.params;

  const [tokenRecord] = await db
    .select()
    .from(tenantCardTokensTable)
    .where(eq(tenantCardTokensTable.token, token));

  if (!tokenRecord) {
    res.status(404).json({ error: "유효하지 않은 링크입니다." });
    return;
  }

  if (new Date() > tokenRecord.expiresAt) {
    res.status(404).json({ error: "만료된 링크입니다." });
    return;
  }

  if (tokenRecord.status === "submitted" || tokenRecord.status === "approved") {
    res.status(400).json({ error: "이미 제출된 입주자카드입니다." });
    return;
  }

  const parsed = SubmitPublicTenantCardBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const data = parsed.data;

  const toDateStr = (d: unknown): string | null => {
    if (!d) return null;
    if (d instanceof Date) return d.toISOString().split("T")[0];
    return String(d);
  };

  const interiorStr = toDateStr(data.interiorStartDate);
  const moveInStr = toDateStr(data.moveInDate);

  let billingStartDate: string | null = null;
  const dates = [interiorStr, moveInStr].filter(Boolean) as string[];
  if (dates.length > 0) {
    billingStartDate = dates.sort()[0];
  }

  const [tenant] = await db
    .insert(tenantsTable)
    .values({
      unitId: tokenRecord.unitId,
      unit: tokenRecord.unitLabel,
      tenantName: data.tenantName,
      residentId: data.residentId,
      phone: data.phone,
      emergencyContact: data.emergencyContact || null,
      email: data.email || null,
      interiorStartDate: interiorStr,
      moveInDate: moveInStr,
      hasTv: data.hasTv ?? false,
      registeredAddress: data.registeredAddress || null,
      companyName: data.companyName || null,
      businessNumber: data.businessNumber || null,
      guarantorName: data.guarantorName || null,
      guarantorPhone: data.guarantorPhone || null,
      guarantorRelation: data.guarantorRelation || null,
      guarantorResidentId: data.guarantorResidentId || null,
      contractDocUrl: data.contractDocUrl || null,
      businessRegDocUrl: data.businessRegDocUrl || null,
      idDocUrl: data.idDocUrl || null,
      vehicleRegDocUrl: data.vehicleRegDocUrl || null,
      contractDoc: !!data.contractDocUrl,
      businessRegDoc: !!data.businessRegDocUrl,
      idDoc: !!data.idDocUrl,
      feeObligationConsent: data.feeObligationConsent,
      penaltyConsent: data.penaltyConsent,
      specialFundConsent: data.specialFundConsent,
      privacyRetentionConsent: data.privacyRetentionConsent,
      guaranteeConsent: data.guaranteeConsent ?? false,
      signatureName: data.signatureName,
      signatureDate: new Date(),
      billingStartDate,
      privacyConsentDate: data.privacyRetentionConsent ? new Date() : null,
      verificationStatus: "unverified",
      status: "active",
    })
    .returning();

  if (data.vehicles && data.vehicles.length > 0) {
    for (let i = 0; i < data.vehicles.length; i++) {
      const v = data.vehicles[i];
      await db.insert(vehiclesTable).values({
        unit: tokenRecord.unitLabel,
        tenantId: tenant.id,
        vehicleNumber: v.vehicleNumber,
        vehicleType: v.vehicleType || null,
        vehicleColor: v.vehicleColor || null,
        tenantRelation: v.tenantRelation,
        ownerName: data.tenantName,
        ownerContact: v.ownerContact,
        isPrimary: v.isPrimary ?? (i === 0),
        ownershipType: "owned",
        status: "registered",
      });
    }
  }

  await db
    .update(tenantCardTokensTable)
    .set({
      status: "submitted",
      submittedAt: new Date(),
    })
    .where(eq(tenantCardTokensTable.id, tokenRecord.id));

  res.json({ success: true, message: "입주자카드가 정상적으로 제출되었습니다." });
});

router.post("/public/tenant-card/:token/upload-url", async (req, res): Promise<void> => {
  const { token } = req.params;

  const [tokenRecord] = await db
    .select()
    .from(tenantCardTokensTable)
    .where(eq(tenantCardTokensTable.token, token));

  if (!tokenRecord) {
    res.status(404).json({ error: "유효하지 않은 링크입니다." });
    return;
  }

  if (new Date() > tokenRecord.expiresAt) {
    res.status(404).json({ error: "만료된 링크입니다." });
    return;
  }

  try {
    const uploadURL = await objectStorageService.getObjectEntityUploadURL();
    const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);

    res.json({
      uploadURL,
      objectPath,
      metadata: {
        name: req.body?.name || "document",
        size: req.body?.size || 0,
        contentType: req.body?.contentType || "application/octet-stream",
      },
    });
  } catch (error) {
    req.log?.error?.({ err: error }, "Error generating upload URL for public tenant card");
    res.status(500).json({ error: "업로드 URL 생성에 실패했습니다." });
  }
});

export default router;
