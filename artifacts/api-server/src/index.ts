import app from "./app";
import { logger } from "./lib/logger";
import { seedDocumentTemplates } from "./routes/seedTemplates";
import { seedTaskTemplates } from "./seed-task-templates";
import { db, usersTable, unitsTable, tenantsTable, ownersTable } from "@workspace/db";
import { sql, eq, and, isNull, isNotNull } from "drizzle-orm";
import { startScheduler, stopScheduler } from "./scheduler";
import { seedTestUsers } from "./seed-test-users";
import { seedPlatformAdmins } from "./seed-platform-admin";
import { seedPartnerBm } from "./seed-partner-bm";
import { seedPartnerMenuDefaults } from "./seed-partner-menu";
import { seedVendorCategories, reloadCategoryParentMap } from "./routes/vendorCategories";
import { ensureConsentSchema, seedConsentDocuments } from "./seed-consent-docs";
import { seedChartOfAccounts } from "./lib/seedChartOfAccounts";
import { wireAccountingListeners } from "./lib/accountingRules";
import { ensureRfqMatchSchema } from "./lib/ensureRfqMatchSchema";
import { backfillInspectionNextDueDates } from "./lib/inspectionBackfill";
import { runMigrations } from "./lib/runMigrations";
import { backfillSkipAccountantApproverSteps } from "./routes/approvalSteps";

async function backfillUnitIds() {
  await db.execute(sql`
    UPDATE tenants t
    SET unit_id = u.id
    FROM units u
    WHERE t.unit_id IS NULL
      AND t.unit IS NOT NULL
      AND t.unit != ''
      AND t.unit = u.unit_number
      AND u.building_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM units u2
        WHERE u2.unit_number = u.unit_number
          AND u2.id != u.id
      )
  `);

  await db.execute(sql`
    UPDATE owners o
    SET unit_id = u.id
    FROM units u
    WHERE o.unit_id IS NULL
      AND o.unit IS NOT NULL
      AND o.unit != ''
      AND o.unit = u.unit_number
      AND u.building_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM units u2
        WHERE u2.unit_number = u.unit_number
          AND u2.id != u.id
      )
  `);

  const remainingTenants = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(tenantsTable)
    .where(and(isNull(tenantsTable.unitId), isNotNull(tenantsTable.unit)));

  const remainingOwners = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(ownersTable)
    .where(and(isNull(ownersTable.unitId), isNotNull(ownersTable.unit)));

  const tRemaining = remainingTenants[0]?.count ?? 0;
  const oRemaining = remainingOwners[0]?.count ?? 0;

  if (tRemaining > 0 || oRemaining > 0) {
    logger.warn({ tenantsWithoutUnitId: tRemaining, ownersWithoutUnitId: oRemaining },
      "Skipped ambiguous records (unit number exists in multiple buildings - requires manual resolution)");
  }
}

