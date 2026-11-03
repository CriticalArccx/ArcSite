-- Already run against your Supabase project (cbaldwin-oss's Project) as part of this migration.
-- Kept here so the schema is versioned alongside the app. Safe to re-run (idempotent).

CREATE TABLE IF NOT EXISTS arcapp_workflows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activities jsonb NOT NULL DEFAULT '[]'::jsonb,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text
);

CREATE TABLE IF NOT EXISTS arcapp_settings (
  setting_key text PRIMARY KEY,
  setting_value text,
  updated_by text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- NOT YET APPLIED — run this one against your project.
--
-- The catalog of workflow items (the on-site modules a workflow can include). `item_key` values
-- are what get stored inside arcapp_workflows.items, so they are stable identifiers: change a
-- label freely, never an existing key.
--
-- `config` is the placeholder for the per-item definition of what the item should actually do
-- (which fields to show, where the answers get written, etc.). It's an empty object for now — the
-- app reads key/label/description/sort_order/enabled and ignores config until those behaviors are
-- specified. Retire an item by setting enabled = false: it disappears from the builder's picker
-- but workflows that already reference it keep rendering.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS arcapp_workflow_items (
  item_key text PRIMARY KEY,
  label text NOT NULL,
  description text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  enabled boolean NOT NULL DEFAULT true,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text
);

-- Seed the eight items. ON CONFLICT DO NOTHING so re-running never clobbers edits made in the
-- dashboard. The first three, plus rtft/launchpad_status/cmms_data_collection, keep the keys the
-- pre-existing workflows already store; equipment_photos and scaaf_study are new.
INSERT INTO arcapp_workflow_items (item_key, label, description, sort_order) VALUES
  ('late_time_personnel',  'Late Time/Personnel',        'Hours between scheduled and actual start, plus corrective-action headcount.', 10),
  ('tamper_seal',          'Tamper Seal Logging',        'Log seal numbers, locations, and condition against the asset.',               20),
  ('joint_pack_photos',    'Joint Pack Photos',          'File joint pack photos to the Activity → Asset → Date folder chain.',         30),
  ('equipment_photos',     'Equipment Photos',           'Capture general equipment photos for the activity.',                          40),
  ('rtft',                 'RTFT Logging',               'Ready to Fill/Turnover inspection record.',                                   50),
  ('launchpad_status',     'LaunchPad Result Logging',   'Schedule status and notes pushed back to LaunchPad.',                         60),
  ('cmms_data_collection', 'CMMS Data Collection',       'Equipment ID, work order number, and CMMS notes.',                            70),
  ('scaaf_study',          'SCAAF Study Information',    'SCAAF study data captured against the activity.',                             80)
ON CONFLICT (item_key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- NOT YET APPLIED — Teams + Tasks (To-Do assignment tool, requested 2026-09-18).
--
-- `members` is a jsonb array of {"name": "...", "email": "..."} objects, same style as
-- arcapp_workflows.items — a team's roster is small, so a join table would be overkill.
--
-- A task is assigned to at most one of: a team (assigned_team_id) or a specific person
-- (assigned_email/assigned_name) — the app enforces that, not a DB constraint, since "neither"
-- (unassigned) is also valid. Deleting a team the app-layer way just unassigns its tasks
-- (ON DELETE SET NULL) rather than deleting them.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS arcapp_teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  members jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text
);

CREATE TABLE IF NOT EXISTS arcapp_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  text text NOT NULL,
  tag text NOT NULL DEFAULT 'norm', -- 'crit' | 'high' | 'norm'
  sys text NOT NULL DEFAULT '',
  due_date date,
  done boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  assigned_team_id uuid REFERENCES arcapp_teams(id) ON DELETE SET NULL,
  assigned_email text,
  assigned_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by text,
  updated_by text
);

