// 핵심 회귀 테스트: 산출 라우트 호출 → 원본 commit → documents 정확히 1행.
// 같은 source 의 반복 호출이 documents 행을 중복 생성하지 않고 upsert 되는지 확인.
// 두 개 이상의 cataloged 산출 라우트(notice_outputs, external_documents)와
// MissingSourceRowError → 404 매핑(contracts PATCH)을 함께 검증한다.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret-for-documents-upsert";

const {
  db,
  usersTable,
  buildingsTable,
  buildingNoticeTemplatesTable,
  noticeOutputsTable,
  externalDocumentsTable,
  documentsTable,
  pool,
} = await import("@workspace/db");
const { eq, and, inArray } = await import("drizzle-orm");
const { default: noticeOutputsRouter } = await import("../routes/noticeOutputs");
const { default: externalDocumentsRouter } = await import("../routes/externalDocuments");
const { default: contractsRouter } = await import("../routes/contracts");

let currentUser: { userId: number; role: string; email: string | null; portalType: string } | null = null;
const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  if (currentUser) (req as unknown as { user: typeof currentUser }).user = currentUser;
  (req as unknown as { log: { warn: () => void; error: () => void; info: () => void } }).log = {
    warn: () => {},
    error: () => {},
    info: () => {},
  };
  next();
});
app.use("/api", noticeOutputsRouter);
app.use("/api", externalDocumentsRouter);
app.use("/api", contractsRouter);

let server: Server;
let baseUrl: string;
const createdBuildingIds: number[] = [];
const createdUserIds: number[] = [];
const createdTemplateIds: number[] = [];
const createdNoticeOutputIds: number[] = [];
const createdExternalDocIds: number[] = [];

let buildingId: number;
let managerId: number;
let templateId: number;

function uniqueEmail(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}@docs-upsert-test.local`;
}

before(async () => {
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const addr = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${addr.port}/api`;

  const [b] = await db
    .insert(buildingsTable)
    .values({
      name: `테스트빌딩-upsert-${crypto.randomUUID().slice(0, 6)}`,
      addressFull: "서울특별시 강남구 테헤란로 1",
      sido: "서울특별시",
      sigungu: "강남구",
    } as typeof buildingsTable.$inferInsert)
    .returning();
  buildingId = b.id;
  createdBuildingIds.push(b.id);

  const [u] = await db
    .insert(usersTable)
    .values({
      email: uniqueEmail("manager"),
      passwordHash: "x",
      role: "manager",
      name: "manager-upsert-test",
      portalType: "building",
      buildingId,
      approvalStatus: "active",
      roleSelected: true,
    } as typeof usersTable.$inferInsert)
    .returning();
  managerId = u.id;
  createdUserIds.push(u.id);

  const [t] = await db
    .insert(buildingNoticeTemplatesTable)
    .values({
      title: `업서트 테스트 템플릿 ${crypto.randomUUID().slice(0, 6)}`,
      category: "일반",
      bodyHtml: "<p>{{buildingName}}</p>",
    } as typeof buildingNoticeTemplatesTable.$inferInsert)
    .returning();
  templateId = t.id;
  createdTemplateIds.push(t.id);

  currentUser = {
    userId: managerId,
    role: "manager",
    email: u.email,
    portalType: "building",
  };
});

after(async () => {
  if (createdNoticeOutputIds.length > 0) {
    const noIds = createdNoticeOutputIds;
    await db
      .delete(documentsTable)
      .where(and(eq(documentsTable.sourceTable, "notice_outputs"), inArray(documentsTable.sourceId, noIds)));
    await db.delete(noticeOutputsTable).where(inArray(noticeOutputsTable.id, noIds));
  }
  if (createdExternalDocIds.length > 0) {
    const exIds = createdExternalDocIds;
    await db
      .delete(documentsTable)
      .where(and(eq(documentsTable.sourceTable, "external_documents"), inArray(documentsTable.sourceId, exIds)));
    await db.delete(externalDocumentsTable).where(inArray(externalDocumentsTable.id, exIds));
  }
  if (createdTemplateIds.length > 0) {
    await db.delete(buildingNoticeTemplatesTable).where(inArray(buildingNoticeTemplatesTable.id, createdTemplateIds));
  }
  if (createdUserIds.length > 0) {
    await db.delete(usersTable).where(inArray(usersTable.id, createdUserIds));
  }
  if (createdBuildingIds.length > 0) {
    await db.delete(buildingsTable).where(inArray(buildingsTable.id, createdBuildingIds));
  }
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await pool.end();
});

