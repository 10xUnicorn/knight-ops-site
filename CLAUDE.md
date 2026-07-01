# KnightOps.biz — Project Spec & Source of Truth

> **Owner:** Daniel Knight (dknightunicorn@gmail.com)
> **Domain:** knightops.biz
> **Repo:** github.com/10xUnicorn/knight-ops-site (public)
> **Last Updated:** 2026-07-01

---

## Changelog — 2026-07-01 (Client Feedback + API Autofix system)

Permanent per-project client links + an API-first bug-fix / feature-build engine.

- **Permanent client links (2 per project).** Admin → project detail → "🔗 Permanent Client Links" generates two never-expire links (expiry configurable Never/7/30/90 + revoke): Features & Bugs (`/feedback?t=<token>`) and Project Files (`/project-files?t=<token>`). Backed by `project_intake_tokens` (+ `link_type`). Edge fns: `project-link` (create/list/revoke/set_expiry), `resolve-link` (validate → project name/brand).
- **feedback.html** (`/feedback?t=`): tabs Bug / Feature / Your Submissions. Auto-saves drafts to localStorage; "Your Submissions" shows live status and lets the client EDIT anything not yet completed (`my-submissions`, `edit-submission`). Capture toolbar on both forms: 🎤 mic dictation (Web Speech), 📋 paste transcript, 🎬 pull transcript from a Loom/YouTube URL (`transcribe-url`, optional TRANSCRIBE_API_KEY for other sources). Uploads → bug-attachments bucket.
- **project-files.html** (`/project-files?t=`): client sees files Daniel marks visible + their own uploads; download + upload (client-files bucket). Admin controls visibility with the 👁 Share toggle per file in Project Files (`admin-file-share` upserts a `project_files` row, client_visible). Edge fn `project-files-view` (load/add_file).
- **Feature requests** (`feature-request`): client submits → emails Daniel (dknightunicorn@gmail.com + daniel@knightops.biz) with an Approve link + admin link. Admin → "✨ Feature Requests": Approve & build / Request revisions (Daniel types notes, no client email) / Reject (`feature-action`). Only status='approved' ever builds.
- **Bugs** (`bug-report`): auto-prioritized. Admin → "🐞 Bug Reports" lists them per project.
- **API AUTOFIX (cloud, no desktop app).** Edge fn `api-autofix` {kind:bug|feature,id,background?}: Claude API (claude-sonnet-4-6) plans → reads repo files via GitHub API → writes the fix → commits (single commit via git data API) to the repo's default branch → Vercel auto-deploys → emails Daniel. Confidence gate: if not safe it sets autofix_error='low_confidence' and emails instead of committing. Event-driven: `bug-report` fires it on submit, `feature-action` fires it on approve (both via EdgeRuntime.waitUntil). Needs projects.repo_url + two Supabase secrets: ANTHROPIC_API_KEY (set) and **GITHUB_TOKEN (MUST be added — repo write for org 10xUnicorn)**. Until GITHUB_TOKEN is set it returns no_github_token and the orchestrator falls back to desktop Claude Code.
- **Schema:** `projects` +repo_url,repo_subpath,deploy_cmd,autofix_enabled. `bug_reports` +fix_summary,fix_commit_url,fixed_at,autofix_attempts,autofix_error. `feature_requests` table (pending→approved/revisions/rejected→building/built) +approval_token. `project_files` +client_visible,added_via_token,storage_path. `client-files` public bucket.
- **Orchestrator v3** (`knight-ops-autobuild-orchestrator`, now **every 15 min** with a cheap count-gate that stops instantly when idle): STEP 0 minimal check; STEP 1 bug SAFETY-NET only (bugs already fix INSTANTLY on submit via the event-driven api-autofix — resolve+backfill projects.repo_url via Vercel/vault, retry, desktop fallback on low_confidence/no_token); STEP 2 approved features → **DESKTOP Claude Code** (features are NOT auto-built by API); STEP 3 net-new dashboard builds → desktop, only in 4-hour slots.
- **Feature routing:** `feature-action` approve NO LONGER fires api-autofix — approved features build via desktop Claude Code (orchestrator STEP 2). Admin "Approve & build" prompts for optional build details appended to `admin_notes`.
- **Admin project detail additions:** `➕ Add a Module (injection prompt)` card — pick any of the 24 `dashboard_modules`, generate a project-tailored module-injection prompt via edge fn `module-injection` (Claude sonnet + universal injection framework + project context; `dashboard_modules.injection_spec` holds curated specs, community seeded), copy/download. `🔧 Recent Fixes & Builds` activity feed (fixed bugs + built features, newest first, commit links). `⚙️ Auto-fix repo` control in the Permanent Links card — set/auto-detect `projects.repo_url` (edge fn `detect-repo` matches the linked Vercel project via VERCEL_TOKEN, manual fallback) + autofix toggle; also on the project editor.
- **New edge fns this wave:** `module-injection`, `detect-repo`, `admin-file-share`, `my-submissions`, `edit-submission`, `transcribe-url`. Optional secrets: `VERCEL_TOKEN` (repo auto-detect), `TRANSCRIBE_API_KEY` (any-video-URL transcripts). `dashboard_modules` +`injection_spec`.

