# CareerFlow testing

> Published-copy note: raw screenshots, browser/session captures, private test identifiers, exports, logs, and backup snapshots are intentionally omitted. Artifact references in historical notes refer to local-only evidence unless explicitly stated otherwise.
> Local runbook credentials: the historical M6/M7, M8, M9, and M11 runners read synthetic test passphrases from `M6_M7_TEST_PASSWORD`, `M8_WRONG_PASSWORD`, `M9_TEST_PASSWORD`, and `M11_TEST_PASSWORD`. Set unique local-only values when running those gates; no passphrase is stored in this repository. The smoke script generates its own value.

## M2 testing

### Apply

```bash
pnpm db:push
pnpm -r typecheck
pnpm dev:api
pnpm dev:web
```

### Walkthrough

1. `/signup` → `/home`.
2. Set direction.
3. `/cv/import` → upload `.txt` or `.md` (PDF deferred to M4) → review → confirm.
4. `/profile` → imported version.
5. `/linkedin` → paste headline → suggestions.
6. `/opportunities/new` → requirements.
7. Start an application workspace.
8. On a requirement, click **Link evidence…** → pick → **Confirm** → verify it changes to linked.
9. Create a second user and try to link their evidence ID into the first user’s application → expect 404 (BOLA guard).

## Security regression note

The historical M1 `POST /applications/:id/requirements/link` handler lacked an evidence-workspace guard. M2 now checks that evidence belongs to the requester-owned application workspace on both this legacy endpoint and `POST /applications/:id/requirements/:reqId/confirm`. This records the source-level gap and correction; it does not assert that a historical unauthorized 201 was observed. Current checks expect 404 for cross-workspace evidence and 201 with `confirmed_at` set for same-workspace linking through both endpoints.

## Storage

Files are under `./data/uploads/` (`STORAGE_DIR` in `.env`). Containment is enforced; escape attempts throw at boot.

## M3 — document editor v2 + application timeline

### Document editor

1. Open an existing document with v1 content and choose **Edit**.
2. Change the text and select **Save new version**; reload and verify v1 and v2 appear in history.
3. Choose **Compare to latest** on v1 and verify both versions display side by side.
4. Choose **Restore as draft** on v1 and save; verify a new v3 appears with v1’s content.
5. Verify v1 and v2 content/IDs remain unchanged and the new version records candidate-input provenance.

### Application timeline

1. Open an application and find **Timeline**.
2. Add synthetic `follow_up` entries with different dates and notes; verify newest date sorts first and entries are marked **Candidate**.
3. Delete one entry, reload the page, and verify it remains absent.

### M3 security gates

- As user A, POST a document version to user B’s document ID → expect 404.
- As user A, POST an application event to user B’s application ID → expect 404.
- As user A, DELETE user B’s event ID under user A’s application ID → expect 200; verify user B’s event row remains.
- Document-version provenance is also checked against the document’s workspace using the existing M2 validation path.

M3 adds no dependency and does not implement PDF import/export. PDF remains deferred to M4.

## Reset

```bash
bash scripts/reset.sh && pnpm db:push
```


## M4 — PDF import

### What changed
- `apps/api/src/extractText.ts` handles PDF via `unpdf` (which wraps `pdfjs-dist`)
- `apps/web/src/app/(app)/cv/import/page.tsx` accepts .pdf in the file picker
- No new routes or schema changes. The API dependency manifest/lockfile and this testing document are also updated; the runner, backups, fixtures, and screenshots are verification artifacts.

### Gate
1. Obtain a text-based PDF (any PDF with selectable text; NOT a scanned image)
2. `/cv/import` → upload → expect sections parsed
3. Confirm sections → profile version created and persisted
4. Reload → profile version still there
5. Regression: .txt and .md still parse as before

### Failure modes (all correct behavior, not bugs)
- **Scanned/image PDF** → 422 with `PDF extraction failed: No selectable text found`. We do not OCR.
- **Encrypted PDF** → 422 with `PDF extraction failed: <unpdf error>`. We do not prompt for passwords.
- **Multi-column layout** → text order may jumble. Documented limitation.

