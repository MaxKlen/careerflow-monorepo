# CareerFlow Privacy and Retention Draft

**Status:** Working product draft; not legal advice and not approved for publication.

## Purpose and data categories

CareerFlow is designed around candidate-controlled career data. Depending on the enabled workflow, the service may process account identifiers, profile and direction content, evidence and application records, uploaded CV files and parsed text, documents and provenance, interview reflections, growth records, notifications, feedback, export files, and employer invitation/projection data. Connected MEH and email are optional integrations and should remain disabled until their provider, data-flow, and consent terms are approved.

## Product-level controls currently represented in code

Authenticated records are scoped to workspaces in the main candidate flows. Employer invitations expose only the intended projection and use hashed bearer tokens. Connected MEH requires explicit consent and is distinct from offline mode. Exports exclude passwords, session tokens, provider secrets, and raw uploaded CV files while including parsed profile data. Account deletion removes the account-owned application records and uploaded/generated files through the application deletion path. Export files expire after a configured period.

These statements describe source behavior and local validation targets; they are not an independent privacy certification.

## Retention decisions requiring owner approval

The owner must approve retention periods for accounts, uploaded files, parsed CV text, exports, logs, feedback, employer invitation records, backups, and provider-side copies. The owner must also decide how long expired export artifacts and infrastructure backups remain recoverable, and whether feedback remains after account deletion with account/workspace links removed. Free-text feedback can contain identifying information entered by the user and should not be described as automatically anonymous.

### Proposed default retention table

The following are **proposed defaults, pending owner and legal approval**. They are planning values only and must not be presented to participants as final policy until approved and implemented consistently across the application, providers, logs, and backups.

| Data category                      |                                         Proposed default | Deletion or expiry behavior                                                                                                  | Approval status                            |
| ---------------------------------- | -------------------------------------------------------: | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| Accounts and account-owned records |           Until user deletion or 24 months of inactivity | User-requested deletion removes account-owned application records; dormant-account policy requires owner decision and notice | Proposed, pending owner and legal approval |
| Uploaded CV files                  |                  Until parsing/confirmation plus 30 days | Remove on account deletion; routine cleanup should remove files past the approved window                                     | Proposed, pending owner and legal approval |
| Parsed CV text and profile data    |               Until user deletion or profile replacement | Included in exports; removed through account deletion subject to backup retention                                            | Proposed, pending owner and legal approval |
| Data exports                       |                                   7 days after readiness | Download route and cleanup remove expired artifacts; backups may retain copies longer                                        | Proposed, pending owner and legal approval |
| Application and security logs      |                                                  30 days | Redact secrets and minimize personal data; security-incident preservation requires documented exception                      | Proposed, pending owner and legal approval |
| Feedback                           | 24 months after submission or until support purpose ends | Account links may be removed on deletion while user-entered identifying text can remain                                      | Proposed, pending owner and legal approval |
| Employer invitations               |                     Until expiry/revocation plus 30 days | Hash tokens; remove or anonymize after the approved operational window                                                       | Proposed, pending owner and legal approval |
| Database and upload backups        |                                          35 days rolling | Deletion propagates according to backup expiry; restore drills must use synthetic or approved data                           | Proposed, pending owner and legal approval |

## Participant and employer disclosures

Before a pilot, participants should receive clear disclosures covering what is collected, why it is processed, optional integrations, employer projections, deletion limits caused by backups or third-party providers, support contact, and the pilot's withdrawal/sign-off process. Employer users should be told exactly which candidate-approved application fields and evidence links are visible.

## Approval gates

This draft requires review by the product owner and qualified privacy/legal counsel before publication or collection of real participant data. It does not replace terms of service, a data-processing agreement, a processor inventory, a breach-response plan, or participant release/sign-off.