---

## Changelog — 2026-06-22 (Prospecting overhaul)

- **Prospecting dashboard count bug FIXED.** `prospecting.html` (base64-embedded dashboard) `loadDashboardData()` fetched `leads?lead_type=eq.prospect` with no limit, hitting PostgREST's 1000-row cap, so "Prospects Found" maxed at 1000. Query now `lead_type=eq.prospect&email=not.is.null&...&limit=50000`. Shows true reachable count (~2,267) and auto-excludes no-email leads. To edit the dashboard you must decode `var D` (base64), change, re-encode, replace.
- **No-email phantoms flagged.** 1,627 prospects had NO email (bot-scraper inserts where Apollo found no verified email). Flagged `status='bad_lead'` + tag `no_email_phantom`; empty emails normalized to NULL. Reversible. Reachable prospects = 2,267.
- **Scrapers paused:** `knight-ops-lead-gen-bot` and `knight-ops-intent-hunter` disabled — they were over-feeding email-less junk into a 0%-converting system. Re-enable only after conversion is fixed AND insert enforces a verified email.
- **Conversion problem:** ~2,639 nurture sends → 11 replies, 0 meetings. Cause: no booking link in emails, selling a $7.5k+ build to cold prospects, 15+ overlapping sequences, per-send AI copy that hallucinates. Fix in flight: "Pull Up a Chair" Roundtable invite campaign (no-pitch, drives /roundtable + /book). Segment ~2,010 clean cold prospects.

---

## Architecture Overview

KnightOps.biz is a static-first multi-page site deployed on **Vercel** with a **Supabase** PostgreSQL backend. All frontend pages are single-file HTML (no build step, no framework). The admin dashboard (`admin.html`) is a ~8,000-line single-page application.

### Infrastructure

| Layer | Service | ID |
|-------|---------|-----|
| Hosting | Vercel | Project: `prj_mXMrnTboMFpBt5QsCdFeR2t7aerz`, Team: `team_WHiAYPn3TV95wpQT1hsoDrhm` |
| Database | Supabase | Project: `trpnlkntvulkjerevngm` |
| Email | Resend | Sending from `Daniel Knight <daniel@knightops.biz>` |
| Payments | Stripe | Connected via payment links + webhooks |
| CRM/Drip | Go High Level | Webhook integration (being replaced) |
| Git | GitHub | `10xUnicorn/knight-ops-site` |

### Supabase Anon Key
```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRycG5sa250dnVsa2plcmV2bmdtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0Njg1MDQsImV4cCI6MjA5MDA0NDUwNH0.q9UrZDjbl7c3xC1eTsq46Qg5MmWNogot2ByZ9c_54cM
```

---

## HARD RULES — Never Violate

### Rule 1: Never overwrite vercel.json
Only make surgical edits to `vercel.json`. Never write the entire file from memory or outputs. Always read the current file first, then edit specific sections. This has caused production outages before.

### Rule 2: Apollo/prospecting leads must NEVER appear in admin dashboard
The `leads` table uses a `lead_type` column:
- `'inbound'` → shows in admin dashboard (`/admin`)
- `'prospect'` → shows in prospecting dashboard (`/prospecting`)

**Any lead sourced from Apollo, Vibe Prospecting, or the overnight scraper must have `lead_type='prospect'`.** Check BOTH `source` column (enum `lead_source`) AND `enrichment_source` column (text). Leads with `enrichment_source ILIKE '%apollo%'` are prospecting leads regardless of what `source` says.

### Rule 3: Always confirm Supabase/Vercel project targets
Before ANY database write, migration, or deployment, run the `project-selector` skill to confirm you're targeting the correct project. Never assume from a previous conversation.

