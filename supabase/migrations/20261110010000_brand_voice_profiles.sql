-- Brand Voice profiles (2026-11-10, Phase 3 of the Creator Studio transformation).
--
-- BEFORE: public.brand_kits held exactly one kit per user in practice — a colour
-- palette plus a preferred font (font_ids[0]) — read and written by the single-kit
-- route /api/v1/brand (first row by created_at). There was nowhere to store how a
-- creator writes, so the Creator Studio generators could not sound like the user.
--
-- AFTER (this migration): brand_kits doubles as the Brand Voice profile table.
-- Each row is now one named profile:
--   * voice     — the Brand Voice itself (niche, audience, language, tone, writing
--                 style, words to use / avoid, sample captions, preferred CTAs),
--                 stored as one jsonb object and normalised in the app layer
--                 (features/create/brandProfile.ts: normalizeVoice).
--   * is_active — which one profile is the active one; the generators read only
--                 the active profile. The backfill below gives every existing
--                 owner exactly one active profile (their oldest kit) so nobody
--                 loses the kit they already had.
--
-- brand_kits already has row-level security (policy brand_kits_owner_all,
-- owner_id = auth.uid()) and the Data API grants to authenticated + service_role
-- from the base schema, and both cover the new columns automatically — so this
-- migration adds no policies and no grants on purpose.
--
-- Everything here is idempotent: the file can be re-run safely.

alter table public.brand_kits add column if not exists voice jsonb not null default '{}'::jsonb;
alter table public.brand_kits add column if not exists is_active boolean not null default false;

create index if not exists brand_kits_owner_active_idx on public.brand_kits (owner_id, is_active);

-- Backfill: mark the OLDEST row per owner active, but only for owners who have
-- no active row yet. On a re-run every owner already has one, the NOT EXISTS
-- guard matches nothing, and the update is a no-op. The id tie-break keeps the
-- choice deterministic when two rows share a created_at.
update public.brand_kits bk
   set is_active = true
 where bk.id in (
         select distinct on (cand.owner_id) cand.id
           from public.brand_kits cand
          order by cand.owner_id, cand.created_at asc, cand.id asc
       )
   and not exists (
         select 1
           from public.brand_kits cur
          where cur.owner_id = bk.owner_id
            and cur.is_active = true
       );
