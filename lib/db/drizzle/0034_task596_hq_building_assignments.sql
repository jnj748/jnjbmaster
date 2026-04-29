-- [Task #596] 본부장(hq_executive) ↔ 건물 다대다 매핑 테이블.
--   유저 유형 관계도 박제: 본부장은 더 이상 "전 건물 수퍼유저" 가 아니라
--   할당된 관할 건물 묶음에서만 데이터를 본다. 한 본부장이 여러 건물,
--   한 건물이 여러 본부장에게 할당될 수 있다.
--   멱등하게 작성한다 — 이미 적용된 환경에서도 안전하게 재실행됨.

CREATE TABLE IF NOT EXISTS "hq_building_assignments" (
  "id" serial PRIMARY KEY NOT NULL,
  "hq_user_id" integer NOT NULL,
  "building_id" integer NOT NULL,
  "assigned_by_user_id" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "hq_building_assignments_unique"
  ON "hq_building_assignments" ("hq_user_id", "building_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hq_building_assignments_hq_user_idx"
  ON "hq_building_assignments" ("hq_user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hq_building_assignments_building_idx"
  ON "hq_building_assignments" ("building_id");
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "hq_building_assignments"
    ADD CONSTRAINT "hq_building_assignments_hq_user_fk"
    FOREIGN KEY ("hq_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "hq_building_assignments"
    ADD CONSTRAINT "hq_building_assignments_building_fk"
    FOREIGN KEY ("building_id") REFERENCES "buildings"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "hq_building_assignments"
    ADD CONSTRAINT "hq_building_assignments_assigned_by_fk"
    FOREIGN KEY ("assigned_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
