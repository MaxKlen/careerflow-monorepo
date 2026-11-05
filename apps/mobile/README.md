# CareerFlow Mobile README v1.1

> Production NOT READY; 0/5 P0 gates closed; full-platform completion NOT CALCULABLE; no readiness %.

Baseline set by the Project Director under owner delegation dated 2026-10-31.

No video approved; owner listening required.

Frozen code/media snapshot: branch `feature/admin-demo-preview-zero-cost`; HEAD `1b5bac24479d74fa4898f494e5c23489c21f94aa`; manifest SHA-256 `67a7e6e05dc72cab3738ab49ee34dd515e25ecea42ef348c7101246cc9e25eaf` (220/220 paths verified).

CareerFlow Mobile is an Expo companion for the local-first, synthetic-data candidate demo. Web/iOS/Android export and automated tests do not establish physical-device behavior. Use fictional, non-sensitive records only.

## Screens and sample-only sections

The bottom navigation includes Home, Tasks, Profile, Journey, Coach, Guide, Join and Admin. Home links to local Evidence Library and Applications follow-through screens. Profile contains career details, CV text, manually captured LinkedIn notes and document drafts.

Join offers a local sample session, demo profile creation and illustrative Starter/Plus/Pro tiers. It creates no real account, paid entitlement or payment. Admin displays fictional members, sample usage, illustrative tiers and a $0.00 ledger. Its controls change only sample rows; there is no admin authentication, live analytics, checkout or financial service (`mobile/src/screens/JoinScreen.tsx`, `mobile/src/screens/AdminDashboardScreen.tsx`).

## Applications, evidence and documents

Applications and follow-ups are candidate-authored local records. Materials outlines are editable and preserve source record IDs, timestamps and text. A text export is user-initiated; nothing is submitted to an employer.

Evidence examples are local and user-authored; they are not independently verified or automatically tailored. Plain-text `.txt` and `.md` CV files can be imported. For PDF/Word, paste text into the editor. LinkedIn capture is manual paste only; there is no LinkedIn login or scraping. Local drafts are not encrypted by the app, uploaded, synced or automatically backed up.

## Offline Coach and optional connected endpoint

The deterministic offline Coach works without a service. `EXPO_PUBLIC_COACH_ENDPOINT` is optional at build time. It was unset in the checked execution environment at 2026-10-31 18:03:54 (+02:00); `mobile/src/coach.ts:4` returns `null` when the value is absent. This does not establish the setting in other distributions. The active Expo entry is `main: expo-router/entry` (`mobile/package.json:5`).

If a build supplies an endpoint, the Coach screen shows its destination and requests one-time permission before each connected request (`mobile/src/app/(tabs)/coach.tsx:22–50`). The request sends `profile`, `tasks` and `milestones`; CV, LinkedIn and other document drafts are not sent. Choosing **Use offline** keeps the request on-device. No endpoint value or URL is recorded here.

## Local storage, migration and backup

Career state, workspace fields, applications, evidence and demo state are stored in one versioned AsyncStorage record. Migration reads both legacy keys, merges the values, writes the combined record, verifies the readback, and only then deletes the old keys. When a read/write/verification step fails, original legacy data remains available for retry; interrupted cleanup resumes from remaining keys. A malformed legacy value is preserved with recovery data where possible.

Autosaves serialize changes into one record and verify the full value. On write failure, the previous raw record is restored and verified; if rollback cannot be confirmed, recovery data is preserved when possible and the operation reports failure. Manual backup/restore uses the same combined-record boundary.

On failed backup-restore rollback, `mobile/src/localBackup.ts:167–169` leaves any existing recovery snapshot byte-for-byte untouched. If no snapshot exists, capture of the previous record is best-effort. The regression `does not overwrite an existing recovery snapshot when restore rollback fails` is in `mobile/tests/local-backup.test.mjs:251–283`; the focused storage suite is 13/13 and the final full mobile suite is 92/92. Six React `act(...)` warnings belong to the web Vitest run and did not fail its 177 tests.

The app has no screen to inspect or restore a recovery snapshot. Keep/export a manual JSON backup and stop further writes after rollback failure. The manual JSON backup can contain profile, application, evidence, CV, LinkedIn and document text; keep it private. It is not cloud backup, automatic recovery or cross-device sync. Physical AsyncStorage/iPhone acceptance remains a separate Blocked external check.

## Run with Expo Go

```bash
pnpm install
pnpm start --tunnel ngrok --go
```

Other scripts: `pnpm test`, `pnpm typecheck`, `pnpm android`, `pnpm ios`, and `pnpm web`. Final regression exported web, iOS and Android successfully; no physical-device test or store build is claimed. The separate [post-regression documentation snapshot](../docs/CareerFlow_Documentation_Snapshot_2026-10-31_v1.0.md) is not the code/media manifest.
