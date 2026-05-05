// [Task #868] 한국 사무실에서 자주 들어오는 비-이미지/PDF 문서를 LLM 분류기에
// 넘기기 전에 평문 텍스트로 풀어주는 헬퍼.
//   - .xlsx / .xls : exceljs 로 첫 시트 → CSV
//   - .docx       : mammoth 로 본문 평문
//   - .hwpx       : ZIP 안의 Contents/section*.xml → <hp:t> 텍스트 노드
//   - .hwp (구버전): OLE2 헤더 검사만, 본문 추출은 best-effort (실패 허용)
// 이렇게 변환된 텍스트는 ocrPipeline.classifyDocument / runGenericExtractor 가
// 그대로 LLM 의 text part 로 보낸다. LLM 은 xlsx/docx/hwpx 바이너리를 직접
// 받지 못하므로 서버에서 텍스트로 풀어줘야 한다.

import ExcelJS from "exceljs";
import mammoth from "mammoth";
import JSZip from "jszip";
import { logger } from "./logger";

// 한국 사무실에서 받는 비-이미지/PDF MIME 들. 이걸 거치면 LLM 입력은 항상
// 평문 텍스트가 된다.
// .xls(레거시 BIFF) 도 일단 받는다 — exceljs 가 못 읽으면 추출 빈 문자열로
// 떨어져 보관함에 unknown 으로 보존되고, 사용자가 화면에서 종류를 직접 지정한다.
export const OFFICE_XLSX_MIMES = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
  "application/vnd.ms-excel", // .xls
]);

export const OFFICE_DOCX_MIMES = new Set([
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
]);

export const OFFICE_HWPX_MIMES = new Set([
  "application/vnd.hancom.hwpx",
  "application/haansofthwpx",
  "application/x-hwpx",
]);

export const OFFICE_HWP_MIMES = new Set([
  "application/vnd.hancom.hwp",
  "application/x-hwp",
  "application/haansoft-hwp",
]);

// 친절 거절 대상 — 화이트리스트엔 안 들어가지만 메시지를 따로 안내한다.
// .doc 는 안정 Node 파서가 없어 거절. (.xls 는 일단 받고 best-effort.)
export const REJECTED_LEGACY_OFFICE_MIMES = new Set([
  "application/msword", // .doc — Node 파서 없음
]);

export function getRejectedLegacyOfficeMessage(mimeType: string): string | null {
  if (mimeType === "application/msword") {
    return "워드 구버전(.doc)은 지원하지 않습니다. .docx 또는 PDF 로 저장해서 다시 올려주세요";
  }
  return null;
}

export function isOfficeDocMime(mimeType: string): boolean {
  return (
    OFFICE_XLSX_MIMES.has(mimeType) ||
    OFFICE_DOCX_MIMES.has(mimeType) ||
    OFFICE_HWPX_MIMES.has(mimeType) ||
    OFFICE_HWP_MIMES.has(mimeType)
  );
}

const MAX_TEXT_CHARS = 60_000;

function clip(text: string): string {
  if (text.length <= MAX_TEXT_CHARS) return text;
  return text.slice(0, MAX_TEXT_CHARS) + "\n…(이하 생략)";
}

/**
 * 첫 시트만 CSV 한 덩어리로 변환. 빈 행/열은 자르고, 셀 값은 toString().trim().
 * exceljs 가 throw 하면 ExcelTextExtractError 로 감싼다.
 */
export async function extractXlsxText(buffer: Buffer): Promise<string> {
  const wb = new ExcelJS.Workbook();
  try {
    // exceljs 의 load 는 ArrayBuffer 를 더 안정적으로 받는다.
    const ab = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    await wb.xlsx.load(ab as ArrayBuffer);
  } catch (err) {
    throw new OfficeDocExtractError("엑셀 파일을 열지 못했습니다", err);
  }
  const ws = wb.worksheets[0];
  if (!ws) return "";
  const rows: string[] = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    const cells: string[] = [];
    let lastNonEmpty = -1;
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const v = cell.value;
      let s = "";
      if (v == null) s = "";
      else if (typeof v === "string") s = v;
      else if (typeof v === "number") s = String(v);
      else if (typeof v === "boolean") s = v ? "true" : "false";
      else if (v instanceof Date) s = v.toISOString().slice(0, 10);
      else if (typeof v === "object" && v !== null) {
        // RichText / Hyperlink / Formula 등.
        const obj = v as { text?: unknown; result?: unknown; richText?: Array<{ text?: string }> };
        if (typeof obj.text === "string") s = obj.text;
        else if (typeof obj.result === "string") s = obj.result;
        else if (typeof obj.result === "number") s = String(obj.result);
        else if (Array.isArray(obj.richText)) s = obj.richText.map((rt) => rt.text ?? "").join("");
        else s = "";
      }
      s = String(s).replace(/\s+/g, " ").trim();
      cells[colNumber - 1] = s;
      if (s.length > 0) lastNonEmpty = colNumber - 1;
    });
    if (lastNonEmpty < 0) return; // 완전 빈 행 스킵
    const trimmed = cells.slice(0, lastNonEmpty + 1).map((c) => c ?? "");
    // CSV 규칙: 콤마/따옴표/줄바꿈 포함 셀은 따옴표로 감싼다.
    const csv = trimmed
      .map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c))
      .join(",");
    rows.push(csv);
  });
  return clip(rows.join("\n"));
}

