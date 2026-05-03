# 경리(accountant) 구코드 격리 보관소

[Task #772 — T1] 경리 화면 전면 개편(T2~T10)의 기반 작업으로,
현재 운영 중인 경리 페이지·위젯·온보딩·역할 가드 정의의 스냅샷을
이 디렉터리에 보관한다.

## 정책
- 이 디렉터리는 **빌드/타입체크에서 제외**된다(`tsconfig.json` `exclude`).
  앱 코드에서는 절대 임포트하지 않는다.
- 후속 엔진 태스크(T2~T10)에서 "구코드 검토 보고" 섹션의 동일 도메인
  페이지를 작성할 때 참조용으로만 사용한다.
- 원본 파일은 그대로 유지되며 신코드와 함께 운영된다 — 보관본은 어디까지나
  "원본이 더 변형되기 전 시점"의 스냅샷이다.

## 보관 일자
2026-05-03 (T1 시점 스냅샷)

## 라우트·가드·사이드바 정의 참조 위치 (스냅샷 미동봉)
경리에 적용되던 라우트/접근 가드/사이드바 정의는 단일 진리 원천인
`artifacts/manager-app/src/lib/permissions.ts` 안에 인라인으로 존재하므로,
별도 파일로 떼어내 보관하지 않는다(같은 파일 안의 다른 역할 정의와
얽혀 있어 분리 시 의미를 잃음). T1 시점 스냅샷이 필요하면 git 히스토리에서
다음 위치를 참조한다:
- `ROUTES[]` 의 access/sideMenu 에 `accountant` 가 포함된 모든 엔트리
  (T1 직전 시점 ~line 272–893 부근).
- `GROUP_ORDER_BY_ROLE.accountant` (T1 직전: dashboard/accounting/facility/
  reports/residents/marketplace).
- `GROUP_TITLES` 의 7개 구코드 그룹 라벨.

T1 적용 후에는 `accountantSidebar()` 가 신 IA 8 그룹을 직접 구성하며,
`GROUP_ORDER_BY_ROLE.accountant` 는 더 이상 경리 사이드바 노출에 영향을
주지 않는다(다른 역할 fallback 용으로만 남음).

## 보관 인벤토리

| 보관본 파일                              | 원본 경로                                                                              |
| ---------------------------------------- | -------------------------------------------------------------------------------------- |
| accountant-dashboard.tsx                 | artifacts/manager-app/src/pages/accountant-dashboard.tsx                               |
| accounting-hub.tsx                       | artifacts/manager-app/src/pages/erp/accounting-hub.tsx                                 |
| phase-1-metering.tsx                     | artifacts/manager-app/src/pages/erp/phase-1-metering.tsx                               |
| phase-2-accounting.tsx                   | artifacts/manager-app/src/pages/erp/phase-2-accounting.tsx                             |
| phase-3-billing.tsx                      | artifacts/manager-app/src/pages/erp/phase-3-billing.tsx                                |
| phase-4-governance.tsx                   | artifacts/manager-app/src/pages/erp/phase-4-governance.tsx                             |
| building-records.tsx                     | artifacts/manager-app/src/pages/erp/building-records.tsx                               |
| bills.tsx                                | artifacts/manager-app/src/pages/erp/bills.tsx                                          |
| fees-summary.tsx                         | artifacts/manager-app/src/pages/erp/fees-summary.tsx                                   |
| expense-voucher-inbox.tsx                | artifacts/manager-app/src/pages/expense-voucher-inbox.tsx                              |
| approvals.tsx                            | artifacts/manager-app/src/pages/approvals.tsx                                          |
| drafts.tsx                               | artifacts/manager-app/src/pages/drafts.tsx                                             |
| tax-schedules.tsx                        | artifacts/manager-app/src/pages/tax-schedules.tsx                                      |
| commissions.tsx                          | artifacts/manager-app/src/pages/commissions.tsx                                        |
| accountant-member-search-widget.tsx      | artifacts/manager-app/src/components/dashboard-widgets/widgets/accountant-member-search-widget.tsx |
| accountant-delinquency-list-widget.tsx   | artifacts/manager-app/src/components/dashboard-widgets/widgets/accountant-delinquency-list-widget.tsx |
| onboarding-accountant-wizard.tsx         | artifacts/manager-app/src/pages/onboarding/accountant-wizard.tsx                       |
| onboarding-accountant-setup.tsx          | artifacts/manager-app/src/pages/onboarding/accountant-setup.tsx                        |
| work-log/                                | artifacts/manager-app/src/pages/work-log/ (전체 디렉터리)                              |
| tenants.tsx                              | artifacts/manager-app/src/pages/tenants.tsx                                            |
| units.tsx                                | artifacts/manager-app/src/pages/units.tsx                                              |
| safety-checklists.tsx                    | artifacts/manager-app/src/pages/safety-checklists.tsx                                  |
| manager-notice-templates.tsx             | artifacts/manager-app/src/pages/manager-notice-templates.tsx                           |
| contracts.tsx                            | artifacts/manager-app/src/pages/contracts.tsx                                          |
| building-vendor-directory.tsx            | artifacts/manager-app/src/pages/building-vendor-directory.tsx                          |
| calendar.tsx                             | artifacts/manager-app/src/pages/calendar.tsx                                           |
| settings.tsx                             | artifacts/manager-app/src/pages/settings.tsx                                           |

## 신코드 IA 매핑(요약)
- 오늘의 한눈 대시보드 ← /work-log (보존)
- 부과엔진 ← /units (보존), 자동분개·부과기준 등 신규는 Coming Soon
- 지출·문서·결재 ← /commissions, /expense-vouchers, /approvals, /drafts (보존)
- 회계 엔진 ← /erp/accounting, /tax-schedules (보존), 총계정원장·재무상태표·손익계산서 신규는 Coming Soon
- 검침·고지·수납 ← /erp/metering, /erp/billing, /erp/bills, /erp/fees-summary (보존)
- 보고·마감 ← /erp/building-records (보존), 월마감/연마감 신규는 Coming Soon
- 설정 ← /settings/profile, /settings/building
- 입주민·시설·파트너(보존 그룹) ← /tenants, /erp/governance, /safety-checklists, /notices/templates, /contracts, /building/vendor-directory
