import { ai } from "@workspace/integrations-gemini-ai";
import { ObjectStorageService } from "./objectStorage";
import { logger } from "./logger";

// [Task #465] 관리소장이 현장에서 작성한 짧은 메모(손글씨/인쇄/포스트잇)를
// 사진으로 찍어 올리면 한국어 텍스트만 추출해 돌려준다. billOcr.ts /
// contractOcr.ts 와 동일한 파일 크기·MIME 화이트리스트와 Gemini 호출 패턴을
// 따르고, 프롬프트만 "메모 받아쓰기"용으로 단순화했다. JSON 이 아닌 평문을
// 반환받아 사용자가 미리보기 다이얼로그에서 확인 후 메모란에 누적한다.

export type MemoOcrResult = {
  text: string;
};

// [Task #465] runMemoOcr 가 사용자 입력(파일) 자체의 문제로 거절했음을
// 라우트가 4xx 로 매핑할 수 있도록 명시적으로 던지는 에러 클래스.
// (Gemini 호출 실패/응답 파싱 실패 같은 서버측 문제는 일반 Error 로 둬서
//  500 으로 떨어지게 한다.)
export class MemoOcrInputError extends Error {
  status: 400 | 413;
  constructor(status: 400 | 413, message: string) {
    super(message);
    this.name = "MemoOcrInputError";
    this.status = status;
  }
}

const SYSTEM_PROMPT = `당신은 한국 집합건물 관리소장이 현장에서 작성한 짧은 메모를 OCR 로 받아쓰는 비서입니다.
주어진 이미지(또는 PDF)에 보이는 한국어 텍스트(손글씨·인쇄·포스트잇·게시물 등)를 그대로 받아 적어 평문으로만 응답하세요.

규칙:
- 사진에 적힌 글자만 그대로 옮겨 적습니다. 요약·해석·번역·문장 보정·제목 추가 금지.
- 줄바꿈은 가능한 한 원본 그대로 유지합니다.
- 사진 속 표/목록은 줄바꿈을 살려 평문으로 옮깁니다.
- 글씨가 흐릿해 확신이 없으면 그 부분만 비워두거나 "(판독불가)" 로 표시합니다.
- 마크다운, 코드펜스, 따옴표, 설명, 헤더 등 부가 텍스트는 절대 출력하지 않습니다.
- 빈 사진이거나 글자가 전혀 없으면 빈 문자열을 반환합니다.

오직 인식된 텍스트만 출력하세요.`;

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

function stripFenceAndTrim(raw: string): string {
  const fenced = raw.match(/```(?:[a-zA-Z]+)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : raw;
  return body.replace(/\u00a0/g, " ").replace(/\r\n/g, "\n").trim();
}

export async function runMemoOcr(opts: {
  objectPath: string;
  fileName?: string | null;
}): Promise<MemoOcrResult> {
  const storage = new ObjectStorageService();
  const file = await storage.getObjectEntityFile(opts.objectPath);
  const [metadata] = await file.getMetadata();
  const mimeType = (metadata.contentType as string) || inferMimeType(opts.fileName);
  if (!ALLOWED_MIME.has(mimeType)) {
    throw new MemoOcrInputError(
      400,
      "지원하지 않는 파일 형식입니다 (PDF/JPEG/PNG/WEBP/HEIC만 허용)",
    );
  }
  const sizeRaw = (metadata.size as string | number | undefined) ?? 0;
  const size = typeof sizeRaw === "string" ? Number.parseInt(sizeRaw, 10) || 0 : sizeRaw;
  if (size > MAX_OCR_BYTES) {
    throw new MemoOcrInputError(
      413,
      `파일이 너무 큽니다 (최대 ${MAX_OCR_BYTES / 1024 / 1024}MB)`,
    );
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
    });
  } catch (err) {
    logger.error({ err, objectPath: opts.objectPath }, "Gemini memo OCR call failed");
    throw new Error("OCR 모델 호출에 실패했습니다");
  }

  const raw = response.candidates?.[0]?.content?.parts
    ?.map((p: { text?: string }) => (p && "text" in p ? p.text ?? "" : ""))
    .join("") ?? "";
  const text = stripFenceAndTrim(raw);
  return { text };
}
