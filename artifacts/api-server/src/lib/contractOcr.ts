import { ai } from "@workspace/integrations-gemini-ai";
import { ObjectStorageService } from "./objectStorage";
import { logger } from "./logger";

// [Task #369] 한국 용역 계약서 OCR. 기존 billOcr.ts 의 파일 크기·MIME
// 화이트리스트 / Gemini 호출 패턴을 그대로 재사용하고, 프롬프트만 계약서
// 정보 추출용으로 교체했다. DB에 직접 쓰지 않고 결과(JSON + 신뢰도)만
// 반환해 사용자가 검토 후 저장하도록 한다.

export type ContractOcrResult = {
  vendorName: string | null;
  businessRegNumber: string | null;
  representativeName: string | null;
  category: string | null;
  title: string | null;
  startDate: string | null;
  endDate: string | null;
  contractAmount: number | null;
  isRecurring: boolean | null;
  fieldConfidence: Record<string, number>;
  rawText: string;
};

const SYSTEM_PROMPT = `당신은 한국 집합건물에서 발주하는 용역(시설관리·청소·경비·승강기·소독 등) 계약서를 분석하는 OCR 어시스턴트입니다.
주어진 이미지 또는 PDF에서 다음 정보를 정확히 추출해 JSON으로만 답하세요. 다른 설명은 일절 금지합니다.

- vendorName: 업체명(수급인/을). 알 수 없으면 null.
- businessRegNumber: 업체 사업자등록번호(예: "123-45-67890"). 알 수 없으면 null.
- representativeName: 업체 대표자 성명. 알 수 없으면 null.
- category: 용역 카테고리. 다음 중 하나를 한국어 키로 반환하세요. 잘 모르겠으면 null.
  elevator(승강기), cleaning(청소), security(경비), disinfection(소독),
  electric(전기), fire_safety(소방), hvac(공조/냉난방), landscaping(조경),
  facility(시설관리/종합관리), other(기타)
- title: 계약서 제목 또는 요약(예: "○○빌딩 청소용역 계약서"). 알 수 없으면 null.
- startDate: 계약 시작일 (YYYY-MM-DD). 알 수 없으면 null.
- endDate: 계약 종료일 (YYYY-MM-DD). 알 수 없으면 null.
- contractAmount: 총 계약금액 (정수, 원 단위, 부가세 포함 표기 시 그 값). 알 수 없으면 null.
- isRecurring: 자동(자동연장) 갱신 조항이 명시되어 있으면 true, 명시적으로 자동연장이 없으면 false, 모호하면 null.
- fieldConfidence: 위 각 필드(vendorName, businessRegNumber, representativeName, category, title, startDate, endDate, contractAmount, isRecurring)에 대한 인식 신뢰도 0.0~1.0 사이 소수.
- rawText: 계약서에서 읽은 전체 원문 텍스트(요약 금지, 줄바꿈 보존).

오직 JSON 하나만 출력하세요.`;

function parseModelJson(text: string): Partial<ContractOcrResult> {
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

const MAX_OCR_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

const ALLOWED_CATEGORIES = new Set([
  "elevator",
  "cleaning",
  "security",
  "disinfection",
  "electric",
  "fire_safety",
  "hvac",
  "landscaping",
  "facility",
  "other",
]);

export async function runContractOcr(opts: {
  objectPath: string;
  fileName?: string | null;
}): Promise<ContractOcrResult> {
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
    logger.error({ err, objectPath: opts.objectPath }, "Gemini contract OCR call failed");
    throw new Error("OCR 모델 호출에 실패했습니다");
  }

  const text = response.candidates?.[0]?.content?.parts
    ?.map((p: { text?: string }) => (p && "text" in p ? p.text ?? "" : ""))
    .join("")
    .trim() ?? "";
  if (!text) throw new Error("OCR 결과가 비어 있습니다");

  // 모델은 isRecurring 을 boolean / "true"/"false" 문자열 / null 등 다양한 형태로
  //   돌려줄 수 있고, contractAmount 도 "12,000,000원" 같은 통화 표현이 올 수 있다.
  //   그래서 좁게 타입을 지정하지 않고 unknown 키맵으로 받는다.
  let parsed: Record<string, unknown>;
  try {
    parsed = parseModelJson(text) as Record<string, unknown>;
  } catch (err) {
    logger.warn({ err, text }, "Contract OCR JSON parse failed");
    throw new Error("OCR 결과를 해석하지 못했습니다");
  }

  const fieldConfidence: Record<string, number> = {};
  if (parsed.fieldConfidence && typeof parsed.fieldConfidence === "object") {
    for (const [k, v] of Object.entries(parsed.fieldConfidence)) {
      const n = typeof v === "number" ? v : Number(v);
      if (Number.isFinite(n)) fieldConfidence[k] = Math.max(0, Math.min(1, n));
    }
  }

  function asString(v: unknown): string | null {
    if (typeof v !== "string") return null;
    const t = v.trim();
    return t.length > 0 ? t : null;
  }

  const category = asString(parsed.category);
  const normalizedCategory = category && ALLOWED_CATEGORIES.has(category) ? category : null;

  let isRecurring: boolean | null = null;
  if (typeof parsed.isRecurring === "boolean") {
    isRecurring = parsed.isRecurring;
  } else if (typeof parsed.isRecurring === "string") {
    const s = parsed.isRecurring.toLowerCase();
    if (s === "true" || s === "yes" || s === "y") isRecurring = true;
    else if (s === "false" || s === "no" || s === "n") isRecurring = false;
  }

  let amount: number | null = null;
  if (typeof parsed.contractAmount === "number" && Number.isFinite(parsed.contractAmount)) {
    amount = Math.round(parsed.contractAmount);
  } else if (typeof parsed.contractAmount === "string") {
    const cleaned = parsed.contractAmount.replace(/[^0-9.-]/g, "");
    const n = Number(cleaned);
    if (Number.isFinite(n)) amount = Math.round(n);
  }

  return {
    vendorName: asString(parsed.vendorName),
    businessRegNumber: asString(parsed.businessRegNumber),
    representativeName: asString(parsed.representativeName),
    category: normalizedCategory,
    title: asString(parsed.title),
    startDate: asString(parsed.startDate),
    endDate: asString(parsed.endDate),
    contractAmount: amount,
    isRecurring,
    fieldConfidence,
    rawText: typeof parsed.rawText === "string" ? parsed.rawText : text,
  };
}
