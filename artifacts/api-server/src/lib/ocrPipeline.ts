// [Task #774] 단일 OCR/문서 파이프라인.
//   - 파일 업로드 → 종류 자동 분류 → 종류별 추출기 호출 → 표준화 JSON 반환.
//   - 기존 OCR(billOcr/contractOcr/businessRegOcr/memoOcr/meterPhotoOcr)을
//     "추출기" 로 재사용한다. 신규는 receipt / bank_statement / resolution /
//     tax_invoice 4종.
//   - 결과는 standardExtractionSchema 에 맞춰 후속 엔진(지출결의·부과·수납·회계)
//     이 키보드 입력 없이 받을 수 있게 정규화한다.

import crypto from "node:crypto";
import { ObjectStorageService } from "./objectStorage";
import { logger } from "./logger";
import { routedGenerate as defaultRoutedGenerate } from "./llmRouter";

// [Task #783] LLM 호출을 테스트에서 스텁할 수 있도록 한 단계 우회한다.
// 운영 코드는 항상 default 구현을 사용하며, __setRoutedGenerateForTests 는
// 단위 테스트에서만 호출된다.
type RoutedGenerateFn = typeof defaultRoutedGenerate;
let routedGenerate: RoutedGenerateFn = defaultRoutedGenerate;
export function __setRoutedGenerateForTests(fn: RoutedGenerateFn | null): void {
  routedGenerate = fn ?? defaultRoutedGenerate;
}
import { runBillOcr } from "./billOcr";
import { runContractOcr } from "./contractOcr";
import { runBusinessRegOcr } from "./businessRegOcr";
import { runMeterPhotoOcr } from "./meterPhotoOcr";
import { runMemoOcr } from "./memoOcr";
import {
  type DocumentIngestionKind,
  documentIngestionKinds,
  type StandardExtraction,
} from "@workspace/db";

const MAX_OCR_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "text/csv",
  "application/vnd.ms-excel",
]);

export class OcrPipelineInputError extends Error {
  status: 400 | 413;
  constructor(status: 400 | 413, message: string) {
    super(message);
    this.name = "OcrPipelineInputError";
    this.status = status;
  }
}

function inferMimeType(name: string | null | undefined): string {
  const lower = (name || "").toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".heic")) return "image/heic";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".csv")) return "text/csv";
  return "image/jpeg";
}

export type LoadedFile = {
  buffer: Buffer;
  mimeType: string;
  size: number;
  contentHash: string;
};

async function loadObject(objectPath: string, fileName: string | null): Promise<LoadedFile> {
  const storage = new ObjectStorageService();
  const file = await storage.getObjectEntityFile(objectPath);
  const [metadata] = await file.getMetadata();
  const mimeType = (metadata.contentType as string) || inferMimeType(fileName);
  if (!ALLOWED_MIME.has(mimeType)) {
    throw new OcrPipelineInputError(400, `지원하지 않는 파일 형식입니다 (${mimeType})`);
  }
  const sizeRaw = (metadata.size as string | number | undefined) ?? 0;
  const size = typeof sizeRaw === "string" ? Number.parseInt(sizeRaw, 10) || 0 : sizeRaw;
  if (size > MAX_OCR_BYTES) {
    throw new OcrPipelineInputError(413, `파일이 너무 큽니다 (최대 ${MAX_OCR_BYTES / 1024 / 1024}MB)`);
  }
  const chunks: Buffer[] = [];
  let total = 0;
  await new Promise<void>((resolve, reject) => {
    const stream = file.createReadStream();
    stream
      .on("data", (c: Buffer) => {
        total += c.length;
        if (total > MAX_OCR_BYTES) {
          stream.destroy(new OcrPipelineInputError(413, "파일이 너무 큽니다"));
          return;
        }
        chunks.push(c);
      })
      .on("end", () => resolve())
      .on("error", reject);
  });
  const buffer = Buffer.concat(chunks);
  const contentHash = crypto.createHash("sha256").update(buffer).digest("hex");
  return { buffer, mimeType, size: buffer.length, contentHash };
}

