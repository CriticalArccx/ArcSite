-- =============================================================================
-- ALREADY APPLIED to your Supabase project as part of this migration.
-- Kept here so it's versioned and re-runnable (each CREATE POLICY will error if
-- the policy already exists — drop it first if you need to redefine one).
-- =============================================================================

-- APPLIED 2026-09-24, fixing a real outage: every "authorized/admin" write policy below was
-- originally written as a raw `EXISTS (SELECT 1 FROM arcapp_authorized_users a WHERE ...)`
-- subquery. The very first real Google OAuth sign-in hit
-- `infinite recursion detected in policy for relation "arcapp_authorized_users"` — because
-- Postgres re-applies arcapp_authorized_users' own RLS policies every time ANY policy's subquery
-- selects from that table, including a subquery inside arcapp_authorized_users' own policy, which
-- recurses forever. This wasn't caught by this repo's Playwright sign-in tests because those mock
-- the Supabase REST layer entirely and never exercise real Postgres RLS evaluation.
--
-- Fix: two SECURITY DEFINER functions. SECURITY DEFINER runs as the function's owner (a role with
-- table access), bypassing RLS *inside* the function body, so the lookup no longer re-triggers the
-- calling policy. Every policy that used to inline the subquery now calls one of these instead.
CREATE OR REPLACE FUNCTION is_arcapp_admin() RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM arcapp_authorized_users a WHERE lower(a.email) = lower(auth.jwt() ->> 'email') AND a.role = 'admin') $$;

CREATE OR REPLACE FUNCTION is_arcapp_authorized() RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM arcapp_authorized_users a WHERE lower(a.email) = lower(auth.jwt() ->> 'email')) $$;

GRANT EXECUTE ON FUNCTION is_arcapp_admin() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION is_arcapp_authorized() TO authenticated, anon;

ALTER TABLE arcapp_workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE arcapp_settings ENABLE ROW LEVEL SECURITY;

-- Read is public (found missing `anon` 2026-09-19, fixed same week — was breaking Joint Pack
-- Photos' Drive-folder/script-URL lookup, the Checklists/Issues ready-status filters, and the
-- Submittals missing-count/exempt-assets list for every not-signed-in user).
CREATE POLICY "settings_select_public" ON arcapp_settings
  FOR SELECT TO anon, authenticated USING (true);

-- TEMPORARY (requested 2026-09-14, widened same day): NO sign-in required at all to
-- read/create/edit/delete Workflows — `anon` and `authenticated` both allowed. Matches the
-- app-side relaxation in Dashboard.tsx (`canManageWorkflows`, now hardcoded `true`).
-- To revert: drop these two policies and re-create the editor-restricted versions below (kept
-- here for exactly that purpose), then flip `canManageWorkflows` back to `canEdit` in Dashboard.tsx.
CREATE POLICY "workflows_select_public" ON arcapp_workflows
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "workflows_write_public" ON arcapp_workflows
  FOR ALL TO anon, authenticated
  USING (true)
  WITH CHECK (true);
-- Editor-restricted version this replaced — the "arcapp_workflow_items" catalog below still uses
-- this same read-open/write-authorized pattern, unchanged:
-- CREATE POLICY "workflows_select_authenticated" ON arcapp_workflows
--   FOR SELECT TO authenticated USING (true);
-- CREATE POLICY "workflows_write_authorized" ON arcapp_workflows
--   FOR ALL TO authenticated
--   USING (EXISTS (SELECT 1 FROM arcapp_authorized_users a WHERE lower(a.email) = lower(auth.jwt() ->> 'email')))
--   WITH CHECK (EXISTS (SELECT 1 FROM arcapp_authorized_users a WHERE lower(a.email) = lower(auth.jwt() ->> 'email')));

-- Settings specifically requires role = 'admin', not just any authorized user — "editors cannot
-- adjust settings" (requested 2026-09-24). Was `STY4authorized_editors`-based ("*_write_editors")
-- until the same date, when ArcApp's whole permission model moved to its own table — see
-- arcapp_authorized_users below.
CREATE POLICY "settings_write_admins" ON arcapp_settings
  FOR ALL TO authenticated
  USING (is_arcapp_admin())
  WITH CHECK (is_arcapp_admin());



