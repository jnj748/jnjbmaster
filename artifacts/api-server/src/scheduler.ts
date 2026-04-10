import { eq, and, lte, gte, isNotNull, sql } from "drizzle-orm";
import { db, tenantsTable, ownersTable, dataDestructionLogsTable, notificationsTable, vehiclesTable } from "@workspace/db";
import { logger } from "./lib/logger";

function getToday(): string {
  return new Date().toISOString().split("T")[0];
}

async function runPrivacyDestructionAlerts(): Promise<void> {
  const todayStr = getToday();
  const thirtyDaysLater = new Date();
  thirtyDaysLater.setDate(thirtyDaysLater.getDate() + 30);
  const thirtyDaysStr = thirtyDaysLater.toISOString().split("T")[0];

  const existingAlerts = await db
    .select()
    .from(notificationsTable)
    .where(
      and(
        eq(notificationsTable.notificationType, "data_destruction_alert"),
        gte(notificationsTable.createdAt, new Date(todayStr))
      )
    );

  if (existingAlerts.length > 0) {
    logger.info("Privacy destruction alert already sent today, skipping");
    return;
  }

  const upcomingTenants = await db
    .select()
    .from(tenantsTable)
    .where(
      and(
        isNotNull(tenantsTable.dataDestructionDate),
        lte(tenantsTable.dataDestructionDate, thirtyDaysStr),
        sql`${tenantsTable.dataDestructionDate} > ${todayStr}`,
        eq(tenantsTable.status, "moved_out")
      )
    );

  const upcomingOwners = await db
    .select()
    .from(ownersTable)
    .where(
      and(
        isNotNull(ownersTable.dataDestructionDate),
        lte(ownersTable.dataDestructionDate, thirtyDaysStr),
        sql`${ownersTable.dataDestructionDate} > ${todayStr}`,
        eq(ownersTable.status, "moved_out")
      )
    );

  const totalCount = upcomingTenants.length + upcomingOwners.length;

  if (totalCount > 0) {
    const details = [
      ...upcomingTenants.map((t) => `입주자 ${t.unit}호 ${t.tenantName} (${t.dataDestructionDate})`),
      ...upcomingOwners.map((o) => `소유자 ${o.unit}호 ${o.ownerName} (${o.dataDestructionDate})`),
    ].join(", ");

    await db.insert(notificationsTable).values({
      recipientType: "admin",
      notificationType: "data_destruction_alert",
      title: "개인정보 파기 예정 알림",
      message: `30일 이내 파기 예정: ${totalCount}건 - ${details}`,
      relatedEntityType: "privacy",
    });

    logger.info({ count: totalCount }, "Privacy destruction alert created");
  }
}

async function runPrivacyDestructionProcessing(): Promise<void> {
  const todayStr = getToday();

  const dueTenants = await db
    .select()
    .from(tenantsTable)
    .where(
      and(
        isNotNull(tenantsTable.dataDestructionDate),
        lte(tenantsTable.dataDestructionDate, todayStr),
        eq(tenantsTable.status, "moved_out")
      )
    );

  const dueOwners = await db
    .select()
    .from(ownersTable)
    .where(
      and(
        isNotNull(ownersTable.dataDestructionDate),
        lte(ownersTable.dataDestructionDate, todayStr),
        eq(ownersTable.status, "moved_out")
      )
    );

  let processedCount = 0;

  for (const tenant of dueTenants) {
    await db.insert(dataDestructionLogsTable).values({
      entityType: "tenant",
      entityId: tenant.id,
      unit: tenant.unit,
      originalName: tenant.tenantName,
      destructionType: "anonymization",
      processedBy: "system",
      notes: `자동 파기 - 퇴거일: ${tenant.moveOutDate}, 파기예정일: ${tenant.dataDestructionDate}`,
    });

    await db
      .update(tenantsTable)
      .set({
        tenantName: "***",
        residentId: null,
        phone: null,
        emergencyContact: null,
        email: null,
        registeredAddress: null,
        guarantorName: null,
        guarantorPhone: null,
        guarantorRelation: null,
        notes: "[개인정보 자동 파기 처리됨]",
        status: "destroyed",
      })
      .where(eq(tenantsTable.id, tenant.id));

    processedCount++;
  }

  for (const owner of dueOwners) {
    await db.insert(dataDestructionLogsTable).values({
      entityType: "owner",
      entityId: owner.id,
      unit: owner.unit,
      originalName: owner.ownerName,
      destructionType: "anonymization",
      processedBy: "system",
      notes: `자동 파기 - 퇴거일: ${owner.moveOutDate}, 파기예정일: ${owner.dataDestructionDate}`,
    });

    await db
      .update(ownersTable)
      .set({
        ownerName: "***",
        phone: null,
        email: null,
        registeredAddress: null,
        notes: "[개인정보 자동 파기 처리됨]",
        status: "destroyed",
      })
      .where(eq(ownersTable.id, owner.id));

    processedCount++;
  }

  if (processedCount > 0) {
    await db.insert(notificationsTable).values({
      recipientType: "admin",
      notificationType: "data_destruction_completed",
      title: "개인정보 자동 파기 처리 완료",
      message: `${processedCount}건의 개인정보가 자동 파기(익명화) 처리되었습니다.`,
      relatedEntityType: "privacy",
    });

    logger.info({ count: processedCount }, "Privacy data auto-destroyed");
  }
}