async function postNoticeOutput(opts: {
  templateId: number;
  title: string;
  format: "png" | "docx" | "pdf" | "share";
  outputDate?: string;
}): Promise<{ status: number; body: { id?: number; formats?: string[] } }> {
  const r = await fetch(`${baseUrl}/notice-outputs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(opts),
  });
  const body = (await r.json()) as { id?: number; formats?: string[] };
  if (typeof body.id === "number") createdNoticeOutputIds.push(body.id);
  return { status: r.status, body };
}

test("POST /notice-outputs → documents 에 (source_table, source_id) 1행이 생성된다", async () => {
  const outputDate = "2099-04-29";
  const res = await postNoticeOutput({
    templateId,
    title: `업서트 케이스 1 ${crypto.randomUUID().slice(0, 6)}`,
    format: "png",
    outputDate,
  });
  assert.equal(res.status, 201);
  assert.ok(res.body.id, "응답에 id 가 있어야 한다");

  const docRows = await db
    .select()
    .from(documentsTable)
    .where(and(eq(documentsTable.sourceTable, "notice_outputs"), eq(documentsTable.sourceId, res.body.id!)));

  assert.equal(docRows.length, 1, "documents 에 정확히 1 행이 있어야 한다");
  assert.equal(docRows[0].kind, "notice_output");
  assert.equal(docRows[0].buildingId, buildingId);
  // formats 가 metadata 또는 trigger 에 의해 누적되었는지 확인 (스키마는 metadata jsonb).
  const meta = (docRows[0].metadata ?? {}) as { formats?: string[] };
  assert.ok(Array.isArray(meta.formats), "metadata.formats 는 배열이어야 한다");
  assert.ok(meta.formats!.includes("png"), "formats 에 'png' 가 포함되어야 한다");
});

test("같은 (templateId, buildingId, outputDate) 재호출은 documents 1행을 유지하고 formats 가 누적된다", async () => {
  const outputDate = "2099-05-01";
  const titleBase = `업서트 케이스 2 ${crypto.randomUUID().slice(0, 6)}`;

  const r1 = await postNoticeOutput({ templateId, title: titleBase, format: "png", outputDate });
  assert.equal(r1.status, 201);
  const firstId = r1.body.id!;

  const r2 = await postNoticeOutput({ templateId, title: titleBase, format: "pdf", outputDate });
  assert.equal(r2.status, 201);
  // notice_outputs 자체는 (templateId, buildingId, outputDate) 유니크라 같은 row id 여야 한다.
  assert.equal(r2.body.id, firstId, "notice_outputs 행이 동일해야 한다 (upsert)");

  const noticeRows = await db
    .select()
    .from(noticeOutputsTable)
    .where(eq(noticeOutputsTable.id, firstId));
  assert.equal(noticeRows.length, 1);
  const formats = (noticeRows[0].formats ?? []) as string[];
  assert.ok(formats.includes("png") && formats.includes("pdf"), `formats 가 png+pdf 모두 포함해야 한다: ${formats}`);

  const docRows = await db
    .select()
    .from(documentsTable)
    .where(and(eq(documentsTable.sourceTable, "notice_outputs"), eq(documentsTable.sourceId, firstId)));
  assert.equal(docRows.length, 1, "documents 행은 여전히 1 (upsert) 이어야 한다");
  const meta = (docRows[0].metadata ?? {}) as { formats?: string[] };
  assert.ok(
    meta.formats?.includes("png") && meta.formats?.includes("pdf"),
    `documents.metadata.formats 가 png+pdf 모두 포함해야 한다: ${JSON.stringify(meta.formats)}`,
  );
});

test("다른 outputDate 로 호출하면 documents 가 새 행으로 생성된다", async () => {
  const titleBase = `업서트 케이스 3 ${crypto.randomUUID().slice(0, 6)}`;
  const r1 = await postNoticeOutput({ templateId, title: titleBase, format: "png", outputDate: "2099-06-01" });
  const r2 = await postNoticeOutput({ templateId, title: titleBase, format: "png", outputDate: "2099-06-02" });
  assert.equal(r1.status, 201);
  assert.equal(r2.status, 201);
  assert.notEqual(r1.body.id, r2.body.id, "다른 날짜는 다른 notice_outputs 행이어야 한다");

  const allDocsForTemplate = await db
    .select()
    .from(documentsTable)
    .where(
      and(
        eq(documentsTable.sourceTable, "notice_outputs"),
        inArray(documentsTable.sourceId, [r1.body.id!, r2.body.id!]),
      ),
    );
  assert.equal(allDocsForTemplate.length, 2, "각 source_id 마다 1 행씩, 총 2 행이어야 한다");
  const ids = new Set(allDocsForTemplate.map((d) => d.sourceId));
  assert.ok(ids.has(r1.body.id!) && ids.has(r2.body.id!));
});

test("POST /external-documents → documents (source_table='external_documents') 1행이 생성된다", async () => {
  const r = await fetch(`${baseUrl}/external-documents`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      title: `외부문서 ${crypto.randomUUID().slice(0, 6)}`,
      fileUrl: "https://example.com/file.pdf",
      mimeType: "application/pdf",
    }),
  });
  assert.equal(r.status, 201);
  const body = (await r.json()) as { id: number; buildingId: number };
  createdExternalDocIds.push(body.id);

  const docRows = await db
    .select()
    .from(documentsTable)
    .where(and(eq(documentsTable.sourceTable, "external_documents"), eq(documentsTable.sourceId, body.id)));
  assert.equal(docRows.length, 1, "documents 에 정확히 1 행이 있어야 한다");
  assert.equal(docRows[0].kind, "external");
  assert.equal(docRows[0].buildingId, buildingId);
});

test("PATCH /contracts/:id 가 존재하지 않는 id 에 대해 404 를 반환한다 (MissingSourceRowError → 404)", async () => {
  const r = await fetch(`${baseUrl}/contracts/999999999`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "노출 안되어야 함" }),
  });
  assert.equal(r.status, 404, "missing source row 는 500 이 아니라 404 여야 한다");
  const docRows = await db
    .select()
    .from(documentsTable)
    .where(and(eq(documentsTable.sourceTable, "contracts"), eq(documentsTable.sourceId, 999999999)));
  assert.equal(docRows.length, 0, "404 경로에서는 documents 가 만들어지지 않아야 한다");
});

test("(source_table, source_id) 는 documents 의 unique 키처럼 동작한다", async () => {
  // 동일 source 에 대해 N 회 반복 호출해도 documents 행 수는 1 이어야 한다.
  const outputDate = "2099-07-15";
  const titleBase = `업서트 케이스 4 ${crypto.randomUUID().slice(0, 6)}`;
  let firstId: number | undefined;
  for (const fmt of ["png", "docx", "pdf", "share", "png", "docx"] as const) {
    const r = await postNoticeOutput({ templateId, title: titleBase, format: fmt, outputDate });
    assert.equal(r.status, 201);
    if (firstId === undefined) firstId = r.body.id!;
    else assert.equal(r.body.id, firstId, "같은 source 행이어야 한다");
  }
  const docRows = await db
    .select()
    .from(documentsTable)
    .where(and(eq(documentsTable.sourceTable, "notice_outputs"), eq(documentsTable.sourceId, firstId!)));
  assert.equal(docRows.length, 1, "6 회 호출 후에도 documents 행은 정확히 1 이어야 한다");
});
