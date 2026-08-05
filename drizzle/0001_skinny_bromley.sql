CREATE TYPE "public"."help_category" AS ENUM('basics', 'okr', 'checkin', 'periods', 'admin', 'account', 'other');--> statement-breakpoint
CREATE TABLE "help_articles" (
	"id" text PRIMARY KEY NOT NULL,
	"category" "help_category" DEFAULT 'other' NOT NULL,
	"question" text NOT NULL,
	"answer" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"author_user_id" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "help_articles" ADD CONSTRAINT "help_articles_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;