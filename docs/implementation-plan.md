# CareerFlow Full-Product Completion Plan

**Goal:** Bring the cloned CareerFlow monorepo to the documented M0–M11 end state with current evidence for implementation, validation, security boundaries, and operational prerequisites, without deploying or pushing.

## Architecture

Preserve the existing pnpm TypeScript monorepo. Candidate, employer, and admin Next.js applications remain separate clients over the Fastify API; shared contracts and domain logic remain in packages; PostgreSQL/Drizzle remains the persistence layer; local filesystem storage remains bounded by the existing path-containment checks. Add only narrow, repository-consistent code and documentation needed to close verified gaps.

## Work waves

1. **Baseline and dependency setup:** install from the lockfile if possible; record versions and ensure the working tree remains reviewable.
2. **Static architecture and security review:** inspect auth boundaries, ownership checks, uploads, exports, provider opt-ins, production defaults, and error handling.
3. **M11 browser closure:** start only isolated local services; walk the documented employer invitation/projection flow and candidate journey; fix defects found.
4. **Regression coverage:** add focused tests or check-only harnesses for any defect fixed and for the highest-risk ownership/security paths that lack committed coverage.
5. **Production hardening:** fail closed on unsafe production defaults, document migrations/backups/rollback/observability prerequisites, and keep external providers disabled in local validation.
6. **Dependency review:** evaluate Dependabot proposals locally; only update versions if compatibility is demonstrated and the change is required for the roadmap end state.
7. **Full validation:** run typechecks, builds, smoke checks, focused regression checks, and source/diff review. Update the gap ledger with exact evidence and remaining blockers.

## Acceptance criteria

- Every documented M0–M11 capability is source-present and either locally verified or explicitly marked blocked with the missing evidence named.
- The M11 visible browser walkthrough is completed against isolated synthetic data, or the exact environment blocker and affected steps are recorded.
- Production configuration does not silently accept the known development session-secret fallback.
- No test or validation contacts external payment, email, AI, production database, or deployment services.
- The repository has a reproducible validation entry point and focused regression coverage for changes made in this effort.
- `docs/roadmap-gap-analysis.md` is updated after each wave with implemented, missing, in-progress, blocked, and assumption states.
- No commit is pushed and no production deployment or publication is performed.
