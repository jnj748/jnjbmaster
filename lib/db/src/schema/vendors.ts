import { pgTable, text, serial, boolean, real, timestamp, date, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const vendorsTable = pgTable("vendors", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  type: text("type").notNull().default("contracted"),
  contactName: text("contact_name"),
  phone: text("phone"),
  email: text("email"),
  address: text("address"),
  rating: real("rating"),
  isRecommended: boolean("is_recommended").notNull().default(false),
  notes: text("notes"),
  businessRegNumber: text("business_reg_number"),
  representativeName: text("representative_name"),
  serviceArea: text("service_area"),
  subCategories: text("sub_categories"),
  sido: text("sido"),
  sigungu: text("sigungu"),
  profileImageUrl: text("profile_image_url"),
  // [Task #661] 파트너 1줄 소개글(최대 30자, NULL 허용). 가입 위저드/내 정보에서 자유 수정.
  intro: text("intro"),
  // [Task #740 가입흐름재설정] 숨고식 거리 기반 매칭을 위한 컬럼 묶음.
  //   - serviceAddressRoad: 가입 위저드 4단계에서 사장님이 입력한 사업장 도로명 주소.
  //     기존 sido/sigungu 텍스트는 표시·legacy 매칭 fallback 용으로 유지(파괴적 변경 금지).
  //   - serviceLat / serviceLng: 도로명 주소를 카카오 지오코딩한 좌표(중심점).
  //     NULL 이면 거리 매칭은 스킵하고 기존 sido/sigungu fallback 만 사용한다.
  //   - serviceRadiusKm: 사장님이 직접 설정하는 서비스 반경(km). 기본 50.
  //     NOT NULL — 신규 vendor 는 항상 50으로 시작, 기존 vendor 는 마이그레이션이 50 백필.
  serviceAddressRoad: text("service_address_road"),
  serviceLat: real("service_lat"),
  serviceLng: real("service_lng"),
  serviceRadiusKm: integer("service_radius_km").notNull().default(50),
  // [Task #740 가입흐름재설정] 본사 승인 게이트.
  //   가입 위저드 통과 후 본사 검토(사업자등록증/신분증) 가 끝나기 전까지 false →
  //   매칭에서 자동 제외. 본사가 승인하면 true 로 전환되어 RFQ 매칭 풀에 들어간다.
  //   기존 platform vendor 는 마이그레이션이 true 로 grandfather (호환).
  matchingEnabled: boolean("matching_enabled").notNull().default(false),
  // [Task #740 가입흐름재설정] 본사 검토용 인증 자료 객체 URL. 객체 스토리지에 업로드된 후의 영구 경로.
  //   파일 자체는 본사 관리자만 다운로드 권한을 갖는다(라우트 가드 측 책임).
  businessCertUrl: text("business_cert_url"),
  idCardUrl: text("id_card_url"),
  // [Task #740 가입흐름재설정] 카카오 본인확인 결과 — 휴대폰 번호와 검증 시각.
  //   카카오 가입 흐름이 끝나면 채워지고, 본사 승인 시 phone/contactName 의 신뢰 근거가 된다.
  kakaoVerifiedAt: timestamp("kakao_verified_at", { withTimezone: true }),
  kakaoPhone: text("kakao_phone"),
  joinedAt: timestamp("joined_at", { withTimezone: true }),
  contractBuildingName: text("contract_building_name"),
  contractStartDate: date("contract_start_date"),
  contractEndDate: date("contract_end_date"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertVendorSchema = createInsertSchema(vendorsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertVendor = z.infer<typeof insertVendorSchema>;
export type Vendor = typeof vendorsTable.$inferSelect;
