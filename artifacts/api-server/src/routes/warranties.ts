import { insertNotification } from "../lib/notificationRecipient";
import { Router, type IRouter } from "express";
import { eq, and, lte, gte, desc, isNull } from "drizzle-orm";
import { db, warrantyPresetsTable, buildingWarrantiesTable, buildingsTable, notificationsTable, rfqsTable, vendorsTable, usersTable } from "@workspace/db";
import { requireRole } from "../middlewares/auth";
import { canAccessBuilding, getAccessibleBuildingIds, buildingScopeFilter } from "../middlewares/buildingScope";

const router: IRouter = Router();
router.use("/warranties", requireRole("manager", "platform_admin", "hq_executive", "facility_staff"));

// [Task #558/#596] 건물 단위 직원 역할(manager/accountant/facility_staff) 및
//   hq_executive 가 본인 관할이 아닌 건물의 하자담보를 직접 URL ID 로
//   조회·수정하는 것을 막는 헬퍼. 누설 방지를 위해 403 대신 404 로 응답한다.
//   platform_admin 만 진정한 전 건물 가시.
async function assertOwnBuildingOr404(
  req: import("express").Request,
  buildingId: number,
): Promise<boolean> {
  return canAccessBuilding(req, buildingId);
}
const WARRANTY_PRESETS_DATA = [
  { tradeCategory: "waterproofing", tradeName: "방수공사 (옥상·외벽·지하층)", warrantyYears: 5, description: "옥상, 외벽, 지하층 방수공사", legalBasis: "주택법 시행령 별표 6" },
  { tradeCategory: "waterproofing", tradeName: "지붕공사", warrantyYears: 5, description: "지붕 방수 및 마감공사", legalBasis: "주택법 시행령 별표 6" },
  { tradeCategory: "exterior", tradeName: "외벽 마감공사", warrantyYears: 3, description: "외벽 도장, 타일 등 마감", legalBasis: "주택법 시행령 별표 6" },
  { tradeCategory: "painting", tradeName: "도장공사", warrantyYears: 2, description: "내·외부 도장공사", legalBasis: "주택법 시행령 별표 6" },
  { tradeCategory: "tiling", tradeName: "타일공사", warrantyYears: 2, description: "바닥·벽면 타일 시공", legalBasis: "주택법 시행령 별표 6" },
  { tradeCategory: "window", tradeName: "창호공사", warrantyYears: 2, description: "창호(새시) 설치공사", legalBasis: "주택법 시행령 별표 6" },
  { tradeCategory: "mechanical", tradeName: "기계설비공사", warrantyYears: 3, description: "냉난방, 급배수, 환기설비", legalBasis: "주택법 시행령 별표 6" },
  { tradeCategory: "electrical", tradeName: "전기공사", warrantyYears: 3, description: "전기설비 공사", legalBasis: "주택법 시행령 별표 6" },
  { tradeCategory: "elevator", tradeName: "승강기 설치공사", warrantyYears: 3, description: "승강기 설치 및 부속설비", legalBasis: "주택법 시행령 별표 6" },
  { tradeCategory: "plumbing", tradeName: "배관공사", warrantyYears: 2, description: "급수·배수·난방 배관", legalBasis: "주택법 시행령 별표 6" },
  { tradeCategory: "structure", tradeName: "구조체공사", warrantyYears: 10, description: "건축물 구조체 (기둥·벽·슬래브)", legalBasis: "주택법 시행령 별표 6" },
  { tradeCategory: "parking", tradeName: "주차장 라인마킹·바닥도장", warrantyYears: 1, description: "주차장 라인마킹 및 에폭시 도장", legalBasis: "관리규약" },
];

router.get("/warranties/presets", async (_req, res): Promise<void> => {
  let presets = await db.select().from(warrantyPresetsTable);

  if (presets.length === 0) {
    await db.insert(warrantyPresetsTable).values(WARRANTY_PRESETS_DATA);
    presets = await db.select().from(warrantyPresetsTable);
  }

  res.json(presets);
});

