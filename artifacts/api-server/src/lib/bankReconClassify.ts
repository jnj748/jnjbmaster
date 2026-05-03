// [Task #817] 통장 업로드/매칭 후 잔여·차액·중복·타호실 케이스를
//   bank_reconciliations 에 draft(open) 행으로 자동 적재하는 분류기.
//
// 호출 시점:
//   1) POST /bank-tx/import      — 업로드 직후(자동매칭 → 분류).
//   2) POST /bank-tx/auto-match  — 자동매칭 종료 후 잔여 케이스 분류.
//
// 분류 우선순위:
//   - duplicate    : 같은 (txDate, amount) + (가상계좌 또는 송금자명) 이 이미
//                    auto/manual 매칭된 다른 bank_tx 와 일치 → 중복 입금.
//   - wrong_account: virtualAccountKey 가 있으나 매칭되는 bill 이 0건 → 타 호실/미등록.
//   - overpaid     : 가상계좌→bill 매칭은 되나 입금액 > 미수액 → 초과.
//   - underpaid    : 가상계좌→bill 매칭은 되나 0 < 입금액 < 미수액 → 미달.
//   - duplicate    : 가상계좌→bill 이 이미 완납(remaining=0)인데 추가 입금 → 중복.
//
// 가상계좌 키도 없고 단일 매칭도 안 된 unmatched 행은 사람이 직접 처리해야 하므로
// dispute 행을 자동 생성하지 않고 그대로 둔다(매칭큐에서 수동 등록 가능).

import { and, eq, inArray, sql } from "drizzle-orm";
import {
  db,
  billsTable,
  bankTransactionsTable,
  bankReconciliationsTable,
} from "@workspace/db";
import { logger } from "./logger";

type ReconCategory =
  | "overpaid"
  | "underpaid"
  | "duplicate"
  | "wrong_account";

const KRW = (n: number) => Math.round(Number(n || 0)).toLocaleString();

export interface AutoOpenResult {
  scanned: number;
  opened: number;
  byCategory: Record<ReconCategory, number>;
}

