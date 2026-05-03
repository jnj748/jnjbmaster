import { ObjectStorageService } from "./objectStorage";
import { logger } from "./logger";
import { routedGenerate } from "./llmRouter";

export type MeterOcrResult = {
  currentReading: number | null;
  confidence: number;
  rawText: string;
};

// [Task #630] OCR 라우터에서 4xx vs 5xx 분기에 사용하는 사용자 입력 오류.
//   파일 형식·용량 검증 실패는 사용자가 다시 시도하면 풀리는 오류이므로 4xx,
//   모델/IO 오류는 5xx 로 응답한다.
export class MeterOcrInputError extends Error {
  constructor(message: string) { super(message); this.name = "MeterOcrInputError"; }
}

const SYSTEM_PROMPT = `당신은 한국 집합건물의 계량기 사진을 분석하는 OCR 어시스턴트입니다.
주어진 이미지에서 다음 정보를 정확히 추출해 JSON으로만 답하세요. 다른 설명은 일절 금지합니다.

- currentReading: 계량기에 표시된 숫자 (소수점 가능). 숫자만 추출하고 단위는 제외.
  알 수 없으면 null.
- confidence: 인식 신뢰도 0.0~1.0 사이 소수.
- rawText: 계량기에서 읽은 원문 텍스트(요약 금지).

힌트:
- 수도/가스/전기 계량기는 보통 5~8자리 숫자.
- 빨간 자리(소수점 이하)는 무시하고 검은 자리만 읽는 것이 일반적이지만,
  소수점이 명확히 표시된 경우는 그대로 포함.
- 흐릿하거나 가려져 일부만 읽힐 때는 confidence 를 낮게 (0.3~0.5) 설정.

오직 JSON 하나만 출력하세요.`;

function parseModelJson(text: string): Partial<MeterOcrResult> {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end < 0) throw new Error("OCR 응답에서 JSON을 찾지 못했습니다");
  return JSON.parse(candidate.slice(start, end + 1));
}

function inferMimeType(name: string | null | undefined): string {
  const lower = (name || "").toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".heic")) return "image/heic";
  if (lower.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

const MAX_OCR_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

export async function runMeterPhotoOcr(opts: {
  objectPath: string;
  fileName?: string | null;
  meterType?: string | null;
}): Promise<MeterOcrResult> {
  const storage = new ObjectStorageService();
  const file = await storage.getObjectEntityFile(opts.objectPath);
  const [metadata] = await file.getMetadata();
  const mimeType = (metadata.contentType as string) || inferMimeType(opts.fileName);
  if (!ALLOWED_MIME.has(mimeType)) {
    throw new MeterOcrInputError("지원하지 않는 이미지 형식입니다 (JPEG/PNG/WEBP/HEIC만 허용)");
  }
  const sizeRaw = (metadata.size as string | number | undefined) ?? 0;
  const size = typeof sizeRaw === "string" ? Number.parseInt(sizeRaw, 10) || 0 : sizeRaw;
  if (size > MAX_OCR_BYTES) {
    throw new MeterOcrInputError(`파일이 너무 큽니다 (최대 ${MAX_OCR_BYTES / 1024 / 1024}MB)`);
  }

  const chunks: Buffer[] = [];
  let total = 0;
  await new Promise<void>((resolve, reject) => {
    const stream = file.createReadStream();
    stream
      .on("data", (c: Buffer) => {
        total += c.length;
        if (total > MAX_OCR_BYTES) {
          stream.destroy(new MeterOcrInputError(`파일이 너무 큽니다 (최대 ${MAX_OCR_BYTES / 1024 / 1024}MB)`));
          return;
        }
        chunks.push(c);
      })
      .on("end", () => resolve())
      .on("error", reject);
  });
  const base64 = Buffer.concat(chunks).toString("base64");

  const prompt = opts.meterType
    ? `${SYSTEM_PROMPT}\n\n이번 사진은 ${opts.meterType} 계량기입니다.`
    : SYSTEM_PROMPT;

  let routed;
  try {
    routed = await routedGenerate({
      tier: "tier0",
      json: true,
      parts: [
        { text: prompt },
        { inlineData: { mimeType, data: base64 } },
      ],
    });
  } catch (err) {
    logger.error({ err, objectPath: opts.objectPath }, "Gemini meter OCR call failed");
    throw new Error("OCR 모델 호출에 실패했습니다");
  }
  logger.info(
    { caller: "meterPhotoOcr", tier: routed.tier, model: routed.model, inputTokens: routed.inputTokens, outputTokens: routed.outputTokens, costEstimateUsd: routed.costEstimateUsd },
    "LLM accounting",
  );
  const text = routed.text;
  if (!text) throw new Error("OCR 결과가 비어 있습니다");

  let parsed: Partial<MeterOcrResult>;
  try {
    parsed = parseModelJson(text);
  } catch (err) {
    logger.warn({ err, text }, "Meter OCR JSON parse failed");
    throw new Error("OCR 결과를 해석하지 못했습니다");
  }

  const reading = typeof parsed.currentReading === "number"
    ? parsed.currentReading
    : Number(parsed.currentReading);
  const confidence = typeof parsed.confidence === "number"
    ? parsed.confidence
    : Number(parsed.confidence);

  return {
    currentReading: Number.isFinite(reading) ? reading : null,
    confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0,
    rawText: typeof parsed.rawText === "string" ? parsed.rawText : text,
  };
}
