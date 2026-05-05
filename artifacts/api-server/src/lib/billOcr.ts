import { ObjectStorageService } from "./objectStorage";
import { logger } from "./logger";
import { routedGenerate } from "./llmRouter";

export type BillOcrResult = {
  billingMonth: string | null;
  totalAmount: number | null;
  unitCount: number | null;
  dueDate: string | null;
  lineItems: Record<string, number>;
  fieldConfidence: Record<string, number>;
  rawText: string;
};

const SYSTEM_PROMPT = `당신은 한국 집합건물의 월별 관리비 고지서를 분석하는 OCR 어시스턴트입니다.
주어진 이미지 또는 PDF에서 다음 정보를 정확히 추출해 JSON으로만 답하세요. 다른 설명은 일절 금지합니다.

- billingMonth: 청구월 (YYYY-MM 형식). 알 수 없으면 null.
- totalAmount: 합계 금액 (정수, 원 단위). 알 수 없으면 null.
- unitCount: 부과 세대수 (정수). 알 수 없으면 null.
- dueDate: 납기일 (YYYY-MM-DD). 알 수 없으면 null.
- lineItems: 항목별 금액 (정수, 원 단위). 다음 키만 사용하세요:
  general(일반관리비), cleaning(청소비), security(경비비), disinfection(소독비),
  elevator(승강기유지비), electricity(공동전기료), water(공동수도료),
  heating(난방비), gas(가스료), longTermRepairFund(장기수선충당금),
  insurance(화재보험료), other(기타).
  해당 항목이 없으면 키 자체를 생략하세요.
- fieldConfidence: 위 각 필드(billingMonth, totalAmount, unitCount, dueDate 및 lineItems의 각 키)에 대한 인식 신뢰도 0.0~1.0 사이 소수.
- rawText: 고지서에서 읽은 전체 원문 텍스트(요약 금지, 줄바꿈 보존).

오직 JSON 하나만 출력하세요.`;

function parseModelJson(text: string): Partial<BillOcrResult> {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end < 0) throw new Error("OCR 응답에서 JSON을 찾지 못했습니다");
  const json = candidate.slice(start, end + 1);
  return JSON.parse(json);
}

function inferMimeType(name: string | null | undefined): string {
  const lower = (name || "").toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".heic")) return "image/heic";
  if (lower.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

// [Task #170] OCR 파일 크기 / MIME 화이트리스트 (서버 차원 강제).
const MAX_OCR_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

export async function runBillOcr(opts: {
  objectPath: string;
  fileName?: string | null;
}): Promise<BillOcrResult> {
  const storage = new ObjectStorageService();
  const file = await storage.getObjectEntityFile(opts.objectPath);
  const [metadata] = await file.getMetadata();
  const mimeType = (metadata.contentType as string) || inferMimeType(opts.fileName);
  if (!ALLOWED_MIME.has(mimeType)) {
    throw new Error("지원하지 않는 파일 형식입니다 (PDF/JPEG/PNG/WEBP/HEIC만 허용)");
  }
  const sizeRaw = (metadata.size as string | number | undefined) ?? 0;
  const size = typeof sizeRaw === "string" ? Number.parseInt(sizeRaw, 10) || 0 : sizeRaw;
  if (size > MAX_OCR_BYTES) {
    throw new Error(`파일이 너무 큽니다 (최대 ${MAX_OCR_BYTES / 1024 / 1024}MB)`);
  }

  const chunks: Buffer[] = [];
  let total = 0;
  await new Promise<void>((resolve, reject) => {
    const stream = file.createReadStream();
    stream
      .on("data", (c: Buffer) => {
        total += c.length;
        if (total > MAX_OCR_BYTES) {
          stream.destroy(new Error(`파일이 너무 큽니다 (최대 ${MAX_OCR_BYTES / 1024 / 1024}MB)`));
          return;
        }
        chunks.push(c);
      })
      .on("end", () => resolve())
      .on("error", reject);
  });
  const buffer = Buffer.concat(chunks);
  const base64 = buffer.toString("base64");

  let routed;
  try {
    routed = await routedGenerate({
      tier: "tier1",
      json: true,
      parts: [
        { text: SYSTEM_PROMPT },
        { inlineData: { mimeType, data: base64 } },
      ],
    });
  } catch (err) {
    logger.error({ err, objectPath: opts.objectPath }, "Gemini OCR call failed");
    throw new Error("OCR 모델 호출에 실패했습니다");
  }
  logger.info(
    { caller: "billOcr", tier: routed.tier, model: routed.model, inputTokens: routed.inputTokens, outputTokens: routed.outputTokens, costEstimateUsd: routed.costEstimateUsd },
    "LLM accounting",
  );
  const text = routed.text;
  if (!text) throw new Error("OCR 결과가 비어 있습니다");

  // [Task #868] LLM 이 깨진 JSON 을 돌려주면 1회 자동 재시도.
  const { parseJsonWithRetry, JSON_RETRY_HINT } = await import("./ocrJsonRetry");
  const parsed = await parseJsonWithRetry<Partial<BillOcrResult>>({
    initialText: text,
    parser: (t) => parseModelJson(t),
    retry: async () => {
      const r = await routedGenerate({
        tier: "tier1",
        json: true,
        parts: [
          { text: SYSTEM_PROMPT + "\n\n" + JSON_RETRY_HINT },
          { inlineData: { mimeType, data: base64 } },
        ],
      });
      return r.text;
    },
    caller: "billOcr",
  });

  const lineItems: Record<string, number> = {};
  if (parsed.lineItems && typeof parsed.lineItems === "object") {
    for (const [k, v] of Object.entries(parsed.lineItems)) {
      const n = typeof v === "number" ? v : Number(v);
      if (Number.isFinite(n)) lineItems[k] = Math.round(n);
    }
  }
  const fieldConfidence: Record<string, number> = {};
  if (parsed.fieldConfidence && typeof parsed.fieldConfidence === "object") {
    for (const [k, v] of Object.entries(parsed.fieldConfidence)) {
      const n = typeof v === "number" ? v : Number(v);
      if (Number.isFinite(n)) fieldConfidence[k] = Math.max(0, Math.min(1, n));
    }
  }

  return {
    billingMonth: typeof parsed.billingMonth === "string" ? parsed.billingMonth : null,
    totalAmount: typeof parsed.totalAmount === "number" ? Math.round(parsed.totalAmount) : null,
    unitCount: typeof parsed.unitCount === "number" ? Math.round(parsed.unitCount) : null,
    dueDate: typeof parsed.dueDate === "string" ? parsed.dueDate : null,
    lineItems,
    fieldConfidence,
    rawText: typeof parsed.rawText === "string" ? parsed.rawText : text,
  };
}
