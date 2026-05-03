// [Task #775] 지출결의서 도메인 이벤트 버스 — 회계엔진(T6) 1차 분개 트리거.
//
// 본 모듈은 인-프로세스 EventEmitter 한 개를 공개해 voucher.confirmed /
// voucher_schedule.tick 같은 이벤트를 발행한다. 회계엔진(T6) 라우트가 추가될 때
// `voucherEventBus.on('voucher.confirmed', handler)` 로 구독해 표준 분개를 만들면 된다.
//
// 운영 큐(Redis/Pulsar 등)로 갈 가능성이 있으므로 인터페이스만 안정시키고 구현은
// 단순한 EventEmitter 로 둔다 — 후속 엔진(T6/T7)이 늘면 그때 외부 큐로 전환.
//
// 발행 시점에 무조건 `logger.info` 1줄을 남겨, 구독자가 아직 없을 때도 감사 추적이
// 가능하도록 한다. 구독자 콜백이 throw 해도 발행자는 영향을 받지 않는다.

import { EventEmitter } from "node:events";
import { logger } from "./logger";

export interface VoucherConfirmedPayload {
  /** 표준 분개 유형. v01 은 '선급'/'비용' 두 가지 — T6 에서 확장. */
  type: "선급" | "비용";
  voucherId: number;
  approvalId: number | null;
  buildingId: number | null;
  amount: number;
  vendor: string | null;
  /** 분납 스케줄 헤더 — 없으면 단건. */
  schedule: {
    scheduleId: number;
    totalAmount: number;
    months: number;
    monthlyAmount: number;
    startMonth: string;
    endMonth: string;
  } | null;
  occurredAt: string; // ISO
}

export interface VoucherScheduleTickPayload {
  scheduleId: number;
  voucherId: number;
  buildingId: number | null;
  /** 진입한 달 (YYYY-MM). */
  month: string;
  round: number;
  totalRounds: number;
  monthlyAmount: number;
  /** 만기 임박(<=1개월 남음) / 종료. */
  reason: "near_end" | "completed";
}

// [Task #794] 출납등록 시 사용한 계좌·결제수단 페이로드. 회계엔진(T6)이 구독해
//   분개의 자금쪽 계정을 실제 계좌로 분기(재분류) 한다.
export interface VoucherRecordedPayload {
  voucherId: number;
  approvalId: number | null;
  buildingId: number | null;
  amount: number;
  vendor: string | null;
  /** 사용자 입력 결제수단 라벨 (예: "계좌이체", "카드", "현금"). 자유 텍스트. */
  paymentMethod: string | null;
  /** 자금 계정 코드 (예: 1010 현금, 1020 예금, 1021 OO은행). NULL 이면 기본 1020. */
  accountCode: string | null;
  paidAt: string | null; // YYYY-MM-DD
  occurredAt: string; // ISO
}

interface VoucherEvents {
  "voucher.confirmed": (p: VoucherConfirmedPayload) => void;
  "voucher_schedule.tick": (p: VoucherScheduleTickPayload) => void;
  "voucher.recorded": (p: VoucherRecordedPayload) => void;
}

class TypedEmitter extends EventEmitter {
  emitTyped<E extends keyof VoucherEvents>(event: E, payload: Parameters<VoucherEvents[E]>[0]): void {
    try {
      this.emit(event, payload);
    } catch (err) {
      // 동기 throw 만 잡힌다 — 비동기 핸들러는 본인이 책임.
      logger.error({ err, event }, "voucher event handler threw synchronously");
    }
  }
  onTyped<E extends keyof VoucherEvents>(event: E, handler: VoucherEvents[E]): void {
    this.on(event, handler as (...args: unknown[]) => void);
  }
}

export const voucherEventBus = new TypedEmitter();

export function publishVoucherConfirmed(payload: Omit<VoucherConfirmedPayload, "occurredAt">): void {
  const full: VoucherConfirmedPayload = { ...payload, occurredAt: new Date().toISOString() };
  logger.info(
    {
      event: "voucher.confirmed",
      voucherId: full.voucherId,
      approvalId: full.approvalId,
      buildingId: full.buildingId,
      amount: full.amount,
      type: full.type,
      hasSchedule: !!full.schedule,
    },
    "voucher.confirmed",
  );
  voucherEventBus.emitTyped("voucher.confirmed", full);
}

// [Task #794] 출납등록(/expense-vouchers/:id/record) 직후 발행. 회계엔진이 구독.
export function publishVoucherRecorded(payload: Omit<VoucherRecordedPayload, "occurredAt">): void {
  const full: VoucherRecordedPayload = { ...payload, occurredAt: new Date().toISOString() };
  logger.info(
    {
      event: "voucher.recorded",
      voucherId: full.voucherId,
      approvalId: full.approvalId,
      buildingId: full.buildingId,
      amount: full.amount,
      paymentMethod: full.paymentMethod,
      accountCode: full.accountCode,
    },
    "voucher.recorded",
  );
  voucherEventBus.emitTyped("voucher.recorded", full);
}

export function publishScheduleTick(payload: VoucherScheduleTickPayload): void {
  logger.info(
    {
      event: "voucher_schedule.tick",
      scheduleId: payload.scheduleId,
      month: payload.month,
      round: payload.round,
      reason: payload.reason,
    },
    "voucher_schedule.tick",
  );
  voucherEventBus.emitTyped("voucher_schedule.tick", payload);
}
