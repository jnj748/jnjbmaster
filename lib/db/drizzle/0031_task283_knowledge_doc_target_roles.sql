-- [Task #283] platform_knowledge_docs.target_roles 컬럼 추가.
--   기존 코드/스키마는 이미 target_roles 를 참조하고 있으나 마이그레이션이
--   누락되어 INSERT 시 "column does not exist" 500 이 발생했다.
--   NULL = 전체 공통 노출. 빈 배열도 동일하게 취급한다(애플리케이션 로직).
ALTER TABLE platform_knowledge_docs
  ADD COLUMN IF NOT EXISTS target_roles text[];
