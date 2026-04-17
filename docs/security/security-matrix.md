# 역할 × API 가드 매트릭스 (Task #96, #88 보강)

업데이트: 2026-04-17

## 1. UI 라우트 (permissions.ts) ↔ API requireRole 정합성

| UI route | UI access (sideMenu) | API router | API requireRole | 정합? |
|---|---|---|---|---|
| /units | manager, accountant, platform_admin | units.ts | manager, platform_admin, accountant | ✅ |
| /tenants | manager, accountant, platform_admin | tenants.ts | manager, platform_admin, accountant | ✅ |
| /owners | manager, platform_admin | owners.ts | manager, platform_admin | ✅ |
| /vehicles | manager, platform_admin, facility_staff | vehicles.ts | manager, platform_admin, facility_staff | ✅ (이번 패치) ¹ |
| /facility | manager, platform_admin, facility_staff | facilityDashboard.ts | manager, platform_admin, facility_staff | ✅ |
| /tasks | manager, platform_admin | tasks.ts | manager, platform_admin | ✅ |
| /ai-assistant | manager, platform_admin | aiAssistant/ | manager, platform_admin | ✅ |
| /maintenance-logs | manager, platform_admin, facility_staff | maintenanceLogs.ts | manager, platform_admin, facility_staff | ✅ |
| /safety-training | manager, platform_admin, facility_staff, hq_executive | safetyTrainings.ts | manager, platform_admin, hq_executive | ⚠️ facility_staff 있음, API 누락 |
| /accounting, /metering, /billing | manager, platform_admin, accountant | (multiple) | manager, platform_admin, accountant | ✅ |
| /tenant-card-tokens (내부) | manager, platform_admin | tenantCardTokens.ts | manager, platform_admin | ✅ |
| /complaints/analytics | hq_executive, platform_admin | index.ts inline | hq_executive, platform_admin | ✅ |
| /platform-settings PUT | platform_admin | platformSettings.ts | platform_admin, hq_executive | ⚠️ hq_executive 추가됨 |

`buildingRouter` 공통 가드(index.ts:75): `manager, platform_admin, hq_executive, accountant, facility_staff`

**권장**: `/safety-training` API 에 facility_staff 추가 검토(별도 작업).

