# Phase 2 schema migration

`packages/db/migrations/0000_phase2_mock_billing_owner.sql` is an additive migration for a database that already has the repository's base schema. It adds account suspension and restricted-impersonation fields, employer subscriptions, synthetic invoices and billing-event idempotency, plus the one-current-subscription indexes.

For an existing database with the base schema, apply it with `pnpm db:migrate`. Beforehand, take the database backup required by your environment. The migration deliberately stops instead of deleting or guessing how to resolve any workspace that already has multiple non-canceled candidate subscriptions; resolve those records explicitly, then retry. Drizzle records successful application so the same migration is not replayed on later runs.

The local investor demo remains isolated and uses guarded `pnpm db:push` during its startup/seed flow. This migration was not applied to any production or remote database. It does not implement, enable, or verify a real payment provider; real-provider work still requires a server-side adapter, verified provider webhooks, production secrets, and a separately reviewed deployment.