### Rule 4: NEVER deploy via Vercel CLI — git push ONLY
Deployments MUST go through git push → GitHub → Vercel auto-deploy. NEVER use `vercel deploy`, `vercel --prod`, or any Vercel CLI deployment. Dirty CLI deploys (`gitDirty: "1"`) have caused pages to go missing in production because they deploy from an incomplete local copy instead of the full git repo. This has happened multiple times and wiped 9+ pages from production.

### Rule 5: Git push requires fresh /tmp clone
The mounted filesystem has an immutable `.git/index.lock`. To push changes:
1. Clone to `/tmp/<fresh-unique-dir>` using the GitHub PAT
2. Copy changed files from the mounted workspace
3. Commit and push from the /tmp clone
4. Git config: `git -c user.name="Daniel Knight" -c user.email="dknightunicorn@gmail.com"`

### Rule 6: Verify every change
After making a change (SQL, deployment, code edit):
1. **Run a verification query or check** — don't just assert it worked
2. **For SQL**: Query the affected rows and confirm the expected state
3. **For deployments**: Check `list_deployments` and confirm state is `READY`
4. **For code changes**: Read the file back and confirm the edit landed
5. **NEVER claim a fix is done without verification evidence**

### Rule 7: One app = one Supabase project
If a task is for a new product or different company, create a new Supabase project. Don't pollute `trpnlkntvulkjerevngm` with unrelated data.

---

## Lead Segmentation System

### Source Enum (`lead_source`)
Valid values: `intake_form`, `marketplace`, `event`, `manual`, `referral`, `website`, `vibe_prospecting`, `apollo`, `automated`, `mini_blueprint`, `website_intake`, `filter_score`, `assessment`

### Lead Type Rules
| Source | Default lead_type | Dashboard |
|--------|------------------|-----------|
| `apollo` | `prospect` | /prospecting |
| `vibe_prospecting` | `prospect` | /prospecting |
| `intake_form` | `inbound` | /admin |
| `event` | `inbound` | /admin |
| `website` | `inbound` | /admin |
| `website_intake` | `inbound` | /admin |
| `referral` | `inbound` | /admin |
| `manual` | depends on context | check added_by |
| `filter_score` | `inbound` | /admin |
| `assessment` | `inbound` | /admin |
| `mini_blueprint` | `inbound` | /admin |

### Enrichment Source Check
If `enrichment_source ILIKE '%apollo%'` AND `added_by IN ('nighthawk_scraper', 'system')`, the lead is a prospecting lead regardless of `source` value.

---

## Database Schema (Key Tables)

### leads
Primary table. Key columns:
- `id` (uuid), `name` (text), `email` (text), `phone` (text)
- `source` (enum `lead_source`), `lead_type` (text: 'inbound'|'prospect')
- `status` (text), `lead_score` (int), `enrichment_source` (text)
- `tags` (text[]), `cohort_id` (text — not a column yet, stored in tags)
- `notes` (text), `added_by` (text), `prospecting_run_id` (uuid)
- `company`, `job_title`, `company_domain`, `company_industry`

### deals
- `id`, `title` (NOT `name`), `deal_value` (NOT `value`), `stage`, `status`
- `sales_channel` (text), `probability`, `expected_close_date`
- `won_date`, `lost_date`, `lost_reason`
- Stages: discovery, qualification, proposal, negotiation, closed_won, closed_lost, on_hold
- Status auto-links with stage (see admin.html `linkDealStageStatus()`)

### tasks
- `id`, `title`, `description`, `status`, `priority`, `due_date`
- `assigned_to`, `project_id`, `created_by`

### projects
- `id`, `name`, `description`, `status`, `client_id`
- Junction table: `project_clients` (many-to-many with clients)

### clients
- `id`, `name`, `email`, `company`, `status`, `phone`

### notifications
- `id`, `title`, `message`, `type`, `read`, `created_at`
- `entity_type` (text), `entity_id` (uuid) — for clickable navigation

### speaker_survey_responses
- `id`, `lead_id`, `answer`, `cohort_id`, `survey_name`, `offer_presented`
- `event_name`, `event_date`

### drip_config / drip_queue
- Drip system: `drip_config` defines sequences, `drip_queue` holds pending sends
- `max_per_batch`: currently 150

---

## Edge Functions (42 total)

