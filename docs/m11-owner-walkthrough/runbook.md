# Owner M11 Visible Walkthrough Runbook

This is the owner-run visible walkthrough, not the automated Playwright test. It uses synthetic local data to validate the employer invitation, candidate controls, withdrawal/revocation, and projection behavior.

## Prerequisites

- Docker Desktop installed and running.
- Approximately 8 GB of free disk space for the local images and database volume.
- Ports `3000`, `3001`, `3002`, `4000`, `5432`, `6379`, `1025`, and `8025` free.
- Node.js 22 or later and pnpm 9.12.0 available in the repository shell.

Expected duration for setup, seed, walkthrough, and teardown is approximately 20–30 minutes.

## Start the stack

From the repository root, run:

```bash
pnpm walkthrough:up
```

This starts the existing PostgreSQL, Redis, and MailHog Compose services, applies the local Drizzle schema, and launches the API, candidate web, employer web, and admin web processes with provider integrations disabled.

## Seed synthetic data

In a second terminal at the repository root, run:

```bash
pnpm walkthrough:seed
```

The command creates a synthetic candidate, workspace, opportunity, application, and employer invitation. It prints the invitation URL and saves local-only credentials and identifiers under `.m11-scripts/seed.env`.

Open the printed invitation URL in the employer browser and use [observation-checklist.md](./observation-checklist.md) while performing the five visible steps. Do not use real email addresses or participant data.

## Record defects

For every unexpected behavior, copy the relevant step into [defect-recording.md](./defect-recording.md) and record the observed result, expected result, severity, and any screenshot or log excerpt. Do not mark the walkthrough complete while a blocking or data-integrity defect remains.

## Stop the stack

When finished, run:

```bash
pnpm walkthrough:down
```

This stops the local processes and Compose services and removes the walkthrough seed credentials/logs. The named Docker database volume is retained by the existing Compose configuration unless the owner explicitly removes it after confirming no needed local data remains.

## If Docker is not installed or ports are busy

Do not deploy a substitute environment or provision cloud PostgreSQL. Install/start Docker Desktop and retry, or stop the process holding the listed port and retry. If the owner cannot provide Docker or sufficient local resources, report the blocker and do not substitute the automated CI test for this visible walkthrough.
