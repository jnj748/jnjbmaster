// [Task #106] 관리소장 첫 시작 자동화 — 진행률/선호 API.
// 보수: manager 역할 전용. 다른 역할 호출 시 200으로 빈 상태 반환(기존 동작 0 변화).

import { Router, type IRouter, type Request, type Response } from "express";
import { eq, and, sql } from "drizzle-orm";
import {
  db,
  usersTable,
  buildingsTable,
  inspectionsTable,
  vendorsTable,
} from "@workspace/db";

const router: IRouter = Router();

const onboardingPrefValues = new Set(["started", "browsing"]);

interface OnboardingStatus {
  preference: "started" | "browsing" | null;
  // 본 기능 출시(2026-04-18) 이전에 만들어진 계정 OR 이미 Gate1 완료한 계정.
  // 클라이언트는 이 플래그가 true 면 모달/Gate redirect 모두 비활성.
  isLegacyExempt: boolean;
  // Gate 1 (hard lock): 건물제원 + 준공일 + 법정업무 등록.
  gate1: {
    hasBuilding: boolean;
    hasBuildingSpecs: boolean; // totalArea/totalFloors/totalUnits 모두 채워졌는가
    hasCompletionDate: boolean;
    hasLegalInspections: boolean;
    completed: boolean;
  };
  // Gate 2 (soft): 직원·협력사 미등록 시 해당 기능 회색.
  gate2: {
    hasVendors: boolean;
    hasStaff: boolean; // facility_staff/accountant 역할 사용자 1명 이상
    completed: boolean;
  };
  // 전체 진행률 0~100.
  progressPercent: number;
}

function emptyStatus(preference: OnboardingStatus["preference"] = null, isLegacyExempt = false): OnboardingStatus {
  return {
    preference,
    isLegacyExempt,
    gate1: { hasBuilding: false, hasBuildingSpecs: false, hasCompletionDate: false, hasLegalInspections: false, completed: false },
    gate2: { hasVendors: false, hasStaff: false, completed: false },
    progressPercent: 0,
  };
}

router.get("/onboarding/status", async (req: Request, res: Response): Promise<void> => {
  const userId = req.user?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) { res.status(404).json({ error: "사용자를 찾을 수 없습니다" }); return; }

  // 보수: manager 외 역할은 빈 상태(영향 0).
  if (user.role !== "manager") {
    res.json(emptyStatus());
    return;
  }

  const preference = (user.onboardingPreference as OnboardingStatus["preference"]) ?? null;

  // 본 기능 출시 이전 계정은 무조건 면제(buildingId 유무 무관).
  const ONBOARDING_RELEASE_DATE = new Date("2026-04-18T00:00:00+09:00");
  const isPreReleaseAccount = user.createdAt
    ? new Date(user.createdAt) < ONBOARDING_RELEASE_DATE
    : false;

  if (!user.buildingId) {
    res.json(emptyStatus(preference, isPreReleaseAccount));
    return;
  }

  const [building] = await db.select().from(buildingsTable).where(eq(buildingsTable.id, user.buildingId));
  const hasBuilding = !!building;
  const hasCompletionDate = !!building?.completionDate;
  // 제원: totalArea/totalFloors/totalUnits 가 모두 채워져 있어야 Gate1 통과.
  const hasBuildingSpecs = !!(
    building &&
    building.totalArea != null && Number(building.totalArea) > 0 &&
    building.totalFloors != null && building.totalFloors > 0 &&
    building.totalUnits != null && building.totalUnits > 0
  );

  const [legalCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(inspectionsTable)
    .where(and(
      eq(inspectionsTable.buildingId, user.buildingId),
      eq(inspectionsTable.inspectionType, "legal"),
    ));
  const hasLegalInspections = (legalCount?.count ?? 0) > 0;

  // 협력사(vendors)는 플랫폼 전역 레지스트리(building_id 컬럼 없음).
  // 따라서 전체 카운트를 사용하며, "이 플랫폼에 협력사가 등록되어 있는가" 의미로 해석.
  // 추후 building-scoped 협력사 매칭이 도입되면 이 지점에서 scope 좁히기.
  const [vendorCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(vendorsTable);
  const hasVendors = (vendorCount?.count ?? 0) > 0;

  // 직원: 같은 building 의 facility_staff/accountant 사용자 1명 이상.
  const [staffCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(usersTable)
    .where(and(
      eq(usersTable.buildingId, user.buildingId),
      sql`${usersTable.role} IN ('facility_staff','accountant')`,
    ));
  const hasStaff = (staffCount?.count ?? 0) > 0;

  const gate1 = {
    hasBuilding,
    hasBuildingSpecs,
    hasCompletionDate,
    hasLegalInspections,
    completed: hasBuilding && hasBuildingSpecs && hasCompletionDate && hasLegalInspections,
  };
  const gate2 = {
    hasVendors,
    hasStaff,
    completed: hasVendors && hasStaff,
  };

  // 진행률: gate1 항목 4개 + gate2 항목 2개 = 6개 균등 가중.
  const checks = [
    gate1.hasBuilding,
    gate1.hasBuildingSpecs,
    gate1.hasCompletionDate,
    gate1.hasLegalInspections,
    gate2.hasVendors,
    gate2.hasStaff,
  ];
  const progressPercent = Math.round((checks.filter(Boolean).length / checks.length) * 100);

  // 보수: 기존 manager 계정에는 새로운 모달/Gate 동작이 발생하지 않도록 함.
  // 면제 조건: (1) Gate1 이미 완료, OR (2) 본 기능 출시 이전 생성 계정.
  // 클라이언트는 isLegacyExempt=true 시 모달/redirect 모두 우회.
  const isLegacyExempt = gate1.completed || isPreReleaseAccount;

  const status: OnboardingStatus = { preference, isLegacyExempt, gate1, gate2, progressPercent };
  res.json(status);
});

router.post("/onboarding/preference", async (req: Request, res: Response): Promise<void> => {
  const userId = req.user?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) { res.status(404).json({ error: "사용자를 찾을 수 없습니다" }); return; }
  if (user.role !== "manager") {
    res.status(403).json({ error: "관리소장만 설정 가능합니다" });
    return;
  }

  const { preference } = req.body as { preference?: string };
  if (!preference || !onboardingPrefValues.has(preference)) {
    res.status(400).json({ error: "잘못된 값입니다" });
    return;
  }

  await db.update(usersTable)
    .set({ onboardingPreference: preference as "started" | "browsing" })
    .where(eq(usersTable.id, userId));

  res.json({ preference });
});

export default router;