async function migrateLegacyUsers() {
  await db.update(usersTable)
    .set({ role: "manager", portalType: "building" })
    .where(sql`${usersTable.role} = 'executive'`);

  await db.update(usersTable)
    .set({ role: "partner", portalType: "partner" })
    .where(sql`${usersTable.role} = 'vendor'`);

  await db.update(usersTable)
    .set({ portalType: "partner" })
    .where(sql`${usersTable.portalType} = 'vendor'`);
}

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function bootstrap() {
  // [Task #454] 포트 바인딩 **이전에** 마이그레이션을 먼저 적용한다.
  //   - listen 후에 돌리면 짧은 시간 동안 트래픽이 옛 스키마로 흘러들어가
  //     readiness 가 잘못 OK 로 보일 수 있다 (코드리뷰 #1 지적).
  //   - 실패하면 process.exit(1) 로 빠르게 깨져 autoscale rolling restart 가
  //     잘못된 인스턴스를 띄우지 않게 한다.
  try {
    const result = await runMigrations();
    logger.info(
      { applied: result.applied, baselined: result.baselined, skipped: result.skipped },
      "Database migrations checked",
    );
  } catch (e) {
    logger.error({ err: e }, "Failed to run database migrations — aborting boot");
    process.exit(1);
  }

  app.listen(port, async (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }

    logger.info({ port }, "Server listening");

    try {
      await migrateLegacyUsers();
      logger.info("Legacy user roles migrated");
    } catch (e) {
      logger.warn({ err: e }, "Failed to migrate legacy user roles");
    }

    try {
      await seedDocumentTemplates();
      logger.info("Document templates seeded");
    } catch (e) {
      logger.warn({ err: e }, "Failed to seed document templates");
    }

    try {
      await seedTaskTemplates();
      logger.info("Task templates seeded");
    } catch (e) {
      logger.warn({ err: e }, "Failed to seed task templates");
    }

    try {
      await backfillUnitIds();
      logger.info("Unit ID backfill completed");
    } catch (e) {
      logger.warn({ err: e }, "Failed to backfill unit IDs");
    }

    // [Task #411] 사용승인일 baseline 으로 셋업된 inspections 의 nextDueDate 를
    //   매 주기 정상 이행 가정으로 walk-forward 보정. 조건부(=오래 지난 항목)만
    //   업데이트하므로 재실행해도 같은 행을 다시 변경하지 않는다(idempotent).
    try {
      const dryRun = process.env["INSPECTION_BACKFILL_DRY_RUN"] === "1";
      await backfillInspectionNextDueDates({ dryRun });
    } catch (e) {
      logger.warn({ err: e }, "Failed to backfill inspection next due dates");
    }

    try {
      await seedTestUsers();
    } catch (e) {
      logger.warn({ err: e }, "Failed to seed test users");
    }

    try {
      await seedPlatformAdmins();
    } catch (e) {
      logger.warn({ err: e }, "Failed to seed platform admins");
    }

    // [Task #298] credit_category_pricing 에 추가된 정책 컬럼이 시드보다 먼저 ALTER 되어야 한다.
    try {
      await ensureRfqMatchSchema();
      logger.info("RFQ match / regional pricing schema ensured");
    } catch (e) {
      logger.warn({ err: e }, "Failed to ensure RFQ match schema");
    }

    try {
      await seedPartnerBm();
      logger.info("Partner BM defaults seeded");
    } catch (e) {
      logger.warn({ err: e }, "Failed to seed partner BM defaults");
    }

    // [Task #637] 파트너 사이드바 핵심 메뉴(/rfqs) 가 OFF 로 저장된 환경을 부팅 시 1회 보정.
    try {
      await seedPartnerMenuDefaults();
      logger.info("Partner menu defaults restored");
    } catch (e) {
      logger.warn({ err: e }, "Failed to restore partner menu defaults");
    }

    try {
      await seedVendorCategories();
      logger.info("Vendor categories seeded");
    } catch (e) {
      logger.warn({ err: e }, "Failed to seed vendor categories");
    }

    // [Task #734] 카테고리 자식 → 부모맵 주입. 매칭 함수가 자식 vendor 를
    //   부모 RFQ 로 통과시키도록 한다. 실패해도 매칭은 부모 자동 포함 없이
    //   기존 동작으로 fallback.
    try {
      await reloadCategoryParentMap();
      logger.info("Vendor category parent map loaded");
    } catch (e) {
      logger.warn({ err: e }, "Failed to load vendor category parent map");
    }

    try {
      await ensureConsentSchema();
      await seedConsentDocuments();
      logger.info("Consent documents seeded");
    } catch (e) {
      logger.warn({ err: e }, "Failed to seed consent documents");
    }

    // [Task #778] T6 회계엔진 — 표준 계정과목 시드 + 자동분개 리스너 wiring.
    try {
      await seedChartOfAccounts();
      wireAccountingListeners();
    } catch (e) {
      logger.warn({ err: e }, "Failed to bootstrap T6 accounting engine");
    }

    // [Task #707 review fix] in-flight 결재 라인의 잔존 경리 결재 단계를 자동
    //   skip 한다. 변경 전 라인이 경리 승인을 기다리며 멈춰 있는 사고를 방지.
    try {
      const result = await backfillSkipAccountantApproverSteps();
      logger.info(
        { skippedSteps: result.skippedSteps, advancedApprovals: result.advancedApprovals, finalizedApprovals: result.finalizedApprovals },
        "[Task #707] Skipped accountant approver steps on in-flight approvals",
      );
    } catch (e) {
      logger.warn({ err: e }, "Failed to skip accountant approver steps");
    }

    startScheduler();
  });
}

bootstrap().catch((err) => {
  logger.error({ err }, "Bootstrap failed");
  process.exit(1);
});

process.on("SIGTERM", () => {
  stopScheduler();
  process.exit(0);
});

process.on("SIGINT", () => {
  stopScheduler();
  process.exit(0);
});
