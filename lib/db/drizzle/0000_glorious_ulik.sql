CREATE TABLE "tasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"category" text DEFAULT 'other' NOT NULL,
	"priority" text DEFAULT 'medium' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"due_date" date,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inspection_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"inspection_id" integer NOT NULL,
	"inspection_date" date NOT NULL,
	"result" text NOT NULL,
	"memo" text,
	"inspector" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inspections" (
	"id" serial PRIMARY KEY NOT NULL,
	"building_id" integer,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"inspection_type" text DEFAULT 'legal' NOT NULL,
	"frequency_per_year" integer NOT NULL,
	"legal_cycle_months" integer,
	"interval_days" integer,
	"fixed_day" integer,
	"recommended_months" text,
	"last_inspection_date" date,
	"next_due_date" date NOT NULL,
	"status" text DEFAULT 'upcoming' NOT NULL,
	"notes" text,
	"legal_basis" text,
	"advance_alert_days" integer DEFAULT 30 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "legal_inspection_presets" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"inspection_type" text DEFAULT 'legal' NOT NULL,
	"legal_cycle_months" integer NOT NULL,
	"default_alert_days" integer DEFAULT 30 NOT NULL,
	"description" text,
	"legal_basis" text,
	"recommended_months" text,
	"sub_items" text,
	"seasonal_notes" text,
	"penalty_info" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tax_schedules" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"schedule_type" text NOT NULL,
	"due_date" date NOT NULL,
	"recurrence" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vendors" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"type" text DEFAULT 'contracted' NOT NULL,
	"contact_name" text,
	"phone" text,
	"email" text,
	"address" text,
	"rating" real,
	"is_recommended" boolean DEFAULT false NOT NULL,
	"notes" text,
	"business_reg_number" text,
	"representative_name" text,
	"service_area" text,
	"sub_categories" text,
	"sido" text,
	"sigungu" text,
	"joined_at" timestamp with time zone,
	"contract_building_name" text,
	"contract_start_date" date,
	"contract_end_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"vendor_id" integer NOT NULL,
	"vendor_name" text NOT NULL,
	"contract_amount" real NOT NULL,
	"commission_rate" real NOT NULL,
	"commission_amount" real NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"matched_date" date NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drafts" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"draft_type" text NOT NULL,
	"inspection_id" integer,
	"body" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" serial PRIMARY KEY NOT NULL,
	"unit_id" integer,
	"unit" text NOT NULL,
	"tenant_name" text NOT NULL,
	"resident_id" text,
	"phone" text,
	"emergency_contact" text,
	"interior_start_date" date,
	"move_in_date" date,
	"move_out_date" date,
	"email" text,
	"company_name" text,
	"business_number" text,
	"has_tv" boolean DEFAULT false NOT NULL,
	"registered_address" text,
	"notes" text,
	"guarantor_name" text,
	"guarantor_phone" text,
	"guarantor_relation" text,
	"guarantor_resident_id" text,
	"status" text DEFAULT 'active' NOT NULL,
	"privacy_consent_date" timestamp with time zone,
	"contract_doc" boolean DEFAULT false NOT NULL,
	"business_reg_doc" boolean DEFAULT false NOT NULL,
	"id_doc" boolean DEFAULT false NOT NULL,
	"contract_doc_url" text,
	"business_reg_doc_url" text,
	"id_doc_url" text,
	"vehicle_reg_doc_url" text,
	"fee_obligation_consent" boolean DEFAULT false NOT NULL,
	"penalty_consent" boolean DEFAULT false NOT NULL,
	"special_fund_consent" boolean DEFAULT false NOT NULL,
	"privacy_retention_consent" boolean DEFAULT false NOT NULL,
	"guarantee_consent" boolean DEFAULT false NOT NULL,
	"signature_name" text,
	"signature_date" timestamp with time zone,
	"billing_start_date" date,
	"verification_status" text DEFAULT 'unverified' NOT NULL,
	"verified_at" timestamp with time zone,
	"verified_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"data_destruction_date" date,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "owners" (
	"id" serial PRIMARY KEY NOT NULL,
	"unit_id" integer,
	"unit" text NOT NULL,
	"owner_name" text NOT NULL,
	"birth_date" date,
	"phone" text,
	"interior_start_date" date,
	"move_in_date" date,
	"move_out_date" date,
	"company_name" text,
	"business_number" text,
	"email" text,
	"registered_address" text,
	"vehicle_number" text,
	"vehicle_type" text,
	"has_tv" boolean DEFAULT false NOT NULL,
	"notes" text,
	"status" text DEFAULT 'active' NOT NULL,
	"privacy_consent_date" timestamp with time zone,
	"business_reg_doc" boolean DEFAULT false NOT NULL,
	"id_doc" boolean DEFAULT false NOT NULL,
	"property_doc" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"data_destruction_date" date,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vehicles" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer,
	"building_id" integer,
	"unit" text NOT NULL,
	"tenant_relation" text,
	"vehicle_number" text NOT NULL,
	"vehicle_type" text,
	"vehicle_color" text,
	"owner_name" text,
	"owner_contact" text,
	"is_primary" boolean DEFAULT true NOT NULL,
	"ownership_type" text DEFAULT 'owned' NOT NULL,
	"registration_doc" boolean DEFAULT false NOT NULL,
	"insurance_doc" boolean DEFAULT false NOT NULL,
	"lease_doc" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'registered' NOT NULL,
	"cancelled_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"recipient_type" text DEFAULT 'admin' NOT NULL,
	"notification_type" text NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"is_read" boolean DEFAULT false NOT NULL,
	"related_entity_type" text,
	"related_entity_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_checklists" (
	"id" serial PRIMARY KEY NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" integer NOT NULL,
	"document_name" text NOT NULL,
	"is_submitted" boolean DEFAULT false NOT NULL,
	"submitted_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"name" text NOT NULL,
	"role" text NOT NULL,
	"phone" text,
	"vendor_id" integer,
	"building_id" integer,
	"building_sido" text,
	"building_sigungu" text,
	"portal_type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "rfqs" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"category" text NOT NULL,
	"description" text,
	"building_name" text NOT NULL,
	"desired_date" date,
	"deadline" date NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"vendor_ids" text,
	"sido" text,
	"sigungu" text,
	"geo_scope" text,
	"close_up_photo_url" text,
	"wide_photo_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quotes" (
	"id" serial PRIMARY KEY NOT NULL,
	"rfq_id" integer NOT NULL,
	"vendor_id" integer NOT NULL,
	"vendor_name" text NOT NULL,
	"total_amount" real NOT NULL,
	"item_breakdown" text,
	"scope" text,
	"estimated_days" integer,
	"available_date" date,
	"notes" text,
	"status" text DEFAULT 'submitted' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "work_reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"rfq_id" integer NOT NULL,
	"quote_id" integer NOT NULL,
	"vendor_id" integer NOT NULL,
	"vendor_name" text NOT NULL,
	"building_id" integer,
	"title" text NOT NULL,
	"description" text,
	"completion_date" date NOT NULL,
	"photo_urls" text,
	"status" text DEFAULT 'submitted' NOT NULL,
	"review_notes" text,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settlements" (
	"id" serial PRIMARY KEY NOT NULL,
	"rfq_id" integer NOT NULL,
	"quote_id" integer NOT NULL,
	"vendor_id" integer NOT NULL,
	"vendor_name" text NOT NULL,
	"contract_amount" real NOT NULL,
	"fee_rate" real DEFAULT 0 NOT NULL,
	"fee_amount" real DEFAULT 0 NOT NULL,
	"payment_amount" real NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"paid_at" date,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "approvals" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"category" text DEFAULT 'other' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"is_draft" boolean DEFAULT false NOT NULL,
	"template_id" integer,
	"current_step" integer DEFAULT 1 NOT NULL,
	"total_steps" integer DEFAULT 1 NOT NULL,
	"requester_id" integer NOT NULL,
	"requester_name" text NOT NULL,
	"approver_id" integer,
	"approver_name" text,
	"estimated_amount" real,
	"vendor_name" text,
	"vendor_quote_details" text,
	"related_draft_id" integer,
	"related_inspection_id" integer,
	"rejection_reason" text,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "approval_steps" (
	"id" serial PRIMARY KEY NOT NULL,
	"approval_id" integer NOT NULL,
	"step_order" integer NOT NULL,
	"approver_id" integer NOT NULL,
	"approver_name" text NOT NULL,
	"approver_role" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"comment" text,
	"signature_id" integer,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "approval_recipients" (
	"id" serial PRIMARY KEY NOT NULL,
	"approval_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"user_name" text NOT NULL,
	"type" text DEFAULT 'recipient' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "digital_signatures" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"user_name" text NOT NULL,
	"signature_type" text DEFAULT 'text' NOT NULL,
	"signature_data" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"category" text DEFAULT 'general' NOT NULL,
	"description" text,
	"fields" text NOT NULL,
	"body_template" text NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"report_date" text NOT NULL,
	"report_type" text DEFAULT 'other' NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"photos" text,
	"author_id" integer NOT NULL,
	"author_name" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"reviewer_id" integer,
	"reviewer_name" text,
	"review_comment" text,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "monthly_summary_reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"report_month" text NOT NULL,
	"building_id" integer,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"weekly_report_ids" text,
	"total_weekly_reports" integer DEFAULT 0 NOT NULL,
	"total_billed" real,
	"total_collected" real,
	"collection_rate" real,
	"unpaid_amount" real,
	"unpaid_units" integer,
	"occupant_card_count" integer,
	"total_units" integer,
	"vehicle_card_count" integer,
	"mom_change_pct" real,
	"author_id" integer NOT NULL,
	"author_name" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"reviewer_id" integer,
	"reviewer_name" text,
	"review_comment" text,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "weekly_summary_reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"week_start" text NOT NULL,
	"week_end" text NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"daily_report_ids" text,
	"total_daily_reports" integer DEFAULT 0 NOT NULL,
	"author_id" integer NOT NULL,
	"author_name" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"reviewer_id" integer,
	"reviewer_name" text,
	"review_comment" text,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "safety_checklist_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"checklist_id" integer NOT NULL,
	"item_name" text NOT NULL,
	"checked" boolean DEFAULT false NOT NULL,
	"result" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "safety_checklists" (
	"id" serial PRIMARY KEY NOT NULL,
	"building_id" integer,
	"category" text NOT NULL,
	"title" text NOT NULL,
	"inspection_date" date NOT NULL,
	"inspector" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "maintenance_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"building_id" integer,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"category" text NOT NULL,
	"work_date" date NOT NULL,
	"worker" text NOT NULL,
	"status" text DEFAULT 'completed' NOT NULL,
	"report_sent" boolean DEFAULT false NOT NULL,
	"report_sent_at" timestamp with time zone,
	"notes" text,
	"source_type" text,
	"checklist_item_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "safety_trainings" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"training_date" date NOT NULL,
	"training_month" integer NOT NULL,
	"training_year" integer NOT NULL,
	"trainer" text NOT NULL,
	"attendees" text,
	"attendee_count" integer DEFAULT 0 NOT NULL,
	"duration" text,
	"content" text,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "data_destruction_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" integer NOT NULL,
	"unit" text NOT NULL,
	"original_name" text NOT NULL,
	"destruction_type" text DEFAULT 'anonymization' NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_by" text DEFAULT 'system' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vehicle_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"vehicle_id" integer NOT NULL,
	"action" text NOT NULL,
	"vehicle_number" text NOT NULL,
	"unit" text NOT NULL,
	"performed_by" text DEFAULT 'system' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tax_deadline_checklists" (
	"id" serial PRIMARY KEY NOT NULL,
	"tax_schedule_id" integer NOT NULL,
	"item_name" text NOT NULL,
	"description" text,
	"is_completed" boolean DEFAULT false NOT NULL,
	"completed_by" integer,
	"completed_at" timestamp with time zone,
	"due_date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attendance" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"check_date" date NOT NULL,
	"check_in_time" timestamp with time zone,
	"check_out_time" timestamp with time zone,
	"check_type" text NOT NULL,
	"status" text DEFAULT 'normal' NOT NULL,
	"device_type" text,
	"ip_address" text,
	"user_agent" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "alert_actions" (
	"id" serial PRIMARY KEY NOT NULL,
	"alert_type" text NOT NULL,
	"related_entity_type" text NOT NULL,
	"related_entity_id" integer NOT NULL,
	"action_type" text NOT NULL,
	"completed_date" date,
	"next_cycle_date" date,
	"acted_on_due_date" date,
	"postpone_days" integer,
	"postpone_reason" text,
	"rfq_id" integer,
	"notes" text,
	"close_up_photo_url" text,
	"wide_photo_url" text,
	"delay_reason" text,
	"delay_reason_detail" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "buildings" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"address_full" text,
	"address_jibun" text,
	"sido" text,
	"sigungu" text,
	"dong" text,
	"zip_code" text,
	"total_units" integer,
	"total_floors" integer,
	"basement_floors" integer,
	"total_area" numeric,
	"building_usage" text,
	"structure_type" text,
	"completion_date" date,
	"elevator_count" integer,
	"parking_spaces" integer,
	"has_playground" boolean DEFAULT false,
	"has_gas" boolean DEFAULT true,
	"has_septic_tank" boolean DEFAULT true,
	"safety_manager_required" boolean DEFAULT false,
	"safety_manager_type" text,
	"building_register_pk" text,
	"land_area" numeric,
	"building_area" numeric,
	"building_coverage_ratio" numeric,
	"floor_area_ratio" numeric,
	"management_office_phone" text,
	"management_office_fax" text,
	"electric_capacity_kw" numeric,
	"gas_usage_monthly" numeric,
	"special_fund_enabled" boolean DEFAULT false NOT NULL,
	"approval_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "units" (
	"id" serial PRIMARY KEY NOT NULL,
	"building_id" integer NOT NULL,
	"unit_number" text NOT NULL,
	"floor" text NOT NULL,
	"exclusive_area" numeric,
	"common_area" numeric,
	"usage" text,
	"notes" text,
	"status" text DEFAULT 'vacant' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "units_building_unit_number" UNIQUE("building_id","unit_number")
);
--> statement-breakpoint
CREATE TABLE "tenant_card_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"building_id" integer NOT NULL,
	"unit_id" integer NOT NULL,
	"unit_label" text NOT NULL,
	"token" uuid DEFAULT gen_random_uuid() NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"submitted_at" timestamp with time zone,
	"approved_at" timestamp with time zone,
	"approved_by" text,
	"rejection_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "management_contract_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"building_id" integer NOT NULL,
	"fee_obligation_clause" text NOT NULL,
	"penalty_clause" text NOT NULL,
	"special_fund_clause" text NOT NULL,
	"privacy_retention_clause" text NOT NULL,
	"additional_clauses" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meter_readings" (
	"id" serial PRIMARY KEY NOT NULL,
	"building_id" integer NOT NULL,
	"unit_id" integer,
	"unit_number" text NOT NULL,
	"meter_type" text NOT NULL,
	"reading_date" date NOT NULL,
	"previous_reading" numeric,
	"current_reading" numeric NOT NULL,
	"usage" numeric,
	"is_anomaly" boolean DEFAULT false NOT NULL,
	"anomaly_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "complaints" (
	"id" serial PRIMARY KEY NOT NULL,
	"building_id" integer NOT NULL,
	"unit_id" integer,
	"unit_number" text NOT NULL,
	"complainant_name" text NOT NULL,
	"complainant_phone" text,
	"category" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"status" text DEFAULT 'received' NOT NULL,
	"assignee_name" text,
	"resolution" text,
	"sensitivity" text DEFAULT 'normal' NOT NULL,
	"is_recurring" boolean DEFAULT false NOT NULL,
	"recurring_count" integer DEFAULT 0 NOT NULL,
	"has_risk_keyword" boolean DEFAULT false NOT NULL,
	"photo_urls" jsonb DEFAULT '[]'::jsonb,
	"escalated_to_hq" boolean DEFAULT false NOT NULL,
	"escalated_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vote_ballots" (
	"id" serial PRIMARY KEY NOT NULL,
	"vote_id" integer NOT NULL,
	"unit_id" integer,
	"unit_number" text NOT NULL,
	"voter_name" text NOT NULL,
	"choice" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vote_ballots_vote_unit" UNIQUE("vote_id","unit_number")
);
--> statement-breakpoint
CREATE TABLE "votes" (
	"id" serial PRIMARY KEY NOT NULL,
	"building_id" integer NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"voter_type" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"total_eligible" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "delinquency_actions" (
	"id" serial PRIMARY KEY NOT NULL,
	"unit_id" integer,
	"unit_number" text NOT NULL,
	"tenant_id" integer,
	"tenant_name" text,
	"overdue_months" integer DEFAULT 0 NOT NULL,
	"total_overdue_amount" integer DEFAULT 0 NOT NULL,
	"action_type" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"action_date" timestamp with time zone DEFAULT now() NOT NULL,
	"notice_date" timestamp with time zone,
	"suspension_date" timestamp with time zone,
	"resolved_date" timestamp with time zone,
	"notes" text,
	"performed_by" text DEFAULT 'system' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "monthly_payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"unit_id" integer NOT NULL,
	"billing_month" text NOT NULL,
	"total_amount" real NOT NULL,
	"paid_amount" real DEFAULT 0 NOT NULL,
	"is_paid" boolean DEFAULT false NOT NULL,
	"due_date" text NOT NULL,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "monthly_payments_unit_id_billing_month_unique" UNIQUE("unit_id","billing_month")
);
--> statement-breakpoint
CREATE TABLE "building_warranties" (
	"id" serial PRIMARY KEY NOT NULL,
	"building_id" integer NOT NULL,
	"preset_id" integer,
	"trade_category" text NOT NULL,
	"trade_name" text NOT NULL,
	"warranty_years" integer NOT NULL,
	"start_date" date NOT NULL,
	"expiry_date" date NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"contractor_name" text,
	"notes" text,
	"alert_sent_60" timestamp with time zone,
	"alert_sent_30" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seasonal_maintenance_presets" (
	"id" serial PRIMARY KEY NOT NULL,
	"month" integer NOT NULL,
	"title" text NOT NULL,
	"category" text NOT NULL,
	"description" text,
	"priority" text DEFAULT 'normal' NOT NULL,
	"rfq_category" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "warranty_presets" (
	"id" serial PRIMARY KEY NOT NULL,
	"trade_category" text NOT NULL,
	"trade_name" text NOT NULL,
	"warranty_years" integer NOT NULL,
	"description" text,
	"legal_basis" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owners" ADD CONSTRAINT "owners_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_building_id_buildings_id_fk" FOREIGN KEY ("building_id") REFERENCES "public"."buildings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_history" ADD CONSTRAINT "vehicle_history_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "units" ADD CONSTRAINT "units_building_id_buildings_id_fk" FOREIGN KEY ("building_id") REFERENCES "public"."buildings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_card_tokens" ADD CONSTRAINT "tenant_card_tokens_building_id_buildings_id_fk" FOREIGN KEY ("building_id") REFERENCES "public"."buildings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_card_tokens" ADD CONSTRAINT "tenant_card_tokens_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "management_contract_templates" ADD CONSTRAINT "management_contract_templates_building_id_buildings_id_fk" FOREIGN KEY ("building_id") REFERENCES "public"."buildings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meter_readings" ADD CONSTRAINT "meter_readings_building_id_buildings_id_fk" FOREIGN KEY ("building_id") REFERENCES "public"."buildings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meter_readings" ADD CONSTRAINT "meter_readings_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_building_id_buildings_id_fk" FOREIGN KEY ("building_id") REFERENCES "public"."buildings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vote_ballots" ADD CONSTRAINT "vote_ballots_vote_id_votes_id_fk" FOREIGN KEY ("vote_id") REFERENCES "public"."votes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vote_ballots" ADD CONSTRAINT "vote_ballots_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "votes" ADD CONSTRAINT "votes_building_id_buildings_id_fk" FOREIGN KEY ("building_id") REFERENCES "public"."buildings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delinquency_actions" ADD CONSTRAINT "delinquency_actions_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delinquency_actions" ADD CONSTRAINT "delinquency_actions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monthly_payments" ADD CONSTRAINT "monthly_payments_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "doc_checklist_entity_doc_idx" ON "document_checklists" USING btree ("entity_type","entity_id","document_name");