### If unpdf fails at install or run
- Drop it: `pnpm --filter @careerflow/api remove unpdf`
- Replace with `pdfjs-dist/legacy/build/pdf.mjs` (documented in conversation)
- Report the error verbatim

### Verified M4 results

- `bash apply-m4.sh`: discovery and all patches passed; recursive typecheck passed for all six packages with a typecheck script.
- `pnpm smoke`: **M0 smoke: OK**. This runs the unchanged M0 regression suite, not new MEH work.
- API startup: `pnpm dev:api`. Web startup: `pnpm --filter @careerflow/web dev`; the root does not define `dev:web`, so that command fails with `Command "dev:web" not found`. No root-script or infrastructure change was needed.
- All imports below used the visible `/cv/import` form: native browser file-input assignment followed by **Upload & parse**. No direct multipart/API bypass was used for these acceptance checks.
- Selectable PDF (`local-only evidence (omitted from this repository)`): review showed Summary, Experience, Skills, and Education. Clicking **Create profile version** created **M4 PDF browser gate**, profile ID `ee14a1b6-a8c3-40a7-8ad7-9f5b2959f8ea`. Reloading that profile retained the label and imported content. Import session: `8b4270ab-9d52-42c9-b070-8bb8a13e73bd`.
- TXT (`local-only evidence (omitted from this repository)`): the same four sections parsed. Visible confirmation created **M4 TXT browser regression**, profile ID `522351e5-b073-4901-aeec-46f762905722`; reload retained the saved content. Import session: `89f71599-e000-4e6c-80f0-ecf75a1a1f40`.
- Markdown (`local-only evidence (omitted from this repository)`): the same four sections parsed in the visible review page. This regression checked parsing only; it was not confirmed into another profile. Import session: `fdb2e7e5-3102-4005-9809-8d36054fd7b1`.
- Image-only PDF (`local-only evidence (omitted from this repository)`): the visible page showed `PDF extraction failed: No selectable text found. The PDF may be a scanned image.` Browser console and API response logs confirmed HTTP **422**. Failed session: `2c16f270-6340-4054-8825-2df60d672300`.
- Encrypted PDF (`local-only evidence (omitted from this repository)`): the visible page showed `PDF extraction failed: No password given`; browser console confirmed HTTP **422**. Failed session: `bea9601e-b29e-4ac7-9921-fc8cb4082685`.
- `unpdf` 2.0.0 worked without a fallback. No OCR, PDF export, schema migration, reset, seed, or M5 work was performed. Only synthetic test records/files were added; existing M0–M3 records were not reset or deleted.
- Known limitation: this validates a simple selectable-text PDF, not arbitrary multi-column layout fidelity. Scanned and password-protected PDFs remain intentionally unsupported.

Evidence is saved under `local-only evidence (omitted from this repository)`. Recreate the synthetic fixtures with `python3 artifacts/create-m4-fixtures.py` using the already-installed local PDF/image libraries.

Final library check: `/profile` displayed **M4 TXT browser regression** and **M4 PDF browser gate** alongside the three existing profile versions. The browser is left on that screen. Final recursive typecheck passed again; output is in `local-only evidence (omitted from this repository)`. Final screen: `local-only evidence (omitted from this repository)`.


## M5 — MEH connected mode

### No-provider validation path

For the M5 validation in this workspace, keep `MEH_PROVIDER_URL`, `MEH_PROVIDER_KEY`, and `MEH_PROVIDER_MODEL` unset or blank. Do not copy a general-purpose API key into MEH settings. Without all three MEH-specific values, the API stays offline-only and `POST /meh/respond` with `mode: "connected"` returns HTTP 503 `provider_not_configured` after consent is present; the prompt is not sent to a provider.

### Consent and data flow

