CREATE TYPE "public"."rollup" AS ENUM('sum', 'avg', 'last');--> statement-breakpoint
ALTER TABLE "key_results" ADD COLUMN "rollup" "rollup" DEFAULT 'last' NOT NULL;