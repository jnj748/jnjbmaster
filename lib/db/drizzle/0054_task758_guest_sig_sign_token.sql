-- [Task #758] 보기 토큰 / 서명 토큰 분리.
--   sign_token_hash: 본인확인 후 서버가 발급, 응답에 평문 1회 노출 → 클라이언트 메모리에만 보관.
--   viewed_notified_at: 첫 열람 시 상신자에게 알림 보낸 시각 (중복 알림 방지).

ALTER TABLE "guest_signature_tokens"
  ADD COLUMN IF NOT EXISTS "sign_token_hash" text;
--> statement-breakpoint

ALTER TABLE "guest_signature_tokens"
  ADD COLUMN IF NOT EXISTS "viewed_notified_at" timestamp with time zone;
