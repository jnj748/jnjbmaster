import { ai } from "@workspace/integrations-gemini-ai";
import { ObjectStorageService } from "./objectStorage";
import { logger } from "./logger";

// [Task #745] 한국 사업자등록증 OCR. 기존 contractOcr.ts / billOcr.ts 와 동일한
// 파일 크기·MIME 화이트리스트 / Gemini 호출 패턴을 그대로 재사용하고, 프롬프트만
// 사업자등록증 정보 추출용으로 교체했다. DB에 직접 쓰지 않고 결과(JSON +
// 신뢰도)만 반환해 사용자가 검토 후 저장하도록 한다.

export type BusinessRegOcrResult = {
  vendorName: string | null;
  businessRegNumber: string | null;
  representativeName: string | null;
  address: string | null;
  businessType: string | null; // 업태
  businessItem: string | null; // 종목
  openedAt: string | null; // 개업연월일 (YYYY-MM-DD)
  fieldConfidence: Record<string, number>;
  rawText: string;
};

const SYSTEM_PROMPT = `당신은 한국 국세청에서 발급한 "사업자등록증"을 분석하는 OCR 어시스턴트입니다.
주어진 이미지 또는 PDF에서 다음 정보를 정확히 추출해 JSON으로만 답하세요. 다른 설명은 일절 금지합니다.

- vendorName: 상호(법인명). 사업자등록증의 "상호"란 값. 알 수 없으면 null.
- businessRegNumber: 사업자등록번호 (예: "123-45-67890"). 알 수 없으면 null.
- representativeName: 대표자 성명. 알 수 없으면 null.
- address: 사업장 소재지(전체 주소 한 줄). 알 수 없으면 null.
- businessType: 업태 (예: "서비스업", "건설업"). 알 수 없으면 null.
- businessItem: 종목 (예: "건물청소", "승강기유지보수"). 알 수 없으면 null.
- openedAt: 개업연월일 (YYYY-MM-DD). 알 수 없으면 null.
- fieldConfidence: 위 각 필드(vendorName, businessRegNumber, representativeName, address, businessType, businessItem, openedAt)에 대한 인식 신뢰도 0.0~1.0 사이 소수.
- rawText: 사업자등록증에서 읽은 전체 원문 텍스트(요약 금지, 줄바꿈 보존).

오직 JSON 하나만 출력하세요.`;

function parseModelJson(text: string): Record<string, unknown> {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end < 0) throw new Error("OCR 응답에서 JSON을 찾지 못했습니다");
  return JSON.parse(candidate.slice(start, end + 1));
}

function inferMimeType(name: string | null | undefined): string {
  const lower = (name || "").toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".heic")) return "image/heic";
  if (lower.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

const MAX_OCR_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

export async function runBusinessRegOcr(opts: {
  objectPath: string;
  fileName?: string | null;
}): Promise<BusinessRegOcrResult> {
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

  let response;
  try {
    response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          role: "user",
          parts: [
            { text: SYSTEM_PROMPT },
            { inlineData: { mimeType, data: base64 } },
          ],
        },
      ],
      config: {
        responseMimeType: "application/json",
      },
    });
  } catch (err) {
    logger.error({ err, objectPath: opts.objectPath }, "Gemini business reg OCR call failed");
    throw new Error("OCR 모델 호출에 실패했습니다");
  }

  const text = response.candidates?.[0]?.content?.parts
    ?.map((p: { text?: string }) => (p && "text" in p ? p.text ?? "" : ""))
    .join("")
    .trim() ?? "";
  if (!text) throw new Error("OCR 결과가 비어 있습니다");

  // [Task #868] LLM 이 깨진 JSON 을 돌려주면 1회 자동 재시도.
  const { parseJsonWithRetry, JSON_RETRY_HINT } = await import("./ocrJsonRetry");
  const parsed = await parseJsonWithRetry<Record<string, unknown>>({
    initialText: text,
    parser: (t) => parseModelJson(t),
    retry: async () => {
      const retryResp = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [
          {
            role: "user",
            parts: [
              { text: SYSTEM_PROMPT + "\n\n" + JSON_RETRY_HINT },
              { inlineData: { mimeType, data: base64 } },
            ],
          },
        ],
        config: { responseMimeType: "application/json" },
      });
      const retryText = retryResp.candidates?.[0]?.content?.parts
        ?.map((p: { text?: string }) => (p && "text" in p ? p.text ?? "" : ""))
        .join("")
        .trim() ?? "";
      if (!retryText) throw new Error("OCR 결과가 비어 있습니다");
      return retryText;
    },
    caller: "businessRegOcr",
  });

  const fieldConfidence: Record<string, number> = {};
  if (parsed.fieldConfidence && typeof parsed.fieldConfidence === "object") {
    for (const [k, v] of Object.entries(parsed.fieldConfidence as Record<string, unknown>)) {
      const n = typeof v === "number" ? v : Number(v);
      if (Number.isFinite(n)) fieldConfidence[k] = Math.max(0, Math.min(1, n));
    }
  }

  function asString(v: unknown): string | null {
    if (typeof v !== "string") return null;
    const t = v.trim();
    return t.length > 0 ? t : null;
  }

  return {
    vendorName: asString(parsed.vendorName),
    businessRegNumber: asString(parsed.businessRegNumber),
    representativeName: asString(parsed.representativeName),
    address: asString(parsed.address),
    businessType: asString(parsed.businessType),
    businessItem: asString(parsed.businessItem),
    openedAt: asString(parsed.openedAt),
    fieldConfidence,
    rawText: typeof parsed.rawText === "string" ? parsed.rawText : text,
  };
}
