import { db, roleMenuOverridesTable, platformSettingsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { logger } from "./lib/logger";

// [Task #637] 파트너 메뉴 기본값 1회성 마이그레이션.
//
// 배경: 본사 관리자가 "유저유형별 메뉴 활성화" 그리드에서 파트너의 `/rfqs`
// 메뉴를 OFF 로 저장한 환경이 보고됐다. 이로 인해 파트너 사이드바에서
// "견적 요청" / "내 견적·작업" 진입 동선이 사라졌다. 정책상 두 항목은 파트너의
// 핵심 진입점이므로 기본값(=오버라이드 행 부재 → ON) 으로 1회 복원한다.
//
// 1회성 보장: platform_settings 의 `partner_menu_default_restored_v1` 플래그가
// 이미 "true" 면 아무 일도 하지 않는다. 이렇게 하면 운영 중 본사 관리자가
// 다시 OFF 로 저장한 결정이 다음 부팅에 의해 덮어써지지 않는다.
const RESTORATION_FLAG_KEY = "partner_menu_default_restored_v1";
const PARTNER_DEFAULT_ON_PATHS = ["/rfqs"];

export async function seedPartnerMenuDefaults(): Promise<void> {
  const existing = await db
    .select({ value: platformSettingsTable.value })
    .from(platformSettingsTable)
    .where(eq(platformSettingsTable.key, RESTORATION_FLAG_KEY))
    .limit(1);

  if (existing.length > 0 && existing[0].value === "true") {
    return;
  }

  // 1) 삭제 대상 행을 먼저 조회 (DELETE 의 rowCount 를 driver 에 의존하지 않음).
  let totalRemoved = 0;
  for (const path of PARTNER_DEFAULT_ON_PATHS) {
    const offRows = await db
      .select({ id: roleMenuOverridesTable.id })
      .from(roleMenuOverridesTable)
      .where(
        and(
          eq(roleMenuOverridesTable.role, "partner"),
          eq(roleMenuOverridesTable.blockId, path),
          eq(roleMenuOverridesTable.enabled, false),
        ),
      );
    if (offRows.length === 0) continue;

    await db
      .delete(roleMenuOverridesTable)
      .where(
        and(
          eq(roleMenuOverridesTable.role, "partner"),
          eq(roleMenuOverridesTable.blockId, path),
          eq(roleMenuOverridesTable.enabled, false),
        ),
      );
    logger.info(
      { role: "partner", blockId: path, removedRows: offRows.length },
      "Restored partner menu default ON (removed OFF override)",
    );
    totalRemoved += offRows.length;
  }

  // 2) 마이그레이션 완료 플래그 기록 — 향후 부팅에서는 재실행되지 않는다.
  if (existing.length === 0) {
    await db.insert(platformSettingsTable).values({
      key: RESTORATION_FLAG_KEY,
      value: "true",
      description:
        "[Task #637] 파트너 /rfqs 기본 ON 1회성 복원 마이그레이션 실행 여부.",
    });
  } else {
    await db
      .update(platformSettingsTable)
      .set({ value: "true" })
      .where(eq(platformSettingsTable.key, RESTORATION_FLAG_KEY));
  }

  logger.info(
    { totalRemoved },
    "Partner menu default restoration completed (one-time migration)",
  );
}
