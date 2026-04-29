// [Task #610] Layer 3/4 회귀 테스트 — DOCUMENT_PRODUCING_ROUTES 카탈로그 무결성.

import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  DOCUMENT_PRODUCING_ROUTES,
  isCatalogedSource,
} from "../services/documents/routeCatalog.js";
import { PRODUCING_TABLE_SYMBOLS } from "../repo/producingDocuments.js";

const REPO_ROOT = new URL("../../../../", import.meta.url).pathname;
const MIGRATIONS_DIR = join(REPO_ROOT, "lib/db/drizzle");
const ROUTES_DIR = join(REPO_ROOT, "artifacts/api-server/src/routes");

function readAllMigrations(): string {
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql"));
  return files.map((f) => readFileSync(join(MIGRATIONS_DIR, f), "utf8")).join("\n");
}
function listRouteFiles(): string[] {
  return readdirSync(ROUTES_DIR)
    .filter((f) => f.endsWith(".ts"))
    .map((f) => join(ROUTES_DIR, f));
}
function readRouteFile(name: string): string {
  const full = join(ROUTES_DIR, name);
  if (!existsSync(full)) return "";
  return readFileSync(full, "utf8");
}

// 정확한 라우트 정의 매처 — `router.post("/path"` 처럼 method 와 path 가 동시에 일치해야 한다.
//   path 안의 정규식 메타문자(콜론, 슬래시) 는 안전하게 escape.
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function routeDefinitionRegex(method: string, path: string): RegExp {
  // router.post("/foo/:bar" 또는 router.post('/foo/:bar' 또는 router.post(`/foo/:bar`
  const m = method.toLowerCase();
  const p = escapeRegex(path);
  return new RegExp(`router\\.${m}\\(\\s*["'\`]${p}["'\`]`);
}

test("Layer 3 (강화): 모든 producing 라우트가 정확한 method+path 로 라우터에 등록된다", () => {
  const allRouteContent = listRouteFiles().map((p) => readFileSync(p, "utf8")).join("\n\n");
  for (const r of DOCUMENT_PRODUCING_ROUTES) {
    const re = routeDefinitionRegex(r.method, r.path);
    assert.ok(
      re.test(allRouteContent),
      `[Task #610 Layer 3] producing route 미마운트: ${r.method} ${r.path} ` +
        `(정규식 ${re} 와 일치하는 router.<method>("<path>" 정의가 없음)`,
    );
  }
});

test("Layer 3: 모든 카탈로그 row 의 routeFile 이 routes/ 에 실제 존재한다", () => {
  for (const r of DOCUMENT_PRODUCING_ROUTES) {
    const full = join(ROUTES_DIR, r.routeFile);
    assert.ok(existsSync(full), `[Task #610 Layer 3] routeFile 누락: ${r.routeFile}`);
  }
});

test("Layer 3 (강화): 각 카탈로그 row 가 가리키는 routeFile 안에 정확한 method+path 정의가 있다", () => {
  for (const r of DOCUMENT_PRODUCING_ROUTES) {
    const body = readRouteFile(r.routeFile);
    const re = routeDefinitionRegex(r.method, r.path);
    assert.ok(
      re.test(body),
      `[Task #610 Layer 3] ${r.method} ${r.path} 가 ${r.routeFile} 에 정의되어 있지 않음`,
    );
  }
});

test("Layer 4: 각 row 가 (트리거 OR routeFile 안 saveProducingDocument/registerDocument) 로 보호된다", () => {
  const sql = readAllMigrations();
  for (const r of DOCUMENT_PRODUCING_ROUTES) {
    const triggerName = `documents_${r.sourceTable}_aiu`;
    const triggered = sql.includes(triggerName);
    const fileBody = readRouteFile(r.routeFile);
    // saveProducingDocument 가 내부적으로 registerDocument 를 호출하므로 둘 중 하나만 있으면 충분.
    const explicitlyRegistered =
      fileBody.includes("saveProducingDocument(") || fileBody.includes("registerDocument(");
    assert.ok(
      triggered || explicitlyRegistered,
      `[Task #610 Layer 4] ${r.method} ${r.path} (${r.sourceTable}) 미보호: ` +
        `트리거(${triggerName}) 도 없고 ${r.routeFile} 안에서 saveProducingDocument/registerDocument 호출도 없음`,
    );
  }
});