const CLASSIFY_PROMPT = `당신은 한국 집합건물 경리 문서를 분류하는 분류기입니다.
주어진 이미지/PDF가 다음 중 어떤 종류인지 한 단어 키로만 답하세요. 다른 설명/JSON 금지.

키:
- receipt: 영수증, 카드매출전표, 간이영수증
- bill: 전기/수도/가스/관리비 등 청구서
- bank_statement: 통장 거래내역, 입출금명세
- contract: 용역 계약서 (청소·경비·승강기 등)
- resolution: 입주자대표회의 의결문/회의록
- tax_invoice: 세금계산서, 전자세금계산서
- business_reg: 사업자등록증
- memo: 손글씨/포스트잇 등 짧은 현장 메모
- meter_photo: 계량기(수도/전기/가스) 사진
- unknown: 위 어디에도 안 맞음

오직 키 한 단어만 출력.`;

export async function classifyDocument(opts: {
  buffer: Buffer;
  mimeType: string;
  hint?: DocumentIngestionKind;
}): Promise<DocumentIngestionKind> {
  if (opts.hint && (documentIngestionKinds as readonly string[]).includes(opts.hint)) {
    return opts.hint;
  }
  // CSV 는 LLM 안 거치고 바로 통장내역으로 본다.
  if (opts.mimeType === "text/csv" || opts.mimeType === "application/vnd.ms-excel") {
    return "bank_statement";
  }
  try {
    const routed = await routedGenerate({
      tier: "tier0",
      parts: [
        { text: CLASSIFY_PROMPT },
        { inlineData: { mimeType: opts.mimeType, data: opts.buffer.toString("base64") } },
      ],
      maxOutputTokens: 16,
    });
    const text = normalizeClassifyToken(routed.text);
    if ((documentIngestionKinds as readonly string[]).includes(text)) {
      return text as DocumentIngestionKind;
    }
    logger.warn({ text }, "classifyDocument unknown response");
    return "unknown";
  } catch (err) {
    logger.warn({ err }, "classifyDocument failed");
    return "unknown";
  }
}

/**
 * Pure helper. LLM 분류기 응답에서 영숫자/언더스코어만 남겨 키 후보를 만든다.
 * 코드펜스, 따옴표, 마침표, 한자/한글 잡음을 모두 제거한다.
 */
export function normalizeClassifyToken(raw: string): string {
  return raw.trim().toLowerCase().replace(/[^a-z_]/g, "");
}

/**
 * Pure helper. LLM JSON 추출 응답에서 안전하게 객체를 꺼낸다.
 * 케이스:
 *  - 순수 JSON 객체 한 개
 *  - ```json ... ``` 코드펜스로 감싸진 JSON
 *  - JSON 앞뒤로 자연어 잡문이 붙은 경우 (첫 `{` ~ 마지막 `}` 잘라쓰기)
 * 객체를 못 찾거나 파싱 실패 시 throw 한다.
 */
export function parseExtractionJson(raw: string): Record<string, unknown> {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : raw;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end < 0 || end <= start) {
    throw new Error("OCR 결과에서 JSON을 찾지 못했습니다");
  }
  return JSON.parse(candidate.slice(start, end + 1)) as Record<string, unknown>;
}

const CATEGORY_HINTS: Record<DocumentIngestionKind, string[]> = {
  receipt: ["일반관리비", "소모품", "수선비", "복리후생", "기타"],
  bill: ["공동전기료", "공동수도료", "난방비", "가스료", "관리비"],
  bank_statement: ["수납", "이체", "수수료", "입금"],
  contract: ["용역계약", "장기수선", "유지보수"],
  resolution: ["의결사항", "수선", "예산"],
  tax_invoice: ["용역대금", "재료비", "공사비"],
  business_reg: ["거래처 등록"],
  memo: ["메모"],
  meter_photo: ["검침"],
  unknown: [],
};

/**
 * Generic LLM extractor for kinds without a dedicated extractor (receipt /
 * bank_statement / resolution / tax_invoice). Returns standardized JSON.
 */