1. Open `/meh` and read the connected-mode disclosure before granting consent.
2. Connected mode sends only the entered prompt text and current screen identifier to a provider configured for that deployment. Saved profile, CV, evidence, and prior conversation history are not included. The provider's privacy, retention, and data-use terms apply.
3. Consent is recorded only after the user checks the acknowledgement and the server validates its disclosure version. Granting consent alone sends no prompt. Users can withdraw consent from the page; later connected requests must return 403 `consent_required`.
4. Offline mode uses deterministic guidance and does not call an external AI provider.

### Persistence and security gates

- Send a synthetic prompt in Offline mode. The user message is stored as `candidate_input`; the assistant response is stored as `ai_generated_unverified` with `modeKind=offline`.
- Reload `/meh`; it restores the latest conversation from the database.
- `POST /meh/respond` with `mode: "connected"` and no active consent returns HTTP 403 `consent_required`.
- With consent but no provider configured, the same request returns HTTP 503 `provider_not_configured` and creates no conversation/message rows.
- Cross-workspace access returns 404. The request route is `POST /meh/respond` with `workspaceId` in the body; conversation reads are scoped under `/meh/:workspaceId/conversations/:id`.
- Attempting to grant consent without the versioned affirmative acknowledgement returns HTTP 400.

### M5 limits and deferred scope

The system prompt is a guardrail, not a guarantee: MEH can still hallucinate or mishandle prompt-injected content, so verify its suggestions. Assistant messages are visibly and persistently labeled `ai_generated_unverified` (“MEH suggests, you verify”). The M5 page restores the latest conversation but has no conversation-management UI. Floating widget, streaming, message editing/deletion, rate limiting, and retrieval-augmented context are out of scope here.

### Verified M5 results — no provider configured

- The M5 implementation was adapted directly from the supplied script after inspecting current files; the pasted runner was not executed verbatim. The adaptations add an affirmative versioned data-flow acknowledgement, restore the latest conversation after reload, omit a null conversation ID on first send, and avoid persisting a prompt when a provider call fails.
- `pnpm -r --if-present typecheck`: exit 0; all six projects with a typecheck script completed, including `apps/api`. The full final output is `local-only evidence (omitted from this repository)`.
- `pnpm db:push`: exit 0, additive MEH tables/enums applied. Immediately afterward every pre-existing table retained its original row count. No reset or seed was run.
- `pnpm smoke`: exit 0, **M0 smoke: OK** (`local-only evidence (omitted from this repository)`).
- API `/health`: HTTP 200 with `ok: true`. Authenticated web `/meh`: HTTP 200. The existing dev servers auto-reloaded the source changes; no extra instance was started.
- The dedicated synthetic API checks passed: no-consent connected request → 403 `consent_required`; consent without the disclosure acknowledgement → 400; valid consent with no provider → 503 `provider_not_configured`; User B's cross-workspace response and conversation-read requests → 404; withdrawal → later connected request 403. The 403/503 refusals added no conversation/message rows. Receipt: `local-only evidence (omitted from this repository)`.
- The visible `/meh` flow showed the exact prompt/screen disclosure before consent, an unchecked acknowledgement, and a disabled grant button. Checking it enabled the grant action. Granting consent showed that no provider was configured. Selecting Connected and sending a synthetic prompt produced the clear refusal message; the browser console confirmed HTTP 503 from `/meh/respond`.
- A visible Offline send stored the prompt **M5 browser offline persistence after reload** and deterministic navigation guidance. A full page reload restored both that exchange and its `offline` / `candidate_input` / `ai_generated_unverified` labels. The current synthetic conversation contains four offline messages (two API-test messages and two browser-test messages).
- Withdrawing consent visibly returned the page to Offline status and disabled the Connected option. A subsequent direct API request using the same account returned 403, with `connected=false` and `providerConfigured=false`.
- Every pre-existing row retained the same ID and content hash across 22 tables (authentication sessions were excluded from this content-hash baseline). In particular, all five profile versions and four document versions are unchanged. Only new synthetic signup/workspace/consent/MEH test records were added. Receipt: `local-only evidence (omitted from this repository)`.
- Test workspace: `88c1e3cb-1a8b-47c0-a954-9b491055bc39`; conversation: `3b269e77-4643-429d-9ae3-e6ba76e54287`. Both M5 consent records are withdrawn at the end of the test.
- `MEH_PROVIDER_URL/KEY/MODEL` remain absent from runtime `.env`, and API status reports `providerConfigured=false`. No provider credential was configured, no general API key was used, and no prompt was sent to an external model. Provider HTTP success/error behavior and actual-model guardrails are deliberately untested.
- No dependencies or package versions changed. M6 widget, streaming, and rate limiting were not started. The workspace has no `.git` metadata, so the review used before-file backups/hashes rather than a Git diff or commit.

