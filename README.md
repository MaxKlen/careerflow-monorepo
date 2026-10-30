# CareerFlow Monorepo

CareerFlow is a TypeScript monorepo for the candidate web app, employer portal, admin app, API, and shared packages.

## Project layout

- `apps/web` — candidate-facing application
- `apps/employer` — employer portal
- `apps/admin` — administration interface
- `apps/api` — API service
- `packages/` — shared domain logic, database schema, contracts, and MEH modes
- `docker/` — local service dependencies
- `scripts/` and `apply-*.sh` — smoke/reset helpers and persistent milestone runbooks
- `TESTING.md` — test commands, security notes, and recorded milestone results

## Local development

Requirements: Node.js 22 or newer, pnpm 9.12.0, and Docker Compose.

1. Copy `.env.example` to `.env` and set local-only values for your environment.
2. Install dependencies with `pnpm install`.
3. Start local dependencies with `pnpm up`.
4. In separate terminals, run the service you need with `pnpm dev:api`, `pnpm dev:web`, `pnpm dev:admin`, or `pnpm dev:employer`.
5. Use `pnpm typecheck` and `pnpm smoke` for the repository-level checks. See `TESTING.md` for milestone-specific gates and manual verification notes.

Do not put production credentials in `.env.example` or commit local `.env` files.

## Milestone status

M10 is recorded as passed in `TESTING.md`. M11 is **not fully green**: the corrected rerun passed its seven automated E2E gates, but the visible six-step browser walkthrough did not finish. M11 should not be treated as complete until that walkthrough is run and passes.

## Repository scope

This repository contains only CareerFlow source, project configuration, testing documentation, and reviewed runbooks. Local environment files, databases, uploaded CVs, raw account/export data, screenshots, build outputs, and backup snapshots are intentionally excluded. `artifacts/` contains only the synthetic fixture generator and this sanitized milestone-status note.
