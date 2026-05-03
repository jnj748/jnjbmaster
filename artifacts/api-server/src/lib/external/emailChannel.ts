// [Task #816] 이메일 발송 채널 — nodemailer 기반 SMTP 어댑터.
//
// 환경변수(미설정 시 dev-mode 시뮬레이션 — providerJobId 가짜 발급):
//   - SMTP_HOST       (예: smtp.gmail.com)
//   - SMTP_PORT       (기본 587)
//   - SMTP_USER       (SMTP 로그인 ID)
//   - SMTP_PASS       (SMTP 비밀번호 / 앱 비밀번호)
//   - SMTP_FROM       (보낸사람 — 미설정 시 SMTP_USER 사용)
//   - SMTP_SECURE     ("true" 면 465 SSL)
//
// payload: { subject?: string, message: string, html?: string, recipientName?: string }
// 운영(SMTP_* 모두 설정) 시 실 SMTP 전송, dev/누락 시 logger 시뮬레이션.

import nodemailer, { type Transporter } from "nodemailer";
import { registerChannel, type ChannelAdapter } from "./adapter";
import { logger } from "../logger";

let cachedTransporter: Transporter | null = null;

function isSmtpConfigured(): boolean {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function getTransporter(): Transporter {
  if (cachedTransporter) return cachedTransporter;
  cachedTransporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST!,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: { user: process.env.SMTP_USER!, pass: process.env.SMTP_PASS! },
  });
  return cachedTransporter;
}

const emailAdapter: ChannelAdapter = {
  channel: "email",
  async send(job) {
    const target = job.target;
    const payload = (job.payload ?? {}) as Record<string, unknown>;
    const subject = String(payload.subject ?? "(제목 없음)");
    const text = String(payload.message ?? "");
    const html = typeof payload.html === "string" ? (payload.html as string) : undefined;

    if (!isSmtpConfigured()) {
      logger.info(
        { kind: "email_dev_simulate", target, subject, payload },
        "[email] SMTP not configured — dev simulate",
      );
      return {
        ok: true,
        providerJobId: `email_dev_${Date.now()}_${job.id}`,
        providerResponse: { simulated: true, reason: "smtp_not_configured", at: new Date().toISOString() },
      };
    }

    try {
      const from = process.env.SMTP_FROM ?? process.env.SMTP_USER!;
      const info = await getTransporter().sendMail({
        from,
        to: target,
        subject,
        text,
        ...(html ? { html } : {}),
      });
      return {
        ok: true,
        providerJobId: info.messageId ?? null,
        providerResponse: { accepted: info.accepted, rejected: info.rejected, response: info.response },
      };
    } catch (e) {
      return { ok: false, error: (e as Error)?.message ?? "email_smtp_exception" };
    }
  },
  async verify(target) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target)) return { ok: false, reason: "invalid_email_format" };
    return { ok: true };
  },
};

export function registerEmailChannel(): void {
  registerChannel(emailAdapter);
}
