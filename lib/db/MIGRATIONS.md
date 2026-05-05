# DB Migrations Guide

이 모노레포는 **개발(Replit) DB** 와 **운영(autoscale deploy) DB** 를 서로 다른 메커니즘으로 동기화한다. 두 경로 모두 같은 `lib/db/drizzle/*.sql` 파일을 ground truth 로 사용하지만 적용 시점과 도구가 다르다.

## TL;DR

| 환경 | 적용 도구 | 트리거 |
| --- | --- | --- |
| Dev (Replit workspace) | `drizzle-kit push` (내부적으로 `scripts/db-push-noninteractive.exp` 래퍼) | `scripts/post-merge.sh` (머지 직후 자동 실행) |
| Prod (autoscale deployment) | `runMigrations()` 가 `lib/db/drizzle/*.sql` 를 순차 실행 | `api-server` 부팅 시 자동 (각 파일은 `_app_migrations` 에 한 번만 기록됨) |

→ **새 테이블 / 컬럼 추가 시 반드시 두 가지를 모두 한다:**
1. `lib/db/src/schema/*.ts` 에 drizzle schema 추가 (dev push 가 사용)
2. `lib/db/drizzle/<NNNN>_<name>.sql` 에 멱등(`IF NOT EXISTS`) SQL 추가 (prod runMigrations 가 사용)

## Dev DB 동기화 (`pnpm --filter db push`)

`lib/db/package.json` 의 `push` 스크립트는 `../../scripts/db-push-noninteractive.exp` 를 호출한다 — drizzle-kit 의 인터랙티브 프롬프트를 expect 로 자동 응답하는 래퍼다.

### 왜 래퍼가 필요한가? (drizzle-kit 0.31.x phantom drift)

drizzle-kit 0.31.x 의 introspection 은 다음 두 케이스에서 schema ↔ DB 가 동일한데도 매번 "drift 있음" 으로 잘못 판단한다.

1. **`UNIQUE NULLS NOT DISTINCT` 제약** — introspection 이 `NULLS NOT DISTINCT` 플래그를 못 읽어 schema 의 `.nullsNotDistinct()` 와 영구 mismatch.
   - 예: `credit_category_pricing_cat_region_unique`
2. **멀티컬럼 unique 제약의 컬럼 순서** — introspection 이 컬럼 순서를 DB 와 다르게 읽어 schema 와 mismatch.
   - 예: `units_building_dong_unit_number`, `safety_checklist_template_categories_value_unique`

이 phantom drift 마다 drizzle-kit 은 `Do you want to truncate ... table?` 프롬프트를 띄우고 stdin 을 기다린다. CI / post-merge 환경에는 stdin 이 없어 무한 대기. 래퍼가 항상 첫 번째 선택지(`No, add the constraint without truncating`) 를 자동으로 보낸다.

### 래퍼 동작

`scripts/db-push-noninteractive.exp` 가 처리하는 프롬프트:

| 프롬프트 패턴 | 자동 응답 | 이유 |
| --- | --- | --- |
| `... Do you want to truncate ...` | Enter (= "No, add without truncating") | phantom drift 이므로 데이터 보존이 정답 |
| `... created or renamed from another ...` | Enter (= 첫 번째 = "create new") | rename 후보로 잘못 잡히는 케이스 회피 |

### 직접 호출하기

```bash
# (권장) 래퍼 경유 — non-interactive. 내부적으로 --force 가 켜져 있다.
pnpm --filter db push

# 위와 완전히 동일. 명시적으로 force 를 표현하고 싶을 때 쓰는 별칭.
pnpm --filter db push-force

# (디버깅 전용) raw drizzle-kit — 인터랙티브 프롬프트 직접 응답.
# 유일하게 --force 가 꺼진 경로다.
pnpm --filter db push-raw
```

> **`push` 가 항상 `--force` 인 이유**: 위 두 phantom drift 프롬프트는 사용자가 직접 봐도 매번 같은 답("No, add without truncating") 을 골라야 한다. 래퍼가 그 답을 자동으로 보내므로 `--force` 는 실질적으로 destructive 하지 않다. 진짜로 데이터가 위험한 변경은 schema 단계에서 review 로 거른다.

## Prod DB 동기화 (`runMigrations()`)

`artifacts/api-server/src/lib/runMigrations.ts` 가 부팅 시 자동 실행한다.

1. `_app_migrations` 테이블이 없으면 생성 (이름·시각만 기록).
2. `lib/db/drizzle/` 에서 `*.sql` 파일을 알파벳 순으로 읽음.
3. `_app_migrations` 에 없는 파일만 트랜잭션 안에서 실행 후 기록.

### 운영 SQL 작성 규칙

- **반드시 멱등하게** 작성한다. dev DB 는 이미 `push --force` 로 같은 schema 가 적용된 상태이므로, 운영에서 새 SQL 이 처음 실행될 때 `CREATE TABLE` / `CREATE INDEX` 가 충돌나면 안 된다.
  - `CREATE TABLE IF NOT EXISTS ...`
  - `CREATE INDEX IF NOT EXISTS ...`
  - `ALTER TABLE ... ADD COLUMN IF NOT EXISTS ...`
- 파일명은 `<NNNN>_<task_or_topic>.sql` 형식 (예: `0071_task852_operational_purge_runs.sql`). NNNN 은 단조 증가.
- 한 파일은 한 트랜잭션이다 — 여러 statement 가 atomic 하게 적용된다.

### 운영에 새 테이블 배포하기

1. `lib/db/src/schema/<table>.ts` 작성.
2. `lib/db/src/schema/index.ts` 에 export 추가.
3. `lib/db/drizzle/<NNNN>_<task>_<table>.sql` 작성 (멱등 DDL).
4. `pnpm --filter db push` 로 dev DB 동기화 확인.
5. 평소처럼 머지 → autoscale 재배포되면 `runMigrations()` 가 새 SQL 을 실행.

## `_app_migrations` 가 schema 에 등록된 이유

`lib/db/src/schema/appMigrations.ts` 가 `_app_migrations` 테이블을 drizzle schema 에 선언한다. 운영에서만 사용되고 dev DB 에는 원래 없었지만, 일부 dev DB 가 과거에 `runMigrations()` 가 한 번 실행된 흔적으로 `_app_migrations` 를 가지고 있었다. drizzle-kit 은 schema 에 없는 테이블을 발견하면 "신규 테이블의 rename 후보" 로 의심해 `Is X table created or renamed from _app_migrations?` 프롬프트를 띄운다.

schema 에 명시적으로 등록함으로써 이 prompt 자체가 발생하지 않는다.
