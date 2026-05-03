// [Task #812] 결산 보고서 PDF·엑셀 내보내기 헬퍼.
//   pdfkit 은 한글 글리프가 없으므로 NanumGothic.ttf 를 등록한 뒤 사용한다.
//   exceljs 는 컬럼 너비/숫자 서식만 적용하고, 워크북 객체를 res 에 스트리밍한다.
import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Response } from "express";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";

const here = path.dirname(fileURLToPath(import.meta.url));
// dev: src/lib → ../../assets/fonts ; prod(esbuild bundled mjs in dist/): ./assets/fonts
const FONT_CANDIDATES = [
  path.resolve(here, "..", "..", "assets", "fonts"),
  path.resolve(here, "assets", "fonts"),
  path.resolve(process.cwd(), "artifacts", "api-server", "assets", "fonts"),
  path.resolve(process.cwd(), "assets", "fonts"),
];
function fontPath(name: string): string {
  for (const dir of FONT_CANDIDATES) {
    const p = path.join(dir, name);
    if (existsSync(p)) return p;
  }
  throw new Error(`Korean font not found: ${name}`);
}

export function setDownloadHeaders(res: Response, filename: string, contentType: string): void {
  res.setHeader("Content-Type", contentType);
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="report"; filename*=UTF-8''${encodeURIComponent(filename)}`,
  );
}

const fmt = new Intl.NumberFormat("ko-KR");
export const nf = (v: number | null | undefined): string =>
  v == null ? "-" : fmt.format(Math.round(Number(v)));

export type SheetSpec = {
  title: string;
  meta?: Array<[string, string]>;
  columns: Array<{ header: string; key: string; width?: number; numeric?: boolean }>;
  rows: Array<Record<string, unknown>>;
  totals?: Record<string, unknown>;
};

export async function sendXlsx(res: Response, filename: string, sheet: SheetSpec): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "관리의달인";
  wb.created = new Date();
  const ws = wb.addWorksheet(sheet.title.slice(0, 31));
  ws.addRow([sheet.title]).font = { bold: true, size: 14 };
  if (sheet.meta?.length) {
    for (const [k, v] of sheet.meta) ws.addRow([k, v]);
  }
  ws.addRow([]);
  const headerRow = ws.addRow(sheet.columns.map((c) => c.header));
  headerRow.font = { bold: true };
  headerRow.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFEFEF" } };
    cell.border = { bottom: { style: "thin" } };
  });
  ws.columns.forEach((col, idx) => {
    const spec = sheet.columns[idx];
    if (spec) col.width = spec.width ?? Math.max(spec.header.length + 4, 12);
  });
  for (const r of sheet.rows) {
    const row = ws.addRow(sheet.columns.map((c) => r[c.key] ?? ""));
    sheet.columns.forEach((c, i) => {
      if (c.numeric) {
        const cell = row.getCell(i + 1);
        cell.numFmt = "#,##0";
        cell.alignment = { horizontal: "right" };
      }
    });
  }
  if (sheet.totals) {
    const totalRow = ws.addRow(sheet.columns.map((c) => sheet.totals?.[c.key] ?? ""));
    totalRow.font = { bold: true };
    totalRow.eachCell((cell, col) => {
      cell.border = { top: { style: "thin" } };
      const spec = sheet.columns[col - 1];
      if (spec?.numeric) {
        cell.numFmt = "#,##0";
        cell.alignment = { horizontal: "right" };
      }
    });
  }
  setDownloadHeaders(
    res,
    filename,
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
  const buf = await wb.xlsx.writeBuffer();
  res.end(Buffer.from(buf));
}

export type PdfTableSpec = {
  title: string;
  meta?: Array<[string, string]>;
  columns: Array<{ header: string; key: string; width: number; align?: "left" | "right"; numeric?: boolean }>;
  rows: Array<Record<string, unknown>>;
  totals?: Record<string, unknown>;
  footnote?: string;
};

export function sendPdf(res: Response, filename: string, spec: PdfTableSpec): void {
  const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 36 });
  doc.registerFont("ko", fontPath("NanumGothic.ttf"));
  doc.registerFont("ko-bold", fontPath("NanumGothicBold.ttf"));
  doc.font("ko");
  setDownloadHeaders(res, filename, "application/pdf");
  doc.pipe(res);

  doc.font("ko-bold").fontSize(16).text(spec.title);
  doc.moveDown(0.3);
  if (spec.meta?.length) {
    doc.font("ko").fontSize(9).fillColor("#555");
    for (const [k, v] of spec.meta) doc.text(`${k}: ${v}`);
    doc.fillColor("#000");
  }
  doc.moveDown(0.5);

  const startX = doc.page.margins.left;
  const usable = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const totalSpec = spec.columns.reduce((s, c) => s + c.width, 0);
  const scale = usable / totalSpec;
  const widths = spec.columns.map((c) => c.width * scale);

  function drawRow(values: string[], opts: { bold?: boolean; bg?: string; border?: boolean } = {}): void {
    const rowHeight = 18;
    if (doc.y + rowHeight > doc.page.height - doc.page.margins.bottom) {
      doc.addPage({ size: "A4", layout: "landscape", margin: 36 });
      doc.font("ko");
    }
    const y = doc.y;
    if (opts.bg) {
      doc.save().rect(startX, y, usable, rowHeight).fill(opts.bg).restore();
    }
    let x = startX;
    doc.font(opts.bold ? "ko-bold" : "ko").fontSize(9).fillColor("#000");
    spec.columns.forEach((c, i) => {
      const w = widths[i];
      const align = c.align ?? (c.numeric ? "right" : "left");
      doc.text(values[i] ?? "", x + 4, y + 4, { width: w - 8, align, lineBreak: false });
      x += w;
    });
    if (opts.border) {
      doc.save().moveTo(startX, y + rowHeight).lineTo(startX + usable, y + rowHeight).strokeColor("#ccc").lineWidth(0.5).stroke().restore();
    }
    doc.y = y + rowHeight;
  }

  drawRow(spec.columns.map((c) => c.header), { bold: true, bg: "#EFEFEF", border: true });
  for (const r of spec.rows) {
    drawRow(spec.columns.map((c) => formatCell(r[c.key], c.numeric)), { border: true });
  }
  if (spec.totals) {
    drawRow(spec.columns.map((c) => formatCell(spec.totals?.[c.key], c.numeric)), { bold: true, bg: "#FAFAFA", border: true });
  }
  if (spec.footnote) {
    doc.moveDown(0.5);
    doc.font("ko").fontSize(8).fillColor("#666").text(spec.footnote);
  }
  doc.end();
}

function formatCell(v: unknown, numeric?: boolean): string {
  if (v == null || v === "") return "-";
  if (numeric) {
    const n = typeof v === "number" ? v : Number(v);
    if (!Number.isFinite(n)) return String(v);
    return nf(n);
  }
  return String(v);
}