Screenshots: `local-only evidence (omitted from this repository)`, `local-only evidence (omitted from this repository)`, `local-only evidence (omitted from this repository)`, and `local-only evidence (omitted from this repository)`.

<!-- M9 TESTING START -->
## M9 — settings, privacy/data, deletion, help, feedback, and adapters

### Run the single script

Run `bash apply-m9.sh` from the repository root. PostgreSQL and the current API must be available (`API_URL` defaults to `http://localhost:4000`); use the API dev watcher or restart it after source changes. The runner applies the additive schema, runs recursive typechecks, and fails rather than skipping unavailable self-verification. It does not reset or seed the database. Existing source files have path-preserving backups under `local-only evidence (omitted from this repository)`.

The strict verifier creates two throwaway candidate accounts only. It checks profile persistence, password/session behavior, owner-scoped export and checkout authorization, JSON export contents and exclusions, expiry/file cleanup, uploaded-CV cleanup, account deletion, the same cookie returning 401 afterward, and restoration of baseline table counts. Never substitute a real user's account into the destructive checks.

### Why deletion is explicit

The ordered relational delete is intentional: `application_events.created_by` and `document_versions.created_by` reference `users` without `onDelete: 'cascade'`. Deleting only the user would therefore fail when those rows exist. M9 explicitly removes dependent rows in the correct order, then deletes the user. M10 should review and migrate those two foreign keys to `ON DELETE CASCADE` before simplifying relational deletion to a single `DELETE FROM users WHERE id = ...`. Uploaded/generated file cleanup will still be required separately.

### Honest retention boundaries

- The opportunity catalog has no `owner_id` and is shared across candidates. A candidate-added entry can be visible to everyone. Exported entries are labeled `sharedCatalogEntries`, not the candidate's private records; account deletion leaves the catalog untouched. This is an unresolved candidate-control gap, not an ownership guarantee. Owner-scoping remains M10 work.
- Feedback survives account deletion with its `user_id` and `workspace_id` removed. This does not guarantee anonymity of identifying details entered into its free text. The settings disclosure states this limitation.
- Exports omit password hashes, session tokens, SMTP/payment secrets, and raw uploaded CV files. Parsed CV text is included. Export files expire after seven days; download/list handling and the running API's periodic cleanup remove expired artifacts.

### No fake payment or email flow

`PAYMENT_PROVIDER=none` is the default. No payment rail is integrated; membership reports not configured, and checkout returns HTTP 501 without calling a provider. Implement the selected real rail in `apps/api/src/paymentProvider.ts` only after the product decision. Merely changing the environment selection does not implement a rail.

`EMAIL_ENABLED=false` is parsed as false. The adapter makes no send call unless email is explicitly enabled and SMTP is configured. Transactional export-ready and password-reset email are wired; inbound email, marketing, and signup email verification are not implemented. Password-reset requests return the same production response whether or not the email exists. In a non-production environment without email, a dev-only reset token is returned for testing. Actual SMTP delivery is not an M9 or M10 test result.

### Mandatory manual browser gates

