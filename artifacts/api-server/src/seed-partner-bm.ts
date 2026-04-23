import {
  db,
  platformSettingsTable,
  creditCategoryPricingTable,
  commissionRatesTable,
} from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { RFQ_CATEGORY_LABELS } from "@workspace/shared/rfq-service-types";

// Categories aligned with RFQ category enum in openapi.yaml
// enum: [elevator, water_tank, fire_safety, electrical, gas, septic, cleaning, security, waterproofing, maintenance_repair, defect_diagnosis, building_maintenance, mechanical, other]

const PRICING: Array<{ category: string; tier: 1 | 2 | 3; creditCost: number; description: string }> = [
  // Tier 1: regular / simple (1 credit)
  { category: "cleaning", tier: 1, creditCost: 1, description: "정기/단순 (방역, 저수조 청소 등)" },
  { category: "water_tank", tier: 1, creditCost: 1, description: "정기/단순 (수질 검사 등)" },
  { category: "gas", tier: 1, creditCost: 1, description: "정기/단순 (공기질/가스 점검)" },
  { category: "septic", tier: 1, creditCost: 1, description: "정기/단순 (정화조)" },
  { category: "security", tier: 1, creditCost: 1, description: "정기/단순" },
  // Tier 2: statutory inspections (3 credits)
  { category: "elevator", tier: 2, creditCost: 3, description: "법정 필수 점검 (승강기 자체점검)" },
  { category: "fire_safety", tier: 2, creditCost: 3, description: "법정 필수 점검 (소방 작동/정밀)" },
  { category: "electrical", tier: 2, creditCost: 3, description: "법정 필수 점검 (전기안전관리)" },
  { category: "mechanical", tier: 2, creditCost: 3, description: "법정 필수 점검 (기계설비 성능)" },
  // Tier 3: large non-regular construction (5 credits)
  { category: "waterproofing", tier: 3, creditCost: 5, description: "고액/비정기 공사 (방수)" },
  { category: "maintenance_repair", tier: 3, creditCost: 5, description: "고액/비정기 공사 (부품교체/대형설비수리)" },
  { category: "building_maintenance", tier: 3, creditCost: 5, description: "고액/비정기 공사 (외벽도장/청소)" },
  { category: "defect_diagnosis", tier: 3, creditCost: 5, description: "고액/비정기 공사 (하자 진단)" },
  { category: "other", tier: 3, creditCost: 5, description: "기타 고액/비정기 공사" },
];

const FIXED_CATEGORIES = [
  "cleaning",
  "water_tank",
  "gas",
  "septic",
  "security",
  "elevator",
  "fire_safety",
  "electrical",
  "mechanical",
];

const SLIDING_CATEGORIES = [
  "waterproofing",
  "maintenance_repair",
  "building_maintenance",
  "defect_diagnosis",
  "other",
];

const SLIDING_RULES_JSON = JSON.stringify([
  { minAmount: 0, maxAmount: 5_000_000, ratePercent: 10 },
  { minAmount: 5_000_000, maxAmount: 20_000_000, ratePercent: 7 },
  { minAmount: 20_000_000, maxAmount: null, ratePercent: 5 },
]);

const COMMISSION_RATES: Array<{
  category: string;
  rateType: "fixed" | "sliding";
  fixedRate: number;
  slidingRules: string | null;
  description: string;
}> = [
  ...FIXED_CATEGORIES.map((c) => ({
    category: c,
    rateType: "fixed" as const,
    fixedRate: 5,
    slidingRules: null,
    description: "정기/법정 서비스 5% 고정",
  })),
  ...SLIDING_CATEGORIES.map((c) => ({
    category: c,
    rateType: "sliding" as const,
    fixedRate: 5,
    slidingRules: SLIDING_RULES_JSON,
    description: "비정기/대형 공사 슬라이딩",
  })),
];

const SETTINGS: Array<{ key: string; value: string; description: string }> = [
  { key: "credits_enabled", value: "true", description: "파트너 크레딧 차감 기능 ON/OFF" },
  { key: "auto_commission_enabled", value: "false", description: "성공 수수료 자동 발생 ON/OFF" },
];

export async function seedPartnerBm(): Promise<void> {
  for (const s of SETTINGS) {
    const existing = await db.select().from(platformSettingsTable).where(eq(platformSettingsTable.key, s.key));
    if (existing.length === 0) {
      await db.insert(platformSettingsTable).values(s);
    }
  }

  for (const p of PRICING) {
    const existing = await db.select().from(creditCategoryPricingTable).where(eq(creditCategoryPricingTable.category, p.category));
    if (existing.length === 0) {
      await db.insert(creditCategoryPricingTable).values({
        ...p,
        // [Task #312] 신규 카테고리 행 시드 시 한글 표시명도 함께 채운다.
        displayNameKo: RFQ_CATEGORY_LABELS[p.category] ?? null,
      });
    }
  }

  // [Task #312] 기본 단가 행(sido/sigungu = NULL)에 display_name_ko 가 비어 있으면
  //   하드코딩된 RFQ_CATEGORY_LABELS 값으로 백필 한다. 이미 관리자가 수정한 값은
  //   덮어쓰지 않는다(NULL 인 행만 갱신).
  for (const [code, label] of Object.entries(RFQ_CATEGORY_LABELS)) {
    await db
      .update(creditCategoryPricingTable)
      .set({ displayNameKo: label })
      .where(and(
        eq(creditCategoryPricingTable.category, code),
        sql`${creditCategoryPricingTable.sido} IS NULL`,
        sql`${creditCategoryPricingTable.sigungu} IS NULL`,
        sql`${creditCategoryPricingTable.displayNameKo} IS NULL`,
      ));
  }

  for (const r of COMMISSION_RATES) {
    const existing = await db.select().from(commissionRatesTable).where(eq(commissionRatesTable.category, r.category));
    if (existing.length === 0) {
      await db.insert(commissionRatesTable).values(r);
    }
  }
}
