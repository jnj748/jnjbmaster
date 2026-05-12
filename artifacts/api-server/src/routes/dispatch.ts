// [Task #781] /dispatch/* — 발송 잡 큐 운영 라우트.
//
// - GET    /dispatch/jobs                  발송이력 (status/channel 필터).
// - GET    /dispatch/stats                 카드 요약(대기/실패/완료).
// - POST   /dispatch/jobs                  운영자 수동 발송(채널/대상/페이로드).
// - POST   /dispatch/jobs/:id/retry        실패 잡 즉시 재시도.
// - GET    /dispatch/popbill-settings      Popbill 설정(발신번호·템플릿).
// - PUT    /dispatch/popbill-settings      설정 갱신.
// - GET    /dispatch/channels              등록된 채널 슬러그.
//
// 모든 발송계 액션은 audit("dispatch.send" / "dispatch.retry") 로 자동 기록한다.

import { Router, type IRouter, type Request, type Response } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db,
  dispatchJobsTable,
  popbillSettingsTable,
  type DispatchChannel,
} from "@workspace/db";
import { requireRole } from "../middlewares/auth";
import { requireAction, audit } from "../middlewares/audit";
import { getUserBuildingId } from "../middlewares/buildingScope";
import {
  enqueueDispatch,
  retryJob,
  listJobs,
  dispatchStats,
  listChannels,
} from "../lib/external/adapter";

const router: IRouter = Router();

router.use("/dispatch", requireRole("manager", "platform_admin", "accountant", "custodian"));

router.get("/dispatch/jobs", async (req: Request, res: Response): Promise<void> => {
  const buildingId = await getUserBuildingId(req);
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const channel = typeof req.query.channel === "string" ? req.query.channel : undefined;
  const limit = Math.min(500, Number(req.query.limit) || 100);
  const rows = await listJobs(buildingId, { status, channel, limit });
  // 응답 직전 마스킹 — 전화번호는 끝 4자리만 노출.
  const masked = rows.map((r) => ({ ...r, target: maskTarget(r.channel, r.target) }));
  res.json(masked);
});

router.get("/dispatch/stats", async (req: Request, res: Response): Promise<void> => {
  const buildingId = await getUserBuildingId(req);
  const stats = await dispatchStats(buildingId);
  res.json(stats);
});

router.get("/dispatch/channels", (_req, res): void => {
  res.json({ channels: listChannels() });
});

const SendBody = z.object({
  channel: z.string().min(2),
  target: z.string().min(2),
  payload: z.record(z.string(), z.unknown()).default({}),
  relatedMonth: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  relatedEntityType: z.string().optional(),
  relatedEntityId: z.number().int().optional(),
  triggerSource: z.string().optional(),
});

router.post(
  "/dispatch/jobs",
  requireAction("dispatch.send"),
  audit("dispatch.send", { targetType: "dispatch_job" }),
  async (req: Request, res: Response): Promise<void> => {
    const parsed = SendBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.issues }); return; }
    const buildingId = await getUserBuildingId(req);
    try {
      const job = await enqueueDispatch({
        buildingId,
        channel: parsed.data.channel as DispatchChannel,
        target: parsed.data.target,
        payload: parsed.data.payload,
        relatedMonth: parsed.data.relatedMonth ?? null,
        relatedEntityType: parsed.data.relatedEntityType ?? null,
        relatedEntityId: parsed.data.relatedEntityId ?? null,
        triggerSource: parsed.data.triggerSource ?? "manual",
        createdBy: req.user?.userId ?? null,
      });
      res.json(job);
    } catch (e) {
      const msg = (e as Error)?.message ?? "send_failed";
      if (msg.startsWith("closing_required:")) {
        res.status(409).json({ error: "closing_required", message: msg });
        return;
      }
      if (msg.startsWith("unknown_dispatch_channel:")) {
        res.status(400).json({ error: "unknown_channel", message: msg });
        return;
      }
      res.status(500).json({ error: msg });
    }
  },
);

router.post(
  "/dispatch/jobs/:id/retry",
  requireAction("dispatch.retry"),
  audit("dispatch.retry", { targetType: "dispatch_job", targetIdParam: "id" }),
  async (req: Request, res: Response): Promise<void> => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) { res.status(400).json({ error: "invalid_id" }); return; }
    const job = await retryJob(id);
    if (!job) { res.status(404).json({ error: "job_not_found_or_already_processing" }); return; }
    res.json({ ...job, target: maskTarget(job.channel, job.target) });
  },
);

router.get("/dispatch/popbill-settings", async (req: Request, res: Response): Promise<void> => {
  const buildingId = await getUserBuildingId(req);
  if (!buildingId) { res.status(403).json({ error: "건물 정보가 없습니다" }); return; }
  const [row] = await db.select().from(popbillSettingsTable).where(eq(popbillSettingsTable.buildingId, buildingId));
  res.json(
    row ?? {
      buildingId,
      senderNumber: null,
      senderProfileId: null,
      kakaoTemplates: {},
      secretsConfigured: !!process.env.POPBILL_LINK_ID && !!process.env.POPBILL_SECRET_KEY,
    },
  );
});

const SettingsBody = z.object({
  senderNumber: z.string().min(8).max(20).nullable().optional(),
  senderProfileId: z.string().min(1).max(64).nullable().optional(),
  kakaoTemplates: z.record(z.string(), z.string()).optional(),
  notes: z.string().max(500).nullable().optional(),
});

router.put(
  "/dispatch/popbill-settings",
  requireAction("popbill.settings.update"),
  audit("popbill.settings.update", { targetType: "popbill_settings" }),
  async (req: Request, res: Response): Promise<void> => {
    const buildingId = await getUserBuildingId(req);
    if (!buildingId) { res.status(403).json({ error: "건물 정보가 없습니다" }); return; }
    const parsed = SettingsBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.issues }); return; }
    const secretsConfigured = !!process.env.POPBILL_LINK_ID && !!process.env.POPBILL_SECRET_KEY;
    const [existing] = await db.select().from(popbillSettingsTable).where(eq(popbillSettingsTable.buildingId, buildingId));
    if (existing) {
      const [u] = await db
        .update(popbillSettingsTable)
        .set({
          ...(parsed.data.senderNumber !== undefined ? { senderNumber: parsed.data.senderNumber } : {}),
          ...(parsed.data.senderProfileId !== undefined ? { senderProfileId: parsed.data.senderProfileId } : {}),
          ...(parsed.data.kakaoTemplates ? { kakaoTemplates: parsed.data.kakaoTemplates } : {}),
          ...(parsed.data.notes !== undefined ? { notes: parsed.data.notes } : {}),
          secretsConfigured,
        })
        .where(eq(popbillSettingsTable.id, existing.id))
        .returning();
      res.json(u);
      return;
    }
    const [c] = await db
      .insert(popbillSettingsTable)
      .values({
        buildingId,
        senderNumber: parsed.data.senderNumber ?? null,
        senderProfileId: parsed.data.senderProfileId ?? null,
        kakaoTemplates: parsed.data.kakaoTemplates ?? {},
        notes: parsed.data.notes ?? null,
        secretsConfigured,
      })
      .returning();
    res.json(c);
  },
);

function maskTarget(channel: string, target: string): string {
  const ch = String(channel || "");
  if (ch.startsWith("popbill_") || ch.startsWith("aligo_")) {
    const digits = target.replace(/[^\d]/g, "");
    if (digits.length >= 7) return `${digits.slice(0, 3)}-****-${digits.slice(-4)}`;
  }
  return target;
}

export default router;
