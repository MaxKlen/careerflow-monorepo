# M11 Visible Walkthrough Record

**Status:** Blocked — not performed in this cycle.

**Required distinction:** This is the visible walkthrough, not the automated Playwright test. CI run `41556567174` passed the automated M11 flow, but that does not satisfy this record.

## Environment blocker

The current sandbox has no Docker, Docker Compose, PostgreSQL server, or running CareerFlow services on ports 3000, 3002, 4000, or 5432. The requested walkthrough requires isolated local services with synthetic data. No external deployment, provider, account, or spending action was used as a substitute.

## Required steps

| Step | Required visible action                                                 | Result        | Evidence / blocker                              |
| ---- | ----------------------------------------------------------------------- | ------------- | ----------------------------------------------- |
| 1    | Employer creates an invitation for a candidate.                         | Not performed | Blocked by unavailable isolated local services. |
| 2    | Candidate receives the invitation, accepts, and sees the projection.    | Not performed | Blocked by unavailable isolated local services. |
| 3    | Candidate data controls are visible: what is projected and what is not. | Not performed | Blocked by unavailable isolated local services. |
| 4    | Candidate withdraws or revokes access; verify the projection drops.     | Not performed | Blocked by unavailable isolated local services. |
| 5    | Employer sees the updated projection state.                             | Not performed | Blocked by unavailable isolated local services. |

No UI defect was claimed or fixed from this blocked walkthrough. The automated M11 evidence remains separate and is recorded in the gap analysis and PR #3.
