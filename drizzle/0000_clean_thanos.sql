CREATE TYPE "public"."confidence" AS ENUM('high', 'mid', 'low');--> statement-breakpoint
CREATE TYPE "public"."period_kind" AS ENUM('quarter', 'month');--> statement-breakpoint
CREATE TYPE "public"."period_state" AS ENUM('active', 'closed', 'planned');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('admin', 'executive', 'staff');--> statement-breakpoint
CREATE TYPE "public"."user_state" AS ENUM('active', 'passive');--> statement-breakpoint
CREATE TABLE "checkins" (
	"id" text PRIMARY KEY NOT NULL,
	"key_result_id" text NOT NULL,
	"author_user_id" text NOT NULL,
	"previous_value" double precision NOT NULL,
	"new_value" double precision NOT NULL,
	"confidence" "confidence" NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "departments" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"emoji" text NOT NULL,
	"name_tr" text NOT NULL,
	"name_en" text NOT NULL,
	"lead_user_id" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "departments_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "key_results" (
	"id" text PRIMARY KEY NOT NULL,
	"objective_id" text NOT NULL,
	"title_tr" text NOT NULL,
	"title_en" text NOT NULL,
	"start" double precision NOT NULL,
	"current" double precision NOT NULL,
	"target" double precision NOT NULL,
	"unit" text DEFAULT '' NOT NULL,
	"confidence" "confidence" DEFAULT 'mid' NOT NULL,
	"owner_user_id" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "login_attempts" (
	"key" text PRIMARY KEY NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"first_failed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_until" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "objectives" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"department_id" text NOT NULL,
	"period_id" text NOT NULL,
	"title_tr" text NOT NULL,
	"title_en" text NOT NULL,
	"owner_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "periods" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"kind" "period_kind" DEFAULT 'quarter' NOT NULL,
	"state" "period_state" DEFAULT 'planned' NOT NULL,
	"starts_on" text NOT NULL,
	"ends_on" text NOT NULL,
	CONSTRAINT "periods_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text,
	"role" "role" DEFAULT 'staff' NOT NULL,
	"department_id" text,
	"state" "user_state" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "checkins" ADD CONSTRAINT "checkins_key_result_id_key_results_id_fk" FOREIGN KEY ("key_result_id") REFERENCES "public"."key_results"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkins" ADD CONSTRAINT "checkins_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "key_results" ADD CONSTRAINT "key_results_objective_id_objectives_id_fk" FOREIGN KEY ("objective_id") REFERENCES "public"."objectives"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "key_results" ADD CONSTRAINT "key_results_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "objectives" ADD CONSTRAINT "objectives_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "objectives" ADD CONSTRAINT "objectives_period_id_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."periods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "objectives" ADD CONSTRAINT "objectives_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree ("email");