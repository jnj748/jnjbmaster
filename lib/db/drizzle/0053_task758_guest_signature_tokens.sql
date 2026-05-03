-- [Task #758] 관리인 가입 없이 SNS 링크로 전자서명 받기.
--   guest_signature_tokens 테이블 + 인덱스 — 멱등 (IF NOT EXISTS) 보장.

CREATE TABLE IF NOT EXISTS "guest_signature_tokens" (
  "id" serial PRIMARY KEY NOT NULL,
  "approval_id" integer NOT NULL,
  "step_id" integer NOT NULL,
  "recipient_name" text NOT NULL,
  "recipient_phone" text NOT NULL,
  "recipient_email" text,
  "recipient_role" text,
  "channel" text DEFAULT 'link_copy' NOT NULL,
  "token_hash" text NOT NULL,
  "auth_method" text DEFAULT 'sms_otp' NOT NULL,
  "otp_hash" text,
  "otp_expires_at" timestamp with time zone,
  "otp_attempts" integer DEFAULT 0 NOT NULL,
  "verified_at" timestamp with time zone,
  "status" text DEFAULT 'active' NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "viewed_at" timestamp with time zone,
  "sent_at" timestamp with time zone DEFAULT now() NOT NULL,
  "signed_at" timestamp with time zone,
  "cancelled_at" timestamp with time zone,
  "cancel_reason" text,
  "action" text,
  "comment" text,
  "signature_image_url" text,
  "signed_copy_id" integer,
  "signer_ip" text,
  "signer_user_agent" text,
  "allow_download_before_sign" boolean DEFAULT true NOT NULL,
  "sent_by_user_id" integer NOT NULL,
  "sent_by_name" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'guest_signature_tokens_token_hash_unique'
  ) THEN
    ALTER TABLE "guest_signature_tokens"
      ADD CONSTRAINT "guest_signature_tokens_token_hash_unique" UNIQUE ("token_hash");
  END IF;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "guest_signature_tokens_step_idx" ON "guest_signature_tokens" ("step_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "guest_signature_tokens_approval_idx" ON "guest_signature_tokens" ("approval_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "guest_signature_tokens_status_idx" ON "guest_signature_tokens" ("status");