### Email & Communication
| Function | Purpose |
|----------|---------|
| `process-drip` (v18) | Main drip processor — handles all sequences |
| `send-notification` | Push notifications |
| `send-plain-email` | Generic email sender |
| `send-email` | Branded email sender |
| `send-intake-confirmation` | Website intake form confirmation |
| `send-survey-email` | Survey distribution |
| `send-section-link` | Section link emails |
| `speaker-campaign` (v3) | Speaker lead drip campaign |
| `quick-blast` (v1) | Generic email blaster |
| `speaker-feedback-email` | Post-event feedback |
| `speaker-outreach` | Speaking opportunity outreach |
| `speaker-inquiry-email` | Inquiry notifications |
| `partner-emails` | Partner portal emails |
| `assessment-drip` | Assessment sequence |
| `send-sms` | SMS outreach |

### Tracking & Analytics
| Function | Purpose |
|----------|---------|
| `track` | General event tracking |
| `track-open` | Email open tracking |
| `track-click` | Email click tracking |
| `track-visitor` | Site visitor tracking |

### Business Logic
| Function | Purpose |
|----------|---------|
| `analyze-offer` | Prospecting filter score analysis |
| `capture-lead` | Lead capture from filter score |
| `receive-email` (v6) | Inbound email processing |
| `serve-proposal` | Proposal page rendering |
| `send-proposal` | Proposal delivery |
| `serve-preview` | Project preview rendering |
| `serve-app` | Client app file serving |
| `speed-to-value-intake` | STV intake processing |
| `speaker-inquiry` | Speaking inquiry processing |
| `manage-drip` | Drip queue management |
| `process-drip-queue` | Queue processor |
| `task-reminders` | Task reminder emails |
| `notify-comment` | Comment notifications |
| `send-magic-link` | Auth magic links |

### Lead Generation Product
| Function | Purpose |
|----------|---------|
| `search-leads` | Lead search API |
| `enrich-leads` | Lead enrichment |
| `deliver-leads` | Lead delivery to purchasers |
| `stripe-lead-webhook` | Stripe payment webhook |
| `send-report-email` | Lead report delivery |

### AI Agents
| Function | Purpose |
|----------|---------|
| `marketing-agent` | Marketing automation |
| `builder-agent` | Build automation |
| `orchestrator-briefing` | Daily briefing |
| `orchestrator-manager` | Agent orchestration |

### Roundtable Reminders (2026-06-17) — NO GHL
`roundtable-reminders` edge function sends branded emails (Resend, from daniel@knightops.biz) to everyone in `roundtable_registrations` (deduped by email). Triggered by `?type=24h|5min|thankyou`. Driven by **pg_cron** jobs (verify_jwt=false; cron passes anon apikey via pg_net):
- `roundtable-24h-reminder` — `0 17 * * 2` (Tue 10am PT) — Zoom link + add-to-calendar
- `roundtable-5min-reminder` — `55 16 * * 3` (Wed 9:55am PT) — "starting in 5 min" + Zoom
- `roundtable-thankyou` — `0 19 * * 3` (Wed 12pm PT) — thanks + book a call (/book)

Zoom = knightops.biz/roundtable-zoom. Times are UTC for PDT (UTC−7); shift +1h hour (18/17:55/20) if PST is ever needed. The roundtable page NO LONGER posts to GoHighLevel — that webhook was removed. Knight Ops does not use GHL anywhere.

---

## Event Lead Engine (2026-06-19)

