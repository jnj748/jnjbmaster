import { pgTable, serial, integer, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";

// [Task #596] 본부장(hq_executive) ↔ 건물 다대다 매핑.
//
// 배경:
//   v0 까지 본부장은 사실상 "전 건물 수퍼유저" 처럼 동작해 왔다(전 건물 가시성).
//   유저 유형 관계도(docs/user-roles/) 를 박제하면서, 본부장은 자신에게 할당된
//   관할 건물 묶음 안에서만 데이터를 보고 조작하도록 정합화한다.
//   - 한 본부장이 여러 건물을 관할할 수 있고,
//   - 한 건물이 여러 본부장에게 할당될 수도 있다(공동 관할).
//   - platform_admin 만 전 건물 가시성을 갖는다.
//
//   `users.building_id` 는 단일 소속 컬럼으로 유지하지만, 본부장 계정에서는
//   사실상 무의미하므로 매핑 테이블만이 권위 있는 source 다.
export const hqBuildingAssignmentsTable = pgTable(
  "hq_building_assignments",
  {
    id: serial("id").primaryKey(),
    // 본부장(hq_executive) 계정의 users.id. 다른 역할 id 가 들어오면 안 됨.
    hqUserId: integer("hq_user_id").notNull(),
    buildingId: integer("building_id").notNull(),
    // 매핑을 만든 platform_admin 의 users.id (감사용). null 가능 — 시스템/시드.
    assignedByUserId: integer("assigned_by_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    hqBuildingUnique: uniqueIndex("hq_building_assignments_unique").on(t.hqUserId, t.buildingId),
    byHqUser: index("hq_building_assignments_hq_user_idx").on(t.hqUserId),
    byBuilding: index("hq_building_assignments_building_idx").on(t.buildingId),
  }),
);

export type HqBuildingAssignment = typeof hqBuildingAssignmentsTable.$inferSelect;
export type InsertHqBuildingAssignment = typeof hqBuildingAssignmentsTable.$inferInsert;
