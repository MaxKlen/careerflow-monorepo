# CareerFlow Production Runbook

**Status:** Preparation only. No production host or deployment has been configured.

Privacy and retention draft: pending legal review — owner action, in progress. This runbook and the draft do not authorize participant-facing use.

## Release prerequisites

Before a release, the owner must select a server-capable hosting platform for the three Next.js applications and Fastify API, an isolated PostgreSQL service, and durable upload storage. The platform must provide HTTPS, secret injection, logs, health checks, restart behavior, and a documented rollback mechanism. Static-only hosting is not sufficient for this codebase.

The release environment must set `NODE_ENV=production`, `DATABASE_URL`, `APP_URL`, `ADMIN_URL`, `EMPLOYER_URL`, `NEXT_PUBLIC_API_URL` for each frontend build, and a unique `SESSION_SECRET` of at least 32 characters. If email is enabled, SMTP credentials and a reviewed sender identity are required. Payment remains disabled until a provider is selected and integrated; MEH connected mode remains disabled unless the owner approves the provider, model, data flow, and consent behavior.

Run `pnpm verify:production-config` in the release environment before starting the API. The API's environment parser also rejects the known development session-secret and localhost URL defaults in production. Never paste secret values into CI logs or issue comments.

## Database and migrations

The current repository exposes Drizzle generation, push, and migrate commands. A production owner must choose and document a versioned migration policy before release. `db:push` is suitable for controlled local development, not an unattended production rollout. A release should apply reviewed forward migrations against a backup, verify health/readiness, and retain the previous application version until compatibility is confirmed.

Rollback must be defined as a tested application rollback plus a forward database repair strategy. Do not assume every schema migration can be safely reversed automatically.

## Backups and uploaded files

The current local storage adapter writes uploads under `STORAGE_DIR`. A production deployment must use a durable, access-controlled storage backend or a backed-up shared volume; ephemeral container storage is not acceptable. The owner must define database backup frequency, point-in-time recovery if available, upload retention, encryption, restore ownership, and target RPO/RTO. At least one restore drill must be completed before production data is accepted.

Account deletion and export expiry are application behaviors, not substitutes for infrastructure backup policy. Backups may contain deleted records until their retention window expires; the privacy notice must explain that distinction.

## Observability and incident response

Before launch, provide request correlation, redacted structured logs, database/readiness checks, scheduler health, error-rate and latency monitoring, and alerts appropriate to the selected host. Document who receives alerts, how to disable a failing provider, and how to preserve a minimal incident timeline without collecting unnecessary personal data.

## Release sequence

1. Confirm owner approvals and synthetic staging data.
2. Validate the environment with `pnpm verify:production-config`.
3. Apply a reviewed database migration against a verified backup.
4. Deploy API and frontends with immutable build identifiers.
5. Verify health, sign-in, invitation, upload, export, deletion, and provider-disabled behavior with synthetic accounts.
6. Confirm logs, alerts, rollback ownership, and storage durability.
7. Record the release identifier and any blocked acceptance gates.

No step in this runbook authorizes deployment by itself.
