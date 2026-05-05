/**
 * [Task #256] 5색 채도 카테고리 팔레트 (관리소장 모드 기준)
 *
 * 관리소장 앱 전반에서 카테고리(시설/회계/입주민/보고·결재/시스템)별로 일관된
 * 색을 쓰기 위한 단일 출처. 화면별로 색을 직접 지정하던 코드(특히 파란 단색
 * 아이콘)는 이 매핑을 참조해 한 화면에 여러 카테고리가 섞일 때 색만으로도
 * 구분이 되도록 한다.
 *
 * 설계 원칙
 * 1) 5색, 채도 위주(고채도 톤). 무채색·연파스텔 위주는 사용하지 않는다.
 * 2) 무지개 순서(빨주노초파남보)는 의도적으로 사용하지 않는다.
 *    카테고리 토큰 선언 순서/색상환 인접도가 무지개 순열이 되지 않도록 비대칭
 *    배치했다. (sky 200° → teal 170° → fuchsia 290° → violet 270° → orange 30°)
 * 3) 한 화면에 자주 함께 노출되는 카테고리끼리는 색상환에서 멀리 떨어진 색을
 *    갖도록 한다. 예) 관리소장 하단 네비는 시설(teal)·AI비서(fuchsia)·업무일지(sky)
 *    순으로, 각각 270°/130°/90° 떨어져 인접 대비가 충분하다.
 * 4) 위험/경고/연체 같은 상태 색(빨강 0° 계열)은 카테고리 팔레트에서 제외하고
 *    `destructive`/`amber-warning` 등 상태색 토큰만 사용한다. 카테고리에 사용된
 *    `orange`(30°)는 상태 빨강(0°)과 색상·채도가 충분히 떨어진다.
 * 5) 라이트/다크 모드 모두 WCAG AA 대비를 만족하도록 600 톤(light bg)을 기본으로
 *    삼고, 옅은 배경은 50 톤을 사용한다. (Tailwind 표준 팔레트)
 */

import type { Group } from "./permissions";

export type CategoryToken =
  | "facility"      // 시설/유지보수
  | "accounting"    // 관리비/회계
  | "residents"     // 입주민/민원
  | "reports"       // 결재/보고/문서
  | "system";       // AI · 일정 · 설정 등 시스템/기타

/**
 * 카테고리 → 아이콘 텍스트 색.
 * 라이트 모드는 600 톤(흰 배경 위 AA 만족), 다크 모드는 400 톤(어두운 배경 위
 * AA 만족)으로 자동 전환된다.
 */
export const CATEGORY_ICON_CLASS: Record<CategoryToken, string> = {
  facility:   "text-teal-600 dark:text-teal-400",
  accounting: "text-orange-600 dark:text-orange-400",
  residents:  "text-violet-600 dark:text-violet-400",
  reports:    "text-sky-600 dark:text-sky-400",
  system:     "text-fuchsia-600 dark:text-fuchsia-400",
};

/**
 * 카테고리 → 옅은 배경 (아이콘 칩/배지 배경용).
 * 다크 모드에서는 같은 hue 의 900/30 으로 전환해 칩이 배경에서 떠 보이게 한다.
 */
export const CATEGORY_BG_CLASS: Record<CategoryToken, string> = {
  facility:   "bg-teal-50 dark:bg-teal-900/30",
  accounting: "bg-orange-50 dark:bg-orange-900/30",
  residents:  "bg-violet-50 dark:bg-violet-900/30",
  reports:    "bg-sky-50 dark:bg-sky-900/30",
  system:     "bg-fuchsia-50 dark:bg-fuchsia-900/30",
};

/** 카테고리 → 진한 배경 (StatCard 같이 흰 아이콘이 올라가는 채도 칩용). */
export const CATEGORY_SOLID_BG_CLASS: Record<CategoryToken, string> = {
  facility:   "bg-teal-500",
  accounting: "bg-orange-500",
  residents:  "bg-violet-500",
  reports:    "bg-sky-500",
  system:     "bg-fuchsia-500",
};

/**
 * 라우트 그룹 → 카테고리 토큰 매핑.
 * `permissions.ts` 의 `Group` 과 1:1 매칭한다. dashboard/marketplace/settings 는
 * 본질적으로 시스템·기타 흐름에 가까워 system 으로 묶었다.
 */
export const GROUP_TO_CATEGORY: Record<Group, CategoryToken> = {
  dashboard:   "system",
  facility:    "facility",
  accounting:  "accounting",
  // [Task #859] manager 전용 "회계 결과 열람" 그룹 — 회계 도메인과 동일한 색 토큰 사용.
  accounting_readonly: "accounting",
  reports:     "reports",
  residents:   "residents",
  marketplace: "system",
  settings:    "system",
};

/**
 * 업무일지 entry 카테고리 → 공통 카테고리 토큰.
 * [직책별 일보 분리] 소장(facility/bill/complaint) 외에
 *   경리(receivable/expense/draft/complaint),
 *   시설(fire/electric/mechanical/other) 카테고리도 매핑한다.
 * 한 화면에 여러 직책 entries 가 섞여 보이는 매니저 보고서에서도 색만 보고
 * 직책·도메인을 구분할 수 있도록 token 을 도메인 의미 기준으로 부여했다.
 */
export const WORK_LOG_CATEGORY_TOKEN: Record<string, CategoryToken> = {
  // manager
  facility:   "facility",
  bill:       "accounting",
  complaint:  "residents",
  admin:      "reports",
  // accountant
  receivable: "accounting",
  expense:    "accounting",
  draft:      "reports",
  // facility_staff
  fire:       "facility",
  electric:   "facility",
  mechanical: "facility",
  other:      "system",
};
