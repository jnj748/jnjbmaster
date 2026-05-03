// [Task #773] 감사로그 — 모든 변경계 도메인 엔진의 액션을 자동 기록.
//
// 후속 엔진(T3~T10) 라우트는 `audit('action_name')` 미들웨어 한 줄만 부착하면
// 행위자(actor)·역할·대상·전후 스냅샷·IP/UA·사유를 일관된 스키마로 남긴다.
// 회계감사·분쟁·마감취소·결재 책임 사후 추적의 단일 진리원천(SoT).

import { pgTable, text, serial, integer, timestamp, jsonb, index } from "drizzle-orm/pg-core";

export const auditLogsTable = pgTable(
  "audit_logs",
  {
    id: serial("id").primaryKey(),
    actorId: integer("actor_id"),
    role: text("role").notNull(),
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: integer("target_id"),
    buildingId: integer("building_id"),
    // 변경계 액션의 전/후 스냅샷. JSON.stringify 한 sanitized payload.
    beforeJson: jsonb("before_json"),
    afterJson: jsonb("after_json"),
    // 위험 액션의 사유 칩(또는 "기타" 자유 입력) — confirm-with-reason 컴포넌트에서 전달.
    reason: text("reason"),
    ip: text("ip"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byActor: index("audit_logs_actor_idx").on(t.actorId),
    byAction: index("audit_logs_action_idx").on(t.action),
    byBuilding: index("audit_logs_building_idx").on(t.buildingId),
    byCreatedAt: index("audit_logs_created_idx").on(t.createdAt),
  }),
);

export type AuditLog = typeof auditLogsTable.$inferSelect;
export type InsertAuditLog = typeof auditLogsTable.$inferInsert;
