ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "suspended_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "admin_users" ADD COLUMN IF NOT EXISTS "suspended_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "employer_users" ADD COLUMN IF NOT EXISTS "suspended_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "impersonator_admin_user_id" uuid;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "is_impersonation" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "impersonation_reason" text;--> statement-breakpoint
ALTER TABLE "employer_sessions" ADD COLUMN IF NOT EXISTS "impersonator_admin_user_id" uuid;--> statement-breakpoint
ALTER TABLE "employer_sessions" ADD COLUMN IF NOT EXISTS "is_impersonation" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "employer_sessions" ADD COLUMN IF NOT EXISTS "impersonation_reason" text;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sessions_impersonator_admin_user_id_admin_users_id_fk') THEN
    ALTER TABLE "sessions" ADD CONSTRAINT "sessions_impersonator_admin_user_id_admin_users_id_fk"
      FOREIGN KEY ("impersonator_admin_user_id") REFERENCES "admin_users"("id") ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employer_sessions_impersonator_admin_user_id_admin_users_id_fk') THEN
    ALTER TABLE "employer_sessions" ADD CONSTRAINT "employer_sessions_impersonator_admin_user_id_admin_users_id_fk"
      FOREIGN KEY ("impersonator_admin_user_id") REFERENCES "admin_users"("id") ON DELETE SET NULL;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."billing_invoice_status" AS ENUM ('open', 'paid', 'void', 'failed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "employer_subscriptions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "employer_user_id" uuid NOT NULL,
  "plan" "subscription_plan" NOT NULL,
  "status" "subscription_status" DEFAULT 'active' NOT NULL,
  "provider" text,
  "external_id" text,
  "current_period_start" timestamp with time zone,
  "current_period_end" timestamp with time zone,
  "canceled_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "employer_subscriptions_employer_user_id_employer_users_id_fk"
    FOREIGN KEY ("employer_user_id") REFERENCES "employer_users"("id") ON DELETE CASCADE
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "employer_subscriptions_user_idx" ON "employer_subscriptions" USING btree ("employer_user_id");--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM "subscriptions"
    WHERE "status" <> 'canceled'
    GROUP BY "workspace_id"
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Phase 2 migration stopped: resolve duplicate non-canceled candidate subscriptions before continuing';
  END IF;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "subscriptions_one_current_per_workspace"
  ON "subscriptions" USING btree ("workspace_id") WHERE "status" <> 'canceled';--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "employer_subscriptions_one_current_per_user"
  ON "employer_subscriptions" USING btree ("employer_user_id") WHERE "status" <> 'canceled';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "billing_invoices" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid,
  "employer_user_id" uuid,
  "subscription_id" uuid,
  "employer_subscription_id" uuid,
  "amount_cents" integer NOT NULL,
  "currency" text DEFAULT 'USD' NOT NULL,
  "status" "billing_invoice_status" DEFAULT 'paid' NOT NULL,
  "provider" text NOT NULL,
  "external_invoice_id" text NOT NULL,
  "description" text NOT NULL,
  "is_synthetic" boolean DEFAULT true NOT NULL,
  "period_start" timestamp with time zone NOT NULL,
  "period_end" timestamp with time zone NOT NULL,
  "issued_at" timestamp with time zone DEFAULT now() NOT NULL,
  "paid_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "billing_invoices_external_invoice_id_unique" UNIQUE ("external_invoice_id"),
  CONSTRAINT "billing_invoice_exactly_one_owner"
    CHECK (("workspace_id" IS NOT NULL) <> ("employer_user_id" IS NOT NULL)),
  CONSTRAINT "billing_invoice_exactly_one_subscription"
    CHECK (("subscription_id" IS NOT NULL) <> ("employer_subscription_id" IS NOT NULL)),
  CONSTRAINT "billing_invoices_workspace_id_workspaces_id_fk"
    FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE,
  CONSTRAINT "billing_invoices_employer_user_id_employer_users_id_fk"
    FOREIGN KEY ("employer_user_id") REFERENCES "employer_users"("id") ON DELETE CASCADE,
  CONSTRAINT "billing_invoices_subscription_id_subscriptions_id_fk"
    FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE SET NULL,
  CONSTRAINT "billing_invoices_employer_subscription_id_employer_subscriptions_id_fk"
    FOREIGN KEY ("employer_subscription_id") REFERENCES "employer_subscriptions"("id") ON DELETE SET NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "billing_invoices_workspace_idx" ON "billing_invoices" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "billing_invoices_employer_idx" ON "billing_invoices" USING btree ("employer_user_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "billing_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "provider" text NOT NULL,
  "event_id" text NOT NULL,
  "event_type" text NOT NULL,
  "invoice_id" uuid,
  "payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "processed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "billing_events_invoice_id_billing_invoices_id_fk"
    FOREIGN KEY ("invoice_id") REFERENCES "billing_invoices"("id") ON DELETE SET NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "billing_events_provider_event_unique"
  ON "billing_events" USING btree ("provider", "event_id");