Free/$1,497 custom interactive lead-capture magnets for event vendors/speakers. Full spec: `EVENT-LEAD-ENGINE-SPEC.md`.
- Pages: `/event-lead-engine` (offer), `/event-lead-engine-intake` (form), `/ele-admin` (approvals), `/le/:slug` (hosted magnet via `api/le.js`→`serve-le`).
- Tables: `ele_builds`, `ele_leads`, `ele_event_hosts`. Attendee leads dual-write to `leads` (source=`event`, tag `ele-magnet`, lead_type inbound — Rule 2 safe).
- Magnet engine template lives in storage `ele-assets/engine/ele-magnet-engine.html` (builder reads from storage). Re-upload after editing `templates/ele-magnet-engine.html`.
- Edge fns: ele-intake, ele-build, ele-capture, ele-approve, ele-autosend (pg_cron 30m → 24h auto-send), ele-review, ele-save, ele-resume, ele-host-coupon, ele-stripe-webhook, serve-le.
- Stripe LIVE: build $1,497, hosting $97/mo, transfer $249. Delivery email from team@knightops.biz, reply-to eden@knightops.biz.
- **2026-06-25 (AI-first + Special Offer):** Intake opens with a "Build it with AI" section — vendor brief + URL → `ele-analyze` edge fn (scans site colors/fonts/action-links/text, Sonnet designs the full config) → form auto-fills + live preview, all editable. New mechanism `special_offer` (Events Special Offer = straight NLP offer/checkout page, no game; engine fn `renderSpecialOffer()`). `ele-analyze` + `ele-revise` MECHS include `special_offer`. AI-first form normalizes `pick_door`→`scratch` and `redirect`→`offer` to a real card. **Free gift is now OPTIONAL** (removed from intake `validate()`). Re-uploaded engine to storage. Deployed `7d2fc8e`.
- **2026-06-25 (Edit/duplicate + candidate versioning + link preview + hosting flip):** `/ele-admin` per-build **✏️ Edit** opens `/event-lead-engine-intake?edit=<id>` — full field + file edit, uploaded files shown as keep-or-replace (gift, logo, link image). New edge fn **ele-edit** (load/save/regenerate/finalize/discard/set_hosting/duplicate). `ele-build` v8 writes a **candidate** page (`builds/<slug>/candidate.html` + `candidate_*` cols) when `candidate:true`, leaving live untouched; admin shows **Use candidate / Discard**; finalize promotes candidate→`magnet.html` (same slug/URL). **Link preview / OG** = cols `link_title`/`link_description`/`link_preview_image`; `serve-le` v3 injects OG fresh at serve time (update WITHOUT rebuild) and serves `?v=candidate`; `ele-build` also bakes OG for downloads; `api/le.js` forwards `?v`. **Turn on hosting** flips a build to hosted + copies/emails the $97/mo pay link. Host mgmt groups codes by host (host_email) with **Copy code / Copy invite link** + **+ New code** (custom-code prompt). Migration `ele_builds_edit_versioning_og`.
- **2026-06-27 (Conversion-first + obey-revise + offer+calendar + embed fix):** `ele-build` v9 aiDesign enforces TIGHT high-converting copy (no walls of text; headline ≤9 words, sub/result/explain ≤18 words, copy cap 240) and NEVER invents a free gift (passes `has_gift`). `buildBase` stopped defaulting gift name to "your free gift" (the phantom-gift bug) and now MERGES `cta_config` (keeps offer_url alongside a calendar). Engine: gift UI only renders when a real gift exists (`hasGift()`); quiz supports `skip_reveal` (answer→capture→CTA, no result screen); new **offer_calendar** CTA = short offer + button AND embedded calendar on the final page; **calendar embeds now execute** via `reactivateScripts` (re-injects `<script>` so GHL `form_embed.js` runs/auto-resizes) + `.cal-wrap iframe{min-height:760px}` so it is never cut off. `ele-revise` v4: user instruction is LAW — obeys removals (gift/step/reveal) with deterministic gift-field clear + quiz `skip_reveal`, keeps copy tight; `CTAS`+`ALLOWED` add `offer_calendar`/link fields. `serve-le` v4 OG default is gift-neutral. Fixed live build `what-is-calling-you-to-write-your-book-right-now` (no gift, skip_reveal, offer brief + button to livedtrue.com/webinar + embedded GHL calendar). Re-uploaded engine to storage.

---

## Dashboard Builder (2026-06-24)

Self-serve engine that turns an intake into a build-ready Claude Code prompt + spec for a full client dashboard. Modeled on the Event Lead Engine. Full spec: `DASHBOARD-BUILDER-SPEC.md`.

**Update 2026-06-24b (streaming mockup + community + grouping + owner emails):**
- **AI mockup now STREAMS** via new edge fn `dashboard-stream` (SSE, model sonnet, max 12k). Fixes the 504: old `dashboard-ai` review at 16k tokens hit the 150s edge gateway wall = "Could not generate". Builder shows a branded skeleton + animated progress bar with time-driven phase labels + elapsed timer; renders the dashboard live into the iframe as `<body>` streams. `db.html` revise uses it too. Resilience: a 16s stall watchdog + completeness check (`</body>`/`</main>`) auto-falls-back to non-streaming `dashboard-ai` (now max **11000** to stay <150s) so an interrupted stream never shows a broken CSS-only result.
- **Community module** added to `dashboard_modules` + builder MODULES + `dashboard-analyze` MODKEYS.
- **Consolidated sidebar**: `MODGROUPS` in builder groups modules into Home / Sales & Revenue / Clients & Success / Client Portal / Community / Growth / AI / System (live preview + AI mockup prompt both consolidate).
- **Owner-only edit emails**: `dashboard-build` save emails DANIEL (NOTIFY = dknightunicorn@gmail.com + daniel@knightops.biz) the builder resume/edit link on first save AND on every manual Save draft (`notify:true`); finalize emails Daniel the client review+edit+admin links (never auto-emails the client). To email an edit link for any existing build without mutating it: POST dashboard-build `{action:'save',resume_token,status:<current>,notify:true}`.

