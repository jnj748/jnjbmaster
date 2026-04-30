// [Task #668] best-effort 메일 전송 어댑터.
//
// 목적:
//   매칭된 파트너에게 사내 알림과 동일한 안내를 가입 이메일로도 보낼 수 있도록
//   가벼운 어댑터를 제공한다. SMTP 환경 변수가 없으면 조용히 no-op 으로 동작해
//   개발/테스트 환경에서 자연 패스되도록 한다.
//
// 환경 변수(선택, 모두 있어야 활성):
//   - SMTP_HOST     (예: smtp.sendgrid.net)
//   - SMTP_PORT     (기본 587, 숫자)
//   - SMTP_USER     (인증 ID — 일부 SMTP 는 생략 가능하지만 본 어댑터는 필수로 본다)
//   - SMTP_PASS     (인증 비밀번호/토큰)
//   - SMTP_FROM     (From 주소, 예: "관리의달인 <noreply@example.com>")
//   - SMTP_SECURE   ("1" 이면 TLS 즉시 사용. 기본은 STARTTLS 자동)
//
// 호출부는 sendMail() 한 줄만 신경쓰면 된다.

import nodemailer, { type Transporter } from "nodemailer";
import { logger } from "./logger";

interface MailParams {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
  secure: boolean;
}

let cached: { config: SmtpConfig; transporter: Transporter } | null = null;
let configWarnedMissing = false;

function loadConfig(): SmtpConfig | null {
  const host = (process.env.SMTP_HOST ?? "").trim();
  const user = (process.env.SMTP_USER ?? "").trim();
  const pass = (process.env.SMTP_PASS ?? "").trim();
  const from = (process.env.SMTP_FROM ?? "").trim();
  if (!host || !user || !pass || !from) {
    if (!configWarnedMissing) {
      logger.info(
        { hasHost: !!host, hasUser: !!user, hasPass: !!pass, hasFrom: !!from },
        "[mail] SMTP not configured — mail sending disabled (no-op)",
      );
      configWarnedMissing = true;
    }
    return null;
  }
  const port = Number(process.env.SMTP_PORT ?? "587") || 587;
  const secure = (process.env.SMTP_SECURE ?? "").trim() === "1";
  return { host, port, user, pass, from, secure };
}

function getTransporter(): { config: SmtpConfig; transporter: Transporter } | null {
  if (cached) return cached;
  const config = loadConfig();
  if (!config) return null;
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.pass },
  });
  cached = { config, transporter };
  return cached;
}

export function isMailEnabled(): boolean {
  return loadConfig() !== null;
}

/**
 * 메일을 best-effort 로 발송한다. SMTP 가 미설정이면 `false` 를 돌려주고
 * 어떤 예외도 던지지 않는다. 호출부는 결과를 무시해도 무방하다.
 */
export async function sendMail(params: MailParams): Promise<boolean> {
  const ctx = getTransporter();
  if (!ctx) return false;
  try {
    await ctx.transporter.sendMail({
      from: ctx.config.from,
      to: params.to,
      subject: params.subject,
      text: params.text,
      html: params.html,
    });
    return true;
  } catch (err) {
    logger.warn({ err, to: params.to, subject: params.subject }, "[mail] sendMail failed");
    return false;
  }
}

// 테스트에서 캐시를 강제 초기화하기 위한 훅. 운영 코드에서는 호출하지 않는다.
export function __resetMailForTests(): void {
  cached = null;
  configWarnedMissing = false;
}