1. On `/settings`, change the display name, save, reload, and verify persistence. Change the password, sign out, and sign in with the new password.
2. Request an export, reload to see `ready`, and download `careerflow-export-<uuid>.json` through the same-origin route. Open the JSON and verify `user`, `workspaces`, and the labeled shared catalog section.
3. On `/help`, verify all six topics and the “what this is not” section.
4. Submit `/feedback`, verify it in the candidate list and admin `/feedback` list, and verify `admin.view_feedback`/update audit records. The API is `/admin/feedback`; the separate admin UI is `http://localhost:3001/feedback`.
5. On `/membership`, verify plans render “Available at no cost in this deployment” and no control initiates a provider checkout.
6. Use a fresh throwaway signup and delete it through the visible `/settings` form with its password, typed email, and irreversible-deletion acknowledgement. Require all four corrected conditions: the visible deletion completes; the final URL is public `/` and renders the welcome screen with **Create account** and **Sign in** visible; `/auth/me` on the deleted session returns 401; sign-in with the deleted credentials returns 401. A URL of `/` alone is not a pass. Retain the existing workspace-absence and uploaded/generated-file cleanup checks in the strict verifier. Never use a real account.

A passing API verifier is not a substitute for these browser gates. Do not call M9 fully green or start M10 on that basis alone.
<!-- M9 TESTING END -->

### M9 verification receipt — this workspace

**Status: automated gates pass; M9 is not fully green because the mandatory browser gates are blocked. M10 has not started.**

- Final `bash apply-m9.sh` completed successfully. Additive `pnpm db:push` and all seven workspace typecheck scripts passed. The exact final verifier result is `M9 strict synthetic self-verification: PASS` in `local-only evidence (omitted from this repository)`.
- The destructive checks used only accounts created by the verifier. They proved HTTP 200 deletion followed by HTTP 401 with the same session, uploaded-CV and generated-export removal, expiry cleanup, and baseline count restoration.
- Separate local feedback/admin API checks passed: submission and candidate listing, authenticated admin listing, contact-consent email visibility, foreign-Origin refusal, status update and view/update/delete audit entries, retention with account links removed, and 404 without false audit success for a repeated deletion. Receipt: `local-only evidence (omitted from this repository)` and `local-only evidence (omitted from this repository)`.
- Final preservation verification compared all 34 original tables. Thirty-three whole-table count/content fingerprints are identical; all 20 original audit rows are also unchanged. Six intentional test audit events were appended and retained with the deleted synthetic admin's actor link removed. Existing totals remain 21 candidates, 22 workspaces, and 7 applications. All temporary M9 candidate/admin/feedback rows and the generated export rows are gone. Receipt: `local-only evidence (omitted from this repository)`.
- No database reset or seed was run, no real account was deleted, no payment rail was called, and transactional email remained disabled. Actual SMTP delivery was not tested. There is no Git metadata in this workspace; source backups are under `local-only evidence (omitted from this repository)` rather than a Git commit.

| Mandatory manual gate | Result in this run |
| --- | --- |
| Settings name persistence and password sign-out/sign-in | **BLOCKED / not passed** — corresponding API checks pass, but no browser settings edit was completed. |
| Settings ready export, same-origin download, opening downloaded JSON | **BLOCKED / not passed** — API JSON/attachment checks pass; visible download path remains unverified. |
| Help: six topics and “what this is not” | **BLOCKED / not passed** — browser walkthrough not completed. |
| Feedback: submit/list plus admin UI and audit | **BLOCKED / not passed** — dedicated API/audit checks pass; candidate/admin UI flow remains unverified. |
| Membership plans/no-cost label/no provider checkout | **BLOCKED / not passed** — API not-configured/501 checks pass; browser render/control gate remains unverified. |
| Throwaway deletion through visible settings form | **BLOCKED / not passed** — API deletion/session/file cleanup passes; destructive UI flow was not completed. |

The browser did complete one new synthetic signup and showed its authenticated home page. Subsequent screen capture/foreground activation failed and browser execution then timed out even on read-only tab access, while API/web/admin HTTP checks remained healthy. No outcome screenshot could be saved. The synthetic browser account was then deleted through the authenticated API, its session returned 401, and its workspace was verified absent. Do not count that fallback as a passing UI-delete test.

