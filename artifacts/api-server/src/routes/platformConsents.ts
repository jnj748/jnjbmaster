import { Router, type IRouter } from "express";
import { and, desc, eq } from "drizzle-orm";
import { db, platformConsentsTable, platformConsentTypes } from "@workspace/db";
import { authMiddleware } from "../middlewares/auth";

const router: IRouter = Router();

router.use(authMiddleware);

router.get("/platform/consents", async (req, res): Promise<void> => {
  const userId = req.user!.userId;
  const rows = await db
    .select()
    .from(platformConsentsTable)
    .where(eq(platformConsentsTable.userId, userId))
    .orderBy(desc(platformConsentsTable.consentedAt));
  res.json(rows);
});

router.get("/platform/consents/check", async (req, res): Promise<void> => {
  const userId = req.user!.userId;
  const consentType = String(req.query.consentType || "");
  if (!consentType || !platformConsentTypes.includes(consentType as typeof platformConsentTypes[number])) {
    res.status(400).json({ error: "유효한 동의 유형이 필요합니다" });
    return;
  }
  const [row] = await db
    .select()
    .from(platformConsentsTable)
    .where(and(eq(platformConsentsTable.userId, userId), eq(platformConsentsTable.consentType, consentType as typeof platformConsentTypes[number])))
    .orderBy(desc(platformConsentsTable.consentedAt))
    .limit(1);
  res.json({ consented: !!row, consent: row || null });
});

router.post("/platform/consents", async (req, res): Promise<void> => {
  const userId = req.user!.userId;
  const { consentType, version, contextRef } = req.body || {};

  if (!consentType || !platformConsentTypes.includes(consentType)) {
    res.status(400).json({ error: "유효한 동의 유형이 필요합니다" });
    return;
  }

  const ipAddress = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket.remoteAddress || null;
  const userAgent = req.headers["user-agent"] || null;

  const [row] = await db
    .insert(platformConsentsTable)
    .values({
      userId,
      consentType,
      version: version || "1.0",
      contextRef: contextRef || null,
      ipAddress,
      userAgent,
    })
    .returning();

  res.status(201).json(row);
});

export default router;
