// [Task #774] OCR/문서엔진 v01 — 단일 진입 라우트.
//   - 표준 contract: POST /api/documents/ingest, GET /api/documents/ingest,
//     POST /api/documents/ingest/:id/confirm, DELETE /api/documents/ingest/:id.
//   - documents.ts 의 `GET /documents/:id` 와 경로 충돌이 있으니 mount 순서에서
//     이 라우터를 documentsRouter 보다 먼저 등록한다 (routes/index.ts 참고).
//   - 회계 흐름의 입력 게이트라서 manager / accountant / platform_admin 만 허용.
//   - dedup: file hash 일치 + (date, vendor, amount) 콤보 일치 둘 다 검사한다.

import { Router, type IRouter, type Request, type Response } from "express";
import { and, desc, eq } from "drizzle-orm";
import {
  db,
  documentIngestionsTable,
  usersTable,
  documentIngestionKinds,
  type DocumentIngestionKind,
  type StandardExtraction,
} from "@workspace/db";
import { ObjectStorageService } from "../lib/objectStorage";
import { ObjectPermission } from "../lib/objectAcl";
import { ingestDocument, OcrPipelineInputError } from "../lib/ocrPipeline";
import { requireRole } from "../middlewares/auth";

const router: IRouter = Router();

// [Task #774] 회계 입력 게이트: 업로드/확정/삭제 같은 쓰기 작업은 경리 권한만.
// [Task #782] 단, 후속 엔진에서 "보관함에서 가져오기" 진입을 쓰는 custodian(관리인) 도
//   조회(GET) 와 linkedRefs 갱신(/link) 은 가능해야 한다.
//   따라서 라우터 전역 게이트 대신 라우트별 가드로 분리한다.
const accountingGate = requireRole("manager", "accountant", "platform_admin");
const consumerGate = requireRole("manager", "accountant", "platform_admin", "custodian");

/**
 * [Task #783] 중복 검출 로직. 라우트에서 빼낸 이유는 통합 테스트가 LLM/스토리지를
 * 거치지 않고 dedup 만 직접 검증할 수 있게 하기 위함이다.
 *
 * 두 가지 dedup 을 순서대로 본다:
 *  1. hash dedup — 같은 (buildingId, contentHash, kind) 가 이미 있으면 그 행을 가리킨다.
 *  2. combo dedup — (vendor, amount, date) 가 모두 동일하면 의미적 중복으로 본다.
 */
export async function findDuplicate(opts: {
  buildingId: number;
  kind: DocumentIngestionKind;
  contentHash: string;
  extraction: Pick<StandardExtraction, "vendor" | "amount" | "date">;
}): Promise<{ duplicateOf: number | null; duplicateReason: "hash" | "combo" | null }> {
  const hashHit = await db.select({ id: documentIngestionsTable.id })
    .from(documentIngestionsTable)
    .where(and(
      eq(documentIngestionsTable.buildingId, opts.buildingId),
      eq(documentIngestionsTable.contentHash, opts.contentHash),
      eq(documentIngestionsTable.kind, opts.kind),
    ))
    .limit(1);
  if (hashHit.length > 0) {
    return { duplicateOf: hashHit[0].id, duplicateReason: "hash" };
  }
  const e = opts.extraction;
  if (e.vendor && e.amount != null && e.date) {
    const recent = await db.select({
      id: documentIngestionsTable.id,
      extraction: documentIngestionsTable.extraction,
    })
      .from(documentIngestionsTable)
      .where(and(
        eq(documentIngestionsTable.buildingId, opts.buildingId),
        eq(documentIngestionsTable.kind, opts.kind),
      ))
      .orderBy(desc(documentIngestionsTable.createdAt))
      .limit(200);
    const match = recent.find(r => {
      const ex = r.extraction as StandardExtraction;
      return ex.vendor === e.vendor && ex.amount === e.amount && ex.date === e.date;
    });
    if (match) {
      return { duplicateOf: match.id, duplicateReason: "combo" };
    }
  }
  return { duplicateOf: null, duplicateReason: null };
}

