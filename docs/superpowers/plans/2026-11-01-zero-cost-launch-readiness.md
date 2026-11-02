# Zero-Cost Launch Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use native execution with frequent validation; no production deployment or repository push is authorized.

**Goal:** Make the CareerFlow monorepo reproducible and launch-ready for a future funded deployment while preserving the current scope and explicitly tracking owner-only gates.

**Architecture:** Keep CareerFlow as a dynamic Next.js/Fastify/PostgreSQL monorepo. Add repository-level CI and test entry points, fail-closed production configuration checks, and provider-neutral deployment documentation. Do not convert the app to static export because authenticated server routes, cookies, uploads, and PostgreSQL are runtime dependencies.

**Tech Stack:** pnpm 9.12, Node 22, TypeScript, Next.js 15, Fastify, Drizzle, Vitest, Playwright, GitHub Actions, Prettier.

**Spec:** User-provided zero-budget launch-readiness checklist plus `docs/roadmap-gap-analysis.md`.

## Global Constraints

- Default to $0 and local/synthetic data.
- Do not deploy, publish, push, buy services, or contact production/external providers.
- Do not expose or commit credentials.
- Preserve owner-only blockers: physical device acceptance, independent security/dependency audit, privacy pilot protocol, participant release sign-off, and production host infrastructure deployment.
- Treat legal documents as drafts requiring qualified review, not legal advice.

## Review Focus

- Dynamic runtime versus static-hosting assumptions: preview deployment must preserve API, cookies, uploads, and database access.
- Frozen-install reproducibility: CI must fail if the lockfile drifts from workspace manifests.
- Production configuration: placeholder secrets, localhost URLs, and incomplete SMTP settings must fail closed.
- Test truthfulness: CI must run committed typecheck/build/unit/browser checks and report environment-blocked smoke gates separately.
- Privacy/recovery readiness: data retention, backup/restore, deletion, and provider opt-in boundaries must be documented without claiming completed legal or infrastructure approval.

---

### Task 1: Add reproducible repository checks

**Files:**

- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Create: `tests/config/repository-readiness.test.ts`
- Create: `playwright.config.ts`
- Create: `tests/e2e/welcome.spec.ts`

- [ ] Add `lint`, `test`, `test:e2e`, and `build` scripts with explicit commands.
- [ ] Add Vitest and Playwright development dependencies; install with lockfile update.
- [ ] Add unit checks for required scripts, absence of committed `.env`, and production-readiness documentation.
- [ ] Add a Playwright welcome-page test that runs the candidate web app only and verifies both public primary actions.
- [ ] Run unit tests and the browser test locally; record API/database-dependent gates as blocked if services are unavailable.

### Task 2: Add GitHub Actions CI

**Files:**

- Create: `.github/workflows/ci.yml`

- [ ] Use Node 22 and pnpm 9.12.
- [ ] Run frozen install, lint, typecheck, unit tests, all-app builds, and Playwright Chromium setup/browser tests.
- [ ] Do not put credentials or production endpoints in workflow files.
- [ ] Keep database smoke as a separately named, environment-dependent job rather than silently skipping it.

### Task 3: Harden configuration and document adapters

**Files:**

- Modify: `apps/api/src/env.ts`
- Modify: `.env.example`
- Create: `scripts/verify-production-config.mjs`
- Modify: `package.json`

- [ ] Reject the known development session secret and localhost URL defaults in production.
- [ ] Require SMTP credentials when production email is enabled.
- [ ] Add a check-only command that validates production configuration without starting the API.
- [ ] Document `NEXT_PUBLIC_API_URL`, storage, email, MEH, payment, and database variables with safe local defaults.

### Task 4: Add zero-cost operational and governance runbooks

**Files:**

- Create: `docs/zero-cost-launch-readiness.md`
- Create: `docs/privacy-and-retention-draft.md`
- Create: `docs/production-runbook.md`
- Modify: `README.md`
- Modify: `docs/roadmap-gap-analysis.md`

- [ ] Correct the static-export assumption and describe dynamic preview hosting requirements.
- [ ] Document free-tier staging options as options, not completed deployment.
- [ ] Document backups, migrations, storage durability, observability, rollback, and owner approvals.
- [ ] Provide a privacy/retention draft with explicit legal-review status.
- [ ] Reconcile the gap ledger to show current-scope complete versus owner-only blocked gates.

### Task 5: Validate and review

- [ ] Run frozen install after lockfile update.
- [ ] Run lint, typecheck, unit tests, builds, and Playwright.
- [ ] Run the production configuration checker with safe failure and safe success fixtures.
- [ ] Inspect the final diff for secrets, unrelated edits, and unsupported claims.
- [ ] Do not commit, push, or deploy.
