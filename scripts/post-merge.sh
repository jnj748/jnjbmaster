#!/bin/bash
set -e
pnpm install --frozen-lockfile
# [Task #454, #854] 이 스크립트는 머지 후 **개발(Replit) DB** 만 동기화한다.
# 운영(autoscale) DB 는 api-server 가 부팅할 때 `runMigrations()` 가
# `lib/db/drizzle/*.sql` 신규 파일을 자동 적용한다 — 자세한 내용은
# `artifacts/api-server/src/lib/runMigrations.ts` 와 `lib/db/MIGRATIONS.md` 참조.
# 새 마이그레이션 파일을 추가할 때는 반드시 `IF NOT EXISTS` 등으로 멱등하게
# 작성해야 한다(같은 파일이 dev 에서는 push --force 로 이미 반영된 상태에서
# 운영 부팅 시 다시 실행되기 때문).
#
# [Task #854] `pnpm --filter db push` 는 내부적으로
# `scripts/db-push-noninteractive.exp` (expect 래퍼) 를 호출하므로,
# drizzle-kit 0.31.x 의 phantom 인터랙티브 프롬프트(UNIQUE NULLS NOT DISTINCT,
# 멀티컬럼 unique 컬럼 순서 introspection 버그) 가 떠도 자동으로 안전한
# 기본값을 선택한다. 자세한 배경은 `lib/db/MIGRATIONS.md` 참조.
pnpm --filter db push
