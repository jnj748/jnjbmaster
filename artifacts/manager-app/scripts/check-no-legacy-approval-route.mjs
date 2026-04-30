#!/usr/bin/env node
// [Task #719] 잘못된 결재 경로(/approval-create) 회귀 차단 정적 검사.
//   라우터에 등록된 경로는 /approvals/create 이며, 알림 다이얼로그·일/주/월간
//   일지·공고문 템플릿·리포트 시스템 등 모든 진입점이 이 경로로만 navigate
//   해야 한다. src/ 안에 인용부호로 시작하는 라우트 리터럴 "/approval-create"
//   가 한 곳이라도 다시 들어오면 본 검사가 실패하고 빌드/CI 가 막힌다.
//
//   파일명 import 경로(@/pages/approval-create) 는 인용부호 뒤에 "@" 또는
//   "." 가 오므로 라우트 리터럴 정규식과 매칭되지 않는다.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve, join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");
const srcRoot = resolve(projectRoot, "src");

// 인용부호("/'/`) 또는 백틱 직후에 오는 라우트 리터럴 "/approval-create" 만
// 매칭한다. import 경로 "@/pages/approval-create" 는 매칭되지 않는다.
const FORBIDDEN_RE = /["'`]\/approval-create\b/;
const offenders = [];

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      walk(full);
      continue;
    }
    if (!/\.(?:tsx?|mjs|cjs|js|jsx)$/.test(name)) continue;
    // 회귀 테스트 자체에 들어 있는 잠금 문자열은 의도된 것이므로 제외한다.
    if (/\.test\.[cm]?[jt]sx?$/.test(name)) continue;
    const text = readFileSync(full, "utf8");
    const lines = text.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (FORBIDDEN_RE.test(lines[i])) {
        offenders.push({
          file: relative(projectRoot, full),
          line: i + 1,
          text: lines[i].trim(),
        });
      }
    }
  }
}

walk(srcRoot);

if (offenders.length > 0) {
  console.error(
    `\n[check-no-legacy-approval-route] FAIL — 라우트 리터럴 "/approval-create" 가 ${offenders.length} 곳에서 발견됐습니다.`,
  );
  console.error(
    "  라우터에 등록된 경로는 /approvals/create 입니다. (Task #719 회귀)\n",
  );
  for (const o of offenders) {
    console.error(`  ${o.file}:${o.line}  ${o.text}`);
  }
  console.error("");
  process.exit(1);
}

console.log(
  '[check-no-legacy-approval-route] OK — 라우트 리터럴 "/approval-create" 잔존 없음.',
);
