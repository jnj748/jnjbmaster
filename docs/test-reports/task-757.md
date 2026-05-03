# Task #757 — 필수/제안업무 템플릿 변경의 직원권한 반영 e2e 검증 리포트

## 개요
관리자(소장/플랫폼)가 task template (필수업무·제안업무) 을 추가·수정·삭제했을 때
같은 건물의 직원권한 사용자(시설기사·경리)의 응답·UI 에 변경이 반영되는지 회귀
차단 e2e 로 검증했다. 본 과제는 verification-only — 코드 수정은 하지 않았다.

## 산출물
- 테스트 스펙: `artifacts/manager-app/e2e/task-template-role-propagation.spec.ts`
- 본 리포트: `docs/test-reports/task-757.md`

실행:
```
pnpm --filter @workspace/manager-app run e2e -- task-template-role-propagation
```

마지막 실행 결과: **3 passed / 2 skipped(test.fixme — 알려진 회귀 잠금)**.

## 환경
- 빌딩 #1 (데모).
- DEV 시드 사용자: `admin@test.com` / `manager@test.com` / `facility@test.com` /
  `accountant@test.com`, 비밀번호 `test1234!`.
- 모든 E2E 템플릿은 `[E2E-<RUN>]` 접두로 격리 + finally 블록에서 cleanup.

## 활성(active) 검증 시나리오 (✅)

### 1) "필수업무 추가/수정/삭제가 시설기사·경리 응답에 정확히 반영"
스펙 위치: `task-template-role-propagation.spec.ts` line 181.

| 검증 항목 | 결과 |
|---|---|
| explicit `targetRoles=["manager","facility_staff"]` 시설 mandatory 추가 → 시설기사 응답에 노출, 경리 응답 비노출 | ✅ |
| explicit `targetRoles=["manager","accountant"]` 회계 mandatory 추가 → 경리 응답에만 노출 | ✅ |
| `targetRoles=[]` + `taskType="accounting"` 휴리스틱 → 경리에만 노출(시설기사 비노출) | ✅ |
| `PATCH title` + `PATCH advanceAlertDays` → 시설기사 응답이 새 제목으로 즉시 갱신, 옛 제목 비노출 | ✅ |
| `PATCH targetRoles` 변경 (시설→경리) → 시설기사 응답에서 사라지고 경리 응답에 등장 | ✅ |
| `PATCH isActive=false` → 해당 역할 응답에서 즉시 제거 | ✅ |
| `DELETE` → 해당 역할 응답에서 즉시 제거 | ✅ |

### 2) "관리소장 — 제안업무 추가/수정/삭제가 본인 화면(API + 위젯) 에 정확히 반영"
스펙 위치: `task-template-role-propagation.spec.ts` line 280.

| 검증 항목 | 결과 |
|---|---|
| `category=suggested` 알림이 `/api/dashboard/alerts` 응답에 `type="task_template_suggested"` 로 노출 | ✅ |
| `category=mandatory` 알림이 같은 응답에 `type="task_template_mandatory"` 로 노출 | ✅ |
| 매니저 대시보드 위젯의 `link-view-all-mandatory` 카드 헤더 노출 | ✅ |
| 매니저 대시보드 위젯의 `link-view-all-suggested` 카드 헤더 노출 | ✅ |
| `PATCH category=suggested` 후 알림 type 이 `task_template_suggested` 로 즉시 전환 | ✅ |
| `PATCH isActive=false` 후 응답에서 즉시 제거 | ✅ |
| `DELETE` 후 응답에서 즉시 제거 | ✅ |

> **카테고리(법정 vs 제안) 분류** 는 알림의 `type` 필드(서버 SoT) +
> `splitDashboardAlerts` (서버와 같은 SoT, `lib/shared/role-routing` 기반) 의
> 조합으로 두 카드에 라우팅된다. 본 시나리오에서 `task_template_mandatory` /
> `task_template_suggested` type 이 카테고리에 따라 정확히 부여되는 것과, 양쪽
> 카드 헤더가 동시 노출되는 것을 함께 검증해 분류 정합을 잠근다.

### 3) "시설기사 대시보드 위젯/필수업무 페이지 UI 반영"
스펙 위치: `task-template-role-propagation.spec.ts` line 391.

| 검증 항목 | 결과 |
|---|---|
| 시설기사 대시보드의 `link-view-all-mandatory` 카드 헤더 노출 (모바일 viewport 390x844) | ✅ |
| `/facility/mandatory-tasks` 페이지에 새 템플릿 제목 노출 | ✅ |

## 알려진 회귀 (test.fixme — 후속 과제로 분리)

### Finding A — `/api/facility/suggested-tasks` 가 facility_staff 에게 항상 빈 배열
- 후속 과제: **#762 직원에게도 시설 제안업무가 보이도록 고치기**.
- 잠금 위치: `task-template-role-propagation.spec.ts` line 444 (`test.fixme`).
- 재현:
  1. admin 으로 `POST /api/platform/task-templates`
     ```json
     {"category":"suggested","taskType":"facility","frequencyType":"one_time",
      "startDate":"<today+5d>","targetRoles":["manager","facility_staff"],
      "scopeType":"all","isActive":true,"advanceAlertDays":7,"title":"E2E suggested"}
     ```
  2. `facility@test.com` 으로 `GET /api/facility/suggested-tasks` → `[]`.
- 원인: `artifacts/api-server/src/routes/facilityTasks.ts` `applyRoleFilter()`
  가 `role==="facility_staff" && kind==="suggested"` 일 때 `return []` 로 무조건
  빈 배열을 돌려준다 (accountant 도 동일).

### Finding B — `/api/facility/mandatory-tasks` 응답에 suggested 카테고리 알림 누수
- 후속 과제: **#763 필수업무 페이지에 제안업무가 섞여 들어오지 않도록 분리**.
- 잠금 위치: `task-template-role-propagation.spec.ts` line 480 (`test.fixme`).
- 재현:
  1. 위 Finding A 의 1번 단계와 동일.
  2. `facility@test.com` 으로 `GET /api/facility/mandatory-tasks` 응답에
     "E2E suggested" 가 함께 포함됨.
- 원인: 같은 `applyRoleFilter()` 가 facility_staff/accountant 의 mandatory 분기
  에서 `alertMatchesRole` 만 사용하고 `isMandatory` 게이트를 적용하지 않음.

## 회귀 잠금 정책
- 활성 시나리오 1 ~ 3 은 위 spec 의 active 테스트로 영구 잠겨 있다.
- Finding A / B 는 spec 안에 `test.fixme(...)` 두 건으로 잠가 두었다. 후속
  과제 #762 / #763 수정 PR 시 `test.fixme` → `test` 로 바꾸면 가드가 활성화된다.
