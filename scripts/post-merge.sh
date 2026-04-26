#!/bin/bash
set -e
pnpm install --frozen-lockfile
# 주의: drizzle-kit 가 일부 마이그레이션 시 인터랙티브 프롬프트를 띄울 수 있다.
# 후속머지 환경은 stdin 이 /dev/null 이라 drizzle-kit 가 TTY 부재를 감지해
# 기본값(첫 번째 선택지, e.g. "No, add the constraint without truncating")으로
# 자동 진행한다. 다만 해당 fallback 까지 약 15~18초 걸리므로 타임아웃은 60초로
# 넉넉히 잡는다(.replit 의 [postMerge] timeoutMs).
pnpm --filter db push --force
