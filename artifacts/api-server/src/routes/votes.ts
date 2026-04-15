import { Router, type IRouter, type Request, type Response } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db, votesTable, voteBallotsTable, usersTable, unitsTable } from "@workspace/db";
import {
  CreateVoteBody,
  CastBallotBody,
  UpdateVoteBody,
} from "@workspace/api-zod";
import { requireRole } from "../middlewares/auth";

const router: IRouter = Router();
router.use(requireRole("manager", "platform_admin", "accountant"));

async function getUserBuildingId(req: Request): Promise<number | null> {
  const userId = req.user?.userId;
  if (!userId) return null;
  const user = await db.select().from(usersTable).where(eq(usersTable.id, userId)).then(r => r[0]);
  return user?.buildingId ?? null;
}

router.get("/votes", async (req: Request, res: Response): Promise<void> => {
  const buildingId = await getUserBuildingId(req);
  if (!buildingId) { res.json([]); return; }

  const rows = await db
    .select()
    .from(votesTable)
    .where(eq(votesTable.buildingId, buildingId))
    .orderBy(desc(votesTable.createdAt));

  const enriched = await Promise.all(
    rows.map(async (v) => {
      const ballots = await db
        .select()
        .from(voteBallotsTable)
        .where(eq(voteBallotsTable.voteId, v.id));

      return {
        ...v,
        forCount: ballots.filter((b) => b.choice === "for").length,
        againstCount: ballots.filter((b) => b.choice === "against").length,
        abstainCount: ballots.filter((b) => b.choice === "abstain").length,
      };
    })
  );

  res.json(enriched);
});

router.post("/votes", async (req: Request, res: Response): Promise<void> => {
  const parsed = CreateVoteBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues });
    return;
  }
  const buildingId = await getUserBuildingId(req);
  if (!buildingId) { res.status(403).json({ error: "건물 정보가 없습니다" }); return; }

  const [row] = await db
    .insert(votesTable)
    .values({ ...parsed.data, buildingId, status: "active" })
    .returning();

  res.status(201).json({ ...row, forCount: 0, againstCount: 0, abstainCount: 0 });
});

router.get("/votes/:id", async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(req.params.id as string);
  const buildingId = await getUserBuildingId(req);
  if (!buildingId) { res.status(403).json({ error: "건물 정보가 없습니다" }); return; }

  const [vote] = await db
    .select()
    .from(votesTable)
    .where(and(eq(votesTable.id, id), eq(votesTable.buildingId, buildingId)));

  if (!vote) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const ballots = await db
    .select()
    .from(voteBallotsTable)
    .where(eq(voteBallotsTable.voteId, id));

  const forCount = ballots.filter((b) => b.choice === "for").length;
  const againstCount = ballots.filter((b) => b.choice === "against").length;
  const abstainCount = ballots.filter((b) => b.choice === "abstain").length;
  const totalVoted = forCount + againstCount + abstainCount;
  const turnoutRate = vote.totalEligible > 0
    ? Math.round((totalVoted / vote.totalEligible) * 10000) / 100
    : 0;

  res.json({
    ...vote,
    forCount,
    againstCount,
    abstainCount,
    turnoutRate,
    ballots: ballots.map((b) => ({
      unitNumber: b.unitNumber,
      voterName: b.voterName,
      choice: b.choice,
      createdAt: b.createdAt,
    })),
  });
});

router.patch("/votes/:id", async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(req.params.id as string);
  const parsed = UpdateVoteBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues });
    return;
  }
  const buildingId = await getUserBuildingId(req);
  if (!buildingId) { res.status(403).json({ error: "건물 정보가 없습니다" }); return; }

  const updates: Partial<typeof votesTable.$inferInsert> = {};
  if (parsed.data.status) updates.status = parsed.data.status;
  if (parsed.data.title) updates.title = parsed.data.title;
  if (parsed.data.description) updates.description = parsed.data.description;

  const [row] = await db
    .update(votesTable)
    .set(updates)
    .where(and(eq(votesTable.id, id), eq(votesTable.buildingId, buildingId)))
    .returning();

  if (!row) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  res.json(row);
});

router.delete("/votes/:id", async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(req.params.id as string);
  const buildingId = await getUserBuildingId(req);
  if (!buildingId) { res.status(403).json({ error: "건물 정보가 없습니다" }); return; }

  const [vote] = await db
    .select()
    .from(votesTable)
    .where(and(eq(votesTable.id, id), eq(votesTable.buildingId, buildingId)));

  if (!vote) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  await db.delete(voteBallotsTable).where(eq(voteBallotsTable.voteId, id));
  await db.delete(votesTable).where(eq(votesTable.id, id));

  res.json({ success: true });
});

router.post("/votes/:id/cast", async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(req.params.id as string);
  const parsed = CastBallotBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues });
    return;
  }
  const buildingId = await getUserBuildingId(req);
  if (!buildingId) { res.status(403).json({ error: "건물 정보가 없습니다" }); return; }

  const [vote] = await db
    .select()
    .from(votesTable)
    .where(and(eq(votesTable.id, id), eq(votesTable.buildingId, buildingId)));

  if (!vote) {
    res.status(404).json({ success: false, message: "투표를 찾을 수 없습니다" });
    return;
  }

  if (vote.status !== "active") {
    res.status(400).json({ success: false, message: "투표가 진행 중이 아닙니다" });
    return;
  }

  const unit = await db
    .select()
    .from(unitsTable)
    .where(and(eq(unitsTable.buildingId, buildingId), eq(unitsTable.unitNumber, parsed.data.unitNumber)))
    .then((r) => r[0]);

  try {
    await db.insert(voteBallotsTable).values({
      voteId: id,
      unitId: unit?.id ?? null,
      unitNumber: parsed.data.unitNumber,
      voterName: parsed.data.voterName,
      choice: parsed.data.choice,
    });
    res.json({ success: true, message: "투표가 완료되었습니다" });
  } catch (err: unknown) {
    const pgErr = err as { code?: string };
    if (pgErr.code === "23505") {
      res.status(409).json({ success: false, message: "이미 투표하셨습니다" });
    } else {
      throw err;
    }
  }
});

export default router;
