import { Router, type IRouter, type Request, type Response } from "express";
import { eq, and, desc } from "drizzle-orm";
import {
  db,
  aiChatSessionsTable,
  aiChatMessagesTable,
  usersTable,
  type AiChatCitation,
} from "@workspace/db";
import { requireRole } from "../../middlewares/auth";
import { pickTier, routedStream, type Tier } from "../../lib/llmRouter";
import {
  buildBuildingContext,
  buildBuildingFacts,
  buildSystemPrompt,
  summarizeRegisterData,
  GENERAL_NOTICE_LABEL,
  GENERAL_NOTICE_LINE,
  INSUFFICIENT_INFO_PREFIX,
} from "./context";

const router: IRouter = Router();

// Single source of truth: only manager + platform_admin can use AI assistant
router.use("/ai", requireRole("manager", "platform_admin"));
// Simple in-memory rate limiter (per-user per-minute)
const RATE_LIMIT_PER_MINUTE = 10;
const MAX_INPUT_CHARS = 4000;

// [Task #761] tier 선택은 공유 라우터(`lib/llmRouter`) 가 담당. 키워드/길이 기반
// 자동 승급 규칙은 모든 LLM 호출자(OCR 포함) 가 동일하게 사용하도록 통합했다.
const rateBuckets = new Map<number, number[]>();
function checkRateLimit(userId: number): boolean {
  const now = Date.now();
  const cutoff = now - 60_000;
  const bucket = (rateBuckets.get(userId) ?? []).filter(t => t > cutoff);
  if (bucket.length >= RATE_LIMIT_PER_MINUTE) {
    rateBuckets.set(userId, bucket);
    return false;
  }
  bucket.push(now);
  rateBuckets.set(userId, bucket);
  return true;
}

/**
 * Strip parenthetical citations that look like raw English data keys
 * (e.g. "(building.totalUnits)", "(recentMaintenance)", "(monthlyBills.latest)").
 *
 * Rule: a parenthetical is removed if its inner text contains a lowercase
 * ASCII letter and contains NO Hangul character. This removes camelCase /
 * snake_case / dot-notation identifiers while preserving:
 *   - Korean parentheticals: "(승강기)", "(예: ...)"
 *   - Number/date parentheticals: "(2026-01)", "(123)"
 *   - All-uppercase acronyms: "(LED)", "(A/S)", "(CCTV)", "(B2B)"
 */