-- Seed: carry over the old hardcoded sample To-Dos as real rows, so the list isn't empty on
-- first load. Only runs if arcapp_tasks is completely empty (no unique column to ON CONFLICT on
-- otherwise), so it's safe to re-run without creating duplicates.
INSERT INTO arcapp_tasks (text, tag, sys, due_date, done, completed_at)
SELECT * FROM (VALUES
  ('Approve turnover package — Chiller Plant Room 1',                'crit', 'CHW-01', CURRENT_DATE,     false, NULL::timestamptz),
  ('Review LOTO permit request — MC-204 Switchgear',                 'high', 'MC-204', CURRENT_DATE,     false, NULL::timestamptz),
  ('Walk punch list — Electrical Room 3',                            'norm', 'ER-03',  CURRENT_DATE + 1, false, NULL::timestamptz),
  ('Sign off functional test — Fire Alarm Panel FP-2',               'high', 'FP-2',   CURRENT_DATE + 5, false, NULL::timestamptz),
  ('Update RFSU tracker — BAS Integration',                          'norm', 'BAS-01', CURRENT_DATE + 8, false, NULL::timestamptz),
  ('Coordinate vendor start-up — Generator Load Bank Test',          'crit', 'GEN-02', CURRENT_DATE + 9, false, NULL::timestamptz),
  ('Close out punch items — Domestic Water Booster',                 'norm', 'DWB-01', CURRENT_DATE + 6, false, NULL::timestamptz),
  ('File inspection request — Emergency Lighting circuit EL-14',     'norm', 'EL-14',  CURRENT_DATE - 4, true,  now())
) AS seed(text, tag, sys, due_date, done, completed_at)
WHERE NOT EXISTS (SELECT 1 FROM arcapp_tasks);

-- ---------------------------------------------------------------------------
-- APPLIED — arcapp_authorized_users (requested 2026-09-18; role column + full site gate added
-- 2026-09-24).
--
-- ArcApp's entire access-control model: who may sign in at all, and whether they're an admin
-- (can change Settings, including this table) or an editor (can't) — deliberately NEVER
-- STY4authorized_editors (LaunchPad's shared edit-rights table, with its own separate is_admin/
-- role columns for a different purpose), by explicit request to keep ArcApp's permission system
-- independent of it. Someone can be an ArcApp admin without being an editor on the LaunchPad side,
-- or vice versa — the two are unrelated on purpose.
--
-- The sign-in gate itself lives in src/lib/useCurrentUser.ts: after any successful auth (Google
-- or magic-link), it checks the signed-in email against this table and immediately signs back out
-- anyone not on it. AppShell.tsx renders NOTHING else (no sidebar, no data fetches) until that
-- check resolves to a real user — see its `!user` gate and SignInPage.tsx.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS arcapp_authorized_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  name text NOT NULL DEFAULT '',
  role text NOT NULL DEFAULT 'editor' CHECK (role IN ('admin', 'editor')),
  created_at timestamptz NOT NULL DEFAULT now(),
  added_by text
);

-- Seed exactly one admin so someone can actually sign in and add everyone else via Settings —
-- deliberately NOT bulk-seeded from STY4authorized_editors this time (that table seeded the
-- allowlist itself back on 2026-09-18, before this table had a role column or the site required
-- sign-in at all; re-running that seed now would import ~20 LaunchPad-side identities into what's
-- meant to be a clean, independent ArcApp roster). ON CONFLICT keeps this safe to re-run.
--
-- The ~19 rows the 2026-09-18 bulk-seed had left in this table (from before this comment's own
-- migration existed) were pruned by hand on 2026-09-24, by request, down to just this one row —
-- if you're restoring this table from scratch, this INSERT is genuinely all you start with.
INSERT INTO arcapp_authorized_users (email, name, role, added_by)
VALUES ('cbaldwin@criticalarccx.com', 'C Baldwin', 'admin', 'migration (initial admin, 2026-09-24)')
ON CONFLICT (email) DO UPDATE SET role = 'admin';

-- ---------------------------------------------------------------------------
-- NOT YET APPLIED — arcapp_submittals (requested 2026-09-19).
--
-- Replaces the old STY4Submittals-backed reviewer, which was one row per ASSET. A submittal is
-- now its own record — a title + an uploaded file — that applies to a whole SET of assets at
-- once (`assets`, a jsonb array of asset names). Its `review_status`/`notes` apply to every asset
-- in that array simultaneously, since they all share this one row instead of each having their
-- own — that's the whole point, not extra logic layered on top.
--
-- Files upload to the "submittals" Supabase Storage bucket (created below, public read so links
-- work for anyone; writes are editor-gated — see supabase/policies.sql).
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS arcapp_submittals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  file_url text,
  file_name text,
  assets jsonb NOT NULL DEFAULT '[]'::jsonb,
  review_status text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  updated_by text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- NOT YET APPLIED — notes_log (requested 2026-09-19). The single overwritable `notes` column
-- above is retired in favor of an append-only log: every "Add Note" adds one entry here instead
-- of replacing the whole field, and the Submittals page shows the full history when its Notes
-- dropdown is opened. `notes` itself is left in place (unused, never dropped — nothing was in it
-- worth migrating).
ALTER TABLE arcapp_submittals ADD COLUMN IF NOT EXISTS notes_log jsonb NOT NULL DEFAULT '[]'::jsonb;

