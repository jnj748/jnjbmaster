#!/bin/bash
set -e
pnpm install --frozen-lockfile
# drizzle-kit 가 "고유 제약을 추가합니다, 테이블을 truncate 할까요?" 같은
# 인터랙티브 프롬프트를 띄울 때, 후속머지 환경은 stdin 이 닫혀 있어 EOF 로
# 그대로 hang 한다. yes 로 빈 줄(= Enter)을 무한 입력해 항상 첫 번째(기본,
# "No, add the constraint without truncating") 선택지가 채택되게 한다.
yes "" | pnpm --filter db push --force
