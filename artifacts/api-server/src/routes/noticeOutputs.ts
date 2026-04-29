// [Task #610] 공고문 export 시점 등록 라우트.

import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, noticeOutputsTable, usersTable, buildingsTable, type DocumentAuthorRole, noticeOutputFormats, buildingNoticeTemplatesTable } from "@workspace/db";
import { requireRole } from "../middlewares/auth";
import { sql } from "drizzle-orm";
import { saveProducingDocument } from "../repo/producingDocuments";
import { buildDocumentName } from "@workspace/document-naming";

const router: IRouter = Router();

router.use(
  "/notice-outputs",
  requireRole("manager", "platform_admin", "accountant", "facility_staff", "hq_executive", "custodian"),
);

router.post("/notice-outputs", async (req, res): Promise<void> => {
  const userId = req.user?.userId;
  const role = req.user?.role;
  if (!userId || !role) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }

  const { templateId, title, format } = req.body ?? {};
  const outputDate = typeof req.body?.outputDate === "string" && req.body.outputDate
    ? req.body.outputDate
    : new Date().toISOString().slice(0, 10);

  if (typeof templateId !== "number" || !Number.isFinite(templateId)) {
    res.status(400).json({ error: "templateId(number) is required" });
    return;
  }
  if (typeof title !== "string" || !title.trim()) {
    res.status(400).json({ error: "title is required" });
    return;
  }
  if (typeof format !== "string" || !(noticeOutputFormats as readonly string[]).includes(format)) {
    res.status(400).json({ error: `format must be one of ${noticeOutputFormats.join("|")}` });
    return;
  }

  // 작성자 컨텍스트 — buildingId 는 서버가 강제, 클라 입력 무시.
  const [u] = await db
    .select({ buildingId: usersTable.buildingId, name: usersTable.name })
    .from(usersTable)
    .where(eq(usersTable.id, userId));
  const buildingId = u?.buildingId;
  if (buildingId == null) {
    res.status(400).json({ error: "no building scope" });
    return;
  }

  const [b] = await db.select({ name: buildingsTable.name }).from(buildingsTable).where(eq(buildingsTable.id, buildingId));

  // 표준 명명 규칙으로 표시 필드 등록(2층 — 트리거가 1층).
  const naming = buildDocumentName({
    kind: "notice_output",
    title: title.trim(),
    buildingName: b?.name ?? null,
    date: outputDate,
  });

  // template 메타 (선택) — 백필/디버깅 용도.
  let templateName: string | null = null;
  try {
    const [t] = await db
      .select({ title: buildingNoticeTemplatesTable.title })
      .from(buildingNoticeTemplatesTable)
      .where(eq(buildingNoticeTemplatesTable.id, templateId));
    templateName = t?.title ?? null;
  } catch {
    // 템플릿이 없거나 조회 실패해도 등록은 진행.
  }

  // [Task #610] 2층 단일 통로 — upsert + documents upsert 헬퍼 위임.
  const row = await saveProducingDocument({
    write: (exec) =>
      exec
        .insert(noticeOutputsTable)
        .values({
          templateId,
          buildingId,
          authorId: userId,
          authorRole: role,
          title: title.trim(),
          formats: [format],
          outputDate,
        })
        .onConflictDoUpdate({
          target: [noticeOutputsTable.templateId, noticeOutputsTable.buildingId, noticeOutputsTable.outputDate],
          set: {
            title: sql`EXCLUDED.title`,
            formats: sql`(
              SELECT ARRAY(
                SELECT DISTINCT v FROM unnest(${noticeOutputsTable.formats} || EXCLUDED.formats) AS v
              )
            )`,
            updatedAt: sql`now()`,
          },
        })
        .returning()
        .then((r) => r[0]),
    document: {
      kind: "notice_output",
      sourceTable: "notice_outputs",
      state: "active",
      title: naming.title,
      subtitle: b?.name ?? null,
      authorId: userId,
      authorRole: role as DocumentAuthorRole,
      buildingId,
      periodStart: outputDate,
      periodEnd: outputDate,
      href: `/notices/templates?templateId=${templateId}`,
      metadata: {
        templateId,
        templateName,
        title: title.trim(),
      },
      formatsAppend: [format],
    },
  });

  res.status(201).json(row);
});

export default router;
