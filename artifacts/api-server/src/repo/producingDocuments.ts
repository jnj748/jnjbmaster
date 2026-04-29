// [Task #610 — code review fix] 2층 단일 통로 (Layer 2) 의 실제 코드 통로.

import { db } from "@workspace/db";
import {
  registerDocument,
  type RegisterDocumentInput,
} from "../services/documents/registerDocument";

// credits.ts 패턴 — 글로벌 db 와 transaction 핸들의 공통 인터페이스.
type DbClient = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

// title/subtitle/buildingId/... 같은 표시 필드는 row 를 받는 함수 형태도 허용.
export interface ProducingDocumentSpec<TRow>
  extends Omit<
    RegisterDocumentInput,
    | "executor"
    | "sourceId"
    | "title"
    | "subtitle"
    | "metadata"
    | "buildingId"
    | "periodStart"
    | "periodEnd"
    | "href"
    | "thumbnailUrl"
    | "authorId"
    | "formatsAppend"
  > {
  title?: string | null | ((row: TRow) => string | null);
  subtitle?: string | null | ((row: TRow) => string | null);
  buildingId?: number | null | ((row: TRow) => number | null);
  periodStart?: string | null | ((row: TRow) => string | null);
  periodEnd?: string | null | ((row: TRow) => string | null);
  href?: string | null | ((row: TRow) => string | null);
  thumbnailUrl?: string | null | ((row: TRow) => string | null);
  metadata?: Record<string, unknown> | ((row: TRow) => Record<string, unknown>);
  authorId?: number | null | ((row: TRow) => number | null);
  // [Task #610 — code review fix #1] formatsAppend 도 row 기반 함수 형태 허용.
  formatsAppend?: string[] | ((row: TRow) => string[]);
}

export interface SaveProducingInput<TRow extends { id: number }> {
  executor?: DbClient;
  /**
   * 원본 producing 테이블에 INSERT/UPDATE/UPSERT 하는 함수.
   * 반드시 같은 executor 인자를 사용해야 atomic 보장이 깨지지 않는다.
   */
  write: (exec: DbClient) => Promise<TRow | undefined>;
  document: ProducingDocumentSpec<TRow>;
}

/**
 * 산출물 1행을 commit 하고 같은 executor 안에서 documents 레지스트리에 upsert 한다.
 *
 * - 의도적으로 try/catch 를 두지 않는다. registerDocument 가 throw 하면
 *   트랜잭션 안에서는 자동 롤백, 글로벌 db 라면 호출자가 catch 하여 로깅/무시 결정.
 * - 등록 실패는 "원본만 commit, 레지스트리 누락" 이라는 불일치를 만들기 때문에
 *   기본 정책은 "함께 실패" 다.
 */
/**
 * write callback 이 row 를 돌려주지 못했을 때 던지는 타입화된 에러.
 * 라우트 핸들러는 `if (e instanceof MissingSourceRowError)` 로 404 매핑을 한다.
 * 문자열 매칭으로 분기하면 메시지 변경 시 조용히 깨지므로 명시 타입을 쓴다.
 */
export class MissingSourceRowError extends Error {
  readonly sourceTable: string;
  constructor(sourceTable: string) {
    super(`[saveProducingDocument] missing source row for ${sourceTable}`);
    this.name = "MissingSourceRowError";
    this.sourceTable = sourceTable;
  }
}

export async function saveProducingDocument<TRow extends { id: number }>(
  opts: SaveProducingInput<TRow>,
): Promise<TRow> {
  const exec = opts.executor ?? db;
  const row = await opts.write(exec);
  if (!row) {
    throw new MissingSourceRowError(opts.document.sourceTable);
  }

  await registerDocument({
    executor: exec,
    kind: opts.document.kind,
    sourceTable: opts.document.sourceTable,
    sourceId: row.id,
    state: opts.document.state,
    title: resolve(opts.document.title, row),
    subtitle: resolve(opts.document.subtitle, row),
    authorId: resolve(opts.document.authorId, row),
    authorRole: opts.document.authorRole ?? null,
    buildingId: resolve(opts.document.buildingId, row),
    periodStart: resolve(opts.document.periodStart, row),
    periodEnd: resolve(opts.document.periodEnd, row),
    href: resolve(opts.document.href, row),
    thumbnailUrl: resolve(opts.document.thumbnailUrl, row),
    metadata:
      typeof opts.document.metadata === "function"
        ? opts.document.metadata(row)
        : (opts.document.metadata ?? {}),
    formatsAppend:
      typeof opts.document.formatsAppend === "function"
        ? opts.document.formatsAppend(row)
        : opts.document.formatsAppend,
  });

  return row;
}

function resolve<TRow, T>(
  v: T | null | undefined | ((row: TRow) => T | null),
  row: TRow,
): T | null {
  if (typeof v === "function") return (v as (row: TRow) => T | null)(row);
  return (v ?? null) as T | null;
}

// 산출물 테이블 화이트리스트 — 회귀 테스트(static guard) 가 라우트 파일에서
//   이 테이블 심볼에 대한 `.insert(...)` / `.update(...)` 직접 호출이 보이면 실패한다.
//   "인서트는 무조건 saveProducingDocument 거쳐야 한다" 라는 Layer 2 단일 통로 강제.
export const PRODUCING_TABLE_SYMBOLS = [
  "dailyJournalsTable",
  "weeklySummaryReportsTable",
  "monthlySummaryReportsTable",
  "approvalsTable",
  "alertActionsTable",
  "externalDocumentsTable",
  "rfqsTable",
  "quotesTable",
  "contractsTable",
  "platformAnnouncementsTable",
  "noticeOutputsTable",
] as const;