async function getUserBuildingId(req: Request): Promise<number | null> {
  const userId = req.user?.userId;
  if (!userId) return null;
  const u = await db.select().from(usersTable).where(eq(usersTable.id, userId)).then(r => r[0]);
  return u?.buildingId ?? null;
}

router.post("/documents/ingest", accountingGate, async (req: Request, res: Response): Promise<void> => {
  const { objectPath, fileName, kindHint } = req.body ?? {};
  if (!objectPath || typeof objectPath !== "string") {
    res.status(400).json({ error: "objectPath가 필요합니다" });
    return;
  }
  const validHint = typeof kindHint === "string" && (documentIngestionKinds as readonly string[]).includes(kindHint)
    ? (kindHint as DocumentIngestionKind)
    : undefined;

  try {
    const storage = new ObjectStorageService();
    const file = await storage.getObjectEntityFile(objectPath);
    const allowed = await storage.canAccessObjectEntity({
      userId: req.user?.userId ? String(req.user.userId) : undefined,
      objectFile: file,
      requestedPermission: ObjectPermission.READ,
    });
    if (!allowed) {
      res.status(403).json({ error: "해당 파일 접근 권한이 없습니다" });
      return;
    }
  } catch {
    res.status(404).json({ error: "파일을 찾지 못했습니다" });
    return;
  }

  const buildingId = await getUserBuildingId(req);
  const userId = req.user?.userId ?? null;

  try {
    const result = await ingestDocument({ objectPath, fileName: fileName ?? null, kindHint: validHint });

    let duplicateOf: number | null = null;
    let duplicateReason: "hash" | "combo" | null = null;
    if (buildingId != null) {
      const dup = await findDuplicate({
        buildingId,
        kind: result.kind,
        contentHash: result.contentHash,
        extraction: result.extraction,
      });
      duplicateOf = dup.duplicateOf;
      duplicateReason = dup.duplicateReason;
    }

    let ingestionId: number | null = null;
    if (!duplicateOf) {
      const [row] = await db.insert(documentIngestionsTable).values({
        buildingId,
        uploadedBy: userId,
        kind: result.kind,
        status: "extracted",
        objectPath,
        fileName: fileName ?? null,
        mimeType: result.mimeType,
        contentHash: result.contentHash,
        extraction: result.extraction,
        llmAccounting: result.llmAccounting,
      }).returning({ id: documentIngestionsTable.id });
      ingestionId = row.id;
    }

    res.json({
      id: ingestionId,
      kind: result.kind,
      contentHash: result.contentHash,
      duplicateOf,
      duplicateReason,
      extraction: result.extraction,
    });
  } catch (err) {
    if (err instanceof OcrPipelineInputError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    req.log.error({ err, objectPath }, "documents/ingest POST failed");
    res.status(500).json({ error: err instanceof Error ? err.message : "OCR 처리 실패" });
  }
});

router.get("/documents/ingest", consumerGate, async (req: Request, res: Response): Promise<void> => {
  const buildingId = await getUserBuildingId(req);
  if (!buildingId) { res.json([]); return; }
  const kindParam = typeof req.query.kind === "string" ? req.query.kind : null;
  const kind = kindParam && (documentIngestionKinds as readonly string[]).includes(kindParam)
    ? (kindParam as DocumentIngestionKind)
    : null;
  const limit = Math.min(Number(req.query.limit) || 50, 200);

  const conds = [eq(documentIngestionsTable.buildingId, buildingId)];
  if (kind) conds.push(eq(documentIngestionsTable.kind, kind));

  const rows = await db.select().from(documentIngestionsTable)
    .where(and(...conds))
    .orderBy(desc(documentIngestionsTable.createdAt))
    .limit(limit);
  res.json(rows);
});

router.post("/documents/ingest/:id/confirm", accountingGate, async (req: Request, res: Response): Promise<void> => {
  const buildingId = await getUserBuildingId(req);
  if (!buildingId) { res.status(403).json({ error: "건물 정보가 없습니다" }); return; }
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "id 가 잘못되었습니다" }); return; }

  const { extraction, linkedRefs, status } = req.body ?? {};
  const sets: Record<string, unknown> = {};
  if (extraction && typeof extraction === "object") sets.extraction = extraction as StandardExtraction;
  if (linkedRefs && typeof linkedRefs === "object") sets.linkedRefs = linkedRefs;
  const validStatus = typeof status === "string" && ["extracted", "confirmed", "rejected"].includes(status)
    ? status
    : "confirmed";
  sets.status = validStatus;

  const [existing] = await db.select({ status: documentIngestionsTable.status })
    .from(documentIngestionsTable)
    .where(and(
      eq(documentIngestionsTable.id, id),
      eq(documentIngestionsTable.buildingId, buildingId),
    ));
  if (!existing) { res.status(404).json({ error: "보관함 항목을 찾지 못했습니다" }); return; }
  if (existing.status !== "extracted") {
    res.status(409).json({ error: `이미 ${existing.status} 상태인 항목은 재확인할 수 없습니다` });
    return;
  }

  const [row] = await db.update(documentIngestionsTable)
    .set(sets)
    .where(and(
      eq(documentIngestionsTable.id, id),
      eq(documentIngestionsTable.buildingId, buildingId),
    ))
    .returning();
  res.json(row);
});

