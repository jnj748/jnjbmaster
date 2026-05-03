// [Task #816] 미납분 고지서 일괄 PDF 생성기.
//
// pdfkit 으로 호실별 1페이지 고지서를 단일 PDF 묶음으로 렌더링한다.
// 입주민 공개 페이지(/public/bills/:token) 와 동일한 데이터 구조(billsTable + billItemsTable)
// 를 재사용해 출력 — 별도 템플릿 분기 없이 같은 항목/총액/잔액을 그대로 보여준다.
//
// 한글 출력을 위해 NotoSansKR Regular TTF 를 임베드(assets/fonts).

import path from "node:path";
import { fileURLToPath } from "node:url";
import PDFDocument from "pdfkit";
import { db } from "@workspace/db";
import { billsTable, billItemsTable } from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";

// 빌드 후(dist/) 또는 dev(src/) 어느 위치에서 실행되더라도 assets/fonts 를 찾는다.
const HERE = path.dirname(fileURLToPath(import.meta.url));
const FONT_CANDIDATES = [
  path.join(HERE, "..", "..", "assets", "fonts", "NotoSansKR-Regular.ttf"),
  path.join(HERE, "..", "assets", "fonts", "NotoSansKR-Regular.ttf"),
  path.join(process.cwd(), "artifacts", "api-server", "assets", "fonts", "NotoSansKR-Regular.ttf"),
  path.join(process.cwd(), "assets", "fonts", "NotoSansKR-Regular.ttf"),
];

import { existsSync } from "node:fs";
function resolveFont(): string {
  for (const p of FONT_CANDIDATES) if (existsSync(p)) return p;
  throw new Error("NotoSansKR-Regular.ttf not found in expected asset paths");
}

const krw = (n: number): string => `${Math.round(n).toLocaleString("ko-KR")}원`;

export interface OverdueNoticePdfInput {
  buildingId: number;
  billIds: number[];
  buildingName?: string | null;
}

export async function generateOverdueNoticesPdf(input: OverdueNoticePdfInput): Promise<Buffer> {
  const { buildingId, billIds, buildingName } = input;
  if (billIds.length === 0) throw new Error("billIds_empty");

  const bills = await db.select().from(billsTable).where(and(
    eq(billsTable.buildingId, buildingId),
    inArray(billsTable.id, billIds),
  ));
  if (bills.length === 0) throw new Error("no_bills_in_scope");

  const items = await db.select().from(billItemsTable)
    .where(inArray(billItemsTable.billId, bills.map(b => b.id)));
  const itemsByBill = new Map<number, typeof items>();
  for (const it of items) {
    const arr = itemsByBill.get(it.billId) ?? [];
    arr.push(it);
    itemsByBill.set(it.billId, arr);
  }

  const fontPath = resolveFont();
  const today = new Date().toISOString().slice(0, 10);

  return await new Promise<Buffer>((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: "A4", margins: { top: 56, bottom: 56, left: 56, right: 56 } });
      const chunks: Buffer[] = [];
      doc.on("data", (c: Buffer) => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      doc.registerFont("KR", fontPath);
      doc.font("KR");

      bills.forEach((b, idx) => {
        if (idx > 0) doc.addPage();
        const remaining = Math.max(0, b.totalAmount - b.paidAmount);
        const overdueDays = b.dueDate < today
          ? Math.floor((Date.parse(today) - Date.parse(b.dueDate)) / 86400000)
          : 0;

        // 헤더
        doc.fontSize(18).text("미납 관리비 고지서", { align: "center" });
        doc.moveDown(0.3);
        doc.fontSize(10).fillColor("#555")
          .text(`${buildingName ?? `건물 #${buildingId}`}  ·  발행일 ${today}`, { align: "center" });
        doc.moveDown(0.8);
        doc.fillColor("#000");

        // 호실/부과월/납기 박스
        doc.fontSize(11);
        const infoY = doc.y;
        doc.text(`호실: ${b.unitNumber}`, 56, infoY);
        doc.text(`부과월: ${b.billingMonth}`, 56 + 170, infoY);
        doc.text(`납기일: ${b.dueDate}`, 56 + 340, infoY);
        doc.moveDown(1.2);

        // 항목 표
        const tableX = 56;
        const cols = [{ w: 100, label: "구분" }, { w: 290, label: "항목" }, { w: 100, label: "금액" }];
        const rowH = 22;
        let y = doc.y;
        // header
        doc.rect(tableX, y, cols.reduce((s, c) => s + c.w, 0), rowH).fillAndStroke("#f3f4f6", "#cbd5e1");
        doc.fillColor("#111").fontSize(10);
        let cx = tableX;
        for (const c of cols) {
          doc.text(c.label, cx + 6, y + 6, { width: c.w - 12 });
          cx += c.w;
        }
        y += rowH;

        const rows = itemsByBill.get(b.id) ?? [];
        if (rows.length === 0) {
          doc.rect(tableX, y, cols.reduce((s, c) => s + c.w, 0), rowH).stroke("#e5e7eb");
          doc.text("(항목 없음)", tableX + 6, y + 6);
          y += rowH;
        } else {
          for (const it of rows) {
            doc.rect(tableX, y, cols.reduce((s, c) => s + c.w, 0), rowH).stroke("#e5e7eb");
            cx = tableX;
            const cells = [
              labelCategory(it.category),
              it.label,
              krw(it.amount),
            ];
            cells.forEach((v, i) => {
              const align: "left" | "right" = i === 2 ? "right" : "left";
              doc.text(String(v), cx + 6, y + 6, { width: cols[i].w - 12, align });
              cx += cols[i].w;
            });
            y += rowH;
            if (y > 730) { doc.addPage(); y = 56; }
          }
        }

        doc.y = y + 10;

        // 합계
        doc.fontSize(11);
        line(doc, "총액", krw(b.totalAmount));
        line(doc, "기납부액", krw(b.paidAmount));
        doc.fontSize(13).fillColor(remaining > 0 ? "#b91c1c" : "#111");
        line(doc, "미납 잔액", krw(remaining));
        doc.fillColor("#111").fontSize(11);
        if (overdueDays > 0) line(doc, "연체 일수", `${overdueDays}일`);

        // 가상계좌
        if (b.virtualAccount) {
          doc.moveDown(0.6);
          doc.fontSize(10).fillColor("#374151")
            .text(`납부 가상계좌: ${b.virtualAccount.bank} ${b.virtualAccount.account} (예금주: ${b.virtualAccount.holder})`);
          doc.fillColor("#000");
        }

        // 안내문
        doc.moveDown(0.8);
        doc.fontSize(9).fillColor("#6b7280")
          .text(
            "본 고지서는 미납 관리비에 대한 재고지서입니다. 납기 경과 시 연체이자가 부과될 수 있으니 빠른 시일 내 납부를 부탁드립니다.\n공개 납부 페이지: /public/bills/" + b.publicToken,
            { align: "left" },
          );
        doc.fillColor("#000");
      });

      doc.end();
    } catch (e) { reject(e); }
  });
}

function line(doc: PDFKit.PDFDocument, label: string, value: string) {
  const y = doc.y;
  doc.text(label, 56, y, { continued: false });
  doc.text(value, 56, y, { width: 483, align: "right" });
  doc.moveDown(0.4);
}

function labelCategory(c: string): string {
  switch (c) {
    case "common": return "공용관리";
    case "meter": return "검침";
    case "repair": return "수선적립";
    case "installment": return "분할";
    case "adjustment": return "조정";
    default: return "기타";
  }
}
