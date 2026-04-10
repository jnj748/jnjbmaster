import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, digitalSignaturesTable, usersTable } from "@workspace/db";

const router: IRouter = Router();

router.get("/signatures", async (req, res): Promise<void> => {
  const user = req.user!;
  const signatures = await db
    .select()
    .from(digitalSignaturesTable)
    .where(eq(digitalSignaturesTable.userId, user.userId));

  res.json(
    signatures.map((s) => ({
      ...s,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
    }))
  );
});

router.post("/signatures", async (req, res): Promise<void> => {
  const user = req.user!;
  const { signatureType, signatureData } = req.body;

  if (!signatureType || !signatureData) {
    res.status(400).json({ error: "서명 데이터가 필요합니다" });
    return;
  }

  const userName = await db
    .select({ name: usersTable.name })
    .from(usersTable)
    .where(eq(usersTable.id, user.userId))
    .then((rows) => rows[0]?.name ?? user.email);

  const [row] = await db
    .insert(digitalSignaturesTable)
    .values({
      userId: user.userId,
      userName,
      signatureType,
      signatureData,
    })
    .returning();

  res.status(201).json({
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
});

router.delete("/signatures/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const user = req.user!;

  const [row] = await db
    .select()
    .from(digitalSignaturesTable)
    .where(and(eq(digitalSignaturesTable.id, id), eq(digitalSignaturesTable.userId, user.userId)));

  if (!row) {
    res.status(404).json({ error: "서명을 찾을 수 없습니다" });
    return;
  }

  await db.delete(digitalSignaturesTable).where(eq(digitalSignaturesTable.id, id));

  res.json({ success: true });
});

export default router;