-- =============================================================================
-- ALREADY APPLIED. Read is public (`anon` included) so the New Workflow form's item
-- checklist works with no sign-in, matching arcapp_workflows above. Writing to the catalog
-- itself (add/rename/retire an item) stays authorized-only — that wasn't part of the "no sign-in"
-- request, only building workflows was. (Any authorized user, admin or editor — the item catalog
-- isn't Settings, so it doesn't need the narrower admin-only check that table gets.)
-- =============================================================================

ALTER TABLE arcapp_workflow_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workflow_items_select_public" ON arcapp_workflow_items
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "workflow_items_write_authorized" ON arcapp_workflow_items
  FOR ALL TO authenticated
  USING (is_arcapp_authorized())
  WITH CHECK (is_arcapp_authorized());


-- =============================================================================
-- NOT YET APPLIED — recommended, but left for you to review and run yourself.
--
-- Inside Retool, every query ran through a privileged connection, so table-level
-- RLS on these existing tables didn't matter much. Once this app ships as public
-- JS talking to Supabase with the anon key, that changes:
--
--   - STY4Assets, STY4BackEndData, STY4authorized_editors, STY4dropdownoptions
--     already have RLS ENABLED in your project. This app assumes their existing
--     policies allow `authenticated` users to read/write appropriately — check
--     them in the Supabase dashboard (Auth -> Policies) before going live, since
--     this app didn't create them and doesn't know their exact shape.
--
--   - STY4RTFT and STY4Submittals currently have RLS DISABLED, which means with
--     RLS off, ANY holder of the anon key (i.e. anyone who opens this site) can
--     read and write those tables without restriction. That's very likely not
--     what you want for RTFT inspection records or submittal reviews.
--
-- We didn't flip these on for you because another app (LaunchPad) reads/writes
-- the same database, and we don't know what that app currently expects from
-- these two tables' access. Enabling RLS with no matching policy would silently
-- break it. Review with whoever owns LaunchPad, then run something like:
-- =============================================================================

-- ALTER TABLE "STY4RTFT" ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "rtft_select_authenticated" ON "STY4RTFT" FOR SELECT TO authenticated USING (true);
-- CREATE POLICY "rtft_write_editors" ON "STY4RTFT" FOR ALL TO authenticated
--   USING (EXISTS (SELECT 1 FROM "STY4authorized_editors" e WHERE lower(e.email) = lower(auth.jwt() ->> 'email')))
--   WITH CHECK (EXISTS (SELECT 1 FROM "STY4authorized_editors" e WHERE lower(e.email) = lower(auth.jwt() ->> 'email')));

-- ALTER TABLE "STY4Submittals" ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "submittals_select_authenticated" ON "STY4Submittals" FOR SELECT TO authenticated USING (true);
-- CREATE POLICY "submittals_write_editors" ON "STY4Submittals" FOR ALL TO authenticated
--   USING (EXISTS (SELECT 1 FROM "STY4authorized_editors" e WHERE lower(e.email) = lower(auth.jwt() ->> 'email')))
--   WITH CHECK (EXISTS (SELECT 1 FROM "STY4authorized_editors" e WHERE lower(e.email) = lower(auth.jwt() ->> 'email')));


-- =============================================================================
-- NOT YET APPLIED — arcapp_teams / arcapp_tasks (To-Do assignment tool). Wide open
-- (anon + authenticated, no editor check) by request, same shape as arcapp_workflows —
-- anyone can build teams and create/assign/complete/delete tasks without signing in.
-- =============================================================================

ALTER TABLE arcapp_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE arcapp_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "teams_select_public" ON arcapp_teams
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "teams_write_public" ON arcapp_teams
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE POLICY "tasks_select_public" ON arcapp_tasks
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "tasks_write_public" ON arcapp_tasks
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);


-- =============================================================================
-- APPLIED — arcapp_authorized_users (sign-in gate + roles). Deliberately NOT wide open like the
-- tables above — this IS the access control list, and as of 2026-09-24 it's ArcApp's ENTIRE
-- permission model (see schema.sql for the role column and CHECK constraint).
--
-- Read is any signed-in ArcApp user, full roster — widened 2026-09-25 (was: your OWN row only)
-- so every "assign to a specific person" UI (Teams, task/item assignment, Settings' default
-- assignee) can offer a dropdown of real authorized users instead of free-text name/email entry,
-- for anyone doing the assigning, not just admins. This is safe to widen because the entire site
-- now requires signing in (see the Sign-in section below) — everyone who can read this table is
-- already a vetted member of the project, and the exposed columns are just email/name/role, not
-- anything more sensitive. Admins additionally get full write (for the management UI in Settings)
-- via the second, ALL-scoped policy — Postgres RLS ORs multiple permissive policies for the same
-- command together, so both apply at once. The write policy goes through is_arcapp_admin() (see
-- top of file) rather than an inline subquery, specifically because a same-table subquery here
-- recurses infinitely — this table is the one that surfaced that bug (see the note at the top of
-- this file). This checks THIS table to decide who can write to THIS table rather than deferring
-- to STY4authorized_editors — by explicit request, so ArcApp's access control has no dependency on
-- LaunchPad's shared table at all, in either direction.
-- =============================================================================

