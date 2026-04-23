import { pgTable, text, serial, integer, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// [Task #296] 유저유형별 이용현황 분석을 위한 페이지 진입 이벤트 적재 테이블.
//   프런트가 라우트 변경 시점에 1행씩 기록하고, 플랫폼관리자 분석 화면이 집계해 읽는다.
//   개인 식별 단위 드릴다운은 out-of-scope 이므로 user_id 는 보관하되 화면에는
//   집계값(고유 사용자 수)만 노출한다.
export const usageEventsTable = pgTable(
  "usage_events",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull(),
    role: text("role").notNull(),
    path: text("path").notNull(),
    menuKey: text("menu_key"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byRoleTime: index("ix_usage_events_role_time").on(t.role, t.occurredAt),
    byPath: index("ix_usage_events_path").on(t.path),
    byTime: index("ix_usage_events_time").on(t.occurredAt),
  }),
);

export const insertUsageEventSchema = createInsertSchema(usageEventsTable).omit({
  id: true,
  occurredAt: true,
});
export type InsertUsageEvent = z.infer<typeof insertUsageEventSchema>;
export type UsageEvent = typeof usageEventsTable.$inferSelect;
