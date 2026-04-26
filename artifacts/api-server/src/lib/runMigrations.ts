import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { pool } from "@workspace/db";
import { logger } from "./logger";

// [Task #454] 런타임 마이그레이션 러너.
//
// 배경:
//   기존 배포 파이프라인은 머지 후 개발(Replit) DB 에만 `pnpm --filter db push --force`
//   를 돌리고, autoscale 운영 배포는 빌드 → 부팅만 한다. 그래서 새 마이그레이션을
//   추가해도 운영 DB 에는 반영되지 않아 협력업체/계약 등록 500 같은 사고가
//   재발했다.
//
// 동작:
//   1. `_app_migrations(filename text PK, applied_at timestamptz)` 테이블을 만들고
//      적용 이력을 추적한다 (drizzle 의 `__drizzle_migrations` 와 분리 — 우리
//      drizzle 메타 저널은 누락된 항목이 있어 그대로 못 쓴다).
//   2. **베이스라인**: 추적 테이블이 비어 있고 운영/개발 DB 가 이미 `users`
//      테이블을 갖고 있다면, 본 파일에 하드코딩된 BASELINE_FILES 목록을 그대로
//      "적용 완료" 로 도장만 찍어 둔다 (실제 SQL 은 실행하지 않음). 이 목록은
//      "런타임 러너가 도입되기 전, 이미 push --force 로 dev DB 에 적용된 적
//      있는 SQL 파일" 의 스냅샷이다.
//   3. 그 후 `lib/db/drizzle/*.sql` 디렉터리를 스캔해 BASELINE 에 없거나 이후
//      추가된 신규 파일을 트랜잭션 안에서 실행한다. 신규 파일은 모두
//      `IF NOT EXISTS` / `ON CONFLICT` 등을 써서 멱등하게 작성한다는 약속이다.
//
// 새 마이그레이션 추가 절차:
//   - `lib/db/drizzle/NNNN_taskXXX_*.sql` 파일을 추가한다.
//   - 모든 DDL 은 `ADD COLUMN IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS`,
//     `CREATE INDEX IF NOT EXISTS` 처럼 멱등하게 작성한다.
//   - BASELINE_FILES 는 건드리지 않는다 (신규 파일은 자동으로 다음 부팅 때
//     적용된다).

// 런타임 러너 도입 시점에 dev DB 에 이미 push --force 로 반영되어 있던
// 마이그레이션 파일들. 새 환경(빈 DB)이 아니면 이 목록은 "도장만 찍고 스킵".
// 신규 마이그레이션은 절대 여기에 추가하지 말 것 — 자동 적용 대상에서
// 빠져 운영 DB 에 누락된다.
const BASELINE_FILES: ReadonlyArray<string> = [
  "0000_glorious_ulik.sql",
  "0001_calm_mikhail_rasputin.sql",
  "0002_bouncy_vulcan.sql",
  "0003_legal_appointees.sql",
  "0004_task137_signup_fixes.sql",
  "0005_task178_building_records.sql",
  "0006_task213_journal_section_photos.sql",
  "0007_task221_task_templates.sql",
  "0007_task222_rfq_service_type.sql",
  "0009_parallel_franklin_richards.sql",
  "0010_plain_jack_power.sql",
  "0011_purple_nebula.sql",
  "0012_task304_task_template_anchored.sql",
  "0013_task305_task_template_eligibility.sql",
  "0014_task319_credit_topup.sql",
  "0015_task323_building_notice_templates.sql",
  "0016_task328_building_register_data.sql",
  "0017_task335_partner_agreed.sql",
  "0018_task339_vendor_reviews.sql",
  "0018_task348_units_register_source.sql",
  "0019_task365_announcement_recurrence.sql",
  "0020_task389_notice_template_schedule.sql",
  "0021_task399_building_contact_phones.sql",
  "0022_task436_vendor_contract_columns.sql",
];

async function findMigrationsDir(): Promise<string> {
  // 빌드 후(번들): artifacts/api-server/dist/migrations/  (build.mjs 가 복사)
  // 개발(tsx watch src/lib/runMigrations.ts): 4단계 위로 올라가 monorepo 루트의 lib/db/drizzle
  const candidates = [
    path.resolve(import.meta.dirname, "migrations"),
    path.resolve(import.meta.dirname, "..", "migrations"),
    path.resolve(import.meta.dirname, "..", "..", "..", "..", "lib", "db", "drizzle"),
    path.resolve(import.meta.dirname, "..", "..", "..", "lib", "db", "drizzle"),
    path.resolve(process.cwd(), "lib", "db", "drizzle"),
    path.resolve(process.cwd(), "..", "..", "lib", "db", "drizzle"),
  ];

  for (const candidate of candidates) {
    try {
      const s = await stat(candidate);
      if (s.isDirectory()) return candidate;
    } catch {
      // try next
    }
  }
  throw new Error(
    `Cannot locate drizzle migrations directory. Tried:\n  ${candidates.join("\n  ")}`,
  );
}

