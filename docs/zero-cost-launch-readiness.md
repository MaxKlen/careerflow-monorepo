# Zero-Cost Launch Readiness

## Bottom line

CareerFlow is source-complete for the current documented M0–M11 application scope, subject to the owner-only gates recorded below. The repository is not a static-export PWA: it contains a Fastify API, cookie sessions, PostgreSQL persistence, upload storage, background scheduling, and three dynamic Next.js applications. A future free-tier preview therefore needs a server-capable host and a database/storage arrangement; uploading only `npm run build` output to a static host would not preserve the product's authenticated workflows.

This document describes what can be prepared at $0. It does not claim that a deployment, legal review, independent audit, or device acceptance has occurred.

## Ready now in the repository

The monorepo now has a frozen-install CI path, formatting/lint check, recursive TypeScript validation, all-frontend builds, a dependency-free production configuration check, a Vitest unit-test entry point, and a Playwright public-browser smoke entry point. Provider integrations remain environment-driven: database URLs, public app URLs, session secrets, SMTP, MEH connected mode, payment selection, and browser API URL are configured through environment variables rather than committed credentials.

The local development path remains Docker Compose plus pnpm. The CI browser gate deliberately exercises the public candidate welcome page without a database, payment rail, email provider, or AI provider. A separate CI database job now provisions an ephemeral Postgres service container, runs schema setup, synthetic smoke, four API integration tests, and the automated M11 employer-invitation flow; it does not use owner credentials or production data.

## Free-tier hosting interpretation

Vercel, Netlify, and Cloudflare Pages can be evaluated for frontend previews, but the current app cannot be treated as a static export. The candidate, employer, and admin frontends need their Next.js server runtime, while the API needs a reachable Fastify runtime and PostgreSQL. A safe preview topology is therefore:

| Component                  | Preview requirement                                                          | Cost posture                                                                    |
| -------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Candidate, employer, admin | Server-capable Next.js deployment or a host-compatible adapter               | Evaluate the host's current free-tier limits before use                         |
| API                        | Reachable HTTPS Fastify service with injected environment variables          | Free only if a suitable free runtime is available and its limits are acceptable |
| PostgreSQL                 | Isolated non-production database with backups understood                     | Free-tier availability and durability must be verified at decision time         |
| Uploads                    | Durable object storage or explicitly backed-up volume                        | Do not rely on ephemeral local filesystem storage                               |
| Email                      | Disabled for local/preview unless an owner selects and configures a provider | No provider call is made by default                                             |
| Payments                   | `PAYMENT_PROVIDER=none` until a real rail is selected and reviewed           | No payment action is available by default                                       |

The repository does not choose or configure a host because that would be an external deployment decision and the owner has not supplied a target, secrets, rollback destination, or data-retention approval.

## Mobile scope

No Expo or React Native project exists in this repository. Expo Go readiness is therefore not a current repository deliverable. If mobile becomes part of the product scope, it should be added as a separately planned workspace with its own device acceptance criteria, environment contract, privacy review, and store-release process.

## Owner-only gates

The following remain intentionally outside autonomous repository work: physical iOS/Android device acceptance; an independent security and dependency audit; approval of a privacy pilot protocol; participant release/sign-off; and production host infrastructure deployment. These are not represented as passed merely because source checks pass.

## What would change the conclusion

The app can move from “plug-and-play prepared” to “preview deployed” once an owner supplies a server-capable hosting target, isolated PostgreSQL and durable upload storage, production HTTPS URLs, a secret-injection method, a rollback owner, and approval for the data-retention/privacy posture. A production release additionally requires the owner-only gates above and a completed M11 visible browser walkthrough.
