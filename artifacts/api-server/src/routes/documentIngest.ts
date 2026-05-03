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

// 회계 입력 게이트: facility_staff / custodian / partner 등 비경리 역할은 차단.
const accountingGate = requireRole("manager", "accountant", "platform_admin");
router.use("/documents/ingest", accountingGate);

async function getUserBuildingId(req: Request): Promise<number | null> {
  const userId = req.user?.userId;
  if (!userId) return null;
  const u = await db.select().from(usersTable).where(eq(usersTable.id, userId)).then(r => r[0]);
  return u?.buildingId ?? null;
}

router.post("/documents/ingest", async (req: Request, res: Response): Promise<void> => {
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
      const hashHit = await db.select({ id: documentIngestionsTable.id })
        .from(documentIngestionsTable)
        .where(and(
          eq(documentIngestionsTable.buildingId, buildingId),
          eq(documentIngestionsTable.contentHash, result.contentHash),
          eq(documentIngestionsTable.kind, result.kind),
        ))
        .limit(1);
      if (hashHit.length > 0) {
        duplicateOf = hashHit[0].id;
        duplicateReason = "hash";
      }
      // 의미적 dedup — (date, vendor, amount) 콤보 일치도 같은 거래로 본다.
      if (!duplicateOf) {
        const e = result.extraction;
        if (e.vendor && e.amount != null && e.date) {
          const recent = await db.select({
            id: documentIngestionsTable.id,
            extraction: documentIngestionsTable.extraction,
          })
            .from(documentIngestionsTable)
            .where(and(
              eq(documentIngestionsTable.buildingId, buildingId),
              eq(documentIngestionsTable.kind, result.kind),
            ))
            .orderBy(desc(documentIngestionsTable.createdAt))
            .limit(200);
          const match = recent.find(r => {
            const ex = r.extraction as StandardExtraction;
            return ex.vendor === e.vendor && ex.amount === e.amount && ex.date === e.date;
          });
          if (match) {
            duplicateOf = match.id;
            duplicateReason = "combo";
          }
        }
      }
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

router.get("/documents/ingest", async (req: Request, res: Response): Promise<void> => {
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

router.post("/documents/ingest/:id/confirm", async (req: Request, res: Response): Promise<void> => {
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

router.delete("/documents/ingest/:id", async (req: Request, res: Response): Promise<void> => {
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
