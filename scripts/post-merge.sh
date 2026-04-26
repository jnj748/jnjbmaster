#!/bin/bash
set -e
pnpm install --frozen-lockfile
# 주의: drizzle-kit 가 일부 마이그레이션 시 인터랙티브 프롬프트를 띄울 수 있다.
# 후속머지 환경은 stdin 이 /dev/null 이라 drizzle-kit 가 TTY 부재를 감지해
# 기본값(첫 번째 선택지, e.g. "No, add the constraint without truncating")으로
# 자동 진행한다. 다만 해당 fallback 까지 약 15~18초 걸리므로 타임아웃은 60초로
# 넉넉히 잡는다(.replit 의 [postMerge] timeoutMs).
#
# [Task #454] 이 스크립트는 머지 후 **개발(Replit) DB** 만 동기화한다.
# 운영(autoscale) DB 는 api-server 가 부팅할 때 `runMigrations()` 가
# `lib/db/drizzle/*.sql` 신규 파일을 자동 적용한다 — 자세한 내용은
# `artifacts/api-server/src/lib/runMigrations.ts` 참조.
# 새 마이그레이션 파일을 추가할 때는 반드시 `IF NOT EXISTS` 등으로 멱등하게
# 작성해야 한다(같은 파일이 dev 에서는 push --force 로 이미 반영된 상태에서
# 운영 부팅 시 다시 실행되기 때문).
pnpm --filter db push --force
