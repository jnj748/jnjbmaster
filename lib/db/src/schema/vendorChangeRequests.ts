// [Task #661] 파트너 사업자정보 변경 신청 큐.
//   - 잠금 항목(상호·사업자번호·대표자·분야)은 PATCH /me/vendor 로는 바뀌지 않고
//     본 신청 → 본사 관리자 승인 흐름으로만 갱신된다.
//   - 신청 1건당 fields[]( {field, before, after}[] ) + 새 사업자등록증 URL + 사유.
//   - 동일 vendor 에 pending 이 동시에 2건 이상 존재하지 못하도록 partial unique
//     index 를 마이그레이션에서 함께 건다(코드 schema 외 별도 SQL).
import { pgTable, text, serial, integer, timestamp, varchar, jsonb } from "drizzle-orm/pg-core";

export const vendorChangeRequestStatuses = ["pending", "approved", "rejected"] as const;
export type VendorChangeRequestStatus = (typeof vendorChangeRequestStatuses)[number];

// fields 컬럼은 [{field, before, after}] 배열을 jsonb 로 보관한다.
//   field ∈ { name, businessRegNumber, representativeName, category }
//   category 의 after 는 "primary,sub1,sub2..." CSV 또는 객체 표현 모두 허용.
export interface VendorChangeRequestFieldChange {
  field: "name" | "businessRegNumber" | "representativeName" | "category";
  before: string | null;
  after: string | null;
}

export const vendorChangeRequestsTable = pgTable("vendor_change_requests", {
  id: serial("id").primaryKey(),
  vendorId: integer("vendor_id").notNull(),
  requestedBy: integer("requested_by").notNull(),
  status: varchar("status", { length: 16, enum: vendorChangeRequestStatuses })
    .notNull()
    .default("pending"),
  // [{field, before, after}] 형태. before 는 신청 시점 vendor row 스냅샷 값.
  fields: jsonb("fields").$type<VendorChangeRequestFieldChange[]>().notNull(),
  // 새 사업자등록증 URL(필수). 이미지/PDF objectPath.
  bizCertUrl: text("biz_cert_url").notNull(),
  reason: text("reason"),
  decidedBy: integer("decided_by"),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  decisionReason: text("decision_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type VendorChangeRequest = typeof vendorChangeRequestsTable.$inferSelect;
export type InsertVendorChangeRequest = typeof vendorChangeRequestsTable.$inferInsert;