/**
 * mammoth 로 docx 본문을 평문 추출. 표/단락 텍스트가 모두 잡힌다.
 */
export async function extractDocxText(buffer: Buffer): Promise<string> {
  try {
    const result = await mammoth.extractRawText({ buffer });
    return clip((result.value || "").trim());
  } catch (err) {
    throw new OfficeDocExtractError("워드(.docx) 본문을 추출하지 못했습니다", err);
  }
}

/**
 * .hwpx 는 ZIP 컨테이너. Contents/section*.xml 안의 <hp:t> 노드 텍스트만 모아
 * 평문으로 돌려준다. (XML 파서는 의존성 절약 위해 정규식으로 처리)
 */
export async function extractHwpxText(buffer: Buffer): Promise<string> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch (err) {
    throw new OfficeDocExtractError("한글(.hwpx) 파일을 열지 못했습니다", err);
  }
  const sectionFiles = Object.keys(zip.files)
    .filter((name) => /^Contents\/section\d*\.xml$/i.test(name))
    .sort();
  if (sectionFiles.length === 0) {
    return "";
  }
  const parts: string[] = [];
  for (const name of sectionFiles) {
    const file = zip.file(name);
    if (!file) continue;
    const xml = await file.async("string");
    // <hp:t ...>텍스트</hp:t> — 속성·네임스페이스 변형 모두 흡수.
    const matches = xml.matchAll(/<hp:t\b[^>]*>([\s\S]*?)<\/hp:t>/g);
    for (const m of matches) {
      const inner = m[1]
        .replace(/<[^>]+>/g, "") // 내부 인라인 태그 제거
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&#10;/g, "\n");
      if (inner.trim().length > 0) parts.push(inner);
    }
    parts.push(""); // 섹션 사이 빈 줄
  }
  return clip(parts.join("\n").replace(/\n{3,}/g, "\n\n").trim());
}

/**
 * .hwp (구형 OLE2) — 안정적인 Node 파서가 없다. OLE2 magic 만 검사해 한글
 * 문서임을 확인하고, 본문 추출은 시도하지 않고 빈 문자열을 돌려준다.
 * 호출자(분류기)는 빈 텍스트일 때 unknown 으로 분류하고 사용자에게 .hwpx/PDF
 * 권장 안내 메시지를 보여줘야 한다.
 */
export function extractHwpTextBestEffort(buffer: Buffer): string {
  if (buffer.length < 8) return "";
  // OLE2 compound file magic: D0 CF 11 E0 A1 B1 1A E1
  const ok =
    buffer[0] === 0xd0 &&
    buffer[1] === 0xcf &&
    buffer[2] === 0x11 &&
    buffer[3] === 0xe0 &&
    buffer[4] === 0xa1 &&
    buffer[5] === 0xb1 &&
    buffer[6] === 0x1a &&
    buffer[7] === 0xe1;
  if (!ok) {
    logger.warn({}, "extractHwpTextBestEffort: OLE2 헤더가 아님");
  }
  return ""; // 본문은 추출 불가 — 빈 텍스트 반환
}

export class OfficeDocExtractError extends Error {
  cause?: unknown;
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "OfficeDocExtractError";
    this.cause = cause;
  }
}

/**
 * 통합 진입점. mimeType 을 보고 적절한 추출기로 분기. 비-오피스 MIME 이면 null.
 * 빈 문자열은 "오피스 문서이긴 하지만 본문이 비어있음" (예: 빈 .hwp) 을 의미.
 */
export async function extractTextIfOfficeDoc(opts: {
  buffer: Buffer;
  mimeType: string;
}): Promise<string | null> {
  if (OFFICE_XLSX_MIMES.has(opts.mimeType)) {
    return await extractXlsxText(opts.buffer);
  }
  if (OFFICE_DOCX_MIMES.has(opts.mimeType)) {
    return await extractDocxText(opts.buffer);
  }
  if (OFFICE_HWPX_MIMES.has(opts.mimeType)) {
    return await extractHwpxText(opts.buffer);
  }
  if (OFFICE_HWP_MIMES.has(opts.mimeType)) {
    return extractHwpTextBestEffort(opts.buffer);
  }
  return null;
}

/**
 * 통장 거래내역 CSV/엑셀 휴리스틱. 헤더 라인에 거래/입금/출금/잔액/적요 같은
 * 단어가 포함되면 LLM 거치지 않고 바로 bank_statement 로 라우팅한다.
 * (CSV 분기와 동일한 패턴)
 */
export function looksLikeBankStatement(text: string): boolean {
  const head = text.slice(0, 2000);
  const keywords = ["거래일", "거래일자", "입금", "출금", "잔액", "적요", "거래내역", "이체"];
  let hits = 0;
  for (const k of keywords) {
    if (head.includes(k)) hits += 1;
  }
  return hits >= 2;
}