The local API, candidate web app, and admin app remain running on ports 4000, 3000, and 3001. Finish the table's browser checks before declaring M9 green.

### M9 browser retry — 2026-10-29

**Current outcome: browser access became unavailable again after Gates 1–4 passed. M9 remains open; Gates 5–6 are not passed. M10 was neither started nor designed.** This retry supersedes the earlier all-blocked browser table above, not the automated verification history.

| Mandatory manual gate | Current retry result |
| --- | --- |
| 1. Settings name persistence and password reauthentication | **PASS** — saved name survived Control+Shift+R; visible `Password changed.`; new password reached `/home` after sign-out. |
| 2. Export ready after reload, same-origin browser download, opened JSON | **PASS** — completed browser download from `/settings/export/4de57d57-e893-4193-9380-1a7f23e68156`; opened JSON includes `user`, `workspaces`, and `sharedCatalogEntries` with the required shared-catalog note. |
| 3. Help topics and limits | **PASS** — all six topics plus `What CareerFlow is not` rendered; console returned zero errors with zero dropped messages. |
| 4. Candidate/admin feedback and audit | **PASS** — synthetic Bug subject `M9 UI gate` submitted and listed; admin status changed to `acknowledged` and survived reload; `/audit` visibly contained `admin.view_feedback` and `admin.update_feedback` with `{"status":"acknowledged"}`. |
| 5. Membership plans and absence of checkout controls | **BLOCKED / not run** — controller failed before membership navigation. |
| 6. Fresh throwaway deletion through visible settings | **BLOCKED / not run** — no deletion-gate account was created and no visible delete form was submitted. |

At 23:40:23 +02:00 the next browser cell timed out on the first operation, capturing the already inspected admin audit page: `In-app Browser JavaScript cancelled or timed out: context deadline exceeded`, followed by `BROWSER_NOT_READY`. No audit screenshot path was returned. Browser testing stopped with no retry or alternate-browser workaround. No application UI failure was observed; this is a browser-access blocker.

Only the newly created synthetic candidate `26a0278c-9f0b-4a6d-8b77-595f7ed2e3eb`, synthetic admin `104fd594-62f3-413d-84d9-95a58f3c4606`, feedback `8cfc48e3-14b4-46a8-9545-3d3ed1bd2aad`, their sessions/workspace, and generated live export were cleaned up. The authenticated API deletion was cleanup only and **does not pass Gate 6**. Runtime settings confirmed `emailConfigured=false` and `paymentProvider=none`; no external provider call was made.

The retry baseline/final comparison verified every pre-existing row across all 37 current tables and all seven existing stored files unchanged. Final counts are 21 candidates, 22 workspaces, and 7 applications. Thirteen genuine test/cleanup audit events were appended and retained with the deleted synthetic admin's actor links removed; all 26 baseline audit rows were preserved. No reset, seed, application source edit, or M10 work occurred.

Evidence: `local-only evidence (omitted from this repository)`, `local-only evidence (omitted from this repository)`, `local-only evidence (omitted from this repository)`, seven screenshots under `local-only evidence (omitted from this repository)`, and `local-only evidence (omitted from this repository)`. The export evidence copy uses the source-verified attachment filename; the browser's completed artifact path itself was opaque.

### Regressions caught by UI gates

`apps/web/src/app/page.tsx` had been redirecting `/` to `/home` unconditionally for several milestones, hiding the spec screen 1 welcome from every visitor. Tests and walkthroughs began at `/signup`, `/signin`, or `/home`, never the public entry point. M9 Gate 6 exposed the regression: after deletion, `/` immediately redirected through `/home` to `/signin` instead of showing the welcome. The root now checks `/auth/me`: an authenticated user goes to `/home`, while an unauthenticated visitor sees the warm welcome and first-class **Create account** and **Sign in** actions. Fixed in the M9 Gate 6 retest.