¹ **/vehicles 의 facility_staff 접근은 의도된 정책**: 시설기사가 관리동
   주차/출입 점검 업무를 수행하므로 `manager-app/src/lib/permissions.ts:214`
   에서 `access: ["manager","platform_admin","facility_staff"]` 로 명시.
   API 가드는 이 UI 정책과 일치하도록 동일 3-역할로 설정. 차량번호/연락처
   마스킹은 별도 후속(#98)에서 다룸.

## 2. 입주자 PII 라우트 차단 결과

| 라우트 | manager | accountant | facility_staff | hq_executive | platform_admin |
|---|---|---|---|---|---|
| GET /tenants/* | ✅ | ✅ | ❌ 403 | ❌ 403 | ✅ |
| GET /owners/* | ✅ | ❌ 403 | ❌ 403 | ❌ 403 | ✅ |
| GET /vehicles/* | ✅ | ❌ 403 (이번 패치) | ✅ | ❌ 403 (이번 패치) | ✅ |
| GET /units/:id | ✅ | ✅ | ❌ 403 | ❌ 403 | ✅ |
| GET /tenant-card-tokens | ✅ | ❌ 403 | ❌ 403 | ❌ 403 | ✅ |
| POST /public/tenant-card/* | 토큰 기반 (인증 불필요), 만료/사용 검증 후 허용 | | | | |

**이번 패치 변경**: 차량 라우트가 단일 핸들러 단위로만 `adminOnly` 가드를
가지고 있어, list/detail/patch/delete 가 hq_executive·accountant 에 노출돼
있었음. 라우터 진입부에 `requireRole("manager","platform_admin","facility_staff")`
적용으로 PII (소유자명·연락처·차량번호) 노출 차단.

## 3. Cross-Building 스코핑 (이번 패치 핵심)

스코핑 패턴:
- 직접 buildingId 컬럼 보유: `units`, `vehicles`, `tenant_card_tokens`,
  `inspections`, `meters`, `complaints`, `votes`, `delinquency`,
  `warranties`, `contracts`, `management_contract_templates`, `meters`,
  `fees`, `maintenance_logs`, `safety_checklists`, `safety_trainings`
  → `eq(table.buildingId, buildingId)` where 절 사용.
- 간접(unitId 경유): `tenants`, `owners`
  → `inArray(table.unitId, db.select({id: unitsTable.id}).from(unitsTable).where(eq(unitsTable.buildingId, buildingId)))`

| 라우트 | 수정 전 | 수정 후 |
|---|---|---|
| GET /tenants (list) | 전체 노출 ❌ | unit 서브쿼리 스코프 ✅ |
| GET /tenants/:id | 전체 ID 조회 ❌ | unit 서브쿼리 스코프 ✅ |
| PATCH /tenants/:id | 전체 ID 수정 ❌ | unit 서브쿼리 스코프 ✅ |
| DELETE /tenants/:id | 전체 ID 삭제 ❌ | unit 서브쿼리 스코프 ✅ |
| POST /tenants/:id/verify | 부분 검증만 | fetchTenantInBuilding 으로 단일 진입 검증 ✅ |
| GET /owners 전체 | 동일 패턴 ❌ | unit 서브쿼리 스코프 ✅ |
| PATCH/DELETE /owners/:id | 동일 패턴 ❌ | unit 서브쿼리 스코프 ✅ |
| GET /vehicles 전체 | buildingId 필터 없음 ❌ | `eq(buildingId, X)` ✅ |
| GET/PATCH/DELETE /vehicles/:id | 동일 ❌ | `eq(buildingId, X)` ✅ |
| /vehicles/unregistered, /inspection | 전 건물 카운트 ❌ | building 스코프 ✅ |
| /vehicles/:id/cancel, batch-cancel, history | 동일 ❌ | building 스코프 ✅ |
| GET /units/* | 이미 buildingId 스코프 | (변경 없음) |
| /tenant-card-tokens | 이미 buildingId 스코프 | (변경 없음) |

## 4. 유틸리티

신규 헬퍼 `artifacts/api-server/src/middlewares/buildingScope.ts:getUserBuildingId(req)` —
units.ts, tenantCardTokens.ts, complaints.ts, inspections.ts 등 기존 인라인
구현을 단일 import 로 통합 가능 (점진 마이그레이션은 별도).

## 5. 6-역할 PII 가드 매트릭스 (회귀 픽스처)

회귀 스크립트가 실제로 검증하는 표 — 셀 = 기대 HTTP status.
역할: M=manager / A=accountant / F=facility_staff / H=hq_executive /
PA=platform_admin / P=partner.

| Endpoint               | M   | A   | F   | H   | PA       | P       |
|------------------------|-----|-----|-----|-----|----------|---------|
| GET /tenants           | 200 | 200 | 403 | 403 | 200/401* | 401/403 |
| GET /tenants/:id (own) | 200 | 200 | 403 | 403 | 200/401* | 401/403 |
| GET /tenants/:id (foreign building) | 404 (다른 빌딩 manager) | — | — | — | — | — |
| GET /owners            | 200 | 403 | 403 | 403 | 200/401* | 401/403 |
| GET /vehicles          | 200 | 403 | 200 | 403 | 200/401* | 401/403 |
| GET /tenant-card-tokens | 200 | 403 | 403 | 403 | 200/401* | 401/403 |
| GET /public/tenant-card/:badtoken | ≠200 (모든 익명) | | | | | |

\* platform_admin 시드는 building 바인딩이 없어 200(빈 목록)이거나 401(빌딩
필수 가드) 양쪽 모두 허용. 핵심 보안 속성은 “다른 역할이 PII를 보지 못함”.

## 6. 회귀 테스트 실행

`scripts/test-cross-building-security.mjs` — fail-hard:
- 6개 시드 계정(M/A/F/H/PA/P) 로그인이 모두 성공해야 함 (없으면 FAIL).
- 위 매트릭스 셀을 전부 단언; 결과는 stdout `N passed, M failed`.
- exit code: 실패 1건이라도 있으면 1.

실행 (API 서버 구동 중):
```sh
node scripts/test-cross-building-security.mjs
```
