-- [Phase1 마무리 C] dispatch_jobs 동시성 dedupe 유니크 인덱스.
--   동일 (channel, related_entity_type, related_entity_id, trigger_source)
--   조합으로 활성(=failed/dead 가 아닌) 잡이 동시에 들어오는 것을 막아
--   중복 발송을 차단한다. failed/dead 는 재시도/보관 목적이라 제외.
CREATE UNIQUE INDEX IF NOT EXISTS dispatch_jobs_dedupe_idx
  ON dispatch_jobs (channel, related_entity_type, related_entity_id, trigger_source)
  WHERE status NOT IN ('failed', 'dead');