// [Task #782] 후속 엔진(지출결의·부과·수납·회계) 화면이 보관함 자료를 사용한 뒤,
//   생성된 후속 객체 id 를 ingestion 의 linkedRefs 에 누적 저장하는 진입점.
//   /confirm 과 달리 status 를 바꾸지 않고, 이미 confirmed 인 항목에도 호출 가능하다.
//   merge 시 기존 키를 덮어쓰지 않고 함께 보존한다(같은 키는 갱신, 새 키는 추가).
router.post("/documents/ingest/:id/link", consumerGate, async (req: Request, res: Response): Promise<void> => {
  const buildingId = await getUserBuildingId(req);
  if (!buildingId) { res.status(403).json({ error: "건물 정보가 없습니다" }); return; }
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "id 가 잘못되었습니다" }); return; }

  const { linkedRefs } = req.body ?? {};
  if (!linkedRefs || typeof linkedRefs !== "object" || Array.isArray(linkedRefs)) {
    res.status(400).json({ error: "linkedRefs 가 필요합니다" });
    return;
  }

  const [existing] = await db.select({ linkedRefs: documentIngestionsTable.linkedRefs })
    .from(documentIngestionsTable)
    .where(and(
      eq(documentIngestionsTable.id, id),
      eq(documentIngestionsTable.buildingId, buildingId),
    ));
  if (!existing) { res.status(404).json({ error: "보관함 항목을 찾지 못했습니다" }); return; }

  const merged = {
    ...(existing.linkedRefs as Record<string, number | string> | null ?? {}),
    ...(linkedRefs as Record<string, number | string>),
  };

  const [row] = await db.update(documentIngestionsTable)
    .set({ linkedRefs: merged })
    .where(and(
      eq(documentIngestionsTable.id, id),
      eq(documentIngestionsTable.buildingId, buildingId),
    ))
    .returning();
  res.json(row);
});

router.delete("/documents/ingest/:id", accountingGate, async (req: Request, res: Response): Promise<void> => {
  const buildingId = await getUserBuildingId(req);
  if (!buildingId) { res.status(403).json({ error: "건물 정보가 없습니다" }); return; }
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "id 가 잘못되었습니다" }); return; }
  await db.delete(documentIngestionsTable).where(and(
    eq(documentIngestionsTable.id, id),
    eq(documentIngestionsTable.buildingId, buildingId),
  ));
  res.json({ ok: true });
});

export default router;
