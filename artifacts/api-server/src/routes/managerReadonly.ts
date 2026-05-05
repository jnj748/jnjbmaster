// [Task #861] 관리소장 "회계 결과 열람" 그룹 — 데이터 미존재 항목 자동 숨김.
//
// 관리소장 사이드바에 항상 노출되던 7개 읽기 전용 항목 중, 경리가 아직 데이터를
// 입력/마감하지 않은 항목은 빈 화면 진입 → 혼선 발생. 부과 실행/마감 보고/세금/
// 검침 등 1건 이상 데이터가 있는 경우만 사이드바에 노출되도록, 본 엔드포인트가
// path 별 데이터 가용성(boolean)을 반환한다.
//
// 사이드바는 path 단위로 가용성을 조회하므로 응답은 { items: { path: boolean } }
// 형태로 단일 호출에서 7개 항목 전부를 회신한다.

import { Router, type IRouter, type Request, type Response } from "express";
import { eq, sql } from "drizzle-orm";
import type { AnyPgColumn, PgTable } from "drizzle-orm/pg-core";
import {
  db,
  billingRunsTable,
  noticeOutputsTable,
  monthlyBillSummariesTable,
  receivableOverdueSnapshotsTable,
  meterReadingsTable,
  periodClosingsTable,
  taxInvoicesTable,
} from "@workspace/db";
import { getUserBuildingId } from "../middlewares/buildingScope";

const router: IRouter = Router();

// 7개 readonly 항목별 "이 빌딩에 데이터가 1건이라도 있는가?" 체크 헬퍼.
// 각 테이블의 buildingId 컬럼을 명시적으로 받아 타입 안전성을 보장한다
// (any 회피 — facilityTasks.ts 의 AnyPgColumn 패턴 채택).
async function existsForBuilding(
  table: PgTable,
  buildingIdColumn: AnyPgColumn,
  buildingId: number,
): Promise<boolean> {
  const rows = await db
    .select({ x: sql<number>`1` })
    .from(table)
    .where(eq(buildingIdColumn, buildingId))
    .limit(1);
  return rows.length > 0;
}

router.get(
  "/manager-readonly-availability",
  async (req: Request, res: Response): Promise<void> => {
    const buildingId = await getUserBuildingId(req);
    if (!buildingId) {
      res.json({ items: {} });
      return;
    }

    const [
      hasBillingRun,
      hasNoticeOutput,
      hasMonthlySummary,
      hasOverdueSnapshot,
      hasMeterReading,
      hasPeriodClosing,
      hasTaxInvoice,
    ] = await Promise.all([
      existsForBuilding(billingRunsTable, billingRunsTable.buildingId, buildingId),
      existsForBuilding(noticeOutputsTable, noticeOutputsTable.buildingId, buildingId),
      existsForBuilding(monthlyBillSummariesTable, monthlyBillSummariesTable.buildingId, buildingId),
      existsForBuilding(
        receivableOverdueSnapshotsTable,
        receivableOverdueSnapshotsTable.buildingId,
        buildingId,
      ),
      existsForBuilding(meterReadingsTable, meterReadingsTable.buildingId, buildingId),
      existsForBuilding(periodClosingsTable, periodClosingsTable.buildingId, buildingId),
      existsForBuilding(taxInvoicesTable, taxInvoicesTable.buildingId, buildingId),
    ]);

    // 부과총괄표·관리비 요약은 부과 실행(billing_runs) 또는 OCR 월요약 둘 중
    // 하나만 있어도 들여다볼 자료가 생긴다. 둘 다 비어 있으면 숨긴다.
    const billingHasData = hasBillingRun || hasMonthlySummary;

    const items: Record<string, boolean> = {
      "/billing/summary": billingHasData,
      "/billing/notices": hasNoticeOutput,
      "/erp/fees-summary": billingHasData,
      "/receivables/overdue": hasOverdueSnapshot,
      "/erp/metering": hasMeterReading,
      "/closing": hasPeriodClosing,
      "/tax": hasTaxInvoice,
    };

    res.json({ items });
  },
);

export default router;
