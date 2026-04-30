-- [Task #650] 안전점검표 템플릿 — 본사 관리(카테고리/항목) + 직원 개인 묶음.
--   기존에 코드 상수로 박혀 있던 5개 카테고리(전기설비/소방시설/비상발전기/저수조/기타)와
--   카테고리별 기본 항목을 시드로 채워, 도입 직후 직원 화면에서 보이는 항목이 동일하도록 한다.

CREATE TABLE IF NOT EXISTS "safety_checklist_template_categories" (
  "id" serial PRIMARY KEY NOT NULL,
  "value" text NOT NULL UNIQUE,
  "label" text NOT NULL,
  "sort_order" integer DEFAULT 100 NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "safety_checklist_template_items" (
  "id" serial PRIMARY KEY NOT NULL,
  "category_id" integer NOT NULL,
  "item_name" text NOT NULL,
  "sort_order" integer DEFAULT 100 NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "safety_checklist_user_templates" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL,
  "category" text NOT NULL,
  "items" text DEFAULT '[]' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "safety_checklist_user_templates_user_category_unique"
    UNIQUE ("user_id","category")
);
--> statement-breakpoint
-- 시드: 코드 상수에 박혀 있던 5개 카테고리와 기본 항목을 그대로 채운다.
INSERT INTO "safety_checklist_template_categories" ("value","label","sort_order","is_active")
SELECT * FROM (VALUES
  ('electrical','전기설비',10,true),
  ('fire_safety','소방시설',20,true),
  ('generator','비상발전기',30,true),
  ('water_tank','저수조',40,true),
  ('other','기타',50,true)
) AS s(value,label,sort_order,is_active)
WHERE NOT EXISTS (SELECT 1 FROM "safety_checklist_template_categories");
--> statement-breakpoint
-- 카테고리별 기본 항목.
INSERT INTO "safety_checklist_template_items" ("category_id","item_name","sort_order","is_active")
SELECT c.id, x.item_name, x.sort_order, true
FROM "safety_checklist_template_categories" c
JOIN (VALUES
  ('electrical','누전차단기 동작 확인',10),
  ('electrical','절연저항 측정',20),
  ('electrical','접지 상태 확인',30),
  ('electrical','배전반 점검',40),
  ('electrical','전선 피복 상태',50),
  ('fire_safety','소화기 점검',10),
  ('fire_safety','스프링클러 동작 확인',20),
  ('fire_safety','화재감지기 점검',30),
  ('fire_safety','비상구 표시등',40),
  ('fire_safety','방화문 상태',50),
  ('generator','엔진오일 점검',10),
  ('generator','냉각수 확인',20),
  ('generator','배터리 상태',30),
  ('generator','연료량 확인',40),
  ('generator','시운전 결과',50),
  ('water_tank','수질 검사',10),
  ('water_tank','수조 내부 청결',20),
  ('water_tank','배관 누수 확인',30),
  ('water_tank','소독 상태',40),
  ('water_tank','수위 확인',50)
) AS x(category_value,item_name,sort_order)
  ON c.value = x.category_value
WHERE NOT EXISTS (SELECT 1 FROM "safety_checklist_template_items");
