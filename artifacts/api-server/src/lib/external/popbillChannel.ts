// [Task #781] Popbill 카카오 알림톡 + LMS/SMS 채널 어댑터.
//
// 시크릿(LinkID/SecretKey/CorpNum) 은 환경변수에서만 읽는다(`environment-secrets`):
//   - POPBILL_LINK_ID
//   - POPBILL_SECRET_KEY
//   - POPBILL_CORP_NUM   (사용 사업자번호 — 회사·건물 단위. 미설정시 dev 모드로 동작)
//   - POPBILL_TEST_MODE  ("true" 면 강제 dev 모드)
//
// 실 발송은 Popbill HTTP API(https://popbill.linkhubcorp.com) 를 직접 호출한다.
// SDK 의존을 피해 monorepo 패키지 추가를 줄였다. 시크릿이 누락되면 dev-mode 로
// "발송 시뮬레이션 후 sent" 처리해 모든 인터록이 동작하는지 검증할 수 있게 한다.
//
// payload 규격:
//   - kakao : { templateCode: string, message: string, altMessage?: string, senderNumber: string, senderProfileId: string }
//   - lms   : { subject?: string, message: string, senderNumber: string }
//   - sms   : { message: string, senderNumber: string }

import crypto from "crypto";
import { registerChannel, type ChannelAdapter } from "./adapter";
import { logger } from "../logger";

function isDevMode(): boolean {
  if (process.env.POPBILL_TEST_MODE === "true") return true;
  if (!process.env.POPBILL_LINK_ID || !process.env.POPBILL_SECRET_KEY || !process.env.POPBILL_CORP_NUM) return true;
  return process.env.NODE_ENV !== "production";
}

function fakeMessageKey(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

async function devSimulate(channel: string, target: string, payload: Record<string, unknown>): Promise<{ ok: true; providerJobId: string; providerResponse: Record<string, unknown> }> {
  logger.info({ kind: "popbill_dev_simulate", channel, target, payload }, `[popbill] dev send to ${target}`);
  return {
    ok: true,
    providerJobId: fakeMessageKey(channel),
    providerResponse: { simulated: true, at: new Date().toISOString() },
  };
}

const popbillKakao: ChannelAdapter = {
  channel: "popbill_kakao",
  async send(job) {
    const target = job.target;
    const payload = (job.payload ?? {}) as Record<string, unknown>;
    if (isDevMode()) return await devSimulate("popbill_kakao", target, payload);
    try {
      // 실 호출 — Popbill 알림톡 API 는 senderID/templateCode/receiver/content 를 필수로 받는다.
      const body = {
        senderID: String(payload.senderProfileId ?? ""),
        templateCode: String(payload.templateCode ?? ""),
        senderNum: String(payload.senderNumber ?? ""),
        altSendType: "A",
        content: String(payload.message ?? ""),
        altContent: String(payload.altMessage ?? payload.message ?? ""),
        receiverNum: target.replace(/[^\d]/g, ""),
        receiverName: String(payload.receiverName ?? ""),
      };
      const resp = await fetch("https://popbill.linkhubcorp.com/KakaoChannel/SendATS", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.POPBILL_SECRET_KEY ?? ""}`,
          "X-PB-LinkID": process.env.POPBILL_LINK_ID ?? "",
          "X-PB-CorpNum": process.env.POPBILL_CORP_NUM ?? "",
        },
        body: JSON.stringify(body),
      });
      const txt = await resp.text();
      if (!resp.ok) return { ok: false, error: `popbill_kakao_http_${resp.status}:${txt.slice(0, 200)}` };
      let parsed: Record<string, unknown> = {};
      try { parsed = JSON.parse(txt); } catch { parsed = { raw: txt }; }
      const receiptNum = (parsed?.receiptNum as string | undefined) ?? null;
      return { ok: true, providerJobId: receiptNum, providerResponse: parsed };
    } catch (e) {
      return { ok: false, error: (e as Error)?.message ?? "popbill_kakao_exception" };
    }
  },
  async verify(target) {
    if (!/^\d{9,12}$/.test(target.replace(/[^\d]/g, ""))) return { ok: false, reason: "invalid_phone_format" };
    return { ok: true };
  },
};

const popbillLms: ChannelAdapter = {
  channel: "popbill_lms",
  async send(job) {
    const target = job.target;
    const payload = (job.payload ?? {}) as Record<string, unknown>;
    if (isDevMode()) return await devSimulate("popbill_lms", target, payload);
    try {
      const body = {
        Sender: String(payload.senderNumber ?? ""),
        Content: String(payload.message ?? ""),
        Subject: String(payload.subject ?? ""),
        Receiver: target.replace(/[^\d]/g, ""),
      };
      const resp = await fetch("https://popbill.linkhubcorp.com/Message/SendLMS", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.POPBILL_SECRET_KEY ?? ""}`,
          "X-PB-LinkID": process.env.POPBILL_LINK_ID ?? "",
          "X-PB-CorpNum": process.env.POPBILL_CORP_NUM ?? "",
        },
        body: JSON.stringify(body),
      });
      const txt = await resp.text();
      if (!resp.ok) return { ok: false, error: `popbill_lms_http_${resp.status}:${txt.slice(0, 200)}` };
      let parsed: Record<string, unknown> = {};
      try { parsed = JSON.parse(txt); } catch { parsed = { raw: txt }; }
      return { ok: true, providerJobId: (parsed?.receiptNum as string | undefined) ?? null, providerResponse: parsed };
    } catch (e) {
      return { ok: false, error: (e as Error)?.message ?? "popbill_lms_exception" };
    }
  },
};

const popbillSms: ChannelAdapter = {
  channel: "popbill_sms",
  async send(job) {
    const target = job.target;
    const payload = (job.payload ?? {}) as Record<string, unknown>;
    if (isDevMode()) return await devSimulate("popbill_sms", target, payload);
    try {
      const body = {
        Sender: String(payload.senderNumber ?? ""),
        Content: String(payload.message ?? "").slice(0, 90),
        Receiver: target.replace(/[^\d]/g, ""),
      };
      const resp = await fetch("https://popbill.linkhubcorp.com/Message/SendSMS", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.POPBILL_SECRET_KEY ?? ""}`,
          "X-PB-LinkID": process.env.POPBILL_LINK_ID ?? "",
          "X-PB-CorpNum": process.env.POPBILL_CORP_NUM ?? "",
        },
        body: JSON.stringify(body),
      });
      const txt = await resp.text();
      if (!resp.ok) return { ok: false, error: `popbill_sms_http_${resp.status}:${txt.slice(0, 200)}` };
      let parsed: Record<string, unknown> = {};
      try { parsed = JSON.parse(txt); } catch { parsed = { raw: txt }; }
      return { ok: true, providerJobId: (parsed?.receiptNum as string | undefined) ?? null, providerResponse: parsed };
    } catch (e) {
      return { ok: false, error: (e as Error)?.message ?? "popbill_sms_exception" };
    }
  },
};

export function registerPopbillChannels(): void {
  registerChannel(popbillKakao);
  registerChannel(popbillLms);
  registerChannel(popbillSms);
}
