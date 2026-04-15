import { Router, type IRouter } from "express";
import type { Request } from "express";
import { eq } from "drizzle-orm";
import { db, managementContractTemplatesTable, usersTable } from "@workspace/db";
import {
  UpsertManagementContractTemplateBody,
  GetManagementContractTemplateResponse,
} from "@workspace/api-zod";

import { requireRole } from "../middlewares/auth";

const router: IRouter = Router();
router.use(requireRole("manager", "platform_admin"));

async function getUserBuildingId(req: Request): Promise<number | null> {
  const userId = req.user?.userId;
  if (!userId) return null;
  const user = await db.select().from(usersTable).where(eq(usersTable.id, userId)).then(r => r[0]);
  return user?.buildingId ?? null;
}

const DEFAULT_FEE_OBLIGATION = "입주자는 입주일 또는 인테리어 개시일 중 빠른 날부터 관리비를 부담하며, 관리규약 및 관리단 결의에 따른 관리비를 매월 정해진 기한 내에 납부하여야 합니다.";
const DEFAULT_PENALTY = "관리비를 2개월 이상 연체할 경우, 관리단은 단수·단전·주차권 회수 등 서비스를 제한할 수 있으며, 법적 조치를 취할 수 있습니다. 입주자는 이에 대해 이의를 제기하지 않을 것에 동의합니다.";
const DEFAULT_SPECIAL_FUND = "장기 미납으로 인해 건물의 정상적인 유지·관리가 어려울 경우, 관리단은 관리규약에 따라 특별충당금을 징수할 수 있으며, 입주자는 이에 동의합니다.";
const DEFAULT_PRIVACY_RETENTION = "관리 목적(비상 연락, 관리비 부과·수납, 체납 관리)으로 개인정보를 수집·이용하는 것에 동의하며, 퇴거 후 관리비 정산 완료일로부터 3년간 보관 후 폐기됩니다.";

router.get("/management-contract-templates", async (req, res): Promise<void> => {
  const buildingId = await getUserBuildingId(req);
  if (!buildingId) {
    res.status(400).json({ error: "건물이 설정되지 않았습니다." });
    return;
  }

  const [template] = await db
    .select()
    .from(managementContractTemplatesTable)
    .where(eq(managementContractTemplatesTable.buildingId, buildingId));

  if (!template) {
    const [newTemplate] = await db
      .insert(managementContractTemplatesTable)
      .values({
        buildingId,
        feeObligationClause: DEFAULT_FEE_OBLIGATION,
        penaltyClause: DEFAULT_PENALTY,
        specialFundClause: DEFAULT_SPECIAL_FUND,
        privacyRetentionClause: DEFAULT_PRIVACY_RETENTION,
      })
      .returning();
    res.json(GetManagementContractTemplateResponse.parse(newTemplate));
    return;
  }

  res.json(GetManagementContractTemplateResponse.parse(template));
});

router.post("/management-contract-templates", async (req, res): Promise<void> => {
  const buildingId = await getUserBuildingId(req);
  if (!buildingId) {
    res.status(400).json({ error: "건물이 설정되지 않았습니다." });
    return;
  }

  const parsed = UpsertManagementContractTemplateBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db
    .select()
    .from(managementContractTemplatesTable)
    .where(eq(managementContractTemplatesTable.buildingId, buildingId));

  if (existing) {
    const [updated] = await db
      .update(managementContractTemplatesTable)
      .set({
        feeObligationClause: parsed.data.feeObligationClause,
        penaltyClause: parsed.data.penaltyClause,
        specialFundClause: parsed.data.specialFundClause,
        privacyRetentionClause: parsed.data.privacyRetentionClause,
        additionalClauses: parsed.data.additionalClauses ?? null,
      })
      .where(eq(managementContractTemplatesTable.id, existing.id))
      .returning();
    res.json(GetManagementContractTemplateResponse.parse(updated));
  } else {
    const [created] = await db
      .insert(managementContractTemplatesTable)
      .values({
        buildingId,
        feeObligationClause: parsed.data.feeObligationClause,
        penaltyClause: parsed.data.penaltyClause,
        specialFundClause: parsed.data.specialFundClause,
        privacyRetentionClause: parsed.data.privacyRetentionClause,
        additionalClauses: parsed.data.additionalClauses ?? null,
      })
      .returning();
    res.json(GetManagementContractTemplateResponse.parse(created));
  }
});

export default router;