- **Pages:** `/dashboard-intake` (builder: AI-first entry, 7 sections, live preview, AI review, spec, prompt + copy, save/finalize/share), `/db` (`db.html` — public shareable build page, review + edit modes via token).
- **Admin:** project detail Build Prompt Generator now has a 5th button **📊 Dashboard** (`showDashboardPrompt()` in admin.html, next to ⚡ Command Center). Dashboard builds appear in Forms & Surveys (form_type `dashboard`, label "Dashboard Build").
- **Tables:** `dashboard_builds` (submissions, selections, status, resume + review/edit share tokens, ai_mockup_html, spec_md, build_prompt, lead_id/client_id/project_id), `dashboard_modules` (24-row module catalog). RLS mirrors ele_builds (anon insert + anon read + admin + service_role).
- **Edge functions:** `dashboard-build` (save/resume/submit/approve/save_edit + creates lead+project on submit), `dashboard-ai` (review mockup + spec via Anthropic, model `claude-sonnet-4-6`, fallback templates), `dashboard-analyze` (AI pre-fill from a free-text brief), `dashboard-shared` (token-scoped read for `/db`). All verify_jwt=false, called with anon key.
- **Storage:** `dashboard-assets` bucket (public read, anon insert) for logos/docs.
- **Generated dashboards** are prescribed as Next.js + Supabase + Resend + Stripe on Vercel (one Supabase project per client, Rule 7). The builder OUTPUTS the goal-function prompt; the actual client build runs in Claude Code.
- Note: AI mockup/spec generation takes ~30-45s (fine in browser; exceeds the VM bash 45s cap — generate via background curl or the browser, not a blocking shell call).

---

## Frontend Pages

### Admin & Internal
| Page | Path | Description |
|------|------|-------------|
| `admin.html` | /admin | Main CRM dashboard — leads, deals, tasks, projects, clients, KPIs, notifications |
| `prospecting.html` | /prospecting | Prospecting dashboard — prospect leads, LinkedIn, outreach |
| `drip-queue-manager.html` | /drip-queue-manager | Email drip queue management |
| `my-leads.html` | /my-leads | Lead generation customer portal |

### Public Pages
| Page | Path | Description |
|------|------|-------------|
| `index.html` | / | Homepage |
| `services.html` | /services | Service offerings |
| `fractional-ai-officer.html` | /fractional-ai-officer | FAO flagship service page (tiers + pricing) |
| `fractional-chief-ai-officer-services.html` | /fractional-chief-ai-officer-services | FCAO SEO pillar page (targets "fractional chief AI officer services") |
| `fractional-ai-officer-services.html` | /fractional-ai-officer-services | FCAO variant page (targets "fractional AI officer services", ROI angle) |
| `portfolio.html` | /portfolio | Case studies & app showcase |
| `case-studies.html` | /case-studies | Case studies alternate |
| `about.html` | /about | About page |
| `pricing.html` | /pricing | Pricing |
| `blog.html` | /blog, /blog/:slug | Blog with dynamic slugs |
| `tools.html` | /tools | Free tools |
| `faq.html` | /faq | FAQ page |
| `careers.html` | /careers | Job listings |
| `apply.html` | /apply | Job application |
| `book.html` | /book | Booking page (Blueprint Call direct) |
| `booking.html` | /booking | Booking hub (all types) |
| `book-tech-call.html` | /book-tech-call | Tech call booking |
| `challenge.html` | /challenge | 7-Day AI System Challenge ($47) |
| `apps.html` | /apps | Apps showcase |

### Speaker System
| Page | Path | Description |
|------|------|-------------|
| `speaker.html` | /speaker | Speaker profile |
| `speaker-survey-magnet.html` | /speaker-survey-magnet | Live event survey capture |
| `speaker-survey-results.html` | /speaker-survey-results | Survey results page |
| `speaker-lead-engine.html` | /speaker-lead-engine | $297 product landing page |
| `speaker-offer.html` | /speaker-offer | Speaker offer page |
| `speaker-application-answers.html` | /speaker-application-answers | Application Q&A |
| `speaker-feedback.html` | /speaker-feedback | Feedback form |
| `speaker-sizzle-reel.mp4` | /speaker-sizzle-reel | Video reel |

