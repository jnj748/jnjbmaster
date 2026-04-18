CREATE TABLE "legal_appointees" (
	"id" serial PRIMARY KEY NOT NULL,
	"building_id" integer NOT NULL,
	"field" text NOT NULL,
	"name" text NOT NULL,
	"certificate_no" text,
	"certificate_expiry" date,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "onboarding_preference" varchar(16);--> statement-breakpoint
ALTER TABLE "buildings" ADD COLUMN "logo_url" text;--> statement-breakpoint
CREATE UNIQUE INDEX "legal_appointees_building_field_unique" ON "legal_appointees" USING btree ("building_id","field");