-- [Task #399] 입주민 안내·공지에서 사용할 추가 연락처 2종.
--   관리사무소 메인 번호(management_office_phone) 외에
--   관리비 문의 전용 회선과 시설/방재실 전용 회선을 분리 보관해
--   공지문 토큰({{feeInquiryPhone}}, {{facilitySafetyPhone}})으로 활용한다.
ALTER TABLE "buildings"
  ADD COLUMN IF NOT EXISTS "fee_inquiry_phone" text;
--> statement-breakpoint
ALTER TABLE "buildings"
  ADD COLUMN IF NOT EXISTS "facility_safety_phone" text;
