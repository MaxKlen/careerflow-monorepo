# What Correct Looks Like — M11 Visible Walkthrough

This document is the source-grounded target for the owner-run visible walkthrough. It describes the current implemented flow, which is candidate-controlled employer invitation and employer projection. It is not a substitute for runtime screenshots or the visible walkthrough.

## Step 1 — Candidate creates an invitation for an employer

**URL:** `http://localhost:3000/applications/<applicationId>` after candidate sign-in.

**Action:** In the “Invite employer to review this application” card, enter the synthetic employer email and click **Invite**. If email is disabled, copy the displayed development-only invitation URL. The current implementation is candidate-originated; it does not provide an employer-originated “invite candidate” flow.

**Expected visible outcome:** “Invitation created.” appears. The invitation list shows the employer email with status `pending`, and a development-only invitation URL is shown when email is disabled.

**Expected network call:** `POST /applications/<applicationId>/invitations` with candidate credentials, `Origin: http://localhost:3000`, and `{ "employerEmail": "..." }`; expected status `201`. The page then calls `GET /applications/<applicationId>/invitations`; expected status `200`.

**Expected database state:** One `employerInvitations` row exists for the application and employer email with a hashed token, future expiry, `usedAt = null`, and `revokedAt = null`. No external email is sent when `EMAIL_ENABLED=false`.

**Common failure modes:** `403 invalid_origin` means the candidate origin does not match `APP_URL`; `404 not_found` means the candidate does not own the application; `409 invitation_already_pending` means an active invitation already exists; no development URL means email mode is enabled and must remain disabled for this synthetic walkthrough.

## Step 2 — Employer accepts the invitation and sees the projection

**URL:** The printed invitation URL, `http://localhost:3002/accept#token=<token>`.

**Action:** Open the URL in the employer browser. Confirm the preview, enter the synthetic company name and a password of at least 10 characters, then click **Create employer account**.

**Expected visible outcome:** The acceptance surface shows “Accept invitation,” the opportunity title/company, employer email, and expiry. After signup, the browser navigates to `/applications/<applicationId>` and displays the opportunity title as the page heading.

**Expected network calls:** First `POST /employer/invitations/preview` with `{ "token": "..." }`; expected status `200`. Then `POST /employer/auth/signup` with employer email, password, company name, and invitation token; expected status `200` and an employer session cookie. The page then calls `POST /employer/invitations/accept` with the token and the employer origin; expected status `200` with `applicationId`. Finally `GET /employer/applications/<applicationId>` should return `200` after navigation.

**Expected database state:** A synthetic `employerUsers` row exists. The invitation has `usedAt` set and `employerUserId` set. The employer session exists only in the ephemeral runtime.

**Common failure modes:** `404 not_found`, `410 revoked/already_used/expired`, or `400 invalid_invitation` means the token is invalid or no longer active; `400 email_mismatch` means the employer email differs from the invitation; `403 invalid_origin` means the employer URL does not match `EMPLOYER_URL`; failure to navigate usually indicates signup or acceptance did not return the expected `applicationId`.

## Step 3 — Candidate data controls are visible

**URL:** Candidate application page at `http://localhost:3000/applications/<applicationId>` and employer projection at `http://localhost:3002/applications/<applicationId>`.

**Action:** On the candidate page, inspect the disclosure beside the invitation control. Compare it with the employer projection after acceptance. Confirm that the employer view contains only the application’s approved projection, not the candidate profile, other applications, the evidence library, or the candidate email.

**Expected visible outcome:** The candidate disclosure states that the employer sees only attached documents and requirements with confirmed evidence. The employer page shows the role/company/stage, attached documents with latest content/provenance, and only requirements whose evidence links are explicitly `linked`.

**Expected network call:** `GET /employer/applications/<applicationId>` with the employer session; expected status `200`. The response body should contain `application`, `documents`, and `requirements`, with secrets redacted from any captured evidence.

**Expected database state:** No candidate data is copied into the employer account. A projection view inserts an `applicationEvents` note with `kind = note` and `sourceType = employer_action`; no unrelated candidate data is exposed.

**Common failure modes:** A `401` means the employer session is absent; `404 not_found` means the invitation is no longer active for that employer; extra profile/other-application/evidence-library data in the response is a data-integrity defect; a requirement without an explicitly linked evidence record appearing in the projection is a filtering defect.

## Step 4 — Candidate revokes access and the projection drops

**URL:** Candidate application page at `http://localhost:3000/applications/<applicationId>`.

**Action:** Use the invitation list’s **revoke** control and then refresh the employer projection. The current UI only renders the revoke button while the invitation is pending (`usedAt` is null). If the invitation has already been accepted, the UI does not expose that button even though the API route can update `revokedAt`; this is a known source-level walkthrough risk requiring owner observation and, if confirmed as a product requirement, a scoped code fix in a later cycle.

**Expected visible outcome:** After a visible revoke action, the candidate invitation status becomes `revoked`. The employer projection becomes inaccessible or disappears from the employer application list after refresh.

**Expected network call:** `DELETE /applications/<applicationId>/invitations/<invitationId>` with candidate credentials and candidate origin; expected status `200`. Then `GET /employer/applications/<applicationId>` should return `404`, and `GET /employer/applications` should no longer include the application.

**Expected database state:** The invitation row has `revokedAt` set. Employer authorization filters revoked invitations, so the application is no longer projectable.

**Common failure modes:** No revoke button after acceptance is the source-level UI limitation described above; `403 invalid_origin` indicates an incorrect candidate origin; a successful delete followed by a still-visible projection is a data-isolation defect; a failed delete with a missing invitation ID indicates stale candidate UI state.

## Step 5 — Employer sees the updated projection state

**URL:** Employer application list at `http://localhost:3002/applications` and prior detail URL at `/applications/<applicationId>`.

**Action:** Refresh the employer list and revisit the prior detail URL after candidate revocation.

**Expected visible outcome:** The application is absent from the employer list, and the detail page shows “Not accessible” or an equivalent not-found state. The employer cannot recover access by refreshing or reusing the old invitation token.

**Expected network call:** `GET /employer/applications`; expected status `200` with the application absent. `GET /employer/applications/<applicationId>`; expected status `404`.

**Expected database state:** The invitation remains associated with the application but has `revokedAt` set; no new employer authorization row is created.

**Common failure modes:** The application remains listed or detail remains accessible after revocation if the projection query does not filter `revokedAt`; a `200` detail response after revocation is a data-integrity blocker; a `401` instead of a scoped `404` indicates the employer session was lost and the step must be repeated with the session preserved.
