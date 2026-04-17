#!/usr/bin/env node
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const distHtml = resolve(__dirname, "../dist/public/index.html");
const srcHtml = resolve(__dirname, "../index.html");

const cssGlobal = resolve(__dirname, "../src/index.css");

const targets = [
  { path: distHtml, label: "dist/public/index.html" },
  { path: srcHtml, label: "index.html" },
];

const FORBIDDEN = [
  {
    pattern: /maximum-scale\s*=\s*[^,"\s]+/i,
    reason:
      "viewport meta에 maximum-scale 사용 금지: 캔버스/넓은 미리보기에서 좌상단 1/4 쏠림 유발 + WCAG 위반",
  },
  {
    pattern: /user-scalable\s*=\s*no/i,
    reason:
      "viewport meta에 user-scalable=no 사용 금지: 캔버스/넓은 미리보기에서 좌상단 1/4 쏠림 유발 + WCAG 위반",
  },
  {
    pattern: /minimum-scale\s*=\s*[^,"\s]+/i,
    reason: "viewport meta에 minimum-scale 사용 금지: 위와 동일 사유",
  },
];

const HTML_FORBIDDEN = [
  {
    pattern: /<(html|body)[^>]*\sstyle=["'][^"']*(width|min-width|max-width)\s*:/i,
    reason: "html/body 인라인 style의 width 잠금은 캔버스 미리보기 폭 계산을 깨뜨립니다.",
  },
];

let failed = false;
for (const { path, label } of targets) {
  if (!existsSync(path)) continue;
  const html = readFileSync(path, "utf8");
  const viewportMatches = html.match(/<meta[^>]*name=["']viewport["'][^>]*>/gi) ?? [];

  for (const tag of viewportMatches) {
    for (const rule of FORBIDDEN) {
      if (rule.pattern.test(tag)) {
        console.error(`[viewport-guard] ${label}: ${rule.reason}`);
        console.error(`  → ${tag}`);
        failed = true;
      }
    }
  }
  for (const rule of HTML_FORBIDDEN) {
    if (rule.pattern.test(html)) {
      console.error(`[viewport-guard] ${label}: ${rule.reason}`);
      failed = true;
    }
  }
}

const CSS_FORBIDDEN = [
  {
    pattern: /(^|\})\s*(html|body|#root)\s*[^{}]*\{[^{}]*\bmax-width\s*:\s*(?!none)[^;}]+/im,
    reason:
      "html/body/#root 의 max-width 잠금은 캔버스/넓은 미리보기에서 좌상단 1/4 쏠림을 유발할 수 있습니다 (max-width: none 만 허용).",
  },
  {
    pattern: /(^|\})\s*(html|body|#root)\s*[^{}]*\{[^{}]*\bmin-width\s*:\s*\d+(\.\d+)?(px|rem|em)/im,
    reason:
      "html/body/#root 에 고정 px/rem/em min-width 잠금은 좁은 폭에서 가로 스크롤/쏠림을 유발할 수 있습니다.",
  },
  {
    pattern: /(^|\})\s*(html|body|#root)\s*[^{}]*\{[^{}]*\bwidth\s*:\s*\d+(\.\d+)?(px|rem|em)/im,
    reason:
      "html/body/#root 에 고정 px/rem/em width 잠금은 캔버스 폭과 어긋나 쏠림을 유발합니다 (100%/100vw/auto 사용).",
  },
];

if (existsSync(cssGlobal)) {
  const css = readFileSync(cssGlobal, "utf8");
  for (const rule of CSS_FORBIDDEN) {
    if (rule.pattern.test(css)) {
      console.error(`[viewport-guard] src/index.css: ${rule.reason}`);
      failed = true;
    }
  }
}

if (failed) {
  console.error(
    "\n[viewport-guard] 빌드 차단: artifacts/manager-app/index.html 의 뷰포트/루트 설정을 점검하세요."
  );
  process.exit(1);
}
console.log("[viewport-guard] OK");
