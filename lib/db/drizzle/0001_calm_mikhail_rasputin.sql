CREATE TABLE "platform_consents" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"consent_type" text NOT NULL,
	"version" text DEFAULT '1.0' NOT NULL,
	"context_ref" text,
	"ip_address" text,
	"user_agent" text,
	"consented_at" timestamp with time zone DEFAULT now() NOT NULL
);