test("Layer 4 (강화): 각 row 가 가리키는 sourceTable 문자열이 routeFile 안에서 인용된다", () => {
  // saveProducingDocument 또는 registerDocument 호출의 sourceTable 인자가
  //   카탈로그의 sourceTable 과 정확히 일치하는지 확인 (간이 검사 — '"<sourceTable>"' 가 보이면 OK).
  for (const r of DOCUMENT_PRODUCING_ROUTES) {
    const body = readRouteFile(r.routeFile);
    const quoted = `"${r.sourceTable}"`;
    assert.ok(
      body.includes(quoted),
      `[Task #610 Layer 4] ${r.routeFile} 에 sourceTable 문자열 ${quoted} 가 등장하지 않음 ` +
        `(카탈로그가 가리키는 등록 호출이 누락되었거나 잘못된 source_table 사용)`,
    );
  }
});

test("Layer 4: 카탈로그가 모든 source_table 에 대해 isCatalogedSource = true", () => {
  for (const r of DOCUMENT_PRODUCING_ROUTES) {
    assert.equal(isCatalogedSource(r.sourceTable), true, `${r.sourceTable} 미카탈로그`);
  }
  assert.equal(isCatalogedSource("__nonexistent_table__"), false);
});

test("Layer 4: 카탈로그가 비어있지 않다", () => {
  assert.ok(DOCUMENT_PRODUCING_ROUTES.length >= 11, "최소 11개 카탈로그 필요");
});

// ---------------------------------------------------------------------------
// Layer 5: 정적 가드 — 산출 테이블 INSERT 는 saveProducingDocument 안에서만 허용.
// ---------------------------------------------------------------------------

// dashboard.ts / inspections.ts 는 자동 RFQ 를 만든다(트리거가 documents 등록).
//   기존 회귀 영향 최소화를 위해 명시적 allowlist 로 직접 INSERT 를 허용하되,
//   향후 작업에서 saveProducingDocument 로 이관해야 한다(주석은 코드 리뷰의 책임).
const ALLOWED_DIRECT_INSERT_FILES: Record<string, string[]> = {
  // 라우트 파일명 -> 직접 INSERT 가 허용된 producing 테이블 심볼 목록.
  "dashboard.ts": ["rfqsTable"],
  "inspections.ts": ["rfqsTable"],
};

// 인라인 어노테이션 — `// [allow-direct-write: <reason>]` 가 같은 줄 또는 바로 위
//   5줄 안에 있으면 직접 .update / .insert 가 허용된다 (상태 추이가 documents
//   레지스트리 의미와 무관한 부수적 갱신: 조회 타임스탬프, 잠금 해제 등).
//   윈도우를 5줄로 잡는 이유: drizzle 의 `await db.update(...)` 패턴에서 `.update(...)`
//   호출이 같은 표현식이 여러 줄로 chained 될 때 어노테이션이 5줄 정도까지 떨어질 수 있음.
const ALLOW_INLINE_ANNOTATION = "[allow-direct-write:";
const ALLOW_INLINE_WINDOW = 5;

