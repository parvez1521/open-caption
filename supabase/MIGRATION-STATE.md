# Migration state — live database vs this repo

Standing note (Phase 8 slice 8.3, 2026-11-10). The app has no Supabase CLI /
access-token path in the build environment, so schema lands on the live
project (`nwqmmvqobjxguvfxeafs`, Open Caption) when the owner pastes an
`APPLY-*.sql` file into the SQL Editor. This file records what is known
about the LIVE state so nobody has to re-derive it. Statuses reflect the
programme log through Phase 7 plus the parent verification noted below;
when an APPLY file is run, update its row here in the same change.

## Project expiry (persistence) — VERIFIED LIVE 2026-11-10

Verified by the parent on 2026-11-10 in the signed-in SQL Editor (this
supersedes the earlier "log-evidenced only" caveat in the Phase-2
persistence research note):

- Registered (non-anonymous) users' projects **never expire**.
- Only anonymous-guest projects are eligible, and only when **both**
  `created_at` **and** `updated_at` are older than the window.
- The window has a hard floor of **720 hours** (30 days) inside
  `public.delete_expired_projects` — no caller can shrink it.
- The guest predicate is on `auth.users.is_anonymous`.
- pg_cron job `capseasy-expire-projects` runs **daily** at `15 3 * * *`
  calling `select public.delete_expired_projects(720, 500)`.

Source: `migrations/20261110000000_project_persistence.sql` /
`APPLY-FIX-PROJECT-EXPIRY.sql`. App-side guest-account cleanup (stale
guest users after 7 days away) is separate: the Vercel cron
`/api/cron/cleanup`, already guest-scoped.

## Stage C composition column — APPLIED + ACTIVATED

- `projects.composition_json` exists live (applied + verified
  2026-11-10); the backfill promoted 1 of 7 projects at apply time, the
  rest stay NULL by design and are promoted lazily on first Stage-C read.
- App state: `STAGE_C_ENABLED = true` (`features/studio/stageC.ts`).
  Writes dual-write (settings-embedded copy + primary column); loads
  prefer the column and fall back to the settings copy. Pre-Stage-C
  projects open unchanged.
- Source: `migrations/20261110030000_composition_primary.sql` /
  `APPLY-COMPOSITION-PRIMARY.sql`.

## APPLY files — status as of Phase 8 (2026-11-10)

| APPLY file | Migration | Status |
|---|---|---|
| `APPLY-ALL-SCHEMA.sql` | base schema aggregate | Bootstrap aggregate for a fresh project; not tracked per-step here. |
| `APPLY-FIX-PROJECT-EXPIRY.sql` | `20261110000000_project_persistence.sql` | **Applied + verified live** (see expiry section above). |
| `APPLY-BRAND-VOICE-PROFILES.sql` | `20261110010000_brand_voice_profiles.sql` | Applied — Brand Voice profiles are live in production (Phase 3). |
| `APPLY-CONTENT-LIBRARY.sql` | `20261110020000_content_library.sql` | Applied — the server-side content library / chat storage is live (Phase 3). |
| `APPLY-COMPOSITION-PRIMARY.sql` | `20261110030000_composition_primary.sql` | **Applied + verified live** (see Stage C section above). |
| `APPLY-CAPTION-TRANSLATIONS.sql` | `20261110040000_caption_translations.sql` | **Applied + verified live** 2026-11-10 (table, RLS, owner policy, unique index checked after apply). |
| `APPLY-GROWTH-STUDIO.sql` | `20261110050000_growth_studio.sql` | **Applied + verified live** 2026-11-10 (both tables, RLS + owner policies checked after apply). |
| `APPLY-PROJECT-FOLDERS-TAGS.sql` | `20261110060000_project_folders_tags.sql` | **Applied + verified live** 2026-11-10 ~22:52 IST (folder + tags columns, both indexes; RLS unchanged) — corrected in Phase 9 W1: this row still said PENDING after the apply. The honest-degradation path (`org_ready:false`, pending-message writes) remains in code for any not-yet-migrated environment. |
| `APPLY-BILLING.sql` | `20261111000000_billing.sql` | **NOT applied yet** (Completion programme Phase B, 2026-11-11). Adds `profiles.plan_expires_at` + the `payments` table (owner-read RLS, service-role writes only). Until it is applied: checkout answers `configured:false, dbPending:true`, billing/me returns an empty payment list, and plan enforcement reads Free limits for everyone (today's behaviour). Owner step: paste STEP 1 → run, STEP 2 → run, STEP 3 → run in the SQL Editor (project `nwqmmvqobjxguvfxeafs`). |

## Guest → account claim flow (code-level state, Phase 8 re-verification)

A guest who signs in to an EXISTING account keeps their work:
`services/auth/guest.ts` stashes the guest's tokens before sign-in
(`rememberGuestForClaim`), `/start` runs `claimPendingGuest()` after
sign-in, and `POST /api/v1/guest/claim` verifies the tokens really belong
to an anonymous guest, then re-owners every guest-owned table (projects,
videos, transcripts, caption documents + versions + translations, jobs,
exports, user looks, brand kits, user fonts, usage events) and merges
`favorite_looks`. Linking an identity onto the guest user (email/Google
link) keeps the same user id, so no move is needed on that path.
**Dedicated tests landed in Phase 9 W1 (2026-11-10):**
`apps/frontend/src/app/api/v1/guest/claim/__tests__/route.test.ts`
(13 tests: re-ownership across all OWNED tables, favorite_looks merge,
token-verification no-ops, double-claim idempotency, no-rollback
failure behaviour) and
`apps/frontend/src/services/auth/__tests__/guest-claim.test.ts`
(8 tests for the stash/claim helpers). The helper suite caught W1-A1:
the stash was deleted before the claim request, so a transient failure
permanently orphaned the guest's work — fixed; the stash now clears
only after a successful hand-off (or on expiry/corruption).
