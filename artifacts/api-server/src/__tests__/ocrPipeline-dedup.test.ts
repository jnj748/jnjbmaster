// [Task #783] document_ingestions 의 중복 검출 통합 테스트.
// findDuplicate() 는 (buildingId + contentHash + kind) 해시 일치를 1차로,
// (vendor, amount, date) 콤보 일치를 2차로 본다. 본 테스트는 LLM/스토리지를
// 거치지 않고 DB 행을 직접 만들어 dedup 분기 전체를 검증한다.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret-for-ocr-dedup";

const {
  db,
  buildingsTable,
  documentIngestionsTable,
  pool,
} = await import("@workspace/db");
const { eq, inArray } = await import("drizzle-orm");
const { findDuplicate } = await import("../routes/documentIngest.js");

const createdIngestionIds: number[] = [];
const createdBuildingIds: number[] = [];
let buildingA: number;
let buildingB: number;

function suffix() {
  return crypto.randomUUID().slice(0, 8);
}

async function insertIngestion(opts: {
  buildingId: number | null;
  kind: "receipt" | "bill" | "bank_statement" | "contract" | "tax_invoice";
  contentHash: string;
  extraction: { vendor?: string | null; amount?: number | null; date?: string | null };
}): Promise<number> {
  const [row] = await db.insert(documentIngestionsTable).values({
    buildingId: opts.buildingId,
    uploadedBy: null,
    kind: opts.kind,
    status: "extracted",
    objectPath: `/test-objects/${suffix()}`,
    fileName: `f-${suffix()}.pdf`,
    mimeType: "application/pdf",
    contentHash: opts.contentHash,
    extraction: {
      kind: opts.kind,
      vendor: opts.extraction.vendor ?? null,
      amount: opts.extraction.amount ?? null,
      date: opts.extraction.date ?? null,
      items: [],
      categoryCandidates: [],
      confidence: 0.9,
      rawText: "",
      pages: [],
      kindSpecific: {},
    },
  }).returning({ id: documentIngestionsTable.id });
  createdIngestionIds.push(row.id);
  return row.id;
}

before(async () => {
  const [bA] = await db.insert(buildingsTable).values({
    name: `dedup-A-${suffix()}`,
    addressFull: "서울특별시 강남구 테헤란로 1",
    sido: "서울특별시",
    sigungu: "강남구",
  } as typeof buildingsTable.$inferInsert).returning();
  buildingA = bA.id;
  createdBuildingIds.push(bA.id);

  const [bB] = await db.insert(buildingsTable).values({
    name: `dedup-B-${suffix()}`,
    addressFull: "서울특별시 강남구 테헤란로 2",
    sido: "서울특별시",
    sigungu: "강남구",
  } as typeof buildingsTable.$inferInsert).returning();
  buildingB = bB.id;
  createdBuildingIds.push(bB.id);
});

after(async () => {
  if (createdIngestionIds.length > 0) {
    await db.delete(documentIngestionsTable).where(inArray(documentIngestionsTable.id, createdIngestionIds));
  }
  if (createdBuildingIds.length > 0) {
    await db.delete(buildingsTable).where(inArray(buildingsTable.id, createdBuildingIds));
  }
  await pool.end();
});

test("findDuplicate: 같은 (building, hash, kind) 재업로드는 hash dedup 으로 잡힌다", async () => {
  const hash = crypto.randomBytes(16).toString("hex");
  const firstId = await insertIngestion({
    buildingId: buildingA,
    kind: "receipt",
    contentHash: hash,
    extraction: { vendor: "마트A", amount: 10000, date: "2026-04-01" },
  });
  const dup = await findDuplicate({
    buildingId: buildingA,
    kind: "receipt",
    contentHash: hash,
    extraction: { vendor: "마트A", amount: 10000, date: "2026-04-01" },
  });
  assert.equal(dup.duplicateOf, firstId);
  assert.equal(dup.duplicateReason, "hash");
});

test("findDuplicate: 같은 hash 라도 kind 가 다르면 dedup 되지 않는다", async () => {
  const hash = crypto.randomBytes(16).toString("hex");
  await insertIngestion({
    buildingId: buildingA,
    kind: "receipt",
    contentHash: hash,
    extraction: { vendor: "X", amount: 1, date: "2026-04-02" },
  });
  const dup = await findDuplicate({
    buildingId: buildingA,
    kind: "bill",
    contentHash: hash,
    extraction: { vendor: "X", amount: 1, date: "2026-04-02" },
  });
  // kind 가 다르므로 hash hit 도, 콤보 hit 도 아님 (다른 종류라서 콤보 검색 범위 밖).
  assert.equal(dup.duplicateOf, null);
  assert.equal(dup.duplicateReason, null);
});

test("findDuplicate: 같은 hash 라도 building 이 다르면 dedup 되지 않는다 (테넌트 격리)", async () => {
  const hash = crypto.randomBytes(16).toString("hex");
  await insertIngestion({
    buildingId: buildingA,
    kind: "receipt",
    contentHash: hash,
    extraction: { vendor: "Y", amount: 1, date: "2026-04-03" },
  });
  const dup = await findDuplicate({
    buildingId: buildingB,
    kind: "receipt",
    contentHash: hash,
    extraction: { vendor: "Y", amount: 1, date: "2026-04-03" },
  });
  assert.equal(dup.duplicateOf, null);
  assert.equal(dup.duplicateReason, null);
});

test("findDuplicate: hash 가 달라도 (vendor, amount, date) 가 모두 같으면 combo dedup 으로 잡힌다", async () => {
  const firstId = await insertIngestion({
    buildingId: buildingA,
    kind: "tax_invoice",
    contentHash: crypto.randomBytes(16).toString("hex"),
    extraction: { vendor: "용역업체Z", amount: 550000, date: "2026-03-31" },
  });
  const dup = await findDuplicate({
    buildingId: buildingA,
    kind: "tax_invoice",
    contentHash: crypto.randomBytes(16).toString("hex"), // 다른 파일이지만 같은 거래
    extraction: { vendor: "용역업체Z", amount: 550000, date: "2026-03-31" },
  });
  assert.equal(dup.duplicateOf, firstId);
  assert.equal(dup.duplicateReason, "combo");
});

test("findDuplicate: combo 키 중 하나라도 어긋나면 dedup 되지 않는다", async () => {
  await insertIngestion({
    buildingId: buildingA,
    kind: "contract",
    contentHash: crypto.randomBytes(16).toString("hex"),
    extraction: { vendor: "청소업체", amount: 300000, date: "2026-02-01" },
  });
  // amount 차이
  const d1 = await findDuplicate({
    buildingId: buildingA,
    kind: "contract",
    contentHash: crypto.randomBytes(16).toString("hex"),
    extraction: { vendor: "청소업체", amount: 300001, date: "2026-02-01" },
  });
  assert.equal(d1.duplicateOf, null, "amount 가 다르면 combo dedup 이 아님");
  // date 차이
  const d2 = await findDuplicate({
    buildingId: buildingA,
    kind: "contract",
    contentHash: crypto.randomBytes(16).toString("hex"),
    extraction: { vendor: "청소업체", amount: 300000, date: "2026-02-02" },
  });
  assert.equal(d2.duplicateOf, null, "date 가 다르면 combo dedup 이 아님");
  // vendor 차이
  const d3 = await findDuplicate({
    buildingId: buildingA,
    kind: "contract",
    contentHash: crypto.randomBytes(16).toString("hex"),
    extraction: { vendor: "다른업체", amount: 300000, date: "2026-02-01" },
  });
  assert.equal(d3.duplicateOf, null, "vendor 가 다르면 combo dedup 이 아님");
});

test("findDuplicate: combo 키가 일부라도 누락되면 combo dedup 검색은 건너뛴다", async () => {
  // 이전에 vendor=null 인 행이 있어도 새 입력의 vendor 가 null/undefined 면 검색 자체가 일어나지 않는다.
  await insertIngestion({
    buildingId: buildingA,
    kind: "bank_statement",
    contentHash: crypto.randomBytes(16).toString("hex"),
    extraction: { vendor: null, amount: null, date: null },
  });
  const dup = await findDuplicate({
    buildingId: buildingA,
    kind: "bank_statement",
    contentHash: crypto.randomBytes(16).toString("hex"),
    extraction: { vendor: null, amount: null, date: null },
  });
  assert.equal(dup.duplicateOf, null);
  assert.equal(dup.duplicateReason, null);
});

test("findDuplicate: hash 일치가 combo 일치보다 우선이다", async () => {
  const sharedHash = crypto.randomBytes(16).toString("hex");
  // 같은 콤보를 가진 다른 행 (콤보 후보)
  const comboCandidateId = await insertIngestion({
    buildingId: buildingA,
    kind: "receipt",
    contentHash: crypto.randomBytes(16).toString("hex"),
    extraction: { vendor: "우선순위마트", amount: 7777, date: "2026-04-04" },
  });
  // 같은 hash 를 가진 행 (hash 후보)
  const hashCandidateId = await insertIngestion({
    buildingId: buildingA,
    kind: "receipt",
    contentHash: sharedHash,
    extraction: { vendor: "다른상호", amount: 9999, date: "2026-04-05" },
  });
  const dup = await findDuplicate({
    buildingId: buildingA,
    kind: "receipt",
    contentHash: sharedHash,
    extraction: { vendor: "우선순위마트", amount: 7777, date: "2026-04-04" },
  });
  assert.equal(dup.duplicateReason, "hash");
  assert.equal(dup.duplicateOf, hashCandidateId);
  assert.notEqual(dup.duplicateOf, comboCandidateId);
});