### ICP Landing Pages
| Page | Path | Description |
|------|------|-------------|
| `for-coaches.html` | /for-coaches | ICP page for coaches |
| `for-consultants.html` | /for-consultants | ICP page for consultants |
| `for-course-creators.html` | /for-course-creators | ICP page for course creators |
| `for-speakers.html` | /for-speakers | ICP page for speakers |
| `for-agencies.html` | /for-agencies | ICP page for agencies |
| `apps-for-coaches.html` | /apps-for-coaches | Apps for coaches |
| `apps-for-consultants.html` | /apps-for-consultants | Apps for consultants |
| `apps-for-course-creators.html` | /apps-for-course-creators | Apps for course creators |
| `apps-for-speakers.html` | /apps-for-speakers | Apps for speakers |
| `apps-for-meal-prep.html` | /apps-for-meal-prep | Apps for meal prep businesses |

### Products & Funnels
| Page | Path | Description |
|------|------|-------------|
| `speed-to-value.html` | /speed-to-value | Speed to Value VIP Day |
| `command-center.html` | /command-center | Command Center landing |
| `command-center-build.html` | /command-center-build | CC intake form |
| `prospecting-filter-score.html` | /prospecting-filter-score | Lead scoring tool |
| `assess.html` | /assess | Business assessment |
| `audit.html` | /audit | Tech audit + lead capture |
| `map.html` | /map/:slug | Shareable audit build map results |
| `blueprint.html` | /blueprint | Blueprint call |
| `mini-blueprint.html` | /mini-blueprint | Mini blueprint form |
| `roundtable.html` | /roundtable | Roundtable event |
| `website-intake.html` | /website-intake | Website development intake form |

### Portals
| Page | Path | Description |
|------|------|-------------|
| `portal.html` | /portal | Client portal |
| `client-portal.html` | /client-portal | Client portal (alternate) |
| `partner-portal.html` | /partner-portal | Partner portal |
| `partners.html` | /partners | Partner program |

### Community
| Page | Path | Description |
|------|------|-------------|
| `nightvibecommunity.html` | /nightvibecommunity | Night Vibe community |
| `community-survey.html` | /community-survey | Community survey |
| `vision-system.html` | /vision-system | Vision system |
| `vault.html` | /vault | Knowledge vault |

### Utility
| Page | Path | Description |
|------|------|-------------|
| `auth.html` | /auth | Authentication |
| `reset-password.html` | /reset-password | Password reset |
| `review.html` | /review | Client review |
| `ref-redirect.html` | /ref-redirect | Referral redirect |
| `privacy-policy.html` | /privacy-policy | Privacy policy |
| `404.html` | (auto) | Custom 404 page |
| `unsubscribe.html` | /unsubscribe | Email unsubscribe |
| `proposal-viewer.html` | /proposal-viewer | Proposal viewer |
| `llms.txt` | /llms.txt | LLM context file |
| `robots.txt` | /robots.txt | SEO robots |

### Serverless API Routes (`/api/`)
| File | Route | Purpose |
|------|-------|---------|
| `api/app.js` | /app/:file | Client app file serving |
| `api/preview.js` | /preview/:slug | Project preview proxy |
| `api/proposal.js` | /proposal/:slug | Proposal rendering |
| `api/sitemap.js` | /sitemap.xml | Dynamic sitemap |

---

## Admin Dashboard Features (admin.html)

### Navigation Sections
Dashboard, Leads, Deals, Tasks, Projects, Clients, Notifications, KPIs, Settings

### Forms & Surveys View (2026-06-17)
Reads from tables in `FS_TABLE_MAP`: `intake_submissions`, `cc_intake_submissions`, `roundtable_registrations`, `leads` (INBOUND ONLY — `fsQuery()` forces `.eq('lead_type','inbound')`, never prospects per Rule 2), assessment/community/speaker surveys. The "Form Submitted" column shows the REAL per-row origin via `fsLeadOrigin()` + `FS_FORM_LABELS` (derived from `metadata.source`/`capture_tool`/`form_type`/`tags`), not the coarse `source` enum. Detail panel (`showFsDetail`) renders every captured field as readable Q&A. Note: `roundtable_registrations` is a separate table — roundtable signups will NOT appear under Leads.

### Inline Editing
All list views support inline editing via `inlineEdit()` / `inlineSave()` / `inlineCancel()`:
- **Leads**: Status column
- **Deals**: Stage, Status, Channel columns
- **Tasks**: Priority, Status columns
- **Projects**: Status column
- **Clients**: Status column

### Deal Stage ↔ Status Auto-Linking
Function `linkDealStageStatus()` automatically syncs:
- discovery/qualification → active
- proposal/negotiation → active
- closed_won → completed (+ sets won_date, probability=100)
- closed_lost → lost (+ sets lost_date, probability=0)
- on_hold → on_hold

