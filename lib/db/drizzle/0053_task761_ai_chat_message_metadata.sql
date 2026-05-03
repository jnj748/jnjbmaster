-- [Task #761] AI 호출의 tier/모델/토큰/비용 추정치를 ai_chat_messages 행에 함께
-- 기록하기 위한 jsonb 컬럼. 모든 신규 환경에서도 멱등하게 적용되도록
-- IF NOT EXISTS 로 작성한다. 기본값 없음 — 라우터를 거친 메시지에만 채워진다.

ALTER TABLE ai_chat_messages ADD COLUMN IF NOT EXISTS metadata jsonb;
