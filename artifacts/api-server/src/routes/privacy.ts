import { Router, type IRouter } from "express";
import { eq, and, lte, gte, isNotNull, sql } from "drizzle-orm";
import { db, tenantsTable, ownersTable, dataDestructionLogsTable, notificationsTable } from "@workspace/db";
import { requireRole } from "../middlewares/auth";

const router: IRouter = Router();
const adminOnly = requireRole("manager", "platform_admin");

function addYears(dateStr: string, years: number): string {
  const d = new Date(dateStr);
  d.setFullYear(d.getFullYear() + years);
  return d.toISOString().split("T")[0];
}

function daysBetween(dateStr: string): number {
  const target = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

router.get("/privacy/destruction-schedule", adminOnly, async (_req, res): Promise<void> => {
  const tenants = await db
    .select()
    .from(tenantsTable)
    .where(
      and(
        isNotNull(tenantsTable.dataDestructionDate),
        eq(tenantsTable.status, "moved_out")
      )
    );

  const owners = await db
    .select()
    .from(ownersTable)
    .where(
      and(
        isNotNull(ownersTable.dataDestructionDate),
        eq(ownersTable.status, "moved_out")
      )
    );

  const schedule = [
    ...tenants.map((t) => ({
      entityType: "tenant" as const,
      entityId: t.id,
      unit: t.unit,
      name: t.tenantName,
      moveOutDate: t.moveOutDate!,
      dataDestructionDate: t.dataDestructionDate!,
      daysUntilDestruction: daysBetween(t.dataDestructionDate!),
      status: daysBetween(t.dataDestructionDate!) <= 0 ? "due" : daysBetween(t.dataDestructionDate!) <= 30 ? "upcoming" : "scheduled",
    })),
    ...owners.map((o) => ({
      entityType: "owner" as const,
      entityId: o.id,
      unit: o.unit,
      name: o.ownerName,
      moveOutDate: o.moveOutDate!,
      dataDestructionDate: o.dataDestructionDate!,
      daysUntilDestruction: daysBetween(o.dataDestructionDate!),
      status: daysBetween(o.dataDestructionDate!) <= 0 ? "due" : daysBetween(o.dataDestructionDate!) <= 30 ? "upcoming" : "scheduled",
    })),
  ].sort((a, b) => a.daysUntilDestruction - b.daysUntilDestruction);

  res.json(schedule);
});

router.post("/privacy/process-destructions", adminOnly, async (_req, res): Promise<void> => {
  const today = new Date().toISOString().split("T")[0];

  const dueTenants = await db
    .select()
    .from(tenantsTable)
    .where(
      and(
        isNotNull(tenantsTable.dataDestructionDate),
        lte(tenantsTable.dataDestructionDate, today),
        eq(tenantsTable.status, "moved_out")
      )
    );

  const dueOwners = await db
    .select()
    .from(ownersTable)
    .where(
      and(
        isNotNull(ownersTable.dataDestructionDate),
        lte(ownersTable.dataDestructionDate, today),
        eq(ownersTable.status, "moved_out")
      )
    );

  const processed: { entityType: string; entityId: number; unit: string }[] = [];

  for (const tenant of dueTenants) {
    await db.insert(dataDestructionLogsTable).values({
      entityType: "tenant",
      entityId: tenant.id,
      unit: tenant.unit,
      originalName: tenant.tenantName,
      destructionType: "anonymization",
      processedBy: "system",
      notes: `퇴거일: ${tenant.moveOutDate}, 파기예정일: ${tenant.dataDestructionDate}`,
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
        notes: "[개인정보 파기 처리됨]",
        status: "destroyed",
      })
      .where(eq(tenantsTable.id, tenant.id));

    processed.push({ entityType: "tenant", entityId: tenant.id, unit: tenant.unit });
  }

  for (const owner of dueOwners) {
    await db.insert(dataDestructionLogsTable).values({
      entityType: "owner",
      entityId: owner.id,
      unit: owner.unit,
      originalName: owner.ownerName,
      destructionType: "anonymization",
      processedBy: "system",
      notes: `퇴거일: ${owner.moveOutDate}, 파기예정일: ${owner.dataDestructionDate}`,
    });

    await db
      .update(ownersTable)
      .set({
        ownerName: "***",
        phone: null,
        email: null,
        registeredAddress: null,
        notes: "[개인정보 파기 처리됨]",
        status: "destroyed",
      })
      .where(eq(ownersTable.id, owner.id));

    processed.push({ entityType: "owner", entityId: owner.id, unit: owner.unit });
  }

  if (processed.length > 0) {
    await db.insert(notificationsTable).values({
      recipientType: "admin",
      notificationType: "data_destruction_completed",
      title: "개인정보 파기 처리 완료",
      message: `${processed.length}건의 개인정보가 파기(익명화) 처리되었습니다.`,
      relatedEntityType: "privacy",
    });
  }

  res.json({ processedCount: processed.length, items: processed });
});

router.post("/privacy/destruction-alerts", adminOnly, async (_req, res): Promise<void> => {
  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];
  const thirtyDaysLater = new Date(today);
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
    res.json({ alertCount: 0, skipped: true, message: "오늘 이미 알림이 발송되었습니다." });
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
  }

  res.json({ alertCount: totalCount, skipped: false });
});

router.get("/privacy/destruction-logs", adminOnly, async (_req, res): Promise<void> => {
  const logs = await db
    .select()
    .from(dataDestructionLogsTable)
    .orderBy(sql`${dataDestructionLogsTable.processedAt} DESC`);

  res.json(logs);
});

export default router;
