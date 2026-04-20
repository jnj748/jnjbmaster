import { Router, type IRouter } from "express";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db,
  platformConsentDocumentsTable,
  platformConsentTypes,
  consentRoles,
} from "@workspace/db";
import { authMiddleware, requireRole } from "../middlewares/auth";

const router: IRouter = Router();

// [Task #133] Public: signup screens fetch the currently published documents per role.
router.get("/platform/consent-documents/active", async (req, res): Promise<void> => {
  const role = String(req.query.role || "");
  if (!consentRoles.includes(role as typeof consentRoles[number])) {
    res.status(400).json({ error: "유효한 역할이 필요합니다" });
    return;
  }
  const rows = await db
    .select()
    .from(platformConsentDocumentsTable)
    .where(
      and(
        eq(platformConsentDocumentsTable.role, role as typeof consentRoles[number]),
        eq(platformConsentDocumentsTable.isPublished, true),
      ),
    )
    .orderBy(desc(platformConsentDocumentsTable.publishedAt));

  // Keep only the latest published version per consent type.
  const latest = new Map<string, typeof rows[number]>();
  for (const r of rows) {
    if (!latest.has(r.consentType)) latest.set(r.consentType, r);
  }
  res.json({ role, documents: Array.from(latest.values()) });
});

// Admin endpoints
router.use(authMiddleware);

router.get(
  "/platform/consent-documents",
  requireRole("platform_admin"),
  async (_req, res): Promise<void> => {
    const rows = await db
      .select()
      .from(platformConsentDocumentsTable)
      .orderBy(
        platformConsentDocumentsTable.role,
        platformConsentDocumentsTable.consentType,
        desc(platformConsentDocumentsTable.createdAt),
      );
    res.json(rows);
  },
);

const UpsertBody = z.object({
  role: z.enum(consentRoles),
  consentType: z.enum(platformConsentTypes),
  title: z.string().min(1),
  body: z.string().min(1),
  version: z.string().min(1),
  required: z.boolean().optional(),
  publish: z.boolean().optional(),
});

router.post(
  "/platform/consent-documents",
  requireRole("platform_admin"),
  async (req, res): Promise<void> => {
    const parsed = UpsertBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const { role, consentType, title, body, version, required, publish } = parsed.data;

    // Check if a document with this (role, type, version) already exists.
    const [existing] = await db
      .select()
      .from(platformConsentDocumentsTable)
      .where(
        and(
          eq(platformConsentDocumentsTable.role, role),
          eq(platformConsentDocumentsTable.consentType, consentType),
          eq(platformConsentDocumentsTable.version, version),
        ),
      );

    if (existing) {
      const [updated] = await db
        .update(platformConsentDocumentsTable)
        .set({
          title,
          body,
          required: required ?? existing.required,
          isPublished: publish ?? existing.isPublished,
          publishedAt: publish ? new Date() : existing.publishedAt,
        })
        .where(eq(platformConsentDocumentsTable.id, existing.id))
        .returning();
      res.json(updated);
      return;
    }

    const [created] = await db
      .insert(platformConsentDocumentsTable)
      .values({
        role,
        consentType,
        title,
        body,
        version,
        required: required ?? false,
        isPublished: publish ?? false,
        publishedAt: publish ? new Date() : null,
        createdBy: req.user!.userId,
      })
      .returning();
    res.status(201).json(created);
  },
);

router.post(
  "/platform/consent-documents/:id/publish",
  requireRole("platform_admin"),
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "유효한 ID가 필요합니다" });
      return;
    }
    const [updated] = await db
      .update(platformConsentDocumentsTable)
      .set({ isPublished: true, publishedAt: new Date() })
      .where(eq(platformConsentDocumentsTable.id, id))
      .returning();
    if (!updated) {
      res.status(404).json({ error: "문서를 찾을 수 없습니다" });
      return;
    }
    res.json(updated);
  },
);

export default router;
