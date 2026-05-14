// 알리고(Aligo) 카카오 알림톡 + SMS/LMS 채널 어댑터.
//
// 시크릿은 환경변수에서만 읽는다:
//   - ALIGO_API_KEY
//   - ALIGO_USER_ID
//   - ALIGO_SENDER_KEY   (알림톡 발신프로필 키)
//   - ALIGO_SENDER_NUMBER
//   - ALIGO_TEST_MODE    ("true" 면 강제 dev 모드)
//
// 미설정·비프로덕션·테스트 모드에서는 devSimulate 로 발송 시뮬레이션 후 sent 처리.
//
// payload 규격(popbill 어댑터와 동일 키 유지):
//   - kakao : { templateCode, message, altMessage?, senderNumber?, senderProfileId?, subject?, receiverName? }
//   - lms   : { subject?, message, senderNumber? }
//   - sms   : { message, senderNumber? }

import crypto from "crypto";
import { registerChannel, type ChannelAdapter } from "./adapter";
import { logger } from "../logger";

function isDevMode(): boolean {
  if (process.env.ALIGO_TEST_MODE === "true") return true;
  if (
    !process.env.ALIGO_API_KEY ||
    !process.env.ALIGO_USER_ID ||
    !process.env.ALIGO_SENDER_KEY ||
    !process.env.ALIGO_SENDER_NUMBER
  ) {
    return true;
  }
  return process.env.NODE_ENV !== "production";
}

function fakeMessageKey(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

async function devSimulate(
  channel: string,
  target: string,
  payload: Record<string, unknown>,
): Promise<{ ok: true; providerJobId: string; providerResponse: Record<string, unknown> }> {
  logger.info({ kind: "aligo_dev_simulate", channel, target, payload }, `[aligo] dev send to ${target}`);
  return {
    ok: true,
    providerJobId: fakeMessageKey(channel),
    providerResponse: { simulated: true, at: new Date().toISOString() },
  };
}

function digitsOnly(phone: string): string {
  return phone.replace(/[^\d]/g, "");
}

function senderFromPayload(payload: Record<string, unknown>): string {
  const fromPayload = String(payload.senderNumber ?? "").trim();
  if (fromPayload) return digitsOnly(fromPayload);
  return digitsOnly(process.env.ALIGO_SENDER_NUMBER ?? "");
}

const aligoKakao: ChannelAdapter = {
  channel: "aligo_kakao",
  async send(job) {
    const target = job.target;
    const payload = (job.payload ?? {}) as Record<string, unknown>;
    if (isDevMode()) return await devSimulate("aligo_kakao", target, payload);
    try {
      const apikey = process.env.ALIGO_API_KEY ?? "";
      const userid = process.env.ALIGO_USER_ID ?? "";
      const senderkey = process.env.ALIGO_SENDER_KEY ?? "";
      const tpl_code = String(payload.templateCode ?? "");
      const sender = senderFromPayload(payload);
      const receiver_1 = digitsOnly(target);
      const message_1 = String(payload.message ?? "");
      const subject_1 =
        String(payload.subject ?? payload.title ?? "").trim() ||
        (tpl_code ? `[${tpl_code}]` : "알림톡");

      const body = new URLSearchParams({
        apikey,
        userid,
        senderkey,
        tpl_code,
        sender,
        receiver_1,
        subject_1,
        message_1,
      });

      const resp = await fetch("https://kakaoapi.aligo.in/akv10/alimtalk/send/", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" },
        body: body.toString(),
      });
      const txt = await resp.text();
      if (!resp.ok) return { ok: false, error: `aligo_kakao_http_${resp.status}:${txt.slice(0, 200)}` };
      let parsed: Record<string, unknown> = {};
      try {
        parsed = JSON.parse(txt) as Record<string, unknown>;
      } catch {
        parsed = { raw: txt };
      }
      const code = Number(parsed.code);
      if (code !== 0) {
        return {
          ok: false,
          error: `aligo_kakao_api_${code}:${String(parsed.message ?? txt).slice(0, 200)}`,
        };
      }
      const mid =
        (parsed.message_id as string | undefined) ??
        (parsed.info as Record<string, unknown> | undefined)?.mid ??
        null;
      return {
        ok: true,
        providerJobId: mid != null ? String(mid) : null,
        providerResponse: parsed,
      };
    } catch (e) {
      return { ok: false, error: (e as Error)?.message ?? "aligo_kakao_exception" };
    }
  },
  async verify(target) {
    if (!/^\d{9,12}$/.test(digitsOnly(target))) return { ok: false, reason: "invalid_phone_format" };
    return { ok: true };
  },
};