function findDirectWrites(
  routeFile: string,
  body: string,
  op: "insert" | "update",
): Array<{ table: string; line: number }> {
  const allowed = op === "insert" ? (ALLOWED_DIRECT_INSERT_FILES[routeFile] ?? []) : [];
  const hits: Array<{ table: string; line: number }> = [];
  const lines = body.split("\n");

  for (const tbl of PRODUCING_TABLE_SYMBOLS) {
    if (allowed.includes(tbl)) continue;
    // .insert(<tbl>) 또는 .update(<tbl>) 패턴.
    const re = new RegExp(`\\.${op}\\(\\s*${escapeRegex(tbl)}\\s*\\)`);

    lines.forEach((ln, idx) => {
      if (!re.test(ln)) return;
      // 1) saveProducingDocument 안의 write 콜백이면 허용.
      //   휴리스틱: 이 라인 위로 30줄 안에 `saveProducingDocument(` 가 있으면 같은 호출 안.
      const before = lines.slice(Math.max(0, idx - 30), idx).join("\n");
      const opens = (before.match(/saveProducingDocument\s*\(/g) ?? []).length;
      if (opens > 0) return;
      // 2) 같은 줄 또는 바로 위 N(=ALLOW_INLINE_WINDOW)줄 안에 인라인 어노테이션이 있으면 허용.
      const winStart = Math.max(0, idx - ALLOW_INLINE_WINDOW);
      const window = lines.slice(winStart, idx + 1).join("\n");
      if (window.includes(ALLOW_INLINE_ANNOTATION)) return;
      hits.push({ table: tbl, line: idx + 1 });
    });
  }
  return hits;
}

test("Layer 5 (INSERT): 산출 테이블 INSERT 는 saveProducingDocument 호출 안에서만 허용된다", () => {
  const violations: string[] = [];
  for (const filePath of listRouteFiles()) {
    const fileName = filePath.split("/").pop() ?? "";
    const body = readFileSync(filePath, "utf8");
    const hits = findDirectWrites(fileName, body, "insert");
    for (const h of hits) {
      violations.push(`${fileName}:${h.line} — .insert(${h.table}) 가 saveProducingDocument 외부에 있음`);
    }
  }

  assert.equal(
    violations.length,
    0,
    `[Task #610 Layer 5] 다음 직접 INSERT 들은 repo/producingDocuments.ts 의 saveProducingDocument ` +
      `를 거쳐야 합니다 (단일 통로 위반):\n  - ${violations.join("\n  - ")}`,
  );
});

test("Layer 5 (UPDATE): 산출 테이블 UPDATE 는 saveProducingDocument 호출 안에서만 허용된다", () => {
  // 단일 통로의 핵심 — INSERT 뿐 아니라 lifecycle UPDATE 도 같은 통로를 거쳐야
  //   documents 레지스트리의 kind/state 가 함께 갱신된다. 부수적 비-lifecycle
  //   업데이트(조회 타임스탬프 등) 는 인라인 어노테이션으로 명시 허용.
  const violations: string[] = [];
  for (const filePath of listRouteFiles()) {
    const fileName = filePath.split("/").pop() ?? "";
    const body = readFileSync(filePath, "utf8");
    const hits = findDirectWrites(fileName, body, "update");
    for (const h of hits) {
      violations.push(
        `${fileName}:${h.line} — .update(${h.table}) 가 saveProducingDocument 외부에 있음 ` +
          `(불가피한 비-lifecycle 갱신이라면 같은 줄 또는 바로 위 2줄에 ` +
          `\`// [allow-direct-write: <사유>]\` 어노테이션을 추가)`,
      );
    }
  }

  assert.equal(
    violations.length,
    0,
    `[Task #610 Layer 5] 다음 직접 UPDATE 들은 단일 통로 위반:\n  - ${violations.join("\n  - ")}`,
  );
});

test("Layer 5: PRODUCING_TABLE_SYMBOLS 에 카탈로그 sourceTable 들이 모두 매핑되어 있다", () => {
  // 카탈로그의 모든 source_table 이 producing 테이블 심볼 목록에 포함되었는지 확인.
  //   심볼명은 snake_case sourceTable + "Table" (camelCase) 규칙.
  const toSymbol = (t: string): string => {
    const camel = t.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
    return `${camel}Table`;
  };
  for (const r of DOCUMENT_PRODUCING_ROUTES) {
    const sym = toSymbol(r.sourceTable);
    assert.ok(
      (PRODUCING_TABLE_SYMBOLS as readonly string[]).includes(sym),
      `[Task #610 Layer 5] sourceTable=${r.sourceTable} → 심볼 ${sym} 가 PRODUCING_TABLE_SYMBOLS 에 없음`,
    );
  }
});