async function runGenericExtractor(opts: {
  buffer: Buffer;
  mimeType: string;
  kind: DocumentIngestionKind;
}): Promise<{ extraction: Partial<StandardExtraction>; routed: { tier: string; model: string; inputTokens: number | null; outputTokens: number | null; costEstimateUsd: number } }> {
  const kindLabel: Record<DocumentIngestionKind, string> = {
    receipt: "영수증/카드매출전표",
    bill: "관리비/공과금 청구서",
    bank_statement: "통장 거래내역",
    contract: "용역 계약서",
    resolution: "입주자대표회의 의결문/회의록",
    tax_invoice: "(전자)세금계산서",
    business_reg: "사업자등록증",
    memo: "현장 메모",
    meter_photo: "계량기 사진",
    unknown: "기타 문서",
  };
  const prompt = `당신은 한국 집합건물 경리 OCR 입니다. 이 문서는 "${kindLabel[opts.kind]}"입니다.
다음 JSON 스키마로만 답하세요. 다른 설명 금지.

{
  "vendor": string|null,            // 거래처명/발급기관/상호
  "amount": number|null,            // 합계 금액(원, 정수). 통장내역이면 핵심 거래 1건의 금액.
  "date": string|null,              // 거래일/발행일 YYYY-MM-DD
  "items": [{"name": string, "amount": number|null, "quantity": number|null}], // 품목/내역
  "categoryCandidates": string[],   // 추정 계정과목 후보 한국어 (최대 3개)
  "confidence": number,             // 전체 인식 신뢰도 0~1
  "rawText": string                 // 문서에서 읽은 원문(요약 금지)
}

종류별 힌트:
- 통장내역: items 에 거래 1건씩 {거래일, 거래처, 입금액/출금액}을 넣고, amount 는 핵심 1건.
- 의결문: vendor=의결주체("입주자대표회의"), amount=의결 금액(있으면), items=의결 안건.
- 영수증: vendor=가맹점, items=품목.
- 세금계산서: vendor=공급자, amount=공급가액+세액 합계.

오직 JSON 하나만 출력하세요.`;
  const routed = await routedGenerate({
    tier: "tier1",
    json: true,
    parts: [
      { text: prompt },
      { inlineData: { mimeType: opts.mimeType, data: opts.buffer.toString("base64") } },
    ],
  });
  const parsed = parseExtractionJson(routed.text) as Partial<StandardExtraction>;
  return { extraction: parsed, routed };
}

function asString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}
function asNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return Math.round(v);
  if (typeof v === "string") {
    const cleaned = v.replace(/[^0-9.\-]/g, "");
    const n = Number(cleaned);
    if (Number.isFinite(n)) return Math.round(n);
  }
  return null;
}

export type IngestResult = {
  kind: DocumentIngestionKind;
  contentHash: string;
  mimeType: string;
  extraction: StandardExtraction;
  llmAccounting: Record<string, unknown>;
};

/**
 * 단일 진입점. 호출자(라우트/배치 업로드/페이지 임베드)는 이 함수만 호출하면 된다.
 * 종류 힌트가 있으면 분류 단계를 건너뛴다.
 */
