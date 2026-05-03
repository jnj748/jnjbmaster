import { ai } from "@workspace/integrations-gemini-ai";
import { logger } from "./logger";

// [Task #761] 플랫폼 LLM 라우터.
// aiAssistant + 모든 OCR(billOcr/contractOcr/meterPhotoOcr/memoOcr) 가 단일
// 진입점으로 LLM 을 호출하도록 한다. 호출자는 prompt/이미지 + 선택적 tier hint
// 만 넘기고, 라우터가:
//   - Tier 0 (free)   : gemini-2.5-flash, 짧은 토큰 범위
//   - Tier 1 (cheap)  : gemini-2.5-flash, 8192 토큰
//   - Tier 2 (adv)    : gemini-2.5-pro, 8192 토큰
// 을 선택하고, 입력 길이 / 키워드 / 호출자 hint / 직전 호출 실패에 따라 자동 승급한다.
// 결과는 tier/model/입출력 토큰/비용 추정치를 함께 반환해 호출자가 ai_chat_messages
// 등에 기록할 수 있게 한다.

export type Tier = "tier0" | "tier1" | "tier2";

export const TIER_MODELS: Record<Tier, string> = {
  tier0: "gemini-2.5-flash",
  tier1: "gemini-2.5-flash",
  tier2: "gemini-2.5-pro",
};

// 천 토큰당 USD. Gemini 공개 가격을 기준으로 한 보수적 추정치.
// (실제 청구는 Replit Integrations 측에서 별도 집계되므로 이 값은 모니터링용.)
const PRICE_PER_1K: Record<Tier, { input: number; output: number }> = {
  tier0: { input: 0.000075, output: 0.0003 },
  tier1: { input: 0.000075, output: 0.0003 },
  tier2: { input: 0.00125, output: 0.005 },
};

const TIER_MAX_TOKENS: Record<Tier, number> = {
  tier0: 512,
  tier1: 8192,
  tier2: 8192,
};

const PRO_KEYWORDS = ["분석", "비교", "전략", "계획", "추천", "예측", "왜", "근거", "리스크", "최적"];
// Tier 1 까지만 끌어올리는 "약한 추론/문맥 필요" 신호. 길이 60~800 의 일반 챗
// 질문도 여기에 들어간다. Tier 0 는 오직 짧고 단순한 사실 질의(예: "준공일?",
// "엘리베이터 몇 대?") 에만 사용된다.
const TIER1_KEYWORDS = ["?", "어떻게", "방법", "절차", "어디", "언제", "누가", "얼마", "가능", "필요"];

/**
 * Pure helper. Given a user-provided text + optional hint, decide which tier
 * to use. Hint always wins.
 *
 * Default flow: Tier 0 → Tier 1 → Tier 2.
 *  - Tier 2: 길이 > 800 자 OR PRO_KEYWORDS (분석/비교/전략 등) 포함 → 추론 비용 큰 작업.
 *  - Tier 1: 길이 60~800 OR TIER1_KEYWORDS 포함 → 일반 챗봇 응답.
 *  - Tier 0: 그 외(짧고 단순한 사실 질의) — 가장 저렴한 라우팅.
 * 호출 중 실패 시 promote() 가 한 단계씩 자동 승급한다.
 */
export function pickTier(content: string, hint?: Tier): Tier {
  if (hint) return hint;
  if (content.length > 800) return "tier2";
  for (const kw of PRO_KEYWORDS) {
    if (content.includes(kw)) return "tier2";
  }
  if (content.length > 60) return "tier1";
  for (const kw of TIER1_KEYWORDS) {
    if (content.includes(kw)) return "tier1";
  }
  return "tier0";
}

function promote(t: Tier): Tier {
  if (t === "tier0") return "tier1";
  if (t === "tier1") return "tier2";
  return "tier2";
}

export type LlmPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } };

export type RoutedGenerateOptions = {
  parts: LlmPart[];
  /** Optional system instruction (Gemini config.systemInstruction). */
  systemInstruction?: string;
  /** Force a tier; otherwise inferred from text content. */
  tier?: Tier;
  /** Override max output tokens. Default per-tier. */
  maxOutputTokens?: number;
  /** Force JSON output mode (responseMimeType=application/json). */
  json?: boolean;
  /** Used for pickTier when no explicit tier is given. */
  inputTextForRouting?: string;
};

export type RoutedGenerateResult = {
  text: string;
  tier: Tier;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  costEstimateUsd: number;
};

function estimateCost(tier: Tier, inputTokens: number | null, outputTokens: number | null): number {
  const p = PRICE_PER_1K[tier];
  const i = ((inputTokens ?? 0) / 1000) * p.input;
  const o = ((outputTokens ?? 0) / 1000) * p.output;
  return Number((i + o).toFixed(6));
}

