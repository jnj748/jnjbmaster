import { pgTable, text, serial, integer, timestamp, boolean, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// [Task #758] 관리인 가입 없이 SNS 링크로 전자서명 받기.
//   approval_steps 의 path="electronic" 단계에 대해, 결재자가 본 시스템에 가입돼
//   있지 않더라도 일회용 토큰 링크(카톡/문자/이메일/링크복사)로 본인확인 후
//   서명/승인/반려를 받을 수 있게 한다. 토큰 원문은 저장하지 않고 sha256 해시만
//   보관(dbleak 시 재사용 차단). 단일 사용 + 만료(기본 72h).
export const guestSignatureChannels = ["kakao", "sms", "email", "link_copy"] as const;
export const guestSignatureStatuses = [
  "active",     // 발송됨, 미열람
  "viewed",     // 링크 열어봄 (OTP 미인증 가능)
  "verified",   // OTP 인증 완료, 서명 대기
  "signed",     // 승인 서명 완료
  "rejected",   // 반려 처리됨
  "expired",    // 만료
  "cancelled",  // 발신자가 취소
] as const;
export const guestSignatureActions = ["approve", "reject", "hold"] as const;
export const guestSignatureAuthMethods = ["sms_otp", "phone_check"] as const;

export const guestSignatureTokensTable = pgTable(
  "guest_signature_tokens",
  {
    id: serial("id").primaryKey(),
    approvalId: integer("approval_id").notNull(),
    stepId: integer("step_id").notNull(),

    // 수신자 정보 (가입자 X — 외부 결재자)
    recipientName: text("recipient_name").notNull(),
    recipientPhone: text("recipient_phone").notNull(),
    recipientEmail: text("recipient_email"),
    recipientRole: text("recipient_role"), // "관리인" / "본부장" 등 표시용
    channel: text("channel", { enum: guestSignatureChannels }).notNull().default("link_copy"),

    // 토큰 — 원문은 발송 직후에만 소유, DB 에는 sha256 만 저장.
    //   tokenHash: 보기 토큰 (링크에 포함). 만료 전까지 다회 GET 가능.
    //   signTokenHash: 본인확인 직후 서버가 발급하는 서명 세션 토큰. 평문은
    //     검증 응답에 1회만 노출 → 클라이언트 메모리에만 보관 → POST sign 시 동봉.
    //   분리 이유: 보기 토큰이 카톡/문자 로그·중계서버에 남아도, 서명 권한은
    //     본인확인을 통과한 세션에서만 행사할 수 있도록 제한.
    tokenHash: text("token_hash").notNull().unique(),
    signTokenHash: text("sign_token_hash"),

    // 첫 열람 알림 발송 시각 (중복 알림 방지).
    viewedNotifiedAt: timestamp("viewed_notified_at", { withTimezone: true }),

    // 본인확인 — sms_otp(기본). otpHash 는 6자리 OTP 의 sha256.
    authMethod: text("auth_method", { enum: guestSignatureAuthMethods }).notNull().default("sms_otp"),
    otpHash: text("otp_hash"),
    otpExpiresAt: timestamp("otp_expires_at", { withTimezone: true }),
    otpAttempts: integer("otp_attempts").notNull().default(0),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),

    // 라이프사이클
    status: text("status", { enum: guestSignatureStatuses }).notNull().default("active"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    viewedAt: timestamp("viewed_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
    signedAt: timestamp("signed_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancelReason: text("cancel_reason"),

    // 결과
    action: text("action", { enum: guestSignatureActions }),
    comment: text("comment"),
    signatureImageUrl: text("signature_image_url"), // data URL 이거나 object storage URL
    signedCopyId: integer("signed_copy_id"), // 생성된 approvalSignedCopies row 참조
    signerIp: text("signer_ip"),
    signerUserAgent: text("signer_user_agent"),

    // 옵션
    allowDownloadBeforeSign: boolean("allow_download_before_sign").notNull().default(true),

    // 발신자 정보
    sentByUserId: integer("sent_by_user_id").notNull(),
    sentByName: text("sent_by_name").notNull(),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => ({
    byStep: index("guest_signature_tokens_step_idx").on(t.stepId),
    byApproval: index("guest_signature_tokens_approval_idx").on(t.approvalId),
    byStatus: index("guest_signature_tokens_status_idx").on(t.status),
  }),
);

export const insertGuestSignatureTokenSchema = createInsertSchema(guestSignatureTokensTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertGuestSignatureToken = z.infer<typeof insertGuestSignatureTokenSchema>;
export type GuestSignatureToken = typeof guestSignatureTokensTable.$inferSelect;
