import { Router, type IRouter, type Request, type Response } from "express";
import { eq, and, desc } from "drizzle-orm";
import {
  db,
  aiChatSessionsTable,
  aiChatMessagesTable,
  usersTable,
  type AiChatCitation,
} from "@workspace/db";
import { ai } from "@workspace/integrations-gemini-ai";
import { requireRole } from "../../middlewares/auth";
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

/**
 * Pick a Gemini model per task spec: "Flash 우선, 복잡 추론은 Pro".
 * Use Pro when the prompt is long or contains keywords that imply
 * multi-step reasoning, comparison, planning, or strategy.
 */
const PRO_KEYWORDS = ["분석", "비교", "전략", "계획", "추천", "예측", "왜", "근거", "리스크", "최적"];
function pickModel(content: string): string {
  if (content.length > 800) return "gemini-2.5-pro";
  for (const kw of PRO_KEYWORDS) {
    if (content.includes(kw)) return "gemini-2.5-pro";
  }
  return "gemini-2.5-flash";
}
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

  // Build building context
  const ctx = await buildBuildingContext(session!.buildingId ?? null);
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

  const contents = priorMessages.map(m => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  let fullResponse = "";
  const sanitizer = new ParenSanitizer();
  let aborted = false;
  let inputTokens: number | null = null;
  let outputTokens: number | null = null;
  req.on("close", () => { aborted = true; });

  try {
    const stream = await ai.models.generateContentStream({
      model: pickModel(content),
      contents,
      config: {
        systemInstruction: systemPrompt,
        maxOutputTokens: 8192,
      },
    });
    for await (const chunk of stream) {
      if (aborted) break;
      const text = chunk.text;
      if (text) {
        const cleaned = sanitizer.push(text);
        if (cleaned) {
          fullResponse += cleaned;
          res.write(`data: ${JSON.stringify({ content: cleaned })}\n\n`);
        }
      }
      const usage = chunk.usageMetadata;
      if (usage) {
        if (typeof usage.promptTokenCount === "number") inputTokens = usage.promptTokenCount;
        if (typeof usage.candidatesTokenCount === "number") outputTokens = usage.candidatesTokenCount;
      }
    }
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
