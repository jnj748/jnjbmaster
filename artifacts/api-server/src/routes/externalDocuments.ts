import { Router, type IRouter } from "express";
import { eq, desc, and, inArray } from "drizzle-orm";
import { db, externalDocumentsTable, usersTable } from "@workspace/db";
import { requireRole } from "../middlewares/auth";
import { getAccessibleBuildingIds } from "../middlewares/buildingScope";
// [Task #610] 2층 단일 통로 — 외부 문서 commit 후 documents 레지스트리에 등록.
import { saveProducingDocument } from "../repo/producingDocuments";
import { buildDocumentName } from "@workspace/document-naming";
import type { DocumentAuthorRole } from "@workspace/db";

const router: IRouter = Router();

router.use(
  "/external-documents",
  requireRole("manager", "platform_admin", "accountant", "facility_staff", "hq_executive"),
);

async function resolveBuildingId(userId: number): Promise<number | null> {
  const u = await db
    .select({ buildingId: usersTable.buildingId })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .then((r) => r[0]);
  return u?.buildingId ?? null;
}

router.get("/external-documents", async (req, res): Promise<void> => {
  // [Task #610 — 코드리뷰 fix] auth.ts 의 declare global 로 req.user 가 이미 typed 되어 있다.
  const userId = req.user?.userId;
  if (!userId) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }

  // [Task #596] hq_executive 는 매핑된 건물 묶음의 외부 문서를 조회.
  //   platform_admin 만 전 건물 가시. 비할당 매니저/회계는 빈 배열.
  const scope = await getAccessibleBuildingIds(req);
  if (!scope.unrestricted && scope.ids.length === 0) {
    res.json([]);
    return;
  }
  const rows = scope.unrestricted
    ? await db.select().from(externalDocumentsTable)
        .orderBy(desc(externalDocumentsTable.createdAt)).limit(50)
    : await db.select().from(externalDocumentsTable)
        .where(inArray(externalDocumentsTable.buildingId, scope.ids))
        .orderBy(desc(externalDocumentsTable.createdAt)).limit(50);

  res.json(rows);
});

router.post("/external-documents", async (req, res): Promise<void> => {
  const userId = req.user?.userId;
  const role = req.user?.role;
  if (!userId) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  const buildingId = await resolveBuildingId(Number(userId));
  if (buildingId == null) {
    res.status(400).json({ error: "no building scope" });
    return;
  }

  const { title, fileUrl, mimeType } = req.body ?? {};
  if (typeof title !== "string" || !title.trim()) {
    res.status(400).json({ error: "title is required" });
    return;
  }
  if (typeof fileUrl !== "string" || !fileUrl.trim()) {
    res.status(400).json({ error: "fileUrl is required" });
    return;
  }

  // [Task #610] 2층 단일 통로 — INSERT + documents upsert 헬퍼 위임.
  let row: typeof externalDocumentsTable.$inferSelect;
  try {
    row = await saveProducingDocument({
      write: (exec) =>
        exec
          .insert(externalDocumentsTable)
          .values({
            buildingId, // 서버 컨텍스트로 강제 — 클라이언트 입력 무시
            title: title.trim(),
            fileUrl: fileUrl.trim(),
            mimeType: typeof mimeType === "string" ? mimeType : null,
            uploadedBy: Number(userId),
          })
          .returning()
          .then((r) => r[0]),
      document: {
        kind: "external",
        sourceTable: "external_documents",
        state: "active",
        // [Task #610] 명명 SoT — buildDocumentName('external') 적용.
        title: (r) =>
          buildDocumentName({
            kind: "external",
            originalName: r.title,
            date: r.createdAt,
          }).title,
        authorId: Number(userId),
        authorRole: (role as DocumentAuthorRole) ?? null,
        buildingId: (r) => r.buildingId,
        href: (r) => r.fileUrl,
        metadata: (r) => ({ mimeType: r.mimeType }),
      },
    });
  } catch (err) {
    // pino-http 가 req.log 를 augment 하므로 캐스팅 불필요.
    req.log.error({ err }, "[Task #610] external_document saveProducingDocument failed");
    res.status(500).json({ error: "외부 문서 등록 실패" });
    return;
  }

  res.status(201).json(row);
});

router.delete("/external-documents/:id", async (req, res): Promise<void> => {
  const userId = req.user?.userId;
  if (!userId) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "invalid id" });
    return;
  }
  const buildingId = await resolveBuildingId(Number(userId));
  if (buildingId == null) {
    res.status(403).json({ error: "no building scope" });
    return;
  }

  const result = await db
    .delete(externalDocumentsTable)
    .where(
      and(
        eq(externalDocumentsTable.id, id),
        eq(externalDocumentsTable.buildingId, buildingId),
      ),
    )
    .returning({ id: externalDocumentsTable.id });

  if (result.length === 0) {
    res.status(404).json({ error: "not found" });
    return;
  }
  res.json({ success: true });
});

export default router;