### Sales Channel Options
Website, In-app Sales, Conversation, Social Media, Stage (In-person), Podcast/Online Interview, Referral

### Clickable Notifications
Notifications with `entity_type` + `entity_id` navigate to the related record via `navigateToNotifEntity()`.

### KPI Dashboard
Grouped into categories: Revenue & Deals, Pipeline, Leads, Engagement. Includes trend charts for revenue over time and deals created by dollar amount.

---

## Cohort/Segment System

Speaker survey leads are tagged with a `cohort_id` in the format `YYYY-MM-DD-event-name-slug`. This enables:
- Per-cohort duplicate checking (same person can fill multiple event surveys)
- Segment-targeted drip campaigns
- Tags array on leads: `[cohortId, 'speaker-lead-engine-drip']`

---

## SEO Schema & Meta Status (June 2026)

All 4 key pages now have: FAQPage JSON-LD schema, og:image + twitter:image (`knight-ops-banner-build-the-machine.jpg`), meta description under 160 chars, and og:title/description matching the page title.
- `index.html` — Organization + Person + FAQPage (6 Q&A) schema, logo URL in Organization
- `fractional-chief-ai-officer-services.html` — Organization + Person + Service + FAQPage (8 Q&A) + HowTo + BreadcrumbList
- `fractional-ai-officer-services.html` — Organization + Person + Service + FAQPage (6 Q&A) + BreadcrumbList
- `fractional-ai-officer.html` — WebPage + ItemList (2 tiers) + FAQPage (7 Q&A). Design is conversion-critical, do NOT alter visuals.

---

## Known Issues & Tech Debt

1. **CRITICAL: Dirty Vercel CLI deploys wipe pages** — The "KnightOps.app" session (`pensive-adoring-edison`) deploys via Vercel CLI with `gitDirty: "1"`. These deploys use whatever files the session has locally, NOT the full git repo. This has wiped 9 pages from production (fractional-ai-officer, challenge, faq, for-agencies, for-coaches, for-consultants, for-course-creators, for-speakers, unsubscribe). **FIX: That session must stop using Vercel CLI and deploy via git push only.** See Rule 4.
2. **Duplicate portal routes** — Both `/portal` and `/client-portal` exist.
3. **Analytics tracking** — `ko-track.js` accuracy needs review.
4. **/assessment links broken** — 6 pages link to `/assessment` but the file is `assess.html` (serves at `/assess`). Need to either rename the file or add a redirect.

---

## Verification Protocol

**Every change must include verification. Follow this checklist:**

### For SQL Changes
```
1. Write the UPDATE/INSERT/DELETE
2. Run it
3. Run a SELECT to verify the expected state
4. Report the verification result with row counts
```

### For Code Deployments
```
1. Make the code changes
2. Push to GitHub
3. Check list_deployments — confirm state is READY
4. If possible, fetch the deployed page and verify the change is present
```

### For Edge Function Deployments
```
1. Deploy the function
2. Check list_edge_functions — confirm version incremented
3. If testable, invoke the function and verify response
```

### Anti-Pattern: False Positive Completion
**NEVER do this:**
- Label a task as "Fix 1 done" without actually running the fix
- Claim SQL was executed when it wasn't
- Mark a task complete based on intent rather than verified outcome
- Skip verification because "it should work"

**ALWAYS do this:**
- Run the actual command
- Verify the result with a follow-up query or check
- Include the verification evidence in your response
- If verification fails, say so and debug

---

## Deployment Checklist

1. Read current `vercel.json` — never overwrite
2. Make surgical code edits
3. Push via fresh /tmp clone
4. Verify deployment state is READY
5. Check for build errors if state is ERROR
6. Test critical paths if possible

---

## Business Context

Knight Ops is Daniel Knight's AI/tech consulting & development company. Key offerings:

- **Night Launch** ($1,497) — Overnight website delivery
- **Night Build** ($7,497) — Full-stack web/mobile app
- **Night Build Pro** ($14,997) — Full app store deployment
- **Unicorn Universe Premium** ($99/mo) — Entrepreneur community
- **10xUnicorn Mastermind** ($10k/yr) — High-performer mastermind
- **Speaker Lead Engine** ($297) — Event lead capture system
- **AI Marketing Machine** ($99/mo) — Marketing automation

Daniel is also a public speaker and music artist. Communities: Unicorn Universe, Future Self Universe, 10xUnicorn Mastermind.
