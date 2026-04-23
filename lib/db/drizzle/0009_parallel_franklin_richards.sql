CREATE TABLE "platform_campaign_user_states" (
	"id" serial PRIMARY KEY NOT NULL,
	"campaign_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"impression_count" integer DEFAULT 0 NOT NULL,
	"last_impression_at" timestamp with time zone,
	"dismissed_until" timestamp with time zone,
	"dont_show_again" boolean DEFAULT false NOT NULL,
	"read_at" timestamp with time zone,
	"cta_clicked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_campaigns" (
	"id" serial PRIMARY KEY NOT NULL,
	"target_role" text NOT NULL,
	"type" text DEFAULT 'other' NOT NULL,
	"audience_filter" text DEFAULT 'all' NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"image_url" text,
	"channels" jsonb DEFAULT '["modal"]'::jsonb NOT NULL,
	"starts_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ends_at" timestamp with time zone,
	"recurrence" text DEFAULT 'none' NOT NULL,
	"recurrence_days" jsonb,
	"max_impressions_per_user" integer DEFAULT 3 NOT NULL,
	"cta_label" text,
	"cta_url" text,
	"achievement_text" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_stopped" boolean DEFAULT false NOT NULL,
	"created_by" integer,
	"created_by_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "disabled_categories" text;--> statement-breakpoint
ALTER TABLE "platform_campaign_user_states" ADD CONSTRAINT "platform_campaign_user_states_campaign_id_platform_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."platform_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_campaign_user_states" ADD CONSTRAINT "platform_campaign_user_states_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ux_campaign_user_states" ON "platform_campaign_user_states" USING btree ("campaign_id","user_id");