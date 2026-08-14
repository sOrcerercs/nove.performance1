CREATE TABLE "kr_monthly_values" (
	"id" text PRIMARY KEY NOT NULL,
	"key_result_id" text NOT NULL,
	"month" text NOT NULL,
	"value" double precision NOT NULL,
	"author_user_id" text NOT NULL,
	"note" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "checkins" ADD COLUMN "month" text;--> statement-breakpoint
ALTER TABLE "kr_monthly_values" ADD CONSTRAINT "kr_monthly_values_key_result_id_key_results_id_fk" FOREIGN KEY ("key_result_id") REFERENCES "public"."key_results"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kr_monthly_values" ADD CONSTRAINT "kr_monthly_values_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "kr_monthly_values_kr_month_unique" ON "kr_monthly_values" USING btree ("key_result_id","month");