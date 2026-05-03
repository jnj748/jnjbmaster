// [Task #778] T6 회계엔진 v01 — 이벤트 → 자동 분개 매핑 룰엔진.
//
// 입력 이벤트:
//   - voucher.confirmed  (선급)  : (차) 1200 선급비용  / (대) 1020 예금
//   - voucher.confirmed  (비용)  : (차) 5100 관리비용  / (대) 1020 예금
//   - voucher.installment_recognized:
//                                 (차) 5100 관리비용 / (대) 1200 선급비용 (회차별)
//   - billing.finalized          : (차) 1100 미수관리비 / (대) 4100 관리수익
//   - payment.received(완납)     : (차) 1020 예금 / (대) 1100 미수관리비
//   - payment.partial            : 동일 (부족분은 미수관리비에 잔존)
//
// 본 모듈은 listener 등록을 1회 수행하며, 헤더+라인을 하나의 트랜잭션으로 삽입한다.
// 대차일치(totalDebit == totalCredit)는 항상 자동 검증되어 isBalanced 로 기록된다.

import { db, journalEntriesTable, journalLinesTable, type JournalSourceEvent } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";
import { voucherEventBus, type VoucherConfirmedPayload, type VoucherScheduleTickPayload } from "./voucherEvents";
import { BILLING_FINALIZED_LISTENERS, type BillingFinalizedEvent } from "../routes/billing";
import { recordSystemAudit } from "../middlewares/audit";

// ── 표준 계정코드 (시드와 일치) ────────────────────────────
export const STD = {
  CASH: { code: "1010", name: "현금" },
  BANK: { code: "1020", name: "예금" },
  AR_FEES: { code: "1100", name: "미수관리비" },
  PREPAID: { code: "1200", name: "선급비용" },
  AP: { code: "2100", name: "미지급금" },
  ADV_RECEIPT: { code: "2200", name: "가수금" },
  REPAIR_RESERVE_LIAB: { code: "2300", name: "수선적립금부채" },
  RETAINED: { code: "3100", name: "이월잉여금" },
  REVENUE: { code: "4100", name: "관리수익" },
  EXPENSE: { code: "5100", name: "관리비용" },
} as const;

const EPS = 0.5;

interface LineDraft {
  accountCode: string;
  accountName: string;
  debit?: number;
  credit?: number;
  partyName?: string | null;
  unitId?: number | null;
  memo?: string | null;
}

function L(acc: { code: string; name: string }, kind: "D" | "C", amount: number, extras: { partyName?: string | null; unitId?: number | null; memo?: string | null } = {}): LineDraft {
  return {
    accountCode: acc.code,
    accountName: acc.name,
    debit: kind === "D" ? amount : 0,
    credit: kind === "C" ? amount : 0,
    partyName: extras.partyName ?? null,
    unitId: extras.unitId ?? null,
    memo: extras.memo ?? null,
  };
}

export interface PostJournalArgs {
  buildingId: number | null;
  entryDate: string; // YYYY-MM-DD
  memo: string;
  sourceEvent: JournalSourceEvent;
  sourceRefType?: string | null;
  sourceRefId?: number | null;
  createdById?: number | null;
  lines: LineDraft[];
  isReversal?: boolean;
  reversedEntryId?: number | null;
}

/** 분개 1건을 헤더+라인으로 저장. 대차일치는 자동 계산되어 isBalanced 에 반영된다. */
export async function postJournal(args: PostJournalArgs): Promise<{ entryId: number; isBalanced: boolean }> {
  const totalDebit = args.lines.reduce((s, l) => s + (l.debit ?? 0), 0);
  const totalCredit = args.lines.reduce((s, l) => s + (l.credit ?? 0), 0);
  const isBalanced = Math.abs(totalDebit - totalCredit) <= EPS;

  if (!isBalanced) {
    logger.warn(
      { sourceEvent: args.sourceEvent, sourceRefId: args.sourceRefId, totalDebit, totalCredit },
      "[T6] journal lines do not balance — recorded with isBalanced=false",
    );
  }

  // 헤더+라인은 단일 트랜잭션으로 삽입 — 라인 INSERT 가 실패하면 헤더도 롤백.
  const entryId = await db.transaction(async (tx) => {
    const [entry] = await tx.insert(journalEntriesTable).values({
      buildingId: args.buildingId ?? null,
      entryDate: args.entryDate,
      memo: args.memo,
      sourceEvent: args.sourceEvent,
      sourceRefType: args.sourceRefType ?? null,
      sourceRefId: args.sourceRefId ?? null,
      totalDebit,
      totalCredit,
      isBalanced,
      isReversal: args.isReversal ?? false,
      reversedEntryId: args.reversedEntryId ?? null,
      createdById: args.createdById ?? null,
    }).returning();

    if (args.lines.length > 0) {
      await tx.insert(journalLinesTable).values(args.lines.map((l, idx) => ({
        entryId: entry.id,
        accountCode: l.accountCode,
        accountName: l.accountName,
        debit: l.debit ?? 0,
        credit: l.credit ?? 0,
        partyName: l.partyName ?? null,
        unitId: l.unitId ?? null,
        memo: l.memo ?? null,
        sortOrder: idx,
      })));
    }
    return entry.id;
  });

  logger.info(
    { entryId, sourceEvent: args.sourceEvent, totalDebit, totalCredit, isBalanced },
    "[T6] journal posted",
  );

  // 시스템(자동) 분개도 T2 감사로그 1행을 남긴다. 라우트 미들웨어 audit 와 별개로
  // listener 경로(voucher/billing/payment)는 req 가 없으므로 recordSystemAudit 사용.
  await recordSystemAudit({
    action: "journal.post",
    targetType: "journal_entry",
    targetId: entryId,
    buildingId: args.buildingId ?? null,
    actorId: args.createdById ?? null,
    after: {
      sourceEvent: args.sourceEvent,
      sourceRefType: args.sourceRefType ?? null,
      sourceRefId: args.sourceRefId ?? null,
      totalDebit, totalCredit, isBalanced,
      memo: args.memo,
    },
    reason: `auto:${args.sourceEvent}`,
  });

  return { entryId, isBalanced };
}

/** 기존 분개의 차/대를 뒤집어 역분개로 새 entry 를 만든다. (마감 후에도 허용) */
export async function reverseJournal(entryId: number, opts: { memo?: string; createdById?: number | null } = {}): Promise<number> {
  const [orig] = await db.select().from(journalEntriesTable).where(eq(journalEntriesTable.id, entryId));
  if (!orig) throw new Error("journal entry not found");
  const lines = await db.select().from(journalLinesTable).where(eq(journalLinesTable.entryId, entryId));

  const flipped: LineDraft[] = lines.map((l) => ({
    accountCode: l.accountCode,
    accountName: l.accountName,
    debit: l.credit,
    credit: l.debit,
    partyName: l.partyName,
    unitId: l.unitId,
    memo: l.memo,
  }));

  const today = new Date().toISOString().slice(0, 10);
  const { entryId: newId } = await postJournal({
    buildingId: orig.buildingId,
    entryDate: today,
    memo: opts.memo ?? `역분개: ${orig.memo}`,
    sourceEvent: "reversal",
    sourceRefType: orig.sourceRefType,
    sourceRefId: orig.sourceRefId,
    createdById: opts.createdById ?? null,
    isReversal: true,
    reversedEntryId: orig.id,
    lines: flipped,
  });
  return newId;
}

// ── 이벤트 핸들러 ─────────────────────────────────────────────
async function onVoucherConfirmed(p: VoucherConfirmedPayload): Promise<void> {
  const today = (p.occurredAt ?? new Date().toISOString()).slice(0, 10);
  const vendor = p.vendor ?? "거래처미상";
  // 선급(분할부과 스케줄 존재) → 선급비용 계상. 비용 → 즉시 비용 계상.
  // 자금 출처는 v01 에서 일괄 예금(1020) 가정 — 출납등록(recorded) 시 실제 계좌·현금 분기는 후속.
  const debitAcc = p.type === "선급" ? STD.PREPAID : STD.EXPENSE;

  await postJournal({
    buildingId: p.buildingId,
    entryDate: today,
    memo: `${p.type === "선급" ? "선급비용" : "관리비용"} 집행 — ${vendor} ${p.amount.toLocaleString()}원`,
    sourceEvent: "voucher.confirmed",
    sourceRefType: "expense_voucher",
    sourceRefId: p.voucherId,
    lines: [
      L(debitAcc, "D", p.amount, { partyName: vendor, memo: `voucher#${p.voucherId}` }),
      L(STD.BANK, "C", p.amount, { partyName: vendor, memo: `voucher#${p.voucherId}` }),
    ],
  }).catch((err) => logger.error({ err, voucherId: p.voucherId }, "[T6] voucher.confirmed posting failed"));
}

async function onBillingFinalized(e: BillingFinalizedEvent): Promise<void> {
  const today = (e.finalizedAt ?? new Date().toISOString()).slice(0, 10);
  await postJournal({
    buildingId: e.buildingId,
    entryDate: today,
    memo: `${e.billingMonth} 관리비 부과 확정 (${e.unitCount}세대)`,
    sourceEvent: "billing.finalized",
    sourceRefType: "billing_run",
    sourceRefId: e.runId,
    lines: [
      L(STD.AR_FEES, "D", e.totalAmount, { memo: `${e.billingMonth} 부과` }),
      L(STD.REVENUE, "C", e.totalAmount, { memo: `${e.billingMonth} 부과` }),
    ],
  }).catch((err) => logger.error({ err, runId: e.runId }, "[T6] billing.finalized posting failed"));
}

/** 수납 분개. 호실/월 단위로 호출되며 부분수납이면 amount<청구액 으로 들어온다. */
export interface PaymentReceivedArgs {
  buildingId: number | null;
  unitId: number;
  billingMonth: string;
  amount: number;
  /** [Task #778] 미수관리비(AR) 잔액. 입금액이 이 값을 초과하면 차액은 가수금(2200)으로. */
  receivableOpenAmount?: number;
  partyName?: string | null;
  isPartial?: boolean;
  occurredAt?: string;
}
export async function postPaymentReceived(p: PaymentReceivedArgs): Promise<number> {
  const today = (p.occurredAt ?? new Date().toISOString()).slice(0, 10);
  const open = Math.max(0, p.receivableOpenAmount ?? p.amount);
  const arAmount = Math.min(p.amount, open);
  const excess = Math.max(0, p.amount - open);
  const lines = [
    L(STD.BANK, "D", p.amount, { unitId: p.unitId, partyName: p.partyName ?? null, memo: `${p.billingMonth} 수납` }),
  ];
  if (arAmount > 0) lines.push(L(STD.AR_FEES, "C", arAmount, { unitId: p.unitId, partyName: p.partyName ?? null, memo: `${p.billingMonth} 수납` }));
  if (excess > 0) lines.push(L(STD.ADV_RECEIPT, "C", excess, { unitId: p.unitId, partyName: p.partyName ?? null, memo: `${p.billingMonth} 초과수납(가수금)` }));
  const memo = `${p.billingMonth} 관리비 수납 ${p.isPartial ? "(부분)" : "(완납)"}${excess > 0 ? ` +가수금 ${excess.toLocaleString()}` : ""} — 호실#${p.unitId} ${p.amount.toLocaleString()}원`;
  const { entryId } = await postJournal({
    buildingId: p.buildingId,
    entryDate: today,
    memo,
    sourceEvent: p.isPartial ? "payment.partial" : "payment.received",
    sourceRefType: "monthly_payment",
    sourceRefId: p.unitId,
    lines,
  });
  return entryId;
}

/** 분할부과 회차 인식. 매월 tick 시 (차)관리비용 / (대)선급비용 — 회차분만큼 환원. */
async function onScheduleTick(p: VoucherScheduleTickPayload): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  await postJournal({
    buildingId: p.buildingId,
    entryDate: today,
    memo: `${p.month} 분할부과 회차 인식 (${p.round}/${p.totalRounds}) — voucher#${p.voucherId} ${p.monthlyAmount.toLocaleString()}원`,
    sourceEvent: "voucher.installment_recognized",
    sourceRefType: "voucher_schedule",
    sourceRefId: p.scheduleId,
    lines: [
      L(STD.EXPENSE, "D", p.monthlyAmount, { memo: `회차 ${p.round}/${p.totalRounds}` }),
      L(STD.PREPAID, "C", p.monthlyAmount, { memo: `회차 ${p.round}/${p.totalRounds}` }),
    ],
  }).catch((err) => logger.error({ err, scheduleId: p.scheduleId, round: p.round }, "[T6] voucher.installment_recognized posting failed"));
}

let WIRED = false;
export function wireAccountingListeners(): void {
  if (WIRED) return;
  WIRED = true;
  voucherEventBus.onTyped("voucher.confirmed", (p) => { void onVoucherConfirmed(p); });
  voucherEventBus.onTyped("voucher_schedule.tick", (p) => { void onScheduleTick(p); });
  BILLING_FINALIZED_LISTENERS.push(onBillingFinalized);
  logger.info("[T6] accounting auto-journal listeners wired");
}
