// [Task #781] Popbill 채널별 설정(발신번호·템플릿). 시크릿(LinkID/SecretKey/CorpNum) 은
//   환경변수에서만 읽고 DB 에 저장하지 않는다(노출 표면 최소화). 본 테이블은 발신번호와
//   템플릿 코드 — 운영자가 화면에서 등록·갱신할 수 있는 메타만 보관.

import { pgTable, text, serial, integer, boolean, timestamp, jsonb, unique } from "drizzle-orm/pg-core";
import { buildingsTable } from "./buildings";

export const popbillSettingsTable = pgTable(
  "popbill_settings",
  {
    id: serial("id").primaryKey(),
    buildingId: integer("building_id").notNull().references(() => buildingsTable.id, { onDelete: "cascade" }),
    // 발신번호 — 알림톡/문자 공통(사전 등록 필요).
    senderNumber: text("sender_number"),
    // 알림톡 발신 프로필(@아이디).
    senderProfileId: text("sender_profile_id"),
    // 알림톡 템플릿 코드 카탈로그. key 는 단지 운영용 라벨, value 는 Popbill 등록 코드.
    // 권장 키: bill_issued / payment_completed / receipt / overdue_1 / overdue_2 / overdue_meeting.
    kakaoTemplates: jsonb("kakao_templates").$type<Record<string, string>>().notNull().default({}),
    // 시크릿 등록 여부(실제 값은 env). UI 토글에 사용.
    secretsConfigured: boolean("secrets_configured").notNull().default(false),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [unique("popbill_settings_building_uk").on(t.buildingId)],
);

export type PopbillSettings = typeof popbillSettingsTable.$inferSelect;
export type InsertPopbillSettings = typeof popbillSettingsTable.$inferInsert;