/**
 * Single, non-streaming generation entrypoint. Auto-promotes one tier on
 * 5xx / 429 / JSON parse errors so a transient flash failure can fall over
 * to pro (and pro stays at pro).
 */
export async function routedGenerate(opts: RoutedGenerateOptions): Promise<RoutedGenerateResult> {
  const baseTier = opts.tier ?? pickTier(opts.inputTextForRouting ?? "");
  let tier: Tier = baseTier;
  let lastErr: unknown;

  for (let attempt = 0; attempt < 2; attempt++) {
    const model = TIER_MODELS[tier];
    const maxOutputTokens = opts.maxOutputTokens ?? TIER_MAX_TOKENS[tier];
    try {
      const response = await ai.models.generateContent({
        model,
        contents: [{ role: "user", parts: opts.parts as never }],
        config: {
          ...(opts.systemInstruction ? { systemInstruction: opts.systemInstruction } : {}),
          maxOutputTokens,
          ...(opts.json ? { responseMimeType: "application/json" } : {}),
        },
      });
      const text = response.candidates?.[0]?.content?.parts
        ?.map((p: { text?: string }) => (p && "text" in p ? p.text ?? "" : ""))
        .join("")
        .trim() ?? "";
      const usage = response.usageMetadata;
      const inputTokens = typeof usage?.promptTokenCount === "number" ? usage.promptTokenCount : null;
      const outputTokens = typeof usage?.candidatesTokenCount === "number" ? usage.candidatesTokenCount : null;
      return {
        text,
        tier,
        model,
        inputTokens,
        outputTokens,
        costEstimateUsd: estimateCost(tier, inputTokens, outputTokens),
      };
    } catch (err) {
      lastErr = err;
      logger.warn(
        { err, tier, model, attempt },
        "routedGenerate call failed; will auto-promote and retry once",
      );
      const next = promote(tier);
      if (next === tier) break;
      tier = next;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("LLM 호출에 실패했습니다");
}

/**
 * Streaming variant for the chat assistant. Auto-promotion only applies
 * before the first chunk is seen (we cannot rewind a partially-streamed
 * response). After streaming completes the caller receives the same
 * {tier, model, tokens, cost} record so it can persist accounting.
 */
export type RoutedStreamOptions = {
  contents: Array<{ role: "user" | "model"; parts: Array<{ text: string }> }>;
  systemInstruction?: string;
  tier?: Tier;
  maxOutputTokens?: number;
  inputTextForRouting?: string;
  /** Per-chunk text callback. Returning false aborts the stream. */
  onChunk: (text: string) => void | boolean | Promise<void | boolean>;
};

export type RoutedStreamResult = Omit<RoutedGenerateResult, "text"> & { fullText: string };

export async function routedStream(opts: RoutedStreamOptions): Promise<RoutedStreamResult> {
  const baseTier = opts.tier ?? pickTier(opts.inputTextForRouting ?? "");
  let tier: Tier = baseTier;
  let attempt = 0;
  let lastErr: unknown;

  while (attempt < 2) {
    const model = TIER_MODELS[tier];
    const maxOutputTokens = opts.maxOutputTokens ?? TIER_MAX_TOKENS[tier];
    let started = false;
    let fullText = "";
    let inputTokens: number | null = null;
    let outputTokens: number | null = null;
    try {
      const stream = await ai.models.generateContentStream({
        model,
        contents: opts.contents as never,
        config: {
          ...(opts.systemInstruction ? { systemInstruction: opts.systemInstruction } : {}),
          maxOutputTokens,
        },
      });
      for await (const chunk of stream) {
        started = true;
        const text = chunk.text;
        if (text) {
          fullText += text;
          const ctl = await opts.onChunk(text);
          if (ctl === false) break;
        }
        const usage = chunk.usageMetadata;
        if (usage) {
          if (typeof usage.promptTokenCount === "number") inputTokens = usage.promptTokenCount;
          if (typeof usage.candidatesTokenCount === "number") outputTokens = usage.candidatesTokenCount;
        }
      }
      return {
        fullText,
        tier,
        model,
        inputTokens,
        outputTokens,
        costEstimateUsd: estimateCost(tier, inputTokens, outputTokens),
      };
    } catch (err) {
      lastErr = err;
      logger.warn(
        { err, tier, model, attempt, started },
        "routedStream call failed",
      );
      // Don't auto-promote if any text already streamed — caller would
      // otherwise see two partial responses concatenated. Promote only on
      // pre-stream errors (auth / 429 / 5xx before the first chunk).
      if (started) break;
      const next = promote(tier);
      if (next === tier) break;
      tier = next;
      attempt += 1;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("LLM 스트림 호출에 실패했습니다");
}

export const __testing = { pickTier, promote, estimateCost };
