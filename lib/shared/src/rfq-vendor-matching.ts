// [Task #698] 파트너(vendor) ↔ RFQ 매칭 단일 진입점.
//
// 배경:
// - 매칭 코드가 routes/rfqs.ts (5군데) + routes/dashboard.ts (1군데) 에 흩어져
//   있고, 모두 옛 단일값 컬럼(vendor.category, vendor.sido, vendor.sigungu)
//   기준의 정확 1:1 비교만 수행했다.
// - 위저드(#661) 가 도입한 신규 컬럼 — vendor.subCategories(콤마 리스트),
//   vendor.serviceArea(JSON {nationwide, bySido}) — 을 매칭 시점에 전혀
//   읽지 않아, 사장님이 "전국 + 모든 분야" 를 켰는데도 옛 단일값이 비어
//   있으면 모든 RFQ 매칭에서 탈락했다.
// - 또한 일부 vendor.category 가 옛 자유 입력 시절의 한글 라벨("방수/도장",
//   "하자진단" 등) 로 남아 있어 RFQ 의 영문 enum 코드("waterproofing",
//   "defect_diagnosis") 와 정확 비교가 깨졌다.
//
// 이 모듈이 단일 진입점이 되어:
//   1) 카테고리: vendor.category(대표) + vendor.subCategories(추가) 합집합.
//      한글 라벨은 영문 코드로 정규화한 뒤 비교.
//   2) 지역: vendor.serviceArea.nationwide=true 면 무조건 통과.
//      bySido 에 RFQ 시도가 있고 시군구 단위 RFQ 면 시군구 일치(또는 시도
//      전체 커버 = 빈 배열) 까지 확인. serviceArea 가 없거나 RFQ 시도를
//      커버하지 않으면 옛 단일값 vendor.sido/sigungu 로 fallback 비교.
//   3) RFQ 시도가 비어 있으면(전국 RFQ) 지역 검사 통과.
//   4) vendor.type !== "platform" 은 매칭 대상에서 제외 (계약형 vendor 는
//      RFQ 자동 매칭 대상이 아님 — 직접 초대로만 vendor_ids 에 들어감).

export interface VendorMatchProfile {
  type?: string | null;
  category?: string | null;
  subCategories?: string | null; // "code1,code2,..." 또는 한글 라벨 콤마 리스트
  serviceArea?: string | null; // JSON 문자열 {nationwide?: bool, bySido?: {시도: 시군구[]}}
  sido?: string | null;
  sigungu?: string | null;
}

export interface RfqMatchProfile {
  category: string;
  sido?: string | null;
  sigungu?: string | null;
  geoScope?: string | null; // "sido" | "sigungu" | null
}

// 한글 라벨 → 영문 enum 코드 매핑.
// vendor 의 옛 한글값(예: "방수/도장")을 RFQ 의 영문 코드("waterproofing") 와
// 비교 가능하게 정규화하기 위한 lookup table.
// rfq-service-types 의 RFQ_CATEGORY_LABELS 역방향 + 흔한 변형(슬래시·줄임말).
const KOREAN_LABEL_TO_CODE: Record<string, string> = {
  "승강기": "elevator",
  "엘리베이터": "elevator",
  "저수조": "water_tank",
  "물탱크": "water_tank",
  "소방": "fire_safety",
  "전기": "electrical",
  "가스": "gas",
  "정화조": "septic",
  "청소": "cleaning",
  "보안": "security",
  "방수": "waterproofing",
  "방수/도장": "waterproofing",
  "도장": "waterproofing",
  "영선/수선유지": "maintenance_repair",
  "영선": "maintenance_repair",
  "수선유지": "maintenance_repair",
  "하자진단": "defect_diagnosis",
  "하자": "defect_diagnosis",
  "건물관리": "building_maintenance",
  "기계설비": "mechanical",
  "기계": "mechanical",
  "기타": "other",
};

// 알려진 영문 코드(라벨 매핑의 값들). normalize 시 "이미 코드" 인지 빠르게 판별.
const KNOWN_CODES: Set<string> = new Set(Object.values(KOREAN_LABEL_TO_CODE));

// [Task #734] 카테고리 자식 → 부모 매핑.
//   2단 카테고리(대분류·자식) 도입에 따라, vendor 가 자식만 선택해도 RFQ 가
//   부모 대분류로 들어오면 매칭되도록 한다. 호출 측(api-server 부팅)이
//   vendor_categories 마스터를 한 번 읽어 setCategoryParentMap() 으로 주입한다.
//   본사 관리자가 카테고리를 추가/수정/비활성하면 routes/vendorCategories.ts
//   에서 reloadCategoryParentMap() 으로 즉시 갱신한다.
//   주입 전(빈 맵)에는 자동 부모 포함 없이 기존 동작과 동일하게 작동한다.
let CATEGORY_PARENT_MAP: Record<string, string> = {};

export function setCategoryParentMap(map: Record<string, string>): void {
  CATEGORY_PARENT_MAP = { ...map };
}

export function getCategoryParentMap(): Readonly<Record<string, string>> {
  return CATEGORY_PARENT_MAP;
}

