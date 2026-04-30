// [Task #132] 파트너 분야 마스터 데이터.
// [Task #734] 2단(대분류·자식) 확장: parent_code (NULL=대분류, 값=부모 code) + active 플래그.
//   - parent_code 는 self-FK 가 아니라 텍스트(code) 참조 — code 의 UNIQUE 제약과
//     본사 관리자 라우트(routes/vendorCategories.ts) 의 부모 검증으로 무결성을 보장한다.
//   - active=false 는 신규 가입 위저드의 옵션에서만 숨긴다 (기존 vendor 의 데이터는 보존).
import { pgTable, text, serial, integer, timestamp, boolean, index } from "drizzle-orm/pg-core";

export const vendorCategoriesTable = pgTable(
  "vendor_categories",
  {
    id: serial("id").primaryKey(),
    code: text("code").notNull().unique(),
    label: text("label").notNull(),
    parentCode: text("parent_code"),
    active: boolean("active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    parentCodeIdx: index("vendor_categories_parent_code_idx").on(t.parentCode),
    activeSortIdx: index("vendor_categories_active_sort_idx").on(t.active, t.sortOrder),
  }),
);

export type VendorCategory = typeof vendorCategoriesTable.$inferSelect;

// [Task #734] 시드 — 사장님 결정 반영:
//   - 'security' (경비) 는 active=false (기존 vendor 데이터는 보존, 신규 가입에서만 숨김).
//   - 신규 대분류 3개: telecom (정보통신) / water_leak (누수) / hvac (냉난방).
//   - 'mechanical' 의 자식에서 '냉난방/온수' 는 새 hvac 대분류로 분리(중복 방지).
//   - 'water_leak', 'hvac', 'other' 는 자식 비움 — 본사 관리자가 화면에서 직접 추가.
export const VENDOR_CATEGORY_SEED: {
  code: string;
  label: string;
  parentCode: string | null;
  sortOrder: number;
  active: boolean;
}[] = [
  // ── 대분류 ───────────────────────────────────────────
  { code: "facility_maintenance", label: "시설 및 영선", parentCode: null, sortOrder: 10, active: true },
  { code: "consumables", label: "소모품 공급", parentCode: null, sortOrder: 20, active: true },
  { code: "cleaning", label: "청소", parentCode: null, sortOrder: 30, active: true },
  { code: "security", label: "경비", parentCode: null, sortOrder: 40, active: false },
  { code: "fire_safety", label: "소방", parentCode: null, sortOrder: 50, active: true },
  { code: "elevator", label: "승강기", parentCode: null, sortOrder: 60, active: true },
  { code: "electrical", label: "전기", parentCode: null, sortOrder: 70, active: true },
  { code: "mechanical", label: "기계설비", parentCode: null, sortOrder: 80, active: true },
  { code: "telecom", label: "정보통신", parentCode: null, sortOrder: 85, active: true },
  { code: "water_leak", label: "누수", parentCode: null, sortOrder: 90, active: true },
  { code: "hvac", label: "냉난방", parentCode: null, sortOrder: 95, active: true },
  { code: "other", label: "기타", parentCode: null, sortOrder: 999, active: true },

  // ── 시설 및 영선 자식 ───────────────────────────────
  { code: "fm_general_repair", label: "일반 보수", parentCode: "facility_maintenance", sortOrder: 1, active: true },
  { code: "fm_painting", label: "도장", parentCode: "facility_maintenance", sortOrder: 2, active: true },
  { code: "fm_waterproofing", label: "방수", parentCode: "facility_maintenance", sortOrder: 3, active: true },
  { code: "fm_tile", label: "미장/타일", parentCode: "facility_maintenance", sortOrder: 4, active: true },
  { code: "fm_carpentry", label: "목공", parentCode: "facility_maintenance", sortOrder: 5, active: true },
  { code: "fm_maintenance_repair", label: "수선유지", parentCode: "facility_maintenance", sortOrder: 6, active: true },

  // ── 소모품 공급 자식 ───────────────────────────────
  { code: "cs_cleaning_supplies", label: "청소 소모품", parentCode: "consumables", sortOrder: 1, active: true },
  { code: "cs_paper_detergent", label: "화장지/세제", parentCode: "consumables", sortOrder: 2, active: true },
  { code: "cs_lighting", label: "형광등/전구", parentCode: "consumables", sortOrder: 3, active: true },
  { code: "cs_filters", label: "필터류", parentCode: "consumables", sortOrder: 4, active: true },

  // ── 청소 자식 ───────────────────────────────────────
  { code: "cl_move_in", label: "입주청소", parentCode: "cleaning", sortOrder: 1, active: true },
  { code: "cl_regular", label: "정기청소", parentCode: "cleaning", sortOrder: 2, active: true },
  { code: "cl_special", label: "특수청소", parentCode: "cleaning", sortOrder: 3, active: true },
  { code: "cl_exterior", label: "외벽 청소", parentCode: "cleaning", sortOrder: 4, active: true },
  { code: "cl_window", label: "유리창 청소", parentCode: "cleaning", sortOrder: 5, active: true },
  { code: "cl_carpet", label: "카펫 청소", parentCode: "cleaning", sortOrder: 6, active: true },

  // ── 소방 자식 ───────────────────────────────────────
  { code: "fs_general_inspection", label: "종합점검", parentCode: "fire_safety", sortOrder: 1, active: true },
  { code: "fs_function_inspection", label: "작동기능 점검", parentCode: "fire_safety", sortOrder: 2, active: true },
  { code: "fs_extinguisher", label: "소화기 점검", parentCode: "fire_safety", sortOrder: 3, active: true },
  { code: "fs_detection_system", label: "자탐설비 점검", parentCode: "fire_safety", sortOrder: 4, active: true },
  { code: "fs_sprinkler", label: "스프링클러 점검", parentCode: "fire_safety", sortOrder: 5, active: true },

  // ── 승강기 자식 ────────────────────────────────────
  { code: "ev_regular_inspection", label: "정기 점검", parentCode: "elevator", sortOrder: 1, active: true },
  { code: "ev_emergency", label: "긴급 출동", parentCode: "elevator", sortOrder: 2, active: true },
  { code: "ev_parts_replacement", label: "부품 교체", parentCode: "elevator", sortOrder: 3, active: true },
  { code: "ev_modernization", label: "현대화 공사", parentCode: "elevator", sortOrder: 4, active: true },

  // ── 전기 자식 ──────────────────────────────────────
  { code: "el_substation", label: "변전실 관리", parentCode: "electrical", sortOrder: 1, active: true },
  { code: "el_safety_inspection", label: "전기안전점검", parentCode: "electrical", sortOrder: 2, active: true },
  { code: "el_lighting_replacement", label: "조명 교체", parentCode: "electrical", sortOrder: 3, active: true },
  { code: "el_construction", label: "전기공사", parentCode: "electrical", sortOrder: 4, active: true },

  // ── 기계설비 자식 ('냉난방/온수' 는 hvac 대분류로 이동) ──
  { code: "me_machine_room", label: "기계실 관리", parentCode: "mechanical", sortOrder: 1, active: true },
  { code: "me_pump_motor", label: "펌프/모터", parentCode: "mechanical", sortOrder: 2, active: true },
  { code: "me_boiler", label: "보일러", parentCode: "mechanical", sortOrder: 3, active: true },

  // ── 정보통신 자식 (사장님 명시 5개) ──────────────────
  { code: "tc_maintenance", label: "정보통신유지관리", parentCode: "telecom", sortOrder: 1, active: true },
  { code: "tc_performance_inspection", label: "정보통신성능점검", parentCode: "telecom", sortOrder: 2, active: true },
  { code: "tc_equipment_repair", label: "정보통신설비 수리", parentCode: "telecom", sortOrder: 3, active: true },
  { code: "tc_internet_repair", label: "인터넷 수리", parentCode: "telecom", sortOrder: 4, active: true },
  { code: "tc_internet_install", label: "인터넷 신규 설치", parentCode: "telecom", sortOrder: 5, active: true },

  // 누수(water_leak) / 냉난방(hvac) / 기타(other): 자식 없음 — 관리자가 화면에서 직접 추가.
];