export async function autoOpenReconciliations(
  buildingId: number,
  options: { txIds?: number[] } = {},
): Promise<AutoOpenResult> {
  const result: AutoOpenResult = {
    scanned: 0,
    opened: 0,
    byCategory: { overpaid: 0, underpaid: 0, duplicate: 0, wrong_account: 0 },
  };

  // 자동매칭이 끝나도 unmatched 로 남아 있는 입금건만 대상.
  const conds = [
    eq(bankTransactionsTable.buildingId, buildingId),
    eq(bankTransactionsTable.matchStatus, "unmatched"),
  ];
  if (options.txIds && options.txIds.length > 0) {
    conds.push(inArray(bankTransactionsTable.id, options.txIds));
  }
  const txs = await db.select().from(bankTransactionsTable).where(and(...conds));
  result.scanned = txs.length;
  if (txs.length === 0) return result;

  // 같은 bank_tx 에 대해 이미 recon 행이 있으면 중복 생성 금지.
  const existing = await db
    .select({ bankTxId: bankReconciliationsTable.bankTxId })
    .from(bankReconciliationsTable)
    .where(and(
      eq(bankReconciliationsTable.buildingId, buildingId),
      inArray(
        bankReconciliationsTable.bankTxId,
        txs.map((t) => t.id),
      ),
    ));
  const dedup = new Set<number>(
    existing.map((e) => e.bankTxId).filter((x): x is number => x != null),
  );

  for (const tx of txs) {
    if (dedup.has(tx.id)) continue;
    if (tx.amount <= 0) continue; // 출금/마이너스 행은 대상 외.

    let category: ReconCategory | null = null;
    let billId: number | null = null;
    let unitId: number | null = null;
    let unitNumber: string | null = null;
    let amountDiff: number = tx.amount;
    let aiSuggestion: string | null = null;
    let reason: string | null = null;

    // 1) 동일 (날짜·금액·가상계좌or송금자) 가 이미 매칭된 입금이면 중복.
    {
      const dupConds = [
        eq(bankTransactionsTable.buildingId, buildingId),
        eq(bankTransactionsTable.txDate, tx.txDate),
        eq(bankTransactionsTable.amount, tx.amount),
        sql`${bankTransactionsTable.id} <> ${tx.id}`,
        inArray(bankTransactionsTable.matchStatus, ["auto", "manual"]),
      ];
      if (tx.virtualAccountKey) {
        dupConds.push(eq(bankTransactionsTable.virtualAccountKey, tx.virtualAccountKey));
      } else if (tx.counterpart) {
        dupConds.push(eq(bankTransactionsTable.counterpart, tx.counterpart));
      } else {
        dupConds.push(sql`1 = 0`); // 식별자 없으면 중복 판정 불가.
      }
      const [dup] = await db
        .select()
        .from(bankTransactionsTable)
        .where(and(...dupConds))
        .limit(1);
      if (dup) {
        category = "duplicate";
        billId = dup.matchedBillId ?? null;
        aiSuggestion = "중복 입금 — 1건은 환불 처리 권장";
        reason = `${tx.txDate} ${KRW(tx.amount)}원 중복 입금 감지 (bank_tx#${dup.id})`;
      }
    }

    // 2) 가상계좌 키가 있으면 bill 단건 조회로 over/under/wrong_account 분기.
    if (!category && tx.virtualAccountKey) {
      const [bill] = await db
        .select()
        .from(billsTable)
        .where(and(
          eq(billsTable.buildingId, buildingId),
          sql`${billsTable.virtualAccount}->>'account' = ${tx.virtualAccountKey}`,
        ))
        .limit(1);
      if (!bill) {
        category = "wrong_account";
        aiSuggestion = "타 호실/미등록 가상계좌 — 입금 호실 확인 후 재배분";
        reason = `가상계좌 ${tx.virtualAccountKey} 와 매칭되는 고지서가 없습니다`;
      } else {
        const remaining = Math.max(0, bill.totalAmount - bill.paidAmount);
        billId = bill.id;
        unitId = bill.unitId;
        unitNumber = bill.unitNumber;
        if (remaining === 0) {
          category = "duplicate";
          aiSuggestion = "이미 완납된 호실에 추가 입금 — 환불 또는 차월 이월 권장";
          reason = `${bill.unitNumber}호 ${bill.billingMonth} 완납 후 ${KRW(tx.amount)}원 추가 입금`;
          amountDiff = tx.amount;
        } else if (tx.amount > remaining) {
          category = "overpaid";
          amountDiff = tx.amount - remaining;
          aiSuggestion = "초과 입금 — 차월 이월 또는 환불 처리 권장";
          reason = `${bill.unitNumber}호 미수 ${KRW(remaining)}원 대비 ${KRW(tx.amount)}원 입금 (초과 ${KRW(amountDiff)}원)`;
        } else if (tx.amount < remaining) {
          category = "underpaid";
          amountDiff = tx.amount - remaining; // 음수
          aiSuggestion = "미달 입금 — 부분수납 처리 또는 차월 이월 권장";
          reason = `${bill.unitNumber}호 미수 ${KRW(remaining)}원 대비 ${KRW(tx.amount)}원 입금 (부족 ${KRW(remaining - tx.amount)}원)`;
        }
        // tx.amount === remaining 이면 자동매칭이 처리했어야 하므로 행 생성 안 함.
      }
    }

    if (!category) continue;

    try {
      await db.insert(bankReconciliationsTable).values({
        buildingId,
        bankTxId: tx.id,
        billId,
        unitId,
        category,
        amount: amountDiff,
        reason,
        aiSuggestion,
        status: "open",
      });
      result.opened++;
      result.byCategory[category]++;
    } catch (err) {
      logger.error({ err, txId: tx.id, buildingId }, "auto-open reconciliation insert failed");
    }
    void unitNumber; // unitNumber 는 reason 본문에만 사용.
  }

  return result;
}