/**
 * 카테고리 정규화. 한글 라벨이면 영문 코드로 매핑, 영문 코드면 그대로.
 * 모르는 값은 trimmed 원문 그대로(엄격하지 않게 — 미래 enum 추가에 견고).
 */
export function normalizeRfqCategory(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (KNOWN_CODES.has(trimmed)) return trimmed;
  if (KOREAN_LABEL_TO_CODE[trimmed]) return KOREAN_LABEL_TO_CODE[trimmed];
  return trimmed;
}

/**
 * vendor 가 커버하는 카테고리 코드 집합.
 *   = normalize(vendor.category) ∪ normalize(vendor.subCategories 콤마 분리)
 *   ∪ [Task #734] 각 코드의 부모 대분류 (CATEGORY_PARENT_MAP 으로 자동 확장)
 *
 * 부모 자동 확장 의도:
 *   - vendor 가 자식만 선택(예: 'cl_window' 유리창청소)해도 RFQ 가 부모만
 *     적어 오면(예: 'cleaning' 청소) 매칭 통과.
 *   - 반대 방향(부모만 가진 vendor 가 자식 RFQ 매칭) 은 의도적으로 막는다 —
 *     특화 서비스 매칭 정밀도 보존.
 */
export function getVendorCategoryCodes(vendor: VendorMatchProfile): Set<string> {
  const codes = new Set<string>();
  const single = normalizeRfqCategory(vendor.category ?? null);
  if (single) codes.add(single);
  if (vendor.subCategories) {
    for (const piece of vendor.subCategories.split(",")) {
      const code = normalizeRfqCategory(piece);
      if (code) codes.add(code);
    }
  }
  // [Task #734] 자식 → 부모 자동 추가. 부모도 다시 부모 가질 일 없음(2단 고정).
  for (const code of Array.from(codes)) {
    const parent = CATEGORY_PARENT_MAP[code];
    if (parent) codes.add(parent);
  }
  return codes;
}

export function vendorCoversCategory(
  vendor: VendorMatchProfile,
  rfqCategory: string | null | undefined,
): boolean {
  const target = normalizeRfqCategory(rfqCategory ?? null);
  if (!target) return false;
  return getVendorCategoryCodes(vendor).has(target);
}

interface ServiceAreaShape {
  nationwide?: boolean;
  bySido?: Record<string, string[] | undefined>;
}

function parseServiceArea(raw: string | null | undefined): ServiceAreaShape | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed as ServiceAreaShape;
  } catch {
    /* malformed → fall back to legacy single-value columns */
  }
  return null;
}

export function vendorCoversRegion(
  vendor: VendorMatchProfile,
  rfqSido: string | null | undefined,
  rfqSigungu: string | null | undefined,
  geoScope: string | null | undefined,
): boolean {
  // RFQ 에 지역 정보가 없으면 모든 vendor 통과 (전국 단위 공고).
  if (!rfqSido) return true;

  const area = parseServiceArea(vendor.serviceArea ?? null);
  if (area) {
    if (area.nationwide) return true;
    const sigunguList = area.bySido?.[rfqSido];
    if (Array.isArray(sigunguList)) {
      // 시군구 단위 RFQ 면 vendor 의 시군구 리스트가 비어 있거나(=시도 전체 커버)
      // 명시적으로 일치 항목이 있어야 통과.
      if (geoScope === "sigungu" && rfqSigungu) {
        if (sigunguList.length === 0) return true;
        return sigunguList.includes(rfqSigungu);
      }
      // 시도 단위 RFQ 또는 시군구 정보 부재 → 등록만 돼 있으면 통과.
      return true;
    }
    // serviceArea JSON 은 있는데 RFQ 시도가 bySido 에 없음 → fallback 단일값으로 한 번 더 확인.
  }

  // Fallback: 옛날 단일값 컬럼 (#661 위저드 이전 vendor).
  if (vendor.sido) {
    if (vendor.sido !== rfqSido) return false;
    if (geoScope === "sigungu" && rfqSigungu && vendor.sigungu) {
      return vendor.sigungu === rfqSigungu;
    }
    return true;
  }

  // serviceArea 도 없고 vendor.sido 도 비어 있으면 활동 지역 미설정 vendor.
  // 매칭에서 제외 (사장님이 위저드를 끝까지 채우지 않은 미완 vendor 보호).
  return false;
}

/**
 * 단일 매칭 진입점. 카테고리 + 지역 + platform 타입을 모두 만족해야 true.
 * 직접 초대(rfq.vendor_ids 명시) 는 이 함수의 책임이 아니다 — 호출 측에서
 * "직접 초대 OR vendorMatchesRfq" 로 OR 조합한다.
 */
export function vendorMatchesRfq(
  vendor: VendorMatchProfile,
  rfq: RfqMatchProfile,
): boolean {
  if ((vendor.type ?? "") !== "platform") return false;
  if (!vendorCoversCategory(vendor, rfq.category)) return false;
  if (!vendorCoversRegion(vendor, rfq.sido ?? null, rfq.sigungu ?? null, rfq.geoScope ?? null)) {
    return false;
  }
  return true;
}