function stripEnglishKeyParens(text: string): string {
  return text.replace(/[ \t]?[（(]([^（()）]*)[)）]/g, (match, inner: string) => {
    const hasLowerAscii = /[a-z]/.test(inner);
    const hasHangul = /[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/.test(inner);
    if (hasLowerAscii && !hasHangul) return "";
    return match;
  });
}

/**
 * Streaming-safe wrapper for stripEnglishKeyParens: buffers any text after
 * an unclosed '(' until the matching ')' arrives, so the strip pattern
 * can be applied across chunk boundaries.
 */
class ParenSanitizer {
  private buffer = "";
  push(chunk: string): string {
    this.buffer += chunk;
    let depth = 0;
    let safeEnd = this.buffer.length;
    for (let i = 0; i < this.buffer.length; i++) {
      const ch = this.buffer[i];
      if (ch === "(" || ch === "（") {
        if (depth === 0) {
          // Keep any single space/tab right before the open paren in the
          // buffer so that, once the parenthetical is later stripped, the
          // preceding space is also consumed by the regex (avoiding double
          // spaces in the output).
          let s = i;
          if (s > 0 && (this.buffer[s - 1] === " " || this.buffer[s - 1] === "\t")) {
            s -= 1;
          }
          safeEnd = s;
        }
        depth++;
      } else if (ch === ")" || ch === "）") {
        if (depth > 0) depth--;
        if (depth === 0) safeEnd = i + 1;
      }
    }
    const safe = this.buffer.slice(0, safeEnd);
    this.buffer = this.buffer.slice(safeEnd);
    return stripEnglishKeyParens(safe);
  }
  flush(): string {
    const out = stripEnglishKeyParens(this.buffer);
    this.buffer = "";
    return out;
  }
}

export const __test = {
  stripEnglishKeyParens,
  ParenSanitizer,
  buildSystemPrompt,
  buildBuildingFacts,
  summarizeRegisterData,
  GENERAL_NOTICE_LABEL,
  GENERAL_NOTICE_LINE,
  INSUFFICIENT_INFO_PREFIX,
};

async function getUserBuildingId(userId: number): Promise<number | null> {
  const u = await db.select({ buildingId: usersTable.buildingId }).from(usersTable).where(eq(usersTable.id, userId)).then(r => r[0]);
  return u?.buildingId ?? null;
}

async function loadOwnedSession(sessionId: number, userId: number) {
  return db
    .select()
    .from(aiChatSessionsTable)
    .where(and(eq(aiChatSessionsTable.id, sessionId), eq(aiChatSessionsTable.userId, userId)))
    .then(r => r[0]);
}

router.get("/ai/sessions", async (req: Request, res: Response): Promise<void> => {
  const userId = req.user!.userId;
  const sessions = await db
    .select()
    .from(aiChatSessionsTable)
    .where(eq(aiChatSessionsTable.userId, userId))
    .orderBy(desc(aiChatSessionsTable.updatedAt));
  res.json(sessions);
});

router.post("/ai/sessions", async (req: Request, res: Response): Promise<void> => {
  const userId = req.user!.userId;
  const buildingId = await getUserBuildingId(userId);
  const title = typeof req.body?.title === "string" && req.body.title.trim() ? req.body.title.trim() : "오늘의 새 대화";
  const [row] = await db
    .insert(aiChatSessionsTable)
    .values({ userId, buildingId, title })
    .returning();
  res.status(201).json(row);
});

router.patch("/ai/sessions/:id", async (req: Request, res: Response): Promise<void> => {
  const userId = req.user!.userId;
  const id = parseInt(req.params.id as string);
  const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
  if (!title) { res.status(400).json({ error: "title is required" }); return; }
  const session = await loadOwnedSession(id, userId);
  if (!session) { res.status(404).json({ error: "Not found" }); return; }
  const [row] = await db
    .update(aiChatSessionsTable)
    .set({ title })
    .where(eq(aiChatSessionsTable.id, id))
    .returning();
  res.json(row);
});

router.delete("/ai/sessions/:id", async (req: Request, res: Response): Promise<void> => {
  const userId = req.user!.userId;
  const id = parseInt(req.params.id as string);
  const session = await loadOwnedSession(id, userId);
  if (!session) { res.status(404).json({ error: "Not found" }); return; }
  await db.delete(aiChatSessionsTable).where(eq(aiChatSessionsTable.id, id));
  res.sendStatus(204);
});

router.get("/ai/sessions/:id/messages", async (req: Request, res: Response): Promise<void> => {
  const userId = req.user!.userId;
  const id = parseInt(req.params.id as string);
  const session = await loadOwnedSession(id, userId);
  if (!session) { res.status(404).json({ error: "Not found" }); return; }
  const messages = await db
    .select()
    .from(aiChatMessagesTable)
    .where(eq(aiChatMessagesTable.sessionId, id))
    .orderBy(aiChatMessagesTable.id);
  res.json(messages);
});

router.post("/ai/chat", async (req: Request, res: Response): Promise<void> => {
  const userId = req.user!.userId;

  if (!checkRateLimit(userId)) {
    res.status(429).json({ error: "분당 메시지 한도를 초과했습니다. 잠시 후 다시 시도해 주세요." });
    return;
  }

  const content = typeof req.body?.content === "string" ? req.body.content.trim() : "";
  if (!content) { res.status(400).json({ error: "content is required" }); return; }
  if (content.length > MAX_INPUT_CHARS) {
    res.status(400).json({ error: `메시지가 너무 깁니다 (최대 ${MAX_INPUT_CHARS}자).` });
    return;
  }

  let sessionIdInput = req.body?.sessionId as number | undefined;
  let session = sessionIdInput ? await loadOwnedSession(Number(sessionIdInput), userId) : null;
  if (sessionIdInput && !session) { res.status(404).json({ error: "세션을 찾을 수 없습니다" }); return; }

  if (!session) {
    const buildingId = await getUserBuildingId(userId);
    const draftTitle = content.length > 30 ? content.slice(0, 30) + "…" : content;
    [session] = await db.insert(aiChatSessionsTable)
      .values({ userId, buildingId, title: draftTitle })
      .returning();
  }

  // Save user message
  await db.insert(aiChatMessagesTable).values({
    sessionId: session!.id,
    role: "user",
    content,
    citations: [],
  });

  // [Task #761] 비교군 NL 질문 — 사용자가 평균/비교/적정/비싼/저렴 같은 표현을
  // 쓰면 익명 비교군 집계를 컨텍스트에 함께 넣는다. 모든 역할(manager/admin)이
  // 동일하게 익명 집계만 받으며, platform_admin 의 식별 가능한 다건물 조회는
  // 별도 플랫폼 라우트(예: /platform/portfolio-anomalies) 를 사용한다.
  const PEER_KEYWORDS = ["비교", "평균", "적정", "비싼", "저렴", "다른 건물", "타 건물", "비슷한", "또래"];
  const includePeerStats = PEER_KEYWORDS.some((kw) => content.includes(kw));
  const ctx = await buildBuildingContext(session!.buildingId ?? null, {
    includePeerStats,
    userRole: req.user!.role,
  });
  const systemPrompt = buildSystemPrompt(ctx);

  // Load prior messages (exclude the just-inserted user message — we'll re-add it last)
  const priorMessages = await db
    .select({ role: aiChatMessagesTable.role, content: aiChatMessagesTable.content })
    .from(aiChatMessagesTable)
    .where(eq(aiChatMessagesTable.sessionId, session!.id))
    .orderBy(aiChatMessagesTable.id);

  // SSE setup
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  // Send sessionId early so the client can update UI
  res.write(`data: ${JSON.stringify({ session: { id: session!.id, title: session!.title } })}\n\n`);

  // [Task #761] 비교군이 첨부된 경우 클라이언트가 응답 출처 배지("비교군 N개 건물 기준")
  // 를 렌더할 수 있도록 별도 SSE 이벤트로 알린다. 본문에는 다른 건물 식별자가
  // 들어가지 않으므로(시스템 프롬프트 규칙 #10), N 만 노출한다.
  const peerCtxMatch = ctx.json.match(/"peerStats":\s*\{[^}]*"n":\s*(\d+)/);
  const peerN = peerCtxMatch ? Number(peerCtxMatch[1]) : null;
  if (peerN && peerN >= 3) {
    res.write(`data: ${JSON.stringify({ peerStats: { n: peerN } })}\n\n`);
  }

  const contents = priorMessages.map(m => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  let fullResponse = "";
  const sanitizer = new ParenSanitizer();
  let aborted = false;
  let tier: Tier = pickTier(content);
  let model = "";
  let inputTokens: number | null = null;
  let outputTokens: number | null = null;
  let costEstimateUsd = 0;
  req.on("close", () => { aborted = true; });

  try {
    const result = await routedStream({
      tier,
      contents: contents as never,
      systemInstruction: systemPrompt,
      onChunk(text) {
        if (aborted) return false;
        const cleaned = sanitizer.push(text);
        if (cleaned) {
          fullResponse += cleaned;
          res.write(`data: ${JSON.stringify({ content: cleaned })}\n\n`);
        }
        return undefined;
      },
    });
    tier = result.tier;
    model = result.model;
    inputTokens = result.inputTokens;
    outputTokens = result.outputTokens;
    costEstimateUsd = result.costEstimateUsd;
  } catch (err) {
    const message = err instanceof Error ? err.message : "AI 응답을 생성하지 못했습니다.";
    res.write(`data: ${JSON.stringify({ error: message })}\n\n`);
    res.end();
    return;
  }

  // Flush any text still buffered inside the paren sanitizer
  const tail = sanitizer.flush();
  if (tail) {
    fullResponse += tail;
    res.write(`data: ${JSON.stringify({ content: tail })}\n\n`);
  }

  // Determine citations: only include those whose label/id appears in response text
  const usedCitations: AiChatCitation[] = [];
  for (const c of ctx.citations) {
    const idStr = String(c.id);
    if (
      fullResponse.includes(c.label) ||
      fullResponse.includes(`#${idStr}`) ||
      fullResponse.includes(`${c.type === "complaint" ? "민원" : ""}${idStr ? ` #${idStr}` : ""}`.trim())
    ) {
      usedCitations.push(c);
    }
  }
  // Dedup by type+id
  const seen = new Set<string>();
  const dedup = usedCitations.filter(c => {
    const k = `${c.type}:${c.id}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).slice(0, 10);

  await db.insert(aiChatMessagesTable).values({
    sessionId: session!.id,
    role: "assistant",
    content: fullResponse,
    citations: dedup,
    inputTokens,
    outputTokens,
    metadata: { tier, model, costEstimateUsd, caller: "aiAssistant" },
  });

  // Touch session updatedAt + auto-update title if still default
  if (session!.title === "새 대화") {
    const draftTitle = content.length > 30 ? content.slice(0, 30) + "…" : content;
    await db.update(aiChatSessionsTable).set({ title: draftTitle }).where(eq(aiChatSessionsTable.id, session!.id));
  } else {
    await db.update(aiChatSessionsTable).set({ updatedAt: new Date() }).where(eq(aiChatSessionsTable.id, session!.id));
  }

  res.write(`data: ${JSON.stringify({ done: true, citations: dedup })}\n\n`);
  res.end();
});

export default router;