async function listMigrationFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir);
  return entries.filter((f) => f.endsWith(".sql")).sort();
}

function splitStatements(sql: string): string[] {
  return sql
    .split(/-->\s*statement-breakpoint/g)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export interface RunMigrationsResult {
  baselined: number;
  applied: string[];
  skipped: number;
}

// pg_advisory_lock 키 — autoscale 다중 인스턴스가 동시에 부팅할 때
// `DO $$ ... ALTER TABLE ADD CONSTRAINT` 등이 경합해 한 쪽이 transient 실패하지
// 않도록 마이그레이션 전체 구간을 직렬화한다. 임의의 64-bit 정수면 충분.
const MIGRATION_LOCK_KEY = 4540001n;

export async function runMigrations(): Promise<RunMigrationsResult> {
  const client = await pool.connect();
  try {
    // 0) 동시 부팅 직렬화. pg_advisory_lock 은 동일 connection 내에서만 유효
    //    하므로 같은 client 로 락 → 마이그레이션 → unlock 한다.
    await client.query(`SELECT pg_advisory_lock($1)`, [MIGRATION_LOCK_KEY.toString()]);

    // 1) 추적 테이블 보장
    await client.query(`
      CREATE TABLE IF NOT EXISTS "_app_migrations" (
        "filename" text PRIMARY KEY,
        "applied_at" timestamp with time zone NOT NULL DEFAULT now()
      )
    `);

    // 2) 베이스라인 (최초 1회): 추적 테이블이 비어 있고 schema 가 이미 있다면
    //    BASELINE_FILES 를 일괄 도장.
    const { rows: countRows } = await client.query<{ c: number }>(
      `SELECT count(*)::int AS c FROM "_app_migrations"`,
    );
    const isFirstRun = (countRows[0]?.c ?? 0) === 0;

    let baselined = 0;
    if (isFirstRun) {
      const { rows: usersRows } = await client.query(
        `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'users' LIMIT 1`,
      );
      const schemaEstablished = usersRows.length > 0;
      if (schemaEstablished) {
        // 베이스라인 도장은 단일 트랜잭션으로 묶는다(코드리뷰 #2).
        //   - 도중에 크래시가 나면 일부만 stamped 된 상태로 다음 부팅 시
        //     (isFirstRun=false) 진입해 BASELINE_FILES 의 누락분이 실제 SQL
        //     로 다시 실행될 수 있어 위험. 트랜잭션으로 all-or-nothing 보장.
        try {
          await client.query("BEGIN");
          for (const f of BASELINE_FILES) {
            await client.query(
              `INSERT INTO "_app_migrations" ("filename") VALUES ($1) ON CONFLICT DO NOTHING`,
              [f],
            );
            baselined++;
          }
          await client.query("COMMIT");
        } catch (err) {
          await client.query("ROLLBACK").catch(() => {});
          baselined = 0;
          throw err;
        }
        logger.info({ baselined }, "Baselined existing migrations");
      } else {
        logger.info("Empty database detected — will apply all migrations from scratch");
      }
    }

    // 3) 적용 이력 로드
    const { rows: appliedRows } = await client.query<{ filename: string }>(
      `SELECT filename FROM "_app_migrations"`,
    );
    const appliedSet = new Set(appliedRows.map((r) => r.filename));

    // 4) 신규 파일 적용
    const dir = await findMigrationsDir();
    const files = await listMigrationFiles(dir);

    const applied: string[] = [];
    let skipped = 0;
    for (const file of files) {
      if (appliedSet.has(file)) {
        skipped++;
        continue;
      }
      const fullPath = path.join(dir, file);
      const content = await readFile(fullPath, "utf8");
      const statements = splitStatements(content);
      try {
        await client.query("BEGIN");
        for (const stmt of statements) {
          await client.query(stmt);
        }
        await client.query(
          `INSERT INTO "_app_migrations" ("filename") VALUES ($1) ON CONFLICT DO NOTHING`,
          [file],
        );
        await client.query("COMMIT");
        applied.push(file);
        logger.info({ file }, "Applied migration");
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        logger.error({ err, file }, "Migration failed — aborting");
        throw err;
      }
    }

    return { baselined, applied, skipped };
  } finally {
    // 락 해제는 best-effort: 연결을 release 하면 자동으로 풀린다.
    try {
      await client.query(`SELECT pg_advisory_unlock($1)`, [MIGRATION_LOCK_KEY.toString()]);
    } catch {
      // ignore
    }
    client.release();
  }
}