router.get("/warranties/building/:buildingId", async (req, res): Promise<void> => {
  const buildingId = parseInt(req.params.buildingId);
  if (isNaN(buildingId)) {
    res.status(400).json({ error: "Invalid building ID" });
    return;
  }

  // [Task #558] 건물 단위 역할은 본인 건물의 하자담보만 조회 가능.
  if (!(await assertOwnBuildingOr404(req, buildingId))) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const warranties = await db
    .select()
    .from(buildingWarrantiesTable)
    .where(eq(buildingWarrantiesTable.buildingId, buildingId))
    .orderBy(buildingWarrantiesTable.expiryDate);

  const today = new Date().toISOString().split("T")[0];
  const updatedWarranties = warranties.map(w => {
    const sixtyDaysBefore = new Date(w.expiryDate);
    sixtyDaysBefore.setDate(sixtyDaysBefore.getDate() - 60);
    const sixtyStr = sixtyDaysBefore.toISOString().split("T")[0];

    let status = w.status;
    if (w.expiryDate < today) status = "expired";
    else if (today >= sixtyStr) status = "expiring_soon";
    else status = "active";

    return { ...w, status };
  });

  res.json(updatedWarranties);
});

router.post("/warranties/building/:buildingId", async (req, res): Promise<void> => {
  const buildingId = parseInt(req.params.buildingId);
  if (isNaN(buildingId)) {
    res.status(400).json({ error: "Invalid building ID" });
    return;
  }

  // [Task #558] 건물 단위 역할은 본인 건물에만 하자담보를 생성 가능.
  if (!(await assertOwnBuildingOr404(req, buildingId))) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const { approvalDate, presetIds } = req.body;
  if (!approvalDate) {
    res.status(400).json({ error: "approvalDate is required" });
    return;
  }

  let presets = await db.select().from(warrantyPresetsTable);
  if (presets.length === 0) {
    await db.insert(warrantyPresetsTable).values(WARRANTY_PRESETS_DATA);
    presets = await db.select().from(warrantyPresetsTable);
  }

  const selectedPresets = presetIds?.length > 0
    ? presets.filter(p => presetIds.includes(p.id))
    : presets;

  await db.update(buildingsTable)
    .set({ approvalDate })
    .where(eq(buildingsTable.id, buildingId));

  const existing = await db.select().from(buildingWarrantiesTable)
    .where(eq(buildingWarrantiesTable.buildingId, buildingId));
  const existingTrades = new Set(existing.map(e => e.tradeName));

  const toInsert = selectedPresets
    .filter(p => !existingTrades.has(p.tradeName))
    .map(preset => {
      const startDate = approvalDate;
      const expiryDate = new Date(approvalDate);
      expiryDate.setFullYear(expiryDate.getFullYear() + preset.warrantyYears);

      return {
        buildingId,
        presetId: preset.id,
        tradeCategory: preset.tradeCategory,
        tradeName: preset.tradeName,
        warrantyYears: preset.warrantyYears,
        startDate,
        expiryDate: expiryDate.toISOString().split("T")[0],
        status: "active",
      };
    });

  if (toInsert.length > 0) {
    await db.insert(buildingWarrantiesTable).values(toInsert);
  }

  const warranties = await db.select().from(buildingWarrantiesTable)
    .where(eq(buildingWarrantiesTable.buildingId, buildingId))
    .orderBy(buildingWarrantiesTable.expiryDate);

  res.status(201).json(warranties);
});

router.patch("/warranties/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid warranty ID" });
    return;
  }

  // [Task #558/#596] 단건 수정도 buildingId 게이트.
  //   platform_admin 만 전 건물 가시. hq_executive 도 매핑된 건물만 통과한다.
  if (req.user?.role !== "platform_admin") {
    const [existing] = await db
      .select({ buildingId: buildingWarrantiesTable.buildingId })
      .from(buildingWarrantiesTable)
      .where(eq(buildingWarrantiesTable.id, id));
    if (!existing) {
      res.status(404).json({ error: "Warranty not found" });
      return;
    }
    if (!(await assertOwnBuildingOr404(req, existing.buildingId))) {
      res.status(404).json({ error: "Warranty not found" });
      return;
    }
  }

  const { contractorName, notes, status } = req.body;
  const updateData: Record<string, unknown> = {};
  if (contractorName !== undefined) updateData.contractorName = contractorName;
  if (notes !== undefined) updateData.notes = notes;
  if (status !== undefined) updateData.status = status;

  const [warranty] = await db.update(buildingWarrantiesTable)
    .set(updateData)
    .where(eq(buildingWarrantiesTable.id, id))
    .returning();

  if (!warranty) {
    res.status(404).json({ error: "Warranty not found" });
    return;
  }

  res.json(warranty);
});