INSERT INTO storage.buckets (id, name, public)
SELECT 'submittals', 'submittals', true
WHERE NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'submittals');

-- ---------------------------------------------------------------------------
-- NOT YET APPLIED — arcapp_item_assignments (Checklist/Issue To-Do, requested 2026-09-21).
--
-- Checklists and Issues themselves live in the read-only CxAlloy Google Sheet (via Apps
-- Script) — this table is ArcApp's own place to record who's responsible for chasing down a
-- specific open checklist/issue, keyed by its CxAlloy id (`item_id`) plus which sheet it came
-- from (`item_type`). Same "at most one of team or person, enforced app-side, unassigned is
-- valid" convention as arcapp_tasks above; the UNIQUE constraint is what makes
-- saveItemAssignments()'s upsert (one row per item, same target) idempotent per item.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS arcapp_item_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_type text NOT NULL, -- 'checklist' | 'issue'
  item_id text NOT NULL,   -- CxAlloy checklist_id / issue_id
  assigned_team_id uuid REFERENCES arcapp_teams(id) ON DELETE SET NULL,
  assigned_email text,
  assigned_name text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text,
  UNIQUE (item_type, item_id)
);

-- ---------------------------------------------------------------------------
-- APPLIED — SAN-NT1B project switcher (requested 2026-09-21).
--
-- ArcApp already shared its Supabase project with LaunchPad, which turned out to already track
-- SAN-NT1B as a full second project (own Apps Script, own <prefix>dropdownoptions/BackEndData/
-- authorized_editors tables — see src/lib/project.ts for the two capability gaps found there:
-- no <prefix>Assets/<prefix>RTFT tables yet, and its Apps Script doesn't have the ArcApp-specific
-- actions added yet). CxAlloy/Sheet-backed reads already carry their own table-name prefix per
-- project (STY4dropdownoptions vs SANNT1Bdropdownoptions, etc. — just a dynamic prefix, no schema
-- change needed there). But every ArcApp-OWNED table below was a single shared pool with no
-- notion of "which site" at all — these `project_key` columns are what make picking a different
-- project in the Topbar switcher actually isolate that project's Teams/Tasks/Submittals/Settings/
-- Workflows/Checklist-Issue-assignments from every other project's, instead of just changing which
-- Sheet data is displayed. Existing rows default/backfill to 'STY4' (everything that existed
-- before this was STY4's data anyway). `arcapp_authorized_users` (who may sign in at all) and
-- `arcapp_workflow_items` (the static catalog of possible workflow item *types*) are deliberately
-- NOT scoped — those are both app-wide concepts, not per-site data.
-- ---------------------------------------------------------------------------

ALTER TABLE arcapp_settings ADD COLUMN IF NOT EXISTS project_key text NOT NULL DEFAULT 'STY4';
ALTER TABLE arcapp_settings DROP CONSTRAINT arcapp_settings_pkey;
ALTER TABLE arcapp_settings ADD PRIMARY KEY (project_key, setting_key);

ALTER TABLE arcapp_tasks ADD COLUMN IF NOT EXISTS project_key text NOT NULL DEFAULT 'STY4';
ALTER TABLE arcapp_teams ADD COLUMN IF NOT EXISTS project_key text NOT NULL DEFAULT 'STY4';
ALTER TABLE arcapp_submittals ADD COLUMN IF NOT EXISTS project_key text NOT NULL DEFAULT 'STY4';
ALTER TABLE arcapp_workflows ADD COLUMN IF NOT EXISTS project_key text NOT NULL DEFAULT 'STY4';

ALTER TABLE arcapp_item_assignments ADD COLUMN IF NOT EXISTS project_key text NOT NULL DEFAULT 'STY4';
ALTER TABLE arcapp_item_assignments DROP CONSTRAINT arcapp_item_assignments_item_type_item_id_key;
ALTER TABLE arcapp_item_assignments ADD CONSTRAINT arcapp_item_assignments_project_item_key UNIQUE (project_key, item_type, item_id);

-- ---------------------------------------------------------------------------
-- APPLIED — arcapp_milestones (requested 2026-10-27).
--
-- Milestones used to be hardcoded sample data (sampleData.ts) with a hand-set pct/status. This
-- table persists just a milestone's own fields — `criteria` is a jsonb array of
-- MilestoneCriterion objects (see src/lib/api.ts) scoping into Checklists/Issues/Submittals/NETA
-- Tracker by asset (or zone, for NETA) + target status/flag. The pct/status themselves are never
-- stored — computeMilestoneProgress (src/pages/arcapp/milestones.ts) derives them live from
-- `criteria` plus each module's current data every time the Milestones page loads, same
-- project_key-scoped pattern as arcapp_submittals/arcapp_tasks/etc. above.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS arcapp_milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_key text NOT NULL,
  name text NOT NULL,
  due_date date,
  criteria jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_by text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- APPLIED — arcapp_tasks.status (Kanban board, requested 2026-10-30).
--
-- The To-Do page's new Board view needs a real third state between "not started" and "done" —
-- `done` alone can't represent "in progress". `status` is the richer field going forward;
-- `done`/`completed_at` stay in sync with it on every write (see setTaskStatus/setTaskDone in
-- src/lib/api.ts) so every pre-existing done/not-done consumer (the List view's checkbox, KpiRow,
-- TodoPanel's open count, todoDueDisplay) keeps working unchanged. Existing rows backfilled to
-- 'done' where `done = true`, 'todo' otherwise (nothing could already be "in progress").
-- ---------------------------------------------------------------------------

ALTER TABLE arcapp_tasks ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'todo';
ALTER TABLE arcapp_tasks ADD CONSTRAINT arcapp_tasks_status_check CHECK (status IN ('todo','in_progress','done'));
UPDATE arcapp_tasks SET status = 'done' WHERE done = true AND status <> 'done';

-- ---------------------------------------------------------------------------
-- APPLIED — arcapp_authorized_users.allowed_projects (requested 2026-11-02).
--
-- Closes a real gap: any authorized ArcApp user (admin or editor) could switch the Topbar project
-- picker into STY4, SAN-NT1B, or RSE1A and read/write that project's data, regardless of which
-- site they actually work on — sign-in only ever checked "is this email on the roster at all,"
-- never "which project(s) is this email for." See project.ts's CAPABILITIES comment and
-- policies.sql's old "Isolation between projects is enforced entirely app-side" note for how that
-- was previously a deliberate, documented trade-off, not an oversight — it no longer is.
--
-- NULL (the default — nothing to backfill, every existing row already behaves exactly as before)
-- means unrestricted, same as today: every project in PROJECTS (project.ts). A non-null array
-- restricts that person to just those project_key values. Not a foreign key / CHECK against a
-- fixed list on purpose — PROJECTS grows over time (RSE1A was just added), and this table
-- shouldn't need a migration every time a new project does.
--
-- Enforced in two places: client-side, Topbar's project switcher only lists what the signed-in
-- user's allowedProjects allows (src/lib/useCurrentUser.ts, Topbar.tsx) and auto-redirects them
-- into an allowed project if their last-selected one (CURRENT_PROJECT, from localStorage) isn't
-- one of them; server-side, every project_key-scoped table's write policy now also calls
-- arcapp_user_allowed_project() (see policies.sql) so a signed-in session can't bypass the switcher
-- and write into a project it isn't assigned to just by calling Supabase directly.
-- ---------------------------------------------------------------------------

ALTER TABLE arcapp_authorized_users ADD COLUMN IF NOT EXISTS allowed_projects text[];

-- ---------------------------------------------------------------------------
-- APPLIED — arcapp_lessons_learned (requested 2026-11-03).
--
-- A quick, project-scoped log of things worth remembering for next time: title, free-text
-- description, a category, and the date it applies to. Deliberately NOT asset/system-linked and
-- NOT attachment-bearing like Submittals/Joint Pack Photos — this is meant to be a lightweight
-- "write it down before it's forgotten" log, not a formal root-cause record; see
-- src/pages/arcapp/components/LessonsLearnedManager.tsx.
--
-- `category` isn't a CHECK-constrained enum — see LESSON_CATEGORIES in src/lib/api.ts, validated
-- app-side only, same reasoning as not CHECK-constraining allowed_projects above (so adding a
-- category later doesn't need a migration).
--
-- `logged_by` is stamped once at creation and never touched again (see saveLessonLearned in
-- api.ts) — `updated_by`/`updated_at` track edits instead, same split as Submittals'
-- notes_log author vs. updated_by.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS arcapp_lessons_learned (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_key text NOT NULL,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT 'Other',
  logged_by text,
  logged_at date NOT NULL DEFAULT CURRENT_DATE,
  updated_by text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
