import { Router, type IRouter } from "express";
import { eq, and, desc, sql } from "drizzle-orm";
import { db, votesTable, voteBallotsTable } from "@workspace/db";
import {
  CreateVoteBody,
  CastBallotBody,
} from "@workspace/api-zod";
import { requireRole } from "../middlewares/auth";

const router: IRouter = Router();
router.use(requireRole("manager", "platform_admin", "accountant"));

function getUserBuildingId(req: any): number {
  return req.user?.buildingId ?? 1;
}

router.get("/votes", async (req, res): Promise<void> => {
  const buildingId = getUserBuildingId(req);

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

router.post("/votes", async (req, res): Promise<void> => {
  const parsed = CreateVoteBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues });
    return;
  }
  const buildingId = getUserBuildingId(req);

  const [row] = await db
    .insert(votesTable)
    .values({ ...parsed.data, buildingId, status: "active" })
    .returning();

  res.status(201).json({ ...row, forCount: 0, againstCount: 0, abstainCount: 0 });
});

router.get("/votes/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  const buildingId = getUserBuildingId(req);

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

router.post("/votes/:id/cast", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  const parsed = CastBallotBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues });
    return;
  }
  const buildingId = getUserBuildingId(req);

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

  try {
    await db.insert(voteBallotsTable).values({
      voteId: id,
      unitNumber: parsed.data.unitNumber,
      voterName: parsed.data.voterName,
      choice: parsed.data.choice,
    });
    res.json({ success: true, message: "투표가 완료되었습니다" });
  } catch (e: any) {
    if (e.code === "23505") {
      res.status(409).json({ success: false, message: "이미 투표하셨습니다" });
    } else {
      throw e;
    }
  }
});

export default router;
