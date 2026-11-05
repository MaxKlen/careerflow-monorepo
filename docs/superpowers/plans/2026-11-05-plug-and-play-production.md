# Plug-and-Play Production Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add production-ready, environment-selected payment, object-storage, email, and connected-AI adapters while preserving safe mock/offline defaults and documenting local/demo deployment configuration.

**Architecture:** Extend the existing adapter boundaries rather than changing route contracts. Provider selection is environment-driven and fail-closed: real adapters are selected only when their credentials/configuration are present; otherwise mock/local/offline implementations remain active. Webhook handling is added as explicit API routes with signature validation and idempotent internal event conversion where the current billing model supports it.

**Tech Stack:** Fastify, TypeScript, pnpm workspaces, Stripe SDK, AWS SDK v3 S3 client, Resend SDK, Google Gen AI SDK, existing Drizzle/Postgres billing and storage interfaces, Render Blueprint YAML.

**Spec:** User request dated 2026-11-05 for `feat/plug-and-play-production`.

## Global Constraints

- No deployment, account creation, paid service, provider call, or spending.
- Base branch is `feat/phase2-mock-billing-owner-demo` at commit `b62d63dbbbc8b7330e5604324fbc68dd8538c9ae`.
- Missing mobile source must be reported; do not copy a generic Expo template.
- Missing credentials must preserve mock/local/offline behavior.
- Do not commit secrets, real provider keys, or absolute local paths.
- Existing synthetic billing must remain clearly labeled and disabled in production unless a real provider is configured.

## Review Focus

- Provider selection with no keys must retain current mocks/local storage/offline MEH.
- Production mode must never silently use mock payments.
- Webhook authenticity and duplicate-event behavior must be explicit.
- S3/R2 failures must not weaken local path traversal and symlink protections.
- Real email/AI failures must return safe application errors and preserve no-key fallbacks.

---

### Task 1: Create the feature branch and dependency manifests

**Files:**

- Modify: `apps/api/package.json`, `packages/meh/package.json`, `pnpm-lock.yaml`
- Create: `docs/superpowers/plans/2026-11-05-plug-and-play-production.md`

- [ ] Create `feat/plug-and-play-production` from `feat/phase2-mock-billing-owner-demo`.
- [ ] Add Stripe, AWS S3, Resend, and the current supported Google Gen AI TypeScript SDK to the appropriate workspaces.
- [ ] Install with the frozen workspace lockfile workflow and keep dependency versions compatible with Node 22.

### Task 2: Expand environment configuration and examples

**Files:**

- Modify: `apps/api/src/env.ts`
- Modify: `.env.example`
- Create: `render.yaml`

- [ ] Add optional Stripe, Paymob, S3/R2, Resend, Gemini, and OpenAI configuration fields with safe defaults.
- [ ] Validate production combinations so mock payment is never enabled in production and real-provider webhook secrets are required when corresponding providers are selected.
- [ ] Document every variable, source, and demo fallback in `.env.example`.
- [ ] Define a Render Blueprint for Postgres, API, candidate, employer, and admin services using free-tier placeholders and environment references; do not deploy it.

### Task 3: Payment adapters and webhook routes

**Files:**

- Modify: `apps/api/src/paymentProvider.ts`
- Modify: `apps/api/src/server.ts`
- Create/modify: payment route and test files as required by existing route conventions.

- [ ] Preserve the existing `PaymentProvider` contract for checkout and add provider-aware cancellation/webhook conversion without breaking mock tests.
- [ ] Implement Stripe Checkout Session creation, subscription cancellation, and verified webhook event parsing using the official SDK.
- [ ] Implement Paymob checkout/cancellation/webhook integration through its documented HTTP API or installed SDK only if an actual compatible SDK is available; otherwise use a narrow typed HTTP adapter and document that choice.
- [ ] Route provider events into the existing idempotent billing service with provider/event identity preserved.
- [ ] Add tests for no-key mock selection, Stripe/Paymob configuration selection without network calls, invalid webhook rejection, and duplicate event handling.

### Task 4: S3/R2 storage adapter

**Files:**

- Modify: `apps/api/src/storage.ts`
- Modify: `apps/api/src/env.ts`
- Add focused storage tests.

- [ ] Define a storage interface implemented by the current hardened local adapter and an S3 adapter.
- [ ] Select S3/R2 only when bucket and credentials are configured; otherwise retain local storage.
- [ ] Preserve key validation and safe object operations, including content type and no implicit public access.
- [ ] Test local fallback and S3 command construction with a mocked client, without contacting a provider.

### Task 5: Resend email adapter

**Files:**

- Modify: `apps/api/src/email.ts`
- Modify: `apps/api/src/env.ts`
- Add focused email tests.

- [ ] Select Resend when `RESEND_API_KEY` is configured, otherwise retain SMTP/MailHog behavior and development logging behavior.
- [ ] Keep invite and password-reset call sites unchanged.
- [ ] Return the existing `SendResult` shape and never log API keys or reset tokens.
- [ ] Test provider selection and failure mapping with a mocked Resend client.

### Task 6: Connected MEH providers

**Files:**

- Modify: `packages/meh/src/connected.ts`, `packages/meh/src/index.ts`, `packages/meh/src/prompts.ts`
- Modify: `apps/api/src/server.ts`
- Add provider tests.

- [ ] Add Gemini generation through the current supported Google Gen AI SDK with a career-coach system prompt and bounded output.
- [ ] Add OpenAI fallback when Gemini is absent or fails, reusing the existing provider shape.
- [ ] Preserve deterministic offline behavior when neither key is present.
- [ ] Ensure provider failures do not leak credentials or user-sensitive prompt contents in logs.
- [ ] Test selection and fallback with mocked SDK clients.

### Task 7: Mobile boundary and demo documentation

**Files:**

- Modify: `INVESTOR_DEMO.md`
- Modify: `docs/roadmap-gap-analysis.md` if needed
- Do not create `apps/mobile` without a real project source.

- [ ] Document automatic mock/local/offline behavior and live-provider activation through environment variables.
- [ ] Record that mobile API integration is blocked because no Expo project exists in this repository or available branches.
- [ ] Keep demo commands and synthetic-account warnings accurate.

### Task 8: Validation and delivery

**Files:** all changed files.

- [ ] Run formatting, typecheck, unit tests, relevant integration tests, and web builds.
- [ ] Review staged paths for secrets, `.env` files other than `.env.example`, absolute local paths, and unrelated changes.
- [ ] Commit logically, push only `feat/plug-and-play-production`, and open a draft PR to the appropriate base branch.
- [ ] Report exact checks, limitations, and the mobile blocker; do not claim provider integration or deployment was exercised without credentials.