Every future test plan must include **load `/` as an unauthenticated visitor and see the welcome** as an explicit first step. Adding that case to the automated smoke suite remains logged follow-up work; no M10 implementation or design was started here.

### M9 Gate 6 root-entry fix and retest — 2026-10-30

**Gate 6: PASS on all four corrected conditions.** Gates 1–5 were already passed according to the owner's current handoff context and were not rerun here. Combined with those prior passes, the M9 gates are green. This receipt supersedes the historical Gate 6 blocked result above, not the earlier automated verification evidence. M10 was not started or designed.

- Applied `bash apply-m9-fix.sh`; exit 0. The requested `pnpm --filter @careerflow/web typecheck` completed successfully (exit 0). The only application-source change is `apps/web/src/app/page.tsx`; the original is preserved at `local-only evidence (omitted from this repository)`.
- Before the fix, an unauthenticated root request returned HTTP 307 with `Location: /home`. Afterward, `/` returns HTTP 200 with no `Location` header and visibly shows the promise, **Create account**, and **Sign in**. The public-route redirect audit found only the intended conditional redirect in the new root page; no other public route redirect was found.
- A fresh synthetic account (identity details withheld) was created through the visible welcome → signup form. Visiting `/` while signed in landed on `/home`; an authenticated diagnostic also redirected to `/home`.
- Through visible Settings, entered the synthetic password and exact email, checked **I understand this is irreversible.**, and clicked **Delete account permanently**. The final browser URL was `http://localhost:3000/` and the welcome rendered with both primary actions visible. Screenshot evidence was retained only in the local workspace and is not included in this repository.
- The browser's `/auth/me` diagnostic showed `unauthenticated`. A separately retained pre-delete session for the same synthetic account returned HTTP 401 from `/auth/me`; its raw cookie was not overwritten by the deletion response. Sign-in with the deleted credentials returned HTTP 401 `invalid_credentials`. The invalidated-session cookie also received HTTP 200 welcome content from `/`, not a redirect. Temporary diagnostic cookie storage was removed afterward.
- Runtime Settings reported `emailConfigured=false` and `paymentProvider=none`. No reset, seed, dependency change, external-provider call, or real-account deletion occurred. No new upload/export files were created in this focused retest; the earlier strict-verifier file-cleanup evidence remains unchanged.

Local backup snapshots and raw HTTP/browser evidence are excluded to avoid publishing private test state. The original workspace had no Git metadata, so verification used the saved original and a unified diff rather than a Git commit.

### M10 verification — 2026-10-30

**M10: PASS.** The two `created_by` foreign keys were verified in PostgreSQL as `ON DELETE CASCADE`. Seven workspace typechecks, the root-page smoke regression, and the synthetic E2E checks passed. The E2E covered password-reset token hashing, expiry, single use under concurrent attempts, identical production responses for existing and unknown email addresses, candidate opportunity ownership and shared-catalog visibility, and account deletion through the new FK cascades. Synthetic accounts were removed and verified absent; recorded pre-existing row counts and shared catalog data were preserved. Email remained disabled, payment provider remained `none`, and no external provider calls were made.

### M11 verification — status

**M11 is not fully green.** The corrected rerun passed seven automated E2E gates, but the visible six-step browser walkthrough did not finish because the prior task stopped. Do not treat M11 as complete until that walkthrough is run and passes.

### Regressions caught by applying runbooks

The first proposed M10 password-reset handler returned different response shapes for an existing account and an unknown email, exposing an account-enumeration signal. The implemented route now returns the same production response (`{ok:true}`) for both. Only non-production with email disabled may receive a dev reset token; token-bearing requests are not written to access logs. The E2E test compares the production response bodies byte-for-byte.

For future runbooks, author scripts as persistent files before executing them; do not rely on transient shell here-docs as the only copy. Before typechecks or other commands that rewrite generated metadata such as `tsconfig.tsbuildinfo`, record a baseline and preserve the originals so generated-file changes can be reviewed safely. This workspace has no Git metadata, so use path-aware backups and a final changed-file inventory.