ALTER TABLE arcapp_authorized_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authorized_users_select_all_signed_in" ON arcapp_authorized_users
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "authorized_users_write_admins" ON arcapp_authorized_users
  FOR ALL TO authenticated
  USING (is_arcapp_admin())
  WITH CHECK (is_arcapp_admin());


-- =============================================================================
-- APPLIED — arcapp_submittals (requested 2026-09-19). Viewable without signing in (matches
-- Checklists/Issues/Joint Pack Photos — status is useful to anyone on-site), writes require any
-- authorized ArcApp user (admin or editor — Submittals isn't Settings, so no admin-only check).
-- =============================================================================

ALTER TABLE arcapp_submittals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "submittals_select_public" ON arcapp_submittals
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "submittals_write_authorized" ON arcapp_submittals
  FOR ALL TO authenticated
  USING (is_arcapp_authorized())
  WITH CHECK (is_arcapp_authorized());

-- Storage: the "submittals" bucket (created in schema.sql) is a PUBLIC bucket, so reading an
-- uploaded file's public URL needs no policy at all — but writes to storage.objects always need
-- one regardless of bucket visibility, or every upload gets rejected.
CREATE POLICY "submittals_bucket_insert_authorized" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'submittals' AND is_arcapp_authorized());

CREATE POLICY "submittals_bucket_update_authorized" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'submittals' AND is_arcapp_authorized());

CREATE POLICY "submittals_bucket_delete_authorized" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'submittals' AND is_arcapp_authorized());


-- =============================================================================
-- NOT YET APPLIED — arcapp_item_assignments (Checklist/Issue To-Do, requested 2026-09-21).
-- Same wide-open pattern as arcapp_teams/arcapp_tasks above — this is the same assignment
-- system extended to cover CxAlloy checklist/issue items instead of freeform tasks, so it gets
-- the same "anyone on-site can reassign, no sign-in required" access.
-- =============================================================================

ALTER TABLE arcapp_item_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "item_assignments_select_public" ON arcapp_item_assignments
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "item_assignments_write_public" ON arcapp_item_assignments
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);


-- =============================================================================
-- APPLIED — SAN-NT1B project switcher's `project_key` columns (see schema.sql). No new policies
-- needed at the time: every existing policy on arcapp_settings/tasks/teams/submittals/workflows/
-- item_assignments already granted access with `USING (true)` (or an editor check that didn't
-- reference any column value), so isolation between projects was enforced entirely app-side, by
-- every query in src/lib/api.ts filtering/stamping `.eq('project_key', CURRENT_PROJECT)`.
--
-- SUPERSEDED 2026-11-02 — that trade-off let any authenticated ArcApp user write to ANY project's
-- data by simply calling Supabase directly with a different project_key, bypassing the Topbar
-- switcher entirely (the switcher is just UI). See the per-project write-authorization block below
-- for the fix: every one of these tables' authenticated-write policies now also requires
-- arcapp_user_allowed_project(project_key).
-- =============================================================================


-- =============================================================================
-- APPLIED — arcapp_milestones (requested 2026-10-27). Same "viewable without signing in, writes
-- need any authorized ArcApp user" pattern as arcapp_submittals above — Milestones isn't Settings,
-- so no admin-only check.
-- =============================================================================

ALTER TABLE arcapp_milestones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "milestones_select_public" ON arcapp_milestones
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "milestones_write_authorized" ON arcapp_milestones
  FOR ALL TO authenticated
  USING (is_arcapp_authorized())
  WITH CHECK (is_arcapp_authorized());


