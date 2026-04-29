#!/usr/bin/env node
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const distRoot = resolve(__dirname, "../dist/public");

const FORBIDDEN_TOKENS = [
  {
    token: "preview-grid",
    reason: "DEV 분할 프리뷰 격자 라우트/컴포넌트가 prod 번들에 누출",
  },
  {
    token: "auth_token__dev__",
    reason: "DEV impersonation localStorage 키 prefix 가 prod 번들에 누출",
  },
  {
    token: "__dev_as__",
    reason: "DEV sessionStorage 핀 키가 prod 번들에 누출",
  },
  {
    token: "/__dev/",
    reason: "DEV 전용 라우트 prefix 가 prod 번들에 누출",
  },
];

const SCAN_EXTENSIONS = new Set([".html", ".js", ".mjs", ".css"]);

if (!existsSync(distRoot)) {
  console.error(
    `[dev-leak-guard] dist 디렉터리 없음: ${distRoot} (먼저 vite build 가 끝나야 합니다)`
  );
  process.exit(1);
}

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) yield* walk(full);
    else yield full;
  }
}

let failed = false;
let scanned = 0;

for (const file of walk(distRoot)) {
  const dot = file.lastIndexOf(".");
  const ext = dot === -1 ? "" : file.slice(dot);
  if (!SCAN_EXTENSIONS.has(ext)) continue;
  scanned += 1;
  const content = readFileSync(file, "utf8");
  for (const { token, reason } of FORBIDDEN_TOKENS) {
    const idx = content.indexOf(token);
    if (idx !== -1) {
      const rel = file.slice(distRoot.length + 1);
      console.error(`[dev-leak-guard] ${rel}: "${token}" 발견 — ${reason}`);
      const start = Math.max(0, idx - 40);
      const end = Math.min(content.length, idx + token.length + 40);
      console.error(`  → ...${content.slice(start, end).replace(/\n/g, "\\n")}...`);
      failed = true;
    }
  }
}

if (failed) {
  console.error(
    `\n[dev-leak-guard] 빌드 차단: DEV 전용 디버그 식별자가 prod 번들에 들어갔습니다.\n` +
      `  → 디버그 컴포넌트가 \`import.meta.env.DEV\` 가드 없이 import 되었거나,\n` +
      `    lazy() 분기가 dead-code 제거에 실패했을 가능성이 큽니다.\n` +
      `  → 디버그 도구는 반드시 컴포넌트 첫 줄 \`if (!import.meta.env.DEV) return null;\`\n` +
      `    + 라우트 lazy 분기 두 가지를 모두 갖춰야 합니다.\n` +
      `  → 자세한 가드 규약은 replit.md 의 "DEV-전용 디버그 도구 가드 (프로덕션 노출 절대 금지)" 참고.`
  );
  process.exit(1);
}

console.log(
  `[dev-leak-guard] OK (${scanned}개 파일 스캔, 디버그 식별자 ${FORBIDDEN_TOKENS.length}종 모두 0건)`
);
