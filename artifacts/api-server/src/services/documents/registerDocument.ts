// [Task #610] 서비스 단일 통로 (4층 방어 중 2층).

import { db, documentsTable, type DocumentKind, type DocumentState, type DocumentAuthorRole } from "@workspace/db";
import { sql } from "drizzle-orm";

// [Task #610 — code review fix] credits.ts 패턴 — 글로벌 db 와 트랜잭션 핸들이
type DbClient = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface RegisterDocumentInput {
  kind: DocumentKind;
  sourceTable: string;
  sourceId: number;
  state?: DocumentState;
  title?: string | null;
  subtitle?: string | null;
  authorId?: number | null;
  authorRole?: DocumentAuthorRole | null;
  buildingId?: number | null;
  periodStart?: string | null; // YYYY-MM-DD
  periodEnd?: string | null;
  href?: string | null;
  thumbnailUrl?: string | null;
  metadata?: Record<string, unknown>;
  // formatsAppend: notice_outputs 같은 누적 시나리오용. metadata.formats 배열에
  //   중복 없이 합치고 싶을 때 지정한다.
  formatsAppend?: string[];
  // [Task #610 — code review fix] PATCH /quotes/:id 처럼 한 트랜잭션 안에서
  executor?: DbClient;
}

/**
 * documents 레지스트리 upsert. 트리거가 이미 박은 행이 있으면 표시 필드만 덮는다.
 */
export async function registerDocument(input: RegisterDocumentInput): Promise<void> {
  const meta = input.metadata ?? {};
  const exec = input.executor ?? db;
  await exec
    .insert(documentsTable)
    .values({
      kind: input.kind,
      sourceTable: input.sourceTable,
      sourceId: input.sourceId,
      state: input.state ?? "active",
      title: input.title ?? null,
      subtitle: input.subtitle ?? null,
      authorId: input.authorId ?? null,
      authorRole: input.authorRole ?? null,
      buildingId: input.buildingId ?? null,
      periodStart: input.periodStart ?? null,
      periodEnd: input.periodEnd ?? null,
      href: input.href ?? null,
      thumbnailUrl: input.thumbnailUrl ?? null,
      metadata: meta,
    })
    .onConflictDoUpdate({
      target: [documentsTable.sourceTable, documentsTable.sourceId],
      set: {
        kind: sql`EXCLUDED.kind`,
        state: sql`EXCLUDED.state`,
        title: sql`COALESCE(EXCLUDED.title, ${documentsTable.title})`,
        subtitle: sql`COALESCE(EXCLUDED.subtitle, ${documentsTable.subtitle})`,
        authorId: sql`COALESCE(EXCLUDED.author_id, ${documentsTable.authorId})`,
        authorRole: sql`COALESCE(EXCLUDED.author_role, ${documentsTable.authorRole})`,
        buildingId: sql`COALESCE(EXCLUDED.building_id, ${documentsTable.buildingId})`,
        periodStart: sql`COALESCE(EXCLUDED.period_start, ${documentsTable.periodStart})`,
        periodEnd: sql`COALESCE(EXCLUDED.period_end, ${documentsTable.periodEnd})`,
        href: sql`COALESCE(EXCLUDED.href, ${documentsTable.href})`,
        thumbnailUrl: sql`COALESCE(EXCLUDED.thumbnail_url, ${documentsTable.thumbnailUrl})`,
        metadata: input.formatsAppend
          ? sql`jsonb_set(
              COALESCE(${documentsTable.metadata}, '{}'::jsonb) || ${sql.raw(`'${JSON.stringify(meta).replace(/'/g, "''")}'::jsonb`)},
              '{formats}',
              to_jsonb(
                ARRAY(
                  SELECT DISTINCT v FROM unnest(
                    COALESCE(
                      (
                        SELECT array_agg(value)::text[]
                        FROM jsonb_array_elements_text(COALESCE(${documentsTable.metadata}->'formats', '[]'::jsonb))
                      ),
                      ARRAY[]::text[]
                    ) || ${sql.raw(`ARRAY[${input.formatsAppend.map((f) => `'${f.replace(/'/g, "''")}'`).join(",")}]::text[]`)}
                  ) AS v
                )
              )
            )`
          : sql`${documentsTable.metadata} || ${sql.raw(`'${JSON.stringify(meta).replace(/'/g, "''")}'::jsonb`)}`,
        updatedAt: sql`now()`,
      },
    });
}