export async function ingestDocument(opts: {
  objectPath: string;
  fileName?: string | null;
  kindHint?: DocumentIngestionKind;
}): Promise<IngestResult> {
  const loaded = await loadObject(opts.objectPath, opts.fileName ?? null);
  const kind = await classifyDocument({
    buffer: loaded.buffer,
    mimeType: loaded.mimeType,
    hint: opts.kindHint,
  });

  let extraction: StandardExtraction;
  let llmAccounting: Record<string, unknown> = {};

  try {
    if (kind === "bill") {
      const r = await runBillOcr({ objectPath: opts.objectPath, fileName: opts.fileName });
      extraction = {
        kind,
        vendor: null,
        amount: r.totalAmount,
        date: r.dueDate,
        items: Object.entries(r.lineItems).map(([name, amount]) => ({ name, amount, quantity: null })),
        categoryCandidates: CATEGORY_HINTS.bill,
        confidence: avg(Object.values(r.fieldConfidence)),
        rawText: r.rawText,
        pages: [],
        kindSpecific: { billingMonth: r.billingMonth, lineItems: r.lineItems, unitCount: r.unitCount, fieldConfidence: r.fieldConfidence },
      };
    } else if (kind === "contract") {
      const r = await runContractOcr({ objectPath: opts.objectPath, fileName: opts.fileName });
      extraction = {
        kind,
        vendor: r.vendorName,
        amount: r.contractAmount,
        date: r.startDate,
        items: r.title ? [{ name: r.title, amount: r.contractAmount, quantity: null }] : [],
        categoryCandidates: r.category ? [r.category, ...CATEGORY_HINTS.contract] : CATEGORY_HINTS.contract,
        confidence: avg(Object.values(r.fieldConfidence)),
        rawText: r.rawText,
        pages: [],
        kindSpecific: {
          businessRegNumber: r.businessRegNumber,
          representativeName: r.representativeName,
          category: r.category,
          startDate: r.startDate,
          endDate: r.endDate,
          isRecurring: r.isRecurring,
          fieldConfidence: r.fieldConfidence,
        },
      };
    } else if (kind === "business_reg") {
      const r = await runBusinessRegOcr({ objectPath: opts.objectPath, fileName: opts.fileName });
      extraction = {
        kind,
        vendor: r.vendorName,
        amount: null,
        date: r.openedAt,
        items: [],
        categoryCandidates: CATEGORY_HINTS.business_reg,
        confidence: avg(Object.values(r.fieldConfidence)),
        rawText: r.rawText,
        pages: [],
        kindSpecific: {
          businessRegNumber: r.businessRegNumber,
          representativeName: r.representativeName,
          address: r.address,
          businessType: r.businessType,
          businessItem: r.businessItem,
          openedAt: r.openedAt,
          fieldConfidence: r.fieldConfidence,
        },
      };
    } else if (kind === "meter_photo") {
      const r = await runMeterPhotoOcr({ objectPath: opts.objectPath, fileName: opts.fileName });
      extraction = {
        kind,
        vendor: null,
        amount: null,
        date: null,
        items: r.currentReading != null ? [{ name: "currentReading", amount: r.currentReading, quantity: null }] : [],
        categoryCandidates: CATEGORY_HINTS.meter_photo,
        confidence: r.confidence,
        rawText: r.rawText,
        pages: [],
        kindSpecific: { currentReading: r.currentReading },
      };
    } else if (kind === "memo") {
      const r = await runMemoOcr({ objectPath: opts.objectPath, fileName: opts.fileName });
      extraction = {
        kind,
        vendor: null,
        amount: null,
        date: null,
        items: [],
        categoryCandidates: CATEGORY_HINTS.memo,
        confidence: 0.7,
        rawText: r.text,
        pages: [],
        kindSpecific: {},
      };
    } else {
      const { extraction: parsed, routed } = await runGenericExtractor({
        buffer: loaded.buffer,
        mimeType: loaded.mimeType,
        kind,
      });
      llmAccounting = {
        tier: routed.tier,
        model: routed.model,
        inputTokens: routed.inputTokens,
        outputTokens: routed.outputTokens,
        costEstimateUsd: routed.costEstimateUsd,
      };
      extraction = {
        kind,
        vendor: asString(parsed.vendor),
        amount: asNumber(parsed.amount),
        date: asString(parsed.date),
        items: Array.isArray(parsed.items) ? parsed.items.map((it) => ({
          name: asString((it as { name?: unknown }).name) ?? "",
          amount: asNumber((it as { amount?: unknown }).amount),
          quantity: asNumber((it as { quantity?: unknown }).quantity),
        })) : [],
        categoryCandidates: Array.isArray(parsed.categoryCandidates)
          ? parsed.categoryCandidates.map((c) => String(c)).slice(0, 5)
          : CATEGORY_HINTS[kind],
        confidence: typeof parsed.confidence === "number" ? Math.max(0, Math.min(1, parsed.confidence)) : 0,
        rawText: typeof parsed.rawText === "string" ? parsed.rawText : "",
        pages: [],
        kindSpecific: {},
      };
    }
  } catch (err) {
    logger.error({ err, kind, objectPath: opts.objectPath }, "ingestDocument extractor failed");
    throw err instanceof Error ? err : new Error("OCR 추출에 실패했습니다");
  }

  return {
    kind,
    contentHash: loaded.contentHash,
    mimeType: loaded.mimeType,
    extraction,
    llmAccounting,
  };
}

function avg(arr: number[]): number {
  if (arr.length === 0) return 0;
  return Math.max(0, Math.min(1, arr.reduce((s, n) => s + (Number.isFinite(n) ? n : 0), 0) / arr.length));
}