// [Task #558] check-alerts 는 모든 건물의 하자담보를 순회하며 만료 알림을
//   발송하는 스케줄러성 엔드포인트라 매니저/시설직원이 직접 호출하면 응답에
//   타 건물 하자담보 행이 그대로 노출된다. platform_admin / hq_executive 만
//   허용해 BAC 누설을 차단한다.
router.post(
  "/warranties/check-alerts",
  requireRole("platform_admin", "hq_executive"),
  async (req, res): Promise<void> => {
  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];

  const sixtyDaysFromNow = new Date(today);
  sixtyDaysFromNow.setDate(sixtyDaysFromNow.getDate() + 60);
  const sixtyStr = sixtyDaysFromNow.toISOString().split("T")[0];

  // [Task #596] hq_executive 는 본인 매핑 건물의 하자담보만 점검 대상.
  const scope = await getAccessibleBuildingIds(req);
  const sf = buildingScopeFilter(scope, buildingWarrantiesTable.buildingId);
  if (sf === "empty") {
    res.json({ alertsGenerated: 0, warranties: [] });
    return;
  }
  const baseConds = [
    lte(buildingWarrantiesTable.expiryDate, sixtyStr),
    gte(buildingWarrantiesTable.expiryDate, todayStr),
  ];
  if (sf) baseConds.push(sf);
  const warranties = await db.select().from(buildingWarrantiesTable)
    .where(and(...baseConds));

  let alertsGenerated = 0;

  for (const warranty of warranties) {
    const expiryDate = new Date(warranty.expiryDate);
    const daysUntilExpiry = Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    const building = await db.select().from(buildingsTable)
      .where(eq(buildingsTable.id, warranty.buildingId))
      .then(r => r[0]);

    const buildingName = building?.name || "관리 건물";

    if (daysUntilExpiry <= 60 && daysUntilExpiry > 30 && !warranty.alertSent60) {
      await insertNotification({
        recipientType: "admin",
        notificationType: "warranty_expiry_60",
        title: `[하자담보] ${warranty.tradeName} 만료 60일 전`,
        message: `${buildingName}의 ${warranty.tradeName} 하자담보가 ${warranty.expiryDate}에 만료됩니다. 하자 진단을 실시하고 필요시 시공사에 보수를 요구하세요.`,
        relatedEntityType: "warranty",
        relatedEntityId: warranty.id,
      });

      await db.update(buildingWarrantiesTable)
        .set({ alertSent60: new Date(), status: "expiring_soon" })
        .where(eq(buildingWarrantiesTable.id, warranty.id));

      alertsGenerated++;
    }

    if (daysUntilExpiry <= 30 && !warranty.alertSent30) {
      await insertNotification({
        recipientType: "admin",
        notificationType: "warranty_expiry_30",
        title: `[긴급] ${warranty.tradeName} 하자담보 만료 30일 전`,
        message: `${buildingName}의 ${warranty.tradeName} 하자담보가 ${warranty.expiryDate}에 만료됩니다. 즉시 하자 진단 및 시공사 보수 요구 조치가 필요합니다.`,
        relatedEntityType: "warranty",
        relatedEntityId: warranty.id,
      });

      await db.update(buildingWarrantiesTable)
        .set({ alertSent30: new Date(), status: "expiring_soon" })
        .where(eq(buildingWarrantiesTable.id, warranty.id));

      alertsGenerated++;
    }
  }

  // [Task #596] 응답 페이로드도 동일한 scope 필터로 재선별 — 스캐너성 응답이
  //   타 건물 행을 노출하지 않도록 보장한다.
  const updatedWarranties = await db.select().from(buildingWarrantiesTable)
    .where(and(...baseConds));

  res.json({ alertsGenerated, warranties: updatedWarranties });
  },
);

export default router;