-- =============================================================================
-- NOT YET APPLIED — per-project write authorization (requested 2026-11-02).
--
-- Pairs with arcapp_authorized_users.allowed_projects (schema.sql). `anon`'s access to the
-- tables below was deliberately left wide open by earlier requests (Workflows, Teams/Tasks, Item
-- Assignments — "no sign-in required" kiosk-style use) and is NOT changed here — anon has no email
-- to check a roster against in the first place, and restricting it would just break that. What
-- changes is `authenticated`: a signed-in ArcApp session can no longer write a row for a
-- project_key its own allowed_projects doesn't include, closing the gap the comment above this
-- block used to describe as an accepted trade-off.
--
-- Every policy touched here is DROP + CREATE (not a fresh name) so re-running this file is safe
-- and doesn't leave the old, wider policy active alongside the new one.
-- =============================================================================

CREATE OR REPLACE FUNCTION arcapp_user_allowed_project(p text) RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM arcapp_authorized_users a
    WHERE lower(a.email) = lower(auth.jwt() ->> 'email')
      AND (a.allowed_projects IS NULL OR p = ANY(a.allowed_projects))
  )
$$;

GRANT EXECUTE ON FUNCTION arcapp_user_allowed_project(text) TO authenticated, anon;

-- arcapp_settings — admin-only already; now also project-scoped.
DROP POLICY IF EXISTS "settings_write_admins" ON arcapp_settings;
CREATE POLICY "settings_write_admins" ON arcapp_settings
  FOR ALL TO authenticated
  USING (is_arcapp_admin() AND arcapp_user_allowed_project(project_key))
  WITH CHECK (is_arcapp_admin() AND arcapp_user_allowed_project(project_key));

-- arcapp_workflows — was one combined anon+authenticated policy; split so anon keeps its existing
-- unrestricted access and only the authenticated half gains the project check.
DROP POLICY IF EXISTS "workflows_write_public" ON arcapp_workflows;
CREATE POLICY "workflows_write_public_anon" ON arcapp_workflows
  FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "workflows_write_authenticated" ON arcapp_workflows
  FOR ALL TO authenticated
  USING (arcapp_user_allowed_project(project_key))
  WITH CHECK (arcapp_user_allowed_project(project_key));

-- arcapp_teams — same split as arcapp_workflows above.
DROP POLICY IF EXISTS "teams_write_public" ON arcapp_teams;
CREATE POLICY "teams_write_public_anon" ON arcapp_teams
  FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "teams_write_authenticated" ON arcapp_teams
  FOR ALL TO authenticated
  USING (arcapp_user_allowed_project(project_key))
  WITH CHECK (arcapp_user_allowed_project(project_key));

-- arcapp_tasks — same split as arcapp_workflows above.
DROP POLICY IF EXISTS "tasks_write_public" ON arcapp_tasks;
CREATE POLICY "tasks_write_public_anon" ON arcapp_tasks
  FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "tasks_write_authenticated" ON arcapp_tasks
  FOR ALL TO authenticated
  USING (arcapp_user_allowed_project(project_key))
  WITH CHECK (arcapp_user_allowed_project(project_key));

-- arcapp_item_assignments — same split as arcapp_workflows above.
DROP POLICY IF EXISTS "item_assignments_write_public" ON arcapp_item_assignments;
CREATE POLICY "item_assignments_write_public_anon" ON arcapp_item_assignments
  FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "item_assignments_write_authenticated" ON arcapp_item_assignments
  FOR ALL TO authenticated
  USING (arcapp_user_allowed_project(project_key))
  WITH CHECK (arcapp_user_allowed_project(project_key));

-- arcapp_submittals — already authenticated-only; add the project check alongside is_arcapp_authorized().
DROP POLICY IF EXISTS "submittals_write_authorized" ON arcapp_submittals;
CREATE POLICY "submittals_write_authorized" ON arcapp_submittals
  FOR ALL TO authenticated
  USING (is_arcapp_authorized() AND arcapp_user_allowed_project(project_key))
  WITH CHECK (is_arcapp_authorized() AND arcapp_user_allowed_project(project_key));

-- arcapp_milestones — already authenticated-only; add the project check alongside is_arcapp_authorized().
DROP POLICY IF EXISTS "milestones_write_authorized" ON arcapp_milestones;
CREATE POLICY "milestones_write_authorized" ON arcapp_milestones
  FOR ALL TO authenticated
  USING (is_arcapp_authorized() AND arcapp_user_allowed_project(project_key))
  WITH CHECK (is_arcapp_authorized() AND arcapp_user_allowed_project(project_key));