// Aligo 기준 바이트 길이 — 한글 = 2바이트, 그 외(ASCII) = 1바이트.
//   SMS 한도 = 90바이트(한글 약 45자). 초과 시 LMS 로 자동 승격.
function aligoByteLength(s: string): number {
  let n = 0;
  for (const ch of s) {
    n += ch.charCodeAt(0) > 0x7f ? 2 : 1;
  }
  return n;
}

async function sendAligoSmsLike(
  channel: "aligo_sms" | "aligo_lms",
  job: Parameters<ChannelAdapter["send"]>[0],
  msgType: "" | "LMS",
): Promise<{ ok: boolean; providerJobId?: string | null; providerResponse?: Record<string, unknown>; error?: string }> {
  const target = job.target;
  const payload = (job.payload ?? {}) as Record<string, unknown>;
  if (isDevMode()) return await devSimulate(channel, target, payload);
  try {
    const apikey = process.env.ALIGO_API_KEY ?? "";
    const userid = process.env.ALIGO_USER_ID ?? "";
    const sender = senderFromPayload(payload);
    const receiver = digitsOnly(target);
    const msg = String(payload.message ?? "");
    // SMS 인데 90바이트 초과면 LMS 로 자동 승격 (truncate 금지 — 본문 보존이 우선).
    let effectiveMsgType: "" | "LMS" = msgType;
    if (channel === "aligo_sms" && aligoByteLength(msg) > 90) {
      effectiveMsgType = "LMS";
    }

    const body = new URLSearchParams({
      key: apikey,
      user_id: userid,
      sender,
      receiver,
      msg,
    });
    if (effectiveMsgType === "LMS") {
      body.set("msg_type", "LMS");
      const subject = String(payload.subject ?? payload.title ?? "").trim();
      if (subject) body.set("title", subject);
    }

    const resp = await fetch("https://apis.aligo.in/send/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" },
      body: body.toString(),
    });
    const txt = await resp.text();
    if (!resp.ok) return { ok: false, error: `${channel}_http_${resp.status}:${txt.slice(0, 200)}` };
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(txt) as Record<string, unknown>;
    } catch {
      parsed = { raw: txt };
    }
    const resultCode = Number(parsed.result_code);
    if (resultCode !== 1) {
      return {
        ok: false,
        error: `${channel}_api_${resultCode}:${String(parsed.message ?? txt).slice(0, 200)}`,
      };
    }
    const msgId = parsed.msg_id != null ? String(parsed.msg_id) : null;
    return { ok: true, providerJobId: msgId, providerResponse: parsed };
  } catch (e) {
    return { ok: false, error: (e as Error)?.message ?? `${channel}_exception` };
  }
}

const aligoSms: ChannelAdapter = {
  channel: "aligo_sms",
  async send(job) {
    return sendAligoSmsLike("aligo_sms", job, "");
  },
};

const aligoLms: ChannelAdapter = {
  channel: "aligo_lms",
  async send(job) {
    return sendAligoSmsLike("aligo_lms", job, "LMS");
  },
};

export function registerAligoChannels(): void {
  registerChannel(aligoKakao);
  registerChannel(aligoSms);
  registerChannel(aligoLms);
}
