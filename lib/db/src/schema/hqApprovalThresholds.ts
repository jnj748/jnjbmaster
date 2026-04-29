import { pgTable, serial, integer, real, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// [Task #611] 본부장(hq_executive) 결재 임계 금액.
//   본부장이 본인 책임 범위(본인이 담당하는 건물)에 대해 임계 금액을 설정·수정할 수
//   있다. 라인 상신 시점에 (해당 건물에 본부장이 배정되어 있는지) × (기안 금액이
//   임계 이상인지) 를 보고 결재선이 자동 결정된다. 변경 이력이 누적되며,
//   변경된 임계 금액은 이후 신규 기안에만 적용된다(이미 진행 중인 라인은 스냅샷 보존).
//
//   row 당 (hqUserId, buildingId) 가 unique. buildingId NULL 은 "본부장 전체 기본값" 으로
//   해석되어, 건물별 row 가 없을 때 fallback 으로 사용된다.
export const hqApprovalThresholdsTable = pgTable(
  "hq_approval_thresholds",
  {
    id: serial("id").primaryKey(),
    hqUserId: integer("hq_user_id").notNull(),
    buildingId: integer("building_id"),
    thresholdAmount: real("threshold_amount").notNull(),
    updatedByUserId: integer("updated_by_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => ({
    hqBuildingUnique: uniqueIndex("hq_approval_thresholds_unique").on(t.hqUserId, t.buildingId),
  }),
);

export const insertHqApprovalThresholdSchema = createInsertSchema(hqApprovalThresholdsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertHqApprovalThreshold = z.infer<typeof insertHqApprovalThresholdSchema>;
export type HqApprovalThreshold = typeof hqApprovalThresholdsTable.$inferSelect;