async function runVehicleMonthlyInspection(): Promise<void> {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const existingInspection = await db
    .select()
    .from(notificationsTable)
    .where(
      and(
        eq(notificationsTable.notificationType, "vehicle_monthly_inspection"),
        gte(notificationsTable.createdAt, monthStart)
      )
    );

  if (existingInspection.length > 0) {
    logger.info("Vehicle monthly inspection already run this month, skipping");
    return;
  }

  const allVehicles = await db
    .select()
    .from(vehiclesTable)
    .where(eq(vehiclesTable.status, "registered"));

  const registeredUnits = new Set(allVehicles.map((v) => v.unit));

  const allTenants = await db
    .select({ unit: tenantsTable.unit, tenantName: tenantsTable.tenantName })
    .from(tenantsTable)
    .where(eq(tenantsTable.status, "active"));

  const unregisteredUnits = allTenants.filter((t) => !registeredUnits.has(t.unit));

  if (unregisteredUnits.length > 0) {
    const unitList = unregisteredUnits
      .slice(0, 10)
      .map((u) => `${u.unit}호`)
      .join(", ");
    const suffix = unregisteredUnits.length > 10 ? ` 외 ${unregisteredUnits.length - 10}건` : "";

    await db.insert(notificationsTable).values({
      recipientType: "admin",
      notificationType: "vehicle_monthly_inspection",
      title: "월별 차량 점검 알림",
      message: `미등록 차량 ${unregisteredUnits.length}건 확인 필요: ${unitList}${suffix}`,
      relatedEntityType: "vehicle",
    });

    logger.info({ count: unregisteredUnits.length }, "Vehicle monthly inspection alert created");
  }
}

let dailyTimer: ReturnType<typeof setInterval> | null = null;
let monthlyTimer: ReturnType<typeof setInterval> | null = null;

export function startScheduler(): void {
  logger.info("Starting automated scheduler for privacy and vehicle tasks");

  runPrivacyDestructionAlerts().catch((err) => logger.error({ err }, "Scheduled privacy alert failed"));
  runPrivacyDestructionProcessing().catch((err) => logger.error({ err }, "Scheduled privacy destruction failed"));

  const now = new Date();
  if (now.getDate() === 1) {
    runVehicleMonthlyInspection().catch((err) => logger.error({ err }, "Scheduled vehicle inspection failed"));
  }

  dailyTimer = setInterval(async () => {
    logger.info("Running daily scheduled privacy tasks");
    try {
      await runPrivacyDestructionAlerts();
      await runPrivacyDestructionProcessing();
    } catch (err) {
      logger.error({ err }, "Daily scheduled task failed");
    }
  }, 24 * 60 * 60 * 1000);

  monthlyTimer = setInterval(async () => {
    const currentDate = new Date();
    if (currentDate.getDate() === 1) {
      logger.info("Running monthly vehicle inspection (1st of month)");
      try {
        await runVehicleMonthlyInspection();
      } catch (err) {
        logger.error({ err }, "Monthly vehicle inspection failed");
      }
    }
  }, 24 * 60 * 60 * 1000);
}

export function stopScheduler(): void {
  if (dailyTimer) {
    clearInterval(dailyTimer);
    dailyTimer = null;
  }
  if (monthlyTimer) {
    clearInterval(monthlyTimer);
    monthlyTimer = null;
  }
  logger.info("Scheduler stopped");
}
