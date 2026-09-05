# KnightOps.biz — Project Spec & Source of Truth

> **Owner:** Daniel Knight (dknightunicorn@gmail.com)
> **Domain:** knightops.biz
> **Repo:** github.com/10xUnicorn/knight-ops-site (public)
> **Last Updated:** 2026-09-02

---

## Changelog — 2026-09-04 (Automations module: one map of the whole ecosystem · ecosystem review · Plaud + hand-off fixes in client-meeting-autobuild)

### SYSTEM → AUTOMATIONS — every scheduled task, cron job, trigger, routine and worker, and what they build
- **Why:** 120 Cowork tasks, 14 pg_cron jobs, 67 triggers, 155 edge functions, 3 cloud routines, 2 Cloudflare workers and 35 projects existed with no single place to see how they feed each other. Cowork reported "no task pulls from Plaud" and the only way to check was to read 120 files.
- **Schema** (migration `automations_registry`): `automations` (one row per automation; `is_live=true` rows are refreshed from `cron.job` + `pg_trigger` and must never be hand-edited), `automation_edges` (typed relations: `reads` · `feeds` · `calls` · `triggers` · `writes` · `builds` · `twin_of`), `github_repos`. RLS on, **admin-only via `is_admin()`, zero anon policies.**
- **`ko_automations_refresh_live()`** (SECURITY DEFINER, admin-gated) reads `cron.job` + 7-day `cron.job_run_details` health and every public trigger, upserts them, and marks vanished ones `gone`. **`ko_automation_graph()`** returns ONE payload — nodes, edges, projects (URLs, client, people, open/building/shipped counts, repo), repos, and **computed gaps** (failing cron, disabled triggers, zombie claims with expired locks, `processing` claims stuck >3h, projects with no repo / no folder / folder inside a Cowork session-output dir / no members / outside the 10xUnicorn org / test rows, unlinked repos). ~130KB, one fetch.
- **`automations-sync` edge fn (v1, admin JWT):** GitHub org → `github_repos`, matched to projects by `repo_url` (normalised) then slug; additive `repo_url` backfill; manual links preserved. Repos were seeded from `gh repo list` on day one (24, 15 matched).
- **admin.html → System → Automations** (third inline `<script>` block, ~41KB): Map with six lanes (Sources → Intake → Processing → Build → Outputs → Projects), **Grouped** (default — one node per group/kind, because 120 tasks and 67 triggers are unreadable as individual boxes) ↔ **Everything** (triggers still collapse per table), zoom/pan, red dot = failed runs, amber = gaps/not active; Projects cards (URLs, people, counts, gaps); Repos (with manual link → also backfills `projects.repo_url`); Gaps (severity-sorted with a fix line each); table; Register / Edit / Link-project for catalog rows. Deep link `#automations/<key>`.
- **Cowork tasks reach the registry through `tools/automations-sync-tasks.py`**, which parses every `~/Claude Home/Scheduled/*/SKILL.md` and emits upsert SQL. **Its output is gitignored on purpose — this repo is public and that file is Daniel's internal automation inventory.** New daily Cowork task **`automations-registry-sync`** runs it, applies the SQL, refreshes live rows, and emails only on change or breakage. Daniel sets its schedule in Cowork.
- **Loading 160KB of SQL through the MCP** meant 8 chunks of ~20KB; anything larger is written to disk instead of shown. Noted so nobody fights it again.

### ECOSYSTEM REVIEW (three parallel reviewers: admin.html, Supabase, scheduled tasks) — fixed in this commit
- **admin.html:** blog editor called `toast()` 8× (only `showToast()` exists) — `saveBlogPost` threw *after* the DB write and before the editor closed → fixed. `renderTimerUI()` was called by pause/resume and never defined → defined. `showEventDetail()` did not exist → `editEvent()`. **Two AI-mockup iframes had `sandbox="allow-scripts allow-same-origin"`, so AI-generated HTML ran same-origin with the admin session** → `allow-scripts` only. Silent `.limit(200)` on bookings, emails-by-label and Notes (the April-inbox class) → 1000, annotated.
- **Supabase:** cron `daily-send-cap-ramp-11pct` had **failed 15/15 runs** (`format('%.0f')` is not valid Postgres), never ramped, and its intent (ramp toward 5,000 sends/day) contradicts the 2026-06-22 scraper pause → **disabled** (`cron.alter_job`, reversible). Bug `3a2ce6b7` was stuck `fixing` with 3 attempts and `autofix_error` NULL — invisible to the digest forever → stamped `max_attempts`, back to `new`.
- **A reviewer finding that was WRONG:** "`feature_requests.status='new'` is outside the lifecycle and the digest filters on `pending`". `pending-digest` v10 (2026-08-30) already lists `new` + NEEDS SCOPING as Section 1. No change.

### FOUND, NOT CHANGED — Daniel's decisions (all also appear in the Gaps tab)
- **RLS is OFF on 40 public tables** (`drip_config`, `meeting_follow_ups`, `email_templates/signatures/accounts/rules/settings`, `scheduled_emails`, `agent_*`, `opus_*`…). Anon key can read/write them. Needs a per-table pass — routines may write with anon.
- **29 unreferenced edge functions** + twins (`process-drip`/`process-drip-queue`, `send-email`/`-v2`/`-plain`, `send-scheduled-emails`/`process-scheduled-emails`). Disabled trigger `trg_auto_create_deal` still has its function; dropping both is safe.
- **Scheduled tasks:** 33 dated one-offs + 15 self-declared dead still present; 8 on retired `claude-sonnet-4-6`; real overlaps — 4 drip senders, 3 daily LinkedIn posters, 3 daily briefs, 2 Gmail reply scanners, 2 eden@ triagers, 3 tasks all editing `blog_posts`; `knight-ops-linkedin-promo` still promotes the Blueprint Session publicly; `blueprint-knightops-sync` carries a plaintext bearer token in its SKILL.md.
- `drip_queue`: 561 rows `active` with `next_send_at` in the past while `process-drip` sends 0 every 5 min. 5,091 unread notifications; `on_task_assigned` fires on every task UPDATE.
- Projects: 4 `build_folder`s inside Cowork session-output dirs, Vision Espresso repo outside the org, ~8 test/garbage rows, WWR + Paradyme Lift as two rows, almost no `project_members`.

### client-meeting-autobuild (Cowork SKILL.md, not in this repo)
- **Had zero Plaud references** — Cowork was right. Now reads Plaud as an independent second queue; Daniel's voice is an instruction, a `mark_memo` is emphasis, matching is on product nouns because Plaud has no invitees.
- **Cloud rows had no exit:** PART ONE selected `status='launched'` only; the cloud routine cannot launch and its rows stop at `queued`/`flagged`/`skipped`. Widened, with a two-pass hand-off (queued → real session after the exclusion sweep; flagged/skipped → note + vault only). Verified 16 recordings, zero overlap between runners — **the two are not duplicating.**
- **Claim-before-work (STEP 0D):** the dedupe row was written at STEP 8, after launch. At 4×/day nothing overlapped; at hourly a slow run got its recording picked up again. The row is now inserted as `processing` up front and updated at STEP 8 — same mechanism, earlier. Round-tripped live, torn down.
- Cadence: **hourly at :35, 7:35am–10:35pm Phoenix** (`35 7-22 * * *`); quiet hours do bookkeeping only, never launch a Terminal. Daniel sets the schedule in Cowork.

---

## Changelog — 2026-09-02d (The orchestrator counted mobile builds and then stopped on them anyway)

- **Symptom:** an approved mobile build ("Woman Wisdom Revolution" / Paradyme Lift) sat untouched. **Cause:** STEP 0's count SELECT was extended with `mobile`, but the *stop condition* on the next line was not — it still read `if bugs=0 AND features=0 AND (builds=0 OR H not in {slots}) → STOP`. With no bugs, no features and no dashboard builds, the orchestrator stopped silently before ever reaching STEP 3B, at any hour.
- **Caught in the act:** the task's `lastRunAt` was **08:23:46**, forty-one seconds *after* the build was approved at 08:23:05. It ran, it counted `mobile=1`, and it stopped anyway.
- **This is the same silent-skip class as the `queued` vs `approved` bug already documented in that file** — a gate that quietly excludes real work — reintroduced by me on 2026-09-02. The file now carries the rule in bold: **every count in the SELECT must appear in the stop condition; add a work type in BOTH places or it will never run.**
- **Also removed the 4-hour slot gate from STEP 3B.** A mobile build now fires on the very next run after approval, like a bug fix does. The real guards against runaway spawning are stronger than a clock and already in place: cap of 1 build per run, the per-folder buildlock, and the atomic `and status='approved'` claim. Waiting hours for a slot just looks broken to whoever pressed approve.
- Orchestrator remains `*/30 * * * *`, enabled, on `claude-fable-5-1` at medium effort.

---

## Changelog — 2026-09-02c (The emails were unfindable, not missing: the inbox only ever loaded 200 · access-gating standard)

### THE INBOX HAD A HARD `.limit(200)` AND SEARCHED CLIENT-SIDE
- Reported as "April's emails are gone". They were not gone. `loadEmailInbox()` pulled the newest **200** rows and `filterEmailList()` then filtered **that array in memory** — so search could only ever find what the folder had already loaded.
- April has **7** emails in the daniel@ inbox, at row positions **73, 74, 244, 303, 336, 523, 559**. Only the first two fall inside 200 — **exactly the two Daniel could see.** The diagnosis is arithmetic, not a guess.
- Search also never looked at `body_text`, so a forward whose subject and sender do not mention the person was unfindable. Daniel's own "Fwd: WWR App Build" had arrived fine and sat at the top of the inbox; searching *April* just could not match it.
- **Fixed:** search is now a **server-side query across ALL mail, every folder**, over subject + from_address + from_name + snippet + **body_text**, debounced 260ms, with the term sanitised because PostgREST `.or()` is comma/paren delimited. "april" returns **38** matches where the UI previously showed 2.
- **The `.limit()` is gone entirely** — an inbox has no bottom. `loadEmailInbox(append)` now pages with `.range()` at 200/page, auto-loads on scroll near the bottom, and offers a *Load older mail* button; search paginates the same way. When the end is genuinely reached it says *"That is everything."*
- Account filter switched from `.eq` to `.ilike` — one row is `Eden@knightops.biz` and `.eq` silently missed it.
- **The lesson worth keeping:** a list that silently truncates is indistinguishable from data loss, and the user will (correctly) report it as data loss. Never cap a list the user searches without telling them the cap exists.

### ACCESS GATING IS NOW A SINGLE STANDARD PATTERN FOR EVERY APP
Written into the build prompt so every generated app is identical and works the moment keys land:
1. **A designed public checkout page** on the web surface (`/join`), using the app's own tokens — a sales page, not a form. Structured to convert: outcome-led headline, who it is for, before → after, concrete deliverables, price framed against the cost of inaction, top 3 objections answered, social proof if it exists, risk reversal, ONE repeated CTA. Written in the client's own vocabulary. **Never invent testimonials, numbers or guarantees — an invented testimonial is fraud, not copy.**
2. **Entitlement lives in the database**, never client state. One table keyed to the user (status, plan, period end, stripe ids, `source` = stripe|iap|manual, `granted_by`). A single server-side `hasAccess(user)` is the only decider, and **RLS enforces it too — UI hiding is not access control.**
3. **Stripe drives it automatically** — webhook is the source of truth; `checkout.session.completed` grants, `subscription.updated` re-syncs, `subscription.deleted`/failed payment revokes. Idempotent, signature-verified. StoreKit purchases write the same table with `source='iap'`, so one check serves both routes.
4. **The admin dashboard manages access directly** — grant, revoke, and see *why* someone has access. A manual grant is a first-class row, so `hasAccess()` never special-cases it. **This works before any Stripe keys exist**: Daniel hand-grants on day one, and when keys land Stripe simply becomes a second writer to the same table. Nothing about the app changes when payments go live.
5. **Proven before done:** grant manually → gated screen unlocks; revoke → re-locks; test-mode checkout grants via webhook with nobody touching the database.

**The public page has a standard now too** (`/join`): design it with the **`ui-ux-pro-max` skill** rather than improvising (and if the skill is unavailable in that session, say so and hold the same bar); purposeful motion that **honours `prefers-reduced-motion`**; and an **interactive demo of the real app** embedded from the React Native Web bundle the build already produces — tappable, seeded, showing the moment the product is good at, never screenshots or stock mockups.

**Voice is the part most builds get wrong.** The builder mines the client's own docs, transcripts and site for their vocabulary, metaphors and sentence rhythm and writes in it. Banned as AI tells: *unlock, elevate, empower, transform your, take it to the next level, in today's fast-paced world, dive in, seamless, robust, game-changer,* "journey" as filler, "it's not just X — it's Y", rhetorical-question openers, stacked em dashes. **If a sentence could headline any product in any industry, delete it and write the specific one.** Conversion-optimised but not salesy: no fake urgency, no countdown without a real deadline, and **never invent a claim, testimonial, number, logo or guarantee — an invented testimonial is fraud, not copy.** With no social proof the section is omitted, not fabricated.

---

## Changelog — 2026-09-02b (April's "missing" emails: they were hidden, not deleted · Apple external payments · Stripe wiring)

### THE EMAILS WERE NEVER DELETED — AN OVER-BROAD `is_inline` FLAG WAS HIDING THEM
- April Little's files were reported missing. Every one of her emails was present (inbox, not deleted, not archived, not spam) and **every byte was in the `email-attachments` bucket the whole time**, at exact size. What was wrong was the `is_inline` flag.
- **Root cause:** `knightops-email-worker` set `is_inline: att.disposition === 'inline' || !!att.contentId`. Mail clients put a **Content-ID on anything dragged into the message body**, so a client's real work gets flagged as signature noise — and `email-files` `list` filters `is_inline=false` for every scope except `email_id`, so it vanishes from lead / client / project file lists. It had swallowed April's **1.9 MB `s&s (6).png` brand logo**, `Fierce & Free (27).png`, her `WWR_App_Business_Plan.docx` and her `.md` dev spec. A `.docx` is never a signature logo.
- **Fixed at source:** new `isInlineNoise()` — inline noise is a **small image** only (`< 100 KB`, `image/*`, and actually flagged). A non-image is never a signature; neither is a large image. **Erring toward showing costs a little noise; erring toward hiding loses client assets.** Worker redeployed (`npx wrangler deploy`, version `bbae1400`); **`WEBHOOK_SECRET` verified still bound afterwards** — it is a Cloudflare *secret*, and losing it silently stops inbound mail reaching the CRM.
- **Data repaired:** 7 attachments un-hidden (April ×4, Angela ×2, Plaud ×1). PodMatch's 97 KB signature graphics correctly stay hidden. 5 new regression checks in `knightops-email-worker/test/parse.test.mjs`; 15/15 pass.
- **THE ANTELOPE CANYON IMAGES WERE NEVER ATTACHMENTS.** Her 2026-08-26 email says *"I've included a few red rock images for the S&S background"* — Gmail converted them to **Google Drive links**, so they never entered the mail as files. Three links are in that email body (`5304dfea-…`). They live in April's Drive, not in any inbox. **Nothing to recover; the link is the artifact.**
- **A separate, older problem, unrelated to this one:** 91 attachments (≈6.6 MB, May–July 2026) have metadata but `storage_path IS NULL` — the pre-2026-08-25 worker measured bytes and threw them away. Not recoverable from our side. **None are April's** (her one byte-less file is a 2026-08-18 `.docx` she re-sent on 08-25 *with* bytes). The originals should still be in Gmail: the worker forwards to Gmail in its own try block, independent of the CRM write.

### APPLE'S 2025 EXTERNAL-PAYMENT CHANGE IS NOW A DECISION, NOT AN ASSUMPTION
- After the **May 2025 Epic v. Apple contempt ruling**, US-storefront apps may link OUT to a web checkout with **no Apple commission** and without the old scare screens. So "digital goods ⇒ StoreKit" is no longer the whole story.
- New **`payment_routing`**: `n_a` · `iap_only` (default — best conversion, every country) · `iap_plus_external` (usually best for a US-heavy audience with a real price point) · `external_link` (US-only, high ticket, existing web checkout). `mobile-analyze` decides it automatically from price point, audience geography and whether a web checkout already exists, writes plain-language reasoning into `payment_routing_reason`, **and it is also a question on the intake** so Daniel can override.
- **The nuance that must never be lost: the no-commission link-out is US-storefront.** Outside the US, in-app digital purchases still generally require StoreKit and the EU runs its own DMA regime — so `external_link` means non-US users cannot buy. The build prompt requires either geo-gating the purchase UI to the US or shipping StoreKit as well, and tells the builder to **verify current App Review terms at submission time** because this area is actively litigated.
- Verified live: `$497/mo` US-only coaching → `external_link` (*"roughly $75 to $150 per member every month… you already have a working Stripe checkout"*); `$4.99/mo` in 40+ countries → `iap_only` (*"most of them cannot legally be routed to an external checkout anyway"*). `iap` is dropped from capabilities when no purchase goes through Apple.

### STRIPE IS THE DEFAULT WHENEVER MONEY DOES NOT GO THROUGH APPLE
- New `payment_processor` (defaults to `stripe`) + a `stripe` jsonb, and a small dedicated **`mobile-stripe`** edge fn (`status` / `set_keys`) so the credential path is small enough to audit at a glance.
- **Security shape, deliberate:** the **publishable key** is public by design so it sits in a plain column; the **secret key and webhook signing secret go to Supabase Vault encrypted** via `ko_set_stripe_secret()` — never a column, never returned to a browser. The row records only *whether* each is set. Verified: 2 Vault entries, `row_leaks_secret = false`, and the admin inputs are cleared on save so no secret lingers in the DOM.
- Admin → Mobile Apps → build detail gains a **💳 Stripe wiring** card: three inputs, mode toggle, webhook URL, status dots, and a "Where do I get these?" walkthrough (Developers → API keys; Developers → Webhooks → Add endpoint, with the exact events to subscribe to). It recommends a **restricted key** (`rk_live_…`) over the full secret key.
- The build prompt now requires the app to be built against `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` / `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET`, to **never hardcode or wait for keys**, to verify every webhook signature (an unverified endpoint hands out free product), to keep entitlement in the DB rather than client state, and to emit **`STRIPE-SETUP.md`**. Until real keys exist the app must run in test mode and **degrade honestly — a disabled buy button, never a fake success**.

### `mobile-build`'s ALLOW-LIST NOW DERIVES ITSELF FROM THE TABLE
- `dashboard-build` (41 entries) and `dashboard-mockups` (34) drifted, silently dropping fields. Rather than repeat that, `mobile-build` reads its writable columns from `ko_mobile_build_columns()` at cold start and subtracts a `SERVER_OWNED` denylist. **Add a column and it just works** — no redeploy, no drift. It also hardened injection: verified that `build_live_url`, `approved_by` and `project_id` sent from a client are refused.
- Also fixed: POSTing `{}` to the anon-reachable `mobile-build` used to mint a blank draft row forever. New rows now require something real on them.

---

## Changelog — 2026-09-02 (Mobile App Builder — native Expo apps, scoped from uploaded documents)

Full spec: **`MOBILE-APP-BUILDER-SPEC.md`**. Sibling of the Dashboard Builder, deliberately a different shape.

- **NEW PAGES, ZERO `vercel.json` CHANGES.** `/mobile-intake` (`mobile-intake.html`, the builder) and `/mb?t=<token>` (`mb.html`, the client review + approve page) are both served by the existing catch-all `/:path` → `/:path.html`. Same precedent as `/shift`. **Rule 1 held: `vercel.json` was never touched.**
- **WHY IT IS NOT THE DASHBOARD BUILDER.** The dashboard builder composes 37 `os_modules` into ≤7 sidebar workspaces. A phone is not a sidebar. The unit here is a **SCREEN** (33 in `SCREENS`), navigation is a **tab bar capped at 5** (`tabPlan()`, Apple HIG — overflow folds into a sibling tab as a segmented control, never a "More" tab), and there are two axes the dashboard has none of: **native capabilities** (19, each carrying its Expo package and iOS usage-description) and **App Store readiness**.
- **THE CLASSIFIER IS THE POINT.** `mobile-analyze` returns `target` = `native` | `web` | `both` with a written reason. A back-office/CRUD brief comes back **`web`** and is pointed at `/dashboard-intake` rather than dressed up as an app — App Store Guideline **4.2** rejects repackaged websites, and we never emit Capacitor, Cordova or a WebView shell. Verified live: a bookkeeping brief returned `web`; a coaching-app brief returned `native`.
- **THE IAP TRAP IS ENCODED.** Guideline **3.1.1**: digital content or subscriptions consumed in-app MUST use StoreKit, not Stripe. The analyzer sets `monetization` and the UI, the build prompt and the admin card all say so out loud. Verified live: "members pay $29/mo for premium lessons inside the app" → `monetization: iap`. Also enforced: **5.1.1(v)** (sign-up ⇒ in-app account deletion is auto-added as a screen) and **4.8** (Google sign-in ⇒ Sign in with Apple required).
- **Stack it emits (Layer B):** Expo + expo-router + TypeScript, Supabase (own project per app, Rule 7), EAS Build with real bundle ids, expo-updates. **The pipeline stops at a store-ready binary — it never auto-submits, and no Apple/Google credentials live in Knight Ops.**
- **THREE SURFACES, ALL IN THE INITIAL BUILD — never a phase 2.** From ONE repo and ONE Supabase project:
  1. the app itself (Expo → EAS binary);
  2. **`web_app`** — a web version of the same app via React Native Web → Vercel. **Default on**, deselectable when the product is meaningless off a phone;
  3. **`web_dashboard`** — the **operator web dashboard** (Next.js on Vercel, same Supabase project): track metrics, manage users, monitor KPIs. **Default on for every app** — a business that cannot see its numbers or manage its users cannot run the product.
  `target` remains the classifier's verdict about the *consumer product*; these two are independent of it, so a native-only app still gets a dashboard. Sections (`ops_modules`): `overview_kpis`*, `users`*, `engagement`, `revenue`, `push`, `content`, `support`, `health`, `settings`* (*always built; `revenue` forced whenever anything is sold, `push` when the app has push, `content` when it has moderation). The dashboard is a **privileged reader of the same tables** — never a second database, never a parallel permission model — staff-gated by RLS *and* a role check, not a hidden route.
- **EVERY KPI MUST HAVE AN EVENT BEHIND IT.** `ops_kpis` is chosen from a fixed list of 20, and the spec names the analytics events each metric is computed from. A KPI with nothing writing to it is a number that never moves — that is a failed build, not a working dashboard. The dashboard gets its **own mockup** (`mobile-job` `kind:'dashboard'` → `dashboard_mockup_html`) because it is a desktop web app and cannot share the phone-frame renderer.
- **Tables:** `mobile_builds` (74 cols) + `mobile_jobs`. Bucket `mobile-assets` (public read, anon insert — PDFs/screenshots go to Claude by URL).
- **THREE THINGS DELIBERATELY NOT COPIED FROM THE DASHBOARD BUILDER, because they are bugs:**
  1. `dashboard_builds` carries `anon_read USING (true)` — anyone with the public anon key can read **every column of every build, including `resume_token`, `share_edit_token`, `email` and `build_prompt`.** `mobile_builds` has **zero anon policies** (admin + service_role only); every read goes through `mobile-shared`, which returns a safe subset and never the tokens. Verified: anon SELECT → `[]`.
  2. `dashboard-analyze` and `dashboard-job` are **unauthenticated Anthropic spend**. `mobile-job` requires a real build token. Verified: an anonymous `start` returns 401.
  3. `dashboard-build` (41 fields) and `dashboard-mockups` (34) have **already drifted**, so a field saved by one path is silently dropped by the other. The mobile set has **ONE** `FIELDS` list, and mockup add/choose live inside `mobile-build` rather than a second function.
- **ONE ready state.** The dashboard writes `approved` from one path and `queued` from two others, which is why the orchestrator silently skipped approved builds for months. `mobile_builds` has exactly one: **`approved`**. Lifecycle `draft → submitted → reviewed → approved → building → built|error`.
- **Edge fns (4, all `verify_jwt=false`, service-role internally):** `mobile-build` (save/resume/submit/approve/save_edit/add_mockup/choose_mockup/**build_status**), `mobile-analyze` (pre-fill + classifier), `mobile-job` (segmented mockup/spec/store generation — same proven mechanics as `dashboard-job`: assistant prefill, `thinking:{type:'disabled'}` on continuation, `stop_reason==='max_tokens'` loop, `textOf()` never `content[0]`; guard swapped to **tab-bar + frame count**), `mobile-shared` (token-scoped read, server decides review vs edit). Env: `MOBILE_ANALYZE_MODEL` (opus), `MOBILE_MOCKUP_MODEL` (sonnet), `MOBILE_CLASSIFY_MODEL` (haiku), `MOBILE_SEG_TOKENS`, `MOBILE_AI_EFFORT`.
- **admin.html:** new **Delivery → Mobile Apps** view (list + detail with mockup iframe, build lifecycle, store pack), `#mobileApps/<id>` deep links, and a 6th **📱 Mobile App** button in the Build Prompt Generator. Also fixed an adjacent latent bug: **`S.dashboardBuilds` was referenced by `showDashboardPrompt()` but never declared or populated**, so its saved-`build_prompt` short-circuit had never once fired — it now lazily loads.
- **Orchestrator:** new **STEP 3B — MOBILE APP BUILDS** (cap 1/run, 4-hour slots), claimed by `update … set status='building' where id=… and status='approved'`, reporting progress through `mobile-build` `build_status` (a raw anon PATCH is RLS-blocked by design).
- **NEW REPO TOOLS** (`tools/`) for the two checks CLAUDE.md mandates but never had scripts for: `script-check.py` (`node --check` every inline `<script>` block) and `onclick-check.py` (every `on*` handler resolves). Plus `callcheck.py` for bare calls inside function bodies — which is what caught a `toast()` call in admin.html, where the function is `showToast()`.
- **Verified end to end:** submit → lead + project + `intake_submissions(form_type='mobile_app')` created; review token → `mode:review` with no leaked fields; edit token → `mode:edit`; bad token → not found; approve → `approved`; `build_status` → `building` at 25%; the orchestrator's exact STEP 3B query returns the row. A real mockup segment produced 13,875 chars with phone frames, a tab bar and a status bar. All test rows removed (`mobile_builds` and `mobile_jobs` back to 0, no stray leads/projects/intakes). `node --check` clean on both `admin.html` blocks; all 499 onclick targets resolve.

---

## Changelog — 2026-09-01 (Funnel discipline: the Blueprint is step 2 and is no longer publicly linked)

- **THE TWO BOOKING PAGES ARE NOT INTERCHANGEABLE, AND THEY ARE NOT "INVERTED" — THEY ARE TWO STEPS.** `/book` (`book.html`, GHL widget `F2GsBGGCAYHgnQees0pV`) is the **Tech Discovery Call — free, 20–30 min, the ONLY public entry point**. `/book-tech-call` (`book-tech-call.html`, GHL widget `7msTu7auncoqSK3zOI4J`) is the **Systems Blueprint Session — step 2, extended by invitation after the discovery call**. The filename reads backwards from what it serves; that is a legacy artifact and is now harmless because **nothing on the public site links to it**. Do not "fix" the naming by swapping the widgets — that would silently repoint every invitation already in the wild.
- **`/book-tech-call` is now unlinked sitewide.** A sweep across all public pages verified **zero** remaining public links to the blueprint booking page or to `/mini-blueprint`. Repointed or removed: `index.html` (3 hero/section CTAs → `/book`, relabeled "Start With a Tech Discovery Call"; 1 prose link unlinked), the five `for-*.html` ICP pages, the four `apps-for-*.html` pages, `pricing.html`, `website-intake.html`, `faq.html`, and `fractional-ai-officer.html`. **Before adding any booking CTA to a public page, point it at `/book`.**
- **Both booking pages lost their green trust-bullet blocks** (`.trust` / `.trust-item`) — six on `book-tech-call.html` (one of which was the public `Blueprint Session Intake` link to `/mini-blueprint`) and four on `book.html`. `book.html` still *mentions* the Blueprint in the "An Honest Fit Decision" copy, deliberately as plain text with no href: prospects should learn it exists without being able to self-serve into step 2.
- **ROOT CAUSE OF THE CUT-OFF SERVICES BUTTONS: `white-space:nowrap` on `.btn-sm`.** A non-wrapping label cannot shrink below its own single-line width, so long CTAs ("Explore the AI Business OS →") overflowed their grid column and got clipped. Removed, replaced with `display:inline-block; max-width:100%`. **Do not put `white-space:nowrap` on a button that lives in a grid or flex column** — it defeats every width constraint around it.
- **Services now reads as a progression, not a menu.** The `.grid-3` service cards were replaced with a numbered `.stages` vertical rail — **01 Tech Discovery (Free) → 02 Systems Blueprint (Complimentary, BY INVITATION) → 03 AI Business OS (from $15,000) → 04 Continuity (from $1,000/mo) → 05 FCAOO (from $7,500/mo)**. Stage 02 deliberately carries **no link at all** — a badge plus the note "Extended by invitation after the discovery call". Every stage CTA now uses the identical `btn-cyan-outline btn-sm` treatment. "Full ownership, always." was pulled out of the numbered sequence into a standalone card, because it is a standard that applies at every stage rather than a stage of its own.

---

## Changelog — 2026-08-31b (Pipeline & revenue true-up: the numbers were invented)

- **THE PIPELINE WAS ~75% FICTION.** 188 deals, 122 "open" worth **$943K**. Sources of the inflation, each now fixed: (1) `fn_sync_intake_to_lead` inserts a **$7,500 "<company> - Blueprint Session"** deal on every intake form; (2) an external booking sync writes **$7,497 "<name> - Blueprint Session"** deals with `source='inbound_booking'` in timestamp batches — it is not in this repo (bookings table has 1 row; these came from the GHL booking flow via a scheduled task); (3) `fn_auto_create_deal_on_engagement` (trigger already disabled) had created $7,497 deals from email clicks; (4) duplicates of real deals — April Little's one $15K build existed as **three won deals ($45K)**, Christie Mann and BSEC twice each, Backyard Property twice; (5) 10 deals had `stage='closed_lost'` with `status='open'` and were counted as pipeline.
- **Everything is reversible.** `archive_trueup_deals`, `archive_trueup_stripe_payments`, `archive_trueup_revenue_payments` hold full pre-change copies (RLS on). Every touched deal carries `deals.trueup_note` naming the rule (R1–R6). Nothing was deleted; placeholders got `status='cancelled'`.
- **Rules applied:** R1 stage/status mismatch → status follows stage. R2 Daniel's own emails / `placeholder.invalid` / "test" titles → cancelled. R3 placeholder-titled, placeholder-valued ($1,497/$7,497/$7,500) auto-deals → cancelled when the lead already has a won deal, already has a real open deal, or has **no proposal, no Fathom meeting and no inbound email**. R4 explicit duplicates (Keira, Lance ×2, Makenzie, Niko ×2, Backyard) → cancelled; April/Christie/BSEC collapsed to one deal each with the Stripe payment rows **repointed** to the kept deal. R5 generic Stripe deals retitled ("Payment for Invoice" → Stephanie Frank retainer / Go Mobile invoice), Chrissy's unmatched $997 attached to her retainer. R6 open discovery-stage placeholders whose call **did** happen (meeting or reply exists) stay open at **$0 / ≤20%** until a real number is quoted — a held call is a conversation, not $7,497.
- **Result: 42 open / $229,437 ($120K weighted) · 21 won / $107,632 · 99 cancelled.** Cash actually collected on record: **$42,938** = $34,988 through Stripe/ACH (12 rows, the $2 Stripe test ignored) + $7,950 Daniel logged by hand in April.
- **NEW GUARD: `trg_deal_automation_guard` (BEFORE INSERT on deals).** Any deal with `created_by IS NULL`, an automation `source`, and a placeholder value enters at **$0 / 20%** with a `trueup_note`. Automations may open a conversation; only a human assigns money. The intake trigger and the booking sync still run — they just can't inflate anything.
- **REVENUE CARDS WERE NEVER READING PAYMENTS.** Dashboard "Revenue (Period)" and KPIs "Total Revenue" summed `projects.contract_value` by *project creation date*; the KPI revenue chart did the same. The $77K sprint card read `revenue_payments`, an April–May list where 13 never-collected "pending/scheduled" rows (incl. "New Deal #1/#2") showed as **$20,247 pending** three months after the sprint ended — those are now `cancelled`. New `koLoadCollected()` is the single basis: `stripe_payments` (succeeded, not ignored, net of refunds) + manual `revenue_payments` marked collected, deduped by deal. Cards renamed **Revenue Collected / Collected (Period)** so nobody mistakes them for contract value; "Won Deal Value" now also shows how much of it is not yet collected.
- **Deals view hides `cancelled` by default** ("Active" filter); "Cancelled / placeholders" and "Everything" options expose them.
- **Still flagged for Daniel (not changed):** "Subscription creation" deal `e9976c7d` — a $3,750 Stripe charge with no customer on it, deal_value $11,250 is a guess; won deals with **$0 collected**: Stephanie Frank "Unified Ecosystem Build" $9,997, Chrissy Bernal "Blueprint Session" $7,497, "Bill - Blueprint Session" $7,497, Nayia Pierrakos $7,497, Keira Brinton Command Center $7,500, Grow Your Niche $4,500, Mad Fresh $2,500 — either paid outside Stripe (log the payment) or not actually won. Biohack Yourself sits in negotiation at **$59,964** from an intake budget field.

---

## Changelog — 2026-08-31 (Booking system rebuilt: it had never worked; now on Google Calendar with invites from knightops.biz)

- **THE HOMEGROWN BOOKING SYSTEM (`/booking` + admin Bookings) HAD NEVER WORKED END TO END.** `booking.html` inserted straight into `bookings` with the anon key, bypassing `booking-create` — so no confirmation, no host email, no lead, no reminder ever fired for a public booking. `booking-create/-cancel/-reschedule/-reminders` all used `guest_name`/`guest_email` (the columns are `booker_name`/`booker_email`), so every call failed; admin's detail view showed blanks for the same reason. Reschedule created a SECOND booking instead of moving the first. Slot conflicts were per booking type, so two call types could be booked on top of each other. Reminders had **no cron job at all**. **RLS was off on all seven booking tables** — the public anon key could list every booking, cancel tokens included. And the "Connect Google Calendar" button was theatre: it prompted for a client ID, built an OAuth URL it never opened, and showed a hardcoded "✓ Edge function deployed" badge for a function that did not exist. `/book` and `/book-tech-call` (the pages the site actually links to) are GHL iframes that never touch Supabase.
- **`booking-create` v14 is the single write path.** DB + Google free/busy conflict checks across ALL types → insert → private Google event → emails with a real invite → reminders → lead → notification. A Google failure never loses the booking: it lands in `bookings.google_sync_error` and admin shows **Retry sync**. `booking-cancel` v13 / `booking-reschedule` v13 delete or patch the Google event in place. `booking-reminders` v12 runs on pg_cron **`booking-reminders-10min`**. All four are real source under **`supabase/functions/`** (shared code in `_shared/gcal.ts` + `_shared/booking-mail.ts`; the MCP deploy rewrites `../_shared/` → `./`).
- **RLS on everywhere.** Anon reads only active/non-private `booking_types`, active `booking_availability`, `booking_overrides`, and a whitelist of `booking_settings` keys. `bookings` has no anon policy at all; the slot picker gets busy windows from **`booking_busy(from,to)`** (start/end only, every type) and reschedule/cancel pages read through **`booking_lookup(id, token)`**. Admins go through `is_admin()`. Verified: anon SELECT `bookings` → `[]`, anon INSERT → 42501.
- **Google OAuth is real now.** Google Cloud project **`knight-ops`** (org unicornuniverse.io, consent screen *Internal* so there is no verification and no 7-day refresh-token expiry), OAuth client "Knight Ops Booking Sync (Supabase)", redirect URI `https://trpnlkntvulkjerevngm.supabase.co/functions/v1/google-oauth/callback`. Client id/secret live in **Supabase Vault** as `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET`, read only through **`public.ko_secret()`** (SECURITY DEFINER, execute granted to service_role only — anon gets `permission denied`). New **`google-oauth`** edge fn (v3, verify_jwt=false): `start` builds the consent URL with an HMAC-signed state, `/callback` exchanges the code and stores the refresh token in **`google_calendar_connection`** (RLS on, zero policies), `status` / `disconnect` / `test_event` / `resync_booking` / `set_share_with` are admin-only, `busy` is public and returns start/end ranges only. The connected account is **daniel@unicornuniverse.io**; on first connect it created the secondary calendar **"Knight Ops Bookings"** (`c_b10894be…@group.calendar.google.com`) and shared it with daniel@knightops.biz.
- **INVITATIONS COME FROM daniel@knightops.biz, NOT FROM GOOGLE — AND THIS IS STRUCTURAL.** `knightops.biz` MX is Cloudflare Email Routing, not Google, so daniel@knightops.biz is not a Google Calendar identity and Google cannot originate an invite from it; any Google-sent invite would show the connected unicornuniverse.io account (the first test proved exactly that). So: the confirmation email — already sent by us from daniel@knightops.biz — carries a real iCalendar invite (`buildIcs`: `METHOD:REQUEST`, `ORGANIZER:mailto:daniel@knightops.biz`, `UID:booking-<id>@knightops.biz`); reschedule sends the same UID with a higher `SEQUENCE`; cancel sends `METHOD:CANCEL`. **The Google event is Daniel's private record: no attendees, `sendUpdates=none`.** Do not add the guest as an attendee to the Google event again — that reintroduces the unicornuniverse.io sender.
- **Google Meet auto-create is refused on this calendar** ("Invalid conference type value"). `syncBookingEvent` retries without `conferenceData`, so a booking never fails over a video link. Zoom-type booking types have no link unless **Booking Settings → type → "Meeting link"** (`booking_types.location_value`) is set; that value goes on the invite and every email. Until it is set, emails say the link will be sent before the call.
- **`leads.status` is an enum and `'booked'` is not in it** — the old lead write was silently failing. A booked call now sets `qualified` only if the lead is at `new/contacted/replied/not_qualified`, never downgrading.
- Fixed on the way: `booking.html` rewrote its own URL to `/book?…` (the GHL page) on every step, so a reload lost the flow; notes were printed twice on the Google event; admin cancel now goes through `booking-cancel` so the guest is told and the event is removed.
- **OUTAGE I CAUSED AND FIXED (same day):** a copy tweak put an unescaped apostrophe (`guest's`) inside a single-quoted JS string in `koGcalRender`, which broke the entire main `<script>` block — the whole admin went dead until `3449074`. `node --check` on both inline blocks catches this instantly; **read its full output, never `| tail -1` it.** The onclick-target check alone does not catch it.
- **Verified live, twice**: public `/booking` flow in Chrome → row + 2 reminders + lead; Google event confirmed via the Calendar API (correct calendar, Phoenix time, no attendees); admin cancel → event gone; the second run's guest invitation was routed back into the CRM inbox through the Cloudflare worker, where the stored `invite.ics` was inspected: `METHOD:REQUEST`, organizer daniel@knightops.biz, no unicornuniverse anywhere. The free/busy guard refused a slot Daniel is genuinely busy for. All test rows removed.

---

## Changelog — 2026-08-30 (The inbox actually behaves like an inbox: readable mail, real replies, threading)

- **RECEIVED MAIL WAS RENDERING BLACK-ON-BLACK, AND IT WAS AN INJECTION HOLE.** `renderEmailReadingPane` dropped raw `data.body_html` into the pane with `color:var(--text)` on a dark background. Senders style for a white background and ship their own colours, so any message that set dark text (or none) was invisible. Worse, the sender's HTML went straight into `innerHTML` — `<script>` will not run that way but **`<img onerror=...>` will**, so every inbound email was arbitrary script execution in the admin dashboard. Both are fixed by `koRenderEmailBody()`: each message renders in its **own sandboxed iframe with a white sheet**, `sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"` — **no `allow-scripts`, so nothing in a received email can execute**. `allow-same-origin` is present only so the height can be measured; with scripting off it grants the frame nothing. Content is sanitised first by `koSanitizeEmailHtml()` (drops `script/style/link/meta/base/iframe/object/embed/form`, all `on*` attributes, and `javascript:` URLs). **Never render sender HTML inline again** — and note that stripping `<style>` also matters for the composer, where a sender's `<style>` block inside contenteditable would repaint the entire admin UI.
- **REPLIES WERE QUOTING `item.snippet`, WHICH IS 200 CHARACTERS.** That is the whole "it cuts off part of the email" bug. `replyToEmail` also read from `emailListData`, and **the inbox list query does not select `body_html` at all**, so the full message was never even in memory. It now re-reads the row with `select('*')` and quotes the entire message. Because the quote travels inside `body_html`, replying to a reply now keeps the whole chain. Verified on a real thread: **4,869 characters quoted where the old code produced 200.**
- **REPLY ALL WAS DEAD CODE.** `replyToEmail(id, mode)` accepted `mode` and never read it, so Reply All was byte-identical to Reply and dropped every other participant. It now puts the sender in To and the original To + CC in CC, minus our own addresses (`koMyAddresses()` reads the From picker plus the four `@knightops.biz` mailboxes) and minus the sender. Verified live: To `angela@…`, CC the two other participants, `daniel@knightops.biz` correctly excluded.
- **THE AI COULD NOT WRITE A REPLY BECAUSE IT WAS NEVER SHOWN THE EMAIL.** `ecAiGenerate` sent only preset/instruction/project/client. `email-ai` **v5** now takes `reply_to_email_id`, loads that message and up to **8 messages of its thread oldest-first**, and is told the last one is what it is answering. The system prompt gained a REPLIES section: answer what was actually asked, do not summarise their message back, do not re-introduce yourself ten messages deep. Verified live — it read a 2-message thread and answered Angela specifically rather than writing a generic new email.
- **GENERATING A DRAFT USED TO DELETE THE QUOTED HISTORY.** `ecAiGenerate` replaced the whole body, preserving only `.ec-sig`. It now preserves `.ec-quote` as well, and **a reply keeps its `Re: ` subject** — letting the model rename the subject mid-thread is itself a threading break.
- **REPLIES NOW THREAD IN THE RECIPIENT'S CLIENT.** `send-plain-email` **v19** passes `In-Reply-To`/`References` to Resend, taken from the parent's `message_id` and existing `headers.references`. Headers are **allow-listed to those two** and CRLF-stripped — a raw passthrough here would be header injection. `emails.reply_to_id` and `cc_addresses` are now recorded on the sent row too.
- **Compose window is 750×644** (was 600×560 — +25% wide, +15% tall), with the extra height going to `.ec-body` (207–276px) rather than the chrome.
- **Replying no longer hijacks an open draft.** `replyToEmail` never cleared `emailEditingDraftId`, so hitting Reply while editing a draft and then sending would **overwrite that draft**. `koResetComposeState()` now clears the draft id, attachments, CC/BCC and reply context on every reply/forward. Replies and forwards also get the default signature, and forward carries the full message with real From/Date/Subject/To headers instead of a snippet.
- **Verified live on production against a real 2-message thread** (Angela Sticca Snyder, 21,675 chars of HTML, 2 CC recipients): reading frame `rgb(255,255,255)` background / `rgb(17,17,17)` text with **0 scripts** and 4,775 characters visible; Reply All recipients exactly right; 4,869 characters quoted and **byte-identical before and after** the AI wrote the draft; signature intact; subject held at "Re: Introduction"; composer measured 750×644. Nothing was sent.

---

## Changelog — 2026-08-25 (Email attachments are real files — the mail worker was dropping every byte)

- **ROOT CAUSE: `knightops-email-worker` measured every attachment and threw it away.** The deployed Cloudflare Email Routing worker built its webhook payload with `size: att.content?.byteLength || 0` and never sent `att.content`. So **every inbound attachment since the worker went live existed only as `{filename, mimeType, size}`** — a name and a byte count with no file behind it. `receive-email` faithfully stored that metadata into `emails.attachments`, and the admin reading pane rendered it as a non-clickable `<div>` (an object with no `url|download_url|path` fell through to the dead branch). Nothing in admin was broken; there was simply nothing to download. April Little's `WWR_App_Business_Plan.docx` is the canonical casualty — 29,689 bytes recorded, zero bytes retained.
- **THE WORKER IS NOW REAL SOURCE IN THIS REPO** at `knightops-email-worker/` (it was previously an opaque 4,815-line uploaded bundle with no source anywhere). Deploy with `npx wrangler deploy` from that folder — **not** the site's git-push flow. `node test/parse.test.mjs` proves a real MIME message survives parse → base64 → decode byte-for-byte, including a Word attachment and an inline logo.
- **`WEBHOOK_SECRET` IS NOW A CLOUDFLARE SECRET, NOT A `[vars]` ENTRY.** It was plaintext, and **this repo is public** — that value is what authorises writes into the CRM. `wrangler.toml` deliberately omits it; `wrangler secret put WEBHOOK_SECRET --name knightops-email-worker` sets it. **Secrets survive `wrangler deploy`; `[vars]` entries do not**, so if you ever move it back into the toml you both leak it and make it wipeable. Converting required one deploy that briefly dropped the binding — inbound mail still forwarded to Gmail throughout, because `message.forward()` sits in its own try block outside the CRM call. Keep it that way: a CRM failure must never stop mail reaching a human.
- **Attachment size policy: 8MB per file, 15MB per message, inlined as base64.** Over the cap the attachment is still RECORDED with a `content_omitted` reason (`too_large` / `message_budget_exceeded` / `encode_failed` / `empty` / `no_content_sent`). **Never let an attachment fail silently again** — the UI prints the specific reason and offers an upload.
- **Inline images are flagged, not hidden.** Signature logos and embedded images arrive as attachments. `is_inline` (set from `disposition==='inline'` or the presence of a Content-ID) keeps them off lead/client/project file lists, where they are pure noise, while leaving them openable from the email itself. `email-files` `list` filters `is_inline=false` for every scope except `email_id`.
- **New `email_attachments` table + PRIVATE `email-attachments` bucket** (migrations `email_attachments_store`, `email_attachments_inline_and_omitted`). RLS on with **zero policies** = service role only; anon SELECT returns `[]` and the bucket returns 400. `storage_path IS NULL` means the bytes were never captured. Unique on `(email_id, lower(filename))` so a redelivered webhook or a re-run backfill cannot duplicate a file.
- **New `email-files` edge fn (v2, `verify_jwt=false`, self-verifying admin JWT).** Actions: `list` · `url` · `upload` · `attach_project` · `detach_project` · `link_contact` · `resync` · `resync_all` · `migrate_outbound` · `delete`. **Every file read is a 10-minute signed URL** — these are client documents and nothing is served publicly.
- **`attach_project` COPIES the object into `project-files/<project_id>/`.** Admin's Project Files card lists the *storage bucket* directly (`sb.storage.from('project-files').list(projectId+'/')`) and `project_files` is only a share-flag sidecar keyed by `file_name`, so copying the object is what makes an emailed file appear there — and inherit the existing 👁 client-visibility toggle. It also inherits the project's `client_id`/`lead_id`.
- **Word and Excel render in-page** via mammoth and SheetJS, lazy-loaded from CDN on first preview. Images/PDF/video reuse the existing `openMedia()` lightbox; text renders inline. Anything else states that no in-browser preview exists rather than showing an empty frame.
- **29 of the 35 people who have emailed files are neither a lead nor a client** (April Little among them — she has no `leads` row and no `profiles` row). Files from a stranger therefore have no contact record to land on, so every unlinked file carries a 🔗 **Link** button that searches leads *and* clients. Auto-creating leads from inbound senders was rejected: it would flood the CRM and collides with Rule 2.
- **Outbound attachments register on send.** `sendEmail()` now `.select('id')`s its insert and calls `koRegisterSentAttachments()`, so a file you sent is downloadable later from the same place. Historic outbound rows kept full base64 inline in `emails.attachments`; `migrate_outbound` lifts those into storage.
- **Pre-existing bug fixed:** the "Linked Lead" badge in the email reading pane called `openDetail()`, **which is defined nowhere in `admin.html`** — it always threw and never opened the lead. Now calls `showLeadDetail()`. Found by the onclick-target check; run that after any surgical edit to this file.
- **Verified end to end with a real email through Cloudflare** (not a simulated webhook): 3 attachments (docx/png/pdf) arrived at exact byte sizes and all three objects are in the bucket. Plus: the offline round-trip test, an inbound test proving a metadata-only attachment is still recorded, anon denied on table and bucket, `no_auth`/`bad_token` on the edge fn, both inline script blocks parsing, and all onclick targets resolving.

---

## Changelog — 2026-08-22 (Manual project file paths, kickoff prompt, AI email composer)

- **ONE build-folder field, two places to edit it.** `projects.build_folder` is now editable directly in **Client Project Details → Build target** ("Working folder (Mac)" → Set/Edit) and it is the *same column* the **Continuity & Ownership → Build folder** input already wrote to, so the two can never drift. Resolution order is `projects.build_folder` → newest `dashboard_builds.build_folder` → `AutoBuilds/<slug>`, and the row states whether the path was set by hand (green) or inherited from an auto-build (gold). `saveProjContinuity()` refreshes the build target and `setProjectFolder()` refreshes continuity.
- **🚀 Copy kickoff prompt** sits above the build target. It emits `Working in the <project> project.`, "This is already a live GitHub repo: <repo_url>", the project file path + working folder (both `projects.build_folder`), the Vercel project ID, live URL, Supabase ref, and an instruction to work only in that folder. **👁 Preview** opens it editable. If the repo or folder is unset it still copies but toasts a warning — so a missing path is never silent.
- **`clients` HAS NO `name` OR `email` COLUMN.** They live on `profiles` (via `clients.profile_id`), or on the originating lead (`clients.lead_id` / `projects.lead_id`). `openBriefModal()` was doing `sb.from('clients').select('id,name,email,profile_id')`, which PostgREST rejects, so **Send Continuity Brief had always opened with an empty To field**. Fixed there and honored everywhere new: profiles first, lead as fallback. 24 of 33 projects now resolve a client email; the other 9 have neither a client profile nor a lead.
- **Project detail shows the client's email** (mailto + 📧 compose), and both the project and client detail headers gained an **📧 Email** button.
- **THE COMPOSER MOVED OUT OF `#v-comms`.** `#emailComposeModal` lived inside the Comms view, which is `display:none` from every other page — so nothing outside Comms could ever open it. It is now a top-level sibling of the views. Everything it already did (send, drafts, schedule send, signatures, attachments, the raw Templates picker) is untouched. `openComposeFor({to,subject,project_id,client_id})` plus `openComposeForProject()` / `openComposeForClient()` prefill the recipient and default signature and carry the record as AI context. **If you ever move a fixed-position modal back inside a `.view`, it stops working from everywhere else.**
- **New `email-ai` edge fn (v3, `verify_jwt=false`, self-verifying admin JWT + `profiles.role in admin/super_admin`).** Returns `{ok,subject,html,sources,client}`. Model `claude-sonnet-5`, overridable with **`EMAIL_AI_MODEL`**. Three modes: free-text instruction; `template:<uuid>` (writes a *fresh personalized version* of an `email_templates` row — it never pastes the template); and `project_update`.
- **`project_update` reads real activity only** over `days` (UI sends 7): GitHub commits, production deploys, and `bug_reports.fixed_at` / `feature_requests.built_at` with their `fix_summary`. The system prompt forbids inventing work — an empty window produces "it was a quiet week", not manufactured progress — and requires commits be translated into client-facing outcomes, never pasted.
- **DEPLOY HISTORY COMES FROM GITHUB, NOT THE VERCEL API — NO `VERCEL_TOKEN` REQUIRED.** Vercel writes a **GitHub Deployment** record on the linked repo for every production deploy (`environment: "Production"`, status `success`, `environment_url` = the live URL), so `GET /repos/{o}/{r}/deployments` with the existing **`GITHUB_TOKEN`** returns the whole deploy history. This is *wider* coverage than the Vercel REST route, which needs a `VERCEL_TOKEN` **and** a `vercel_project_id` — and most projects here have a `repo_url` but no `vercel_project_id` (1 of 8 sampled). The Vercel REST call is kept only as a fallback for projects deployed without a GitHub link. **`VERCEL_TOKEN` is still unset on Supabase and nothing needs it** (`detect-repo` returns `no_vercel_token`; that only affects repo auto-detect).
- **VOICE COMES FROM `sent_at IS NOT NULL`.** Of 3,754 outbound rows from `daniel@knightops.biz`, **3,714 have `sent_at` NULL** — those are the bulk/drip sends — and only 40 carry a real `sent_at`, which are the hand-written one-to-one emails. A `.order('sent_at', desc)` without `.not('sent_at','is',null)` puts the NULLs first and **every voice sample is bulk mail**, which is exactly what happened on v1. Quoted reply chains and forwarded blocks are stripped before sampling.
- Generated text replaces the message body but **preserves the signature** already in it.

---

## Changelog — 2026-08-20 (Saved-style dedupe + project auto-association by email and fuzzy name)

- **THE DUPLICATE MOCKUP BUG WAS IN `dashboard-mockups` `add`.** It seeded an `Original` entry from `ai_mockup_html` and then pushed the incoming html — which is normally the SAME document — so the first "Save this style" always produced two identical entries. This is what put an identical `Original` and `Ecosystem V2 - Top Nav` on the Melissa Methven build. Every entry now carries a **SHA-256 `hash`**; identical bytes relabel the existing entry and return `duplicate:true` instead of appending, and `Original` is only seeded when it genuinely differs.
- **`ko_match_project(email, name)` associates a build with a project on Save style / Looks right / client Pick.** **Email is the gate** (candidates are only projects reachable via `leads.email` or `clients→profiles.email`), so two clients can never cross-contaminate. Among that person's projects the **name has to be close AND clearly ahead of the runner-up** (≥0.45 and a ≥0.12 gap); a single unambiguous owner passes at ≥0.30. Anything else returns `ambiguous` and **links nothing** — it never guesses. `ko_norm_name()` strips the words on every project (`dashboard|app|portal|system|ecosystem|build|v2|mvp|ai|ops|…`) so matching happens on the brand.
- **SCORE IS A BLEND, NOT `greatest()` — do not "simplify" this back.** v1 used `greatest(containment, trigram)`. Token containment saturates at 1.0 the moment the shorter name's words all appear, so every `Melissa Methven ...` project scored 1.000 and tied → permanently ambiguous. v3 uses **0.6 × containment + 0.4 × trigram**: containment answers "right client", trigram answers "which of their projects". Verified 8/8 including both Melissa builds routing to their own distinct projects.
- **REGRESSION I INTRODUCED AND FIXED:** the 08-19d rewrite of `reviewWithAI` ran past the end of the function and deleted `saveMockStyle()` and `approveMock()`, leaving two live buttons throwing ReferenceError. Restored from `47bf7e8`. The jsdom suite passed because it never clicked them — there is now a check that every `onclick` target resolves to a defined function. **Run that check after any surgical edit to a big single-file page.**
- **Merged duplicate projects** `ca7e330a` + `c4ef1d3b` (identical name, same lead, only child rows were one dashboard build each). Kept the newer/richer record, repointed the builds, coalesced missing columns. Both rows are archived in **`public.archive_merged_projects`** (RLS on) so the merge is reversible. `projects` now has zero duplicate names.

---

## Changelog — 2026-08-19d (Revision is an EDIT, not a rebuild — the disappearing sidebar)

- **ROOT CAUSE: the revise box never sent the existing mockup anywhere.** `base_html` appeared ZERO times in the codebase. Typing a note and hitting Regenerate started a brand-new from-scratch job with `revision_notes` appended, so the model had nothing to preserve and routinely came back with a different (or missing) sidebar. Three bugs stacked on top of that: the iframe was repainted with half-written HTML mid-run, and a stale run could `finish()` over a newer one (the abort flag was only checked at the top of the loop, and `finish()` nulled `_streamAbort`, killing the new run's handle).
- **Three modes now, resolved per request** (`dashboard-job` v4): `create` · `patch` · `rebuild`. **`patch` is an EDIT** — `REVISE_SYS` receives the current document and is told everything unmentioned must come through byte-for-byte, that a vague request is never permission to restructure, and that returning fewer nav items than it received is a FAILED revision. Verified live: *"make the KPI cards smaller and add a renewal date column"* → **97.7% of lines untouched, 4 changed regions, nav 7→7, pages 6→6, tabs 13→13, chips 13→13.**
- **Mode is classified, not guessed.** `classifyMode()` uses **`claude-haiku-4-5`** (~$0.001/call, `DASHBOARD_CLASSIFY_MODEL`) and answers PATCH or REBUILD, biased to PATCH on ambiguity. **9/9 on the test set** — "make it cleaner" and "the numbers look wrong" → patch; "try a different layout", "start over", "add a whole Community page" → rebuild. A rebuild strips `base_html` from the payload so it genuinely starts clean.
- **`config_changed` is decided CLIENT-side and forces a rebuild** — `_cfgFingerprint()` hashes modules + custom modules + layout + nav groups + facing + brand mode. A patch cannot express "I added three modules", so if the fingerprint moved since the mockup was made, mode is `rebuild` regardless of the note.
- **Server-side guard, because prompts are not guarantees.** After a patch, `struct()` compares nav presence, nav item count and page count against the base. Nav gone, or item count below 60% of the original without the note asking for removal → **the original is returned unchanged** and the UI says so. Removal verbs (`remov|delete|drop|hide|consolidat|merge|…`) disarm the guard so intentional removals still work.
- **The canvas is never destroyed while patching.** No skeleton, no progressive repaint over a working mockup, and a `_runToken` means a stale run can no longer write to the iframe. Every failure path calls `keepPrevious()`. Added a **↩ Revert** button (`_prevMock`) and a **How to apply it** selector (Auto / Revise in place / Rebuild) for manual override.
- **`db.html` got the same treatment** plus a real bug fix: its `MODLABEL` map still held only the retired keys, so after the os_modules migration a client would have seen raw `l2_lead_capture` strings on the review page. Now carries all 37 canonical labels with the legacy keys kept as aliases.

---

## Changelog — 2026-08-19c (Dashboard builder: os_modules layers, one record spine, 7-item nav, layouts)

- **THE BUILDER HAD ITS OWN INVENTED MODULE CATALOG.** 25 modules grouped by made-up categories (Sales/Ops/Growth), completely disconnected from `public.os_modules` (37 modules across layers 0-9) which is what Knight Ops actually sells and delivers. That single fact caused the "overkill and disconnected" feeling. `MODULES` in `dashboard-intake.html` and `CATALOG` in `dashboard-analyze` are now **exact mirrors of os_modules** — if you add a row to os_modules you must add it to BOTH. `MODALIAS` maps every legacy key (`leads`→`l2_lead_capture` etc) so saved builds still hydrate.
- **LAYERS ORGANISE THE BUILD, WORKSPACES ORGANISE THE USE. Do not merge these two ideas.** Making the sidebar mirror the 10 layers just renames the overwhelm. The module picker is grouped by layer (build sequence, what gets sold); the generated app's sidebar is **≤7 workspaces** (`WORKSPACES` + `MAX_NAV=7`). Each module carries `L` (layer) and `w` (workspace).
- **`navWorkspaces()` is the consolidation engine.** Modules are capabilities, NOT nav items — several become TABS inside one page. Home is pinned first, Settings pinned last, middle workspaces ranked by module count, and anything over the cap **folds into a sibling** via its `fold` target. Verified: **20 modules → exactly 7 nav items**. Cascading folds must land somewhere sensible — `ai.fold` is `home` (not `growth`, which can itself be folded) and the fallback is `first[0]` (Home), never "last kept", which previously dumped AI Brain into Team & Ops.
- **ONE RECORD SPINE — the fix for "they feel disconnected".** Lead / client / partner / team are ONE `contacts` record with `record_type` as a **text ARRAY**, keyed by a case-insensitive unique index on `lower(email)`. Everything FKs to `contact_id`. The People page is one table with **segment chips that are FILTERS, not nav items**. Enforced in the build prompt, `SPINE` in dashboard-job (both mockup and spec), and the spec's Data Model must open with contacts. Verified in a live mockup: one People page, chips All/Leads/Clients/Partners, and rows carrying `data-seg="client ascend"` (two types, one record).
- **`SIMPLICITY BUDGET`**: max 7 nav, max 4 KPIs per view, ONE primary table per view, every page opens with a sentence naming the number it moves, no capability in two places. `dashboard-analyze` also got an explicit **anti-over-scoping** rule ("twelve well-chosen modules beats twenty five") plus forced inclusion of `l1_kpi_dashboard`/`l1_data_foundation`/`l1_auth_roles` since Layer 1 always ships first.
- **5 layout archetypes + auto**: `sidebar` · `rail` (icon rail + context panel) · `topbar` · `split` (list/detail) · `brief` (KPI hero). These change STRUCTURE, not colour, so mockups stop looking identical. `auto` makes the AI choose from business model and emit `<!-- layout: x -->`; `dashboard-analyze` also returns `layout` + `layout_reason`.
- **`final_notes`** field at the bottom of the intake, read LAST and weighted heaviest in analyze, mockup, spec and build prompt. Verified it propagates: a note about chasing renewals produced an "🔥 3 members are Ascension-Ready" banner and an Ascension segment chip.
- **MOCKUP + SPEC ARE BACK ON `claude-sonnet-5`** (`DASHBOARD_MOCKUP_MODEL`) — the mockup is output-length bound, not reasoning bound, and gets regenerated repeatedly, so Opus was poor value. **Analysis stays on `claude-opus-5`** (`DASHBOARD_ANALYZE_MODEL`) since it runs once per document and its depth sets up everything downstream. Sonnet mockup: 4 segments / 155s / 39KB.
- **Migration `dashboard_builds_layout_workspaces_final_notes`** adds `layout`, `final_notes`, `workspaces`, `layers`; `dashboard-build` v15 whitelist extended. Round trip verified, test rows removed.

---

## Changelog — 2026-08-19b (Dashboard builder on Claude Opus 5 + segmented background generation)

- **Model is now `claude-opus-5` at `output_config:{effort:'medium'}`** across `dashboard-analyze` v13, `dashboard-job` v1, `dashboard-stream` v13, `dashboard-ai` v16. Overridable per environment with **`DASHBOARD_AI_MODEL`** and **`DASHBOARD_AI_EFFORT`** — change those two secrets, not the code. Effort is set with `output_config`, NOT a top-level `effort` key.
- **THE ~150s SUPABASE EDGE WALL IS REAL AND IT KILLS OPUS MID-DOCUMENT.** Opus 5 runs ~80 tok/s; a mockup is 25KB and a PRD is 52KB. A single streaming call was **shut down at 157–160s with ~1.2KB written** (confirmed in `function_logs`: the dashboard-stream worker logs `shutdown` mid-stream, no `event: done` ever reaches the client). Do NOT "fix" this by raising max_tokens — the ceiling is wall-clock, not tokens.
- **New `dashboard-job` edge fn + `dashboard_jobs` table (migration `dashboard_jobs_background_generation`) = segmented generation.** Actions `start` / `step` / `status` / `cancel`. Each `step` requests at most `DASHBOARD_SEG_TOKENS` (4500), appends to `dashboard_jobs.output`, and returns `done:false` while `stop_reason==='max_tokens'`. The browser loops `step` and re-renders, so it still looks live but no single request approaches the wall. RLS on with **zero policies** = service role only. Verified: mockup 3 segments / 122s / 25,093 bytes; spec 5 segments / 51,805 chars.
- **Continuation uses an ASSISTANT PREFILL with `thinking:{type:'disabled'}`** — prefill and thinking are mutually exclusive, and Opus 5 refuses `thinking:disabled` at `xhigh`/`max` effort (another reason medium is the right level here). Segment 1 has no prefill so Opus may think freely. If the prefill is ever rejected, the fn falls back to a plain "continue from exactly where this stops" user turn. Seam quality verified: zero duplicated runs, one `## Information Architecture` heading, balanced div count, 0 em dashes.
- **`content[0].text` IS A BUG ON ANY THINKING MODEL.** Opus 5 thinks adaptively, so `content[]` can lead with a thinking block and the old `d.content?.[0]?.text` in `dashboard-ai` returned undefined. Every function now uses a `textOf()` helper that filters to `type==='text'` blocks. Same class of bug on the stream side: only `delta.type==='text_delta'` is appended.
- **`dashboard-intake.html` + `db.html` migrated off `dashboard-stream`** to the job runner (0 references remain in either file). The old 16s stall watchdog would have aborted every healthy Opus run before the first byte of HTML; it is now a 180s per-segment guard, and the progress label shows `(part N)`.
- **`dashboard-stream` and `dashboard-ai` are kept as fallbacks only** — they remain on Opus and will still time out on long output, so treat them as the deterministic-fallback path, not the primary one.
- **Timing to expect:** analyze ~75s, mockup ~2min, full PRD ~5min. That is the cost of Opus-grade output; if a faster turnaround is ever needed, set `DASHBOARD_AI_MODEL=claude-sonnet-5`.

---

## Changelog — 2026-08-19 (Dashboard builder deep pre-fill + collapsible sidebar)

- **ANTHROPIC_API_KEY IS OUT OF CREDITS.** Every AI edge fn returns "Your credit balance is too low" (`dashboard-analyze`, `dashboard-stream`, `dashboard-ai`, `api-autofix`, `shift-guide`, `module-injection`). Add credits at console.anthropic.com. The builder's silent failure was compounded by the frontend guard `if(res.error && !res.suggested)` — `res.suggested` is `{}`, which is TRUTHY, so the error toast never fired and Analyze looked like it "did nothing". Now guarded on `Object.keys(suggested).length` and the failure is shown in red inline.
- **`dashboard-analyze` v12:** max_tokens 2000 → 10000 (2000 could not fit a full field map, so JSON.parse failed on every rich document). Input cap 60k → 340k chars. Schema expanded from 18 to 28 fields (`features` per module constrained to exact catalog strings, `module_notes`, `custom_modules`, `data_model`, `goal_criteria`, `roles.journey_stages/statuses/matrix`, `hosting`, `domain`, `blog.cadence`, `email`, `phone`, `extracted`/`assumed`). Accepts `docs[]` (PDF) and `images[]` (screenshots) as Anthropic URL blocks, retries text-only if attachments are rejected, and runs a repair pass on unparseable JSON. FIELD MAP values in a `dashboard-kickoff.md` are treated as AUTHORITATIVE.
- **Uploader rebuilt (`dashboard-intake.html`):** the 1 GB cap is gone; md/txt/csv/json/code read as text, **docx via mammoth**, **xlsx/xls via SheetJS**, **PDFs and images passed to Claude by public URL** (bucket is public read). `analyzeBuild()` now `await`s `Promise.allSettled(S.reads)` — previously FileReader was fire-and-forget, so clicking Analyze quickly sent an EMPTY `uploads_text`. Unreadable types surface an amber "N not readable by AI" chip instead of failing silently.
- **`applySuggested()` rewritten:** it was dropping `features`, custom modules, journey stages, statuses, hosting, domain, blog cadence, email/phone and file paths even when the AI returned them, and called `buildFeatures()` BEFORE `S.features` was set so AI feature picks were overwritten by defaults. Hex colors are normalized (`input[type=color]` silently rejects `C6A664` or `#abc`). `additional_details` is appended, never clobbered.
- **Collapsible grouped sidebar enforced in all four artifacts:** new `navGroups()` is the single source of truth (Home / Sales & Revenue / Clients & Success / Client Portal / Community / Growth / AI / System / Custom). The build prompt gains a `## Sidebar navigation (build it exactly like this)` section with the exact group→module map plus persistence and responsive rules, plus per-module features and `module_notes`; `dashboard-stream` v12 and `dashboard-ai` v15 share a `NAV_RULE` requiring an accordion with only the active group expanded, and both non-AI fallback mockups now render a real working accordion.
- **Migration `dashboard_builds_deep_prefill_fields`** adds `module_notes`, `data_model`, `goal_criteria`, `nav_groups`, `role_matrix`. **`dashboard-build` v14 FIELDS whitelist extended** — it is an explicit allow-list, so any new field added to `gather()` MUST be added there AND exist as a column or the save silently drops it. Save→resume round trip verified, test row removed.
- **Verified:** 30-check jsdom suite on the live page (full field map applied, prompt sections present, hydrate round trip, zero window errors), file-routing test (7 files incl. a 900 MB one, PDF/image routed, zip flagged), and production byte check on knightops.biz/dashboard-intake.

---

## Changelog — 2026-08-17c (Knowledge base, Obsidian and scheduled-task repositioning)

- **Canonical positioning note created:** `Obsidian Data/Knight Ops/Knight-Ops-Positioning-2026.md` supersedes every earlier offer/pricing note. Five offers only, four canonical stats (`$200M+` impact · `50+` systems · `85%` time saved · `100%` code ownership), the six money claims that must never be merged, layer 0–9 architecture, four portal states, language rules. `Offers-and-Pricing.md` and both Offer-Architecture notes carry SUPERSEDED banners.
- **Agent-facing sources repositioned:** `daniel-master-instructions.md`, both sales agent brains (with a `POSITIONING — READ FIRST` block prepended), all 6 `Knight Ops/SEO/` generation prompts, `Projects/KnightOps-Biz-Main-Site.md`, `content-system/README.md`, `Auto Deploy to Vercel.md` (now documents the `ko` helper + the never-overwrite-vercel.json rule).
- **16 scheduled-task `SKILL.md` files** under `Claude Home/Claude/Scheduled/` repositioned — retired offers removed, stats corrected to the canonical four, coach-centric ICP → organizations, booking-link labels fixed (**`/book` = Tech Discovery Call, `/book-tech-call` = Systems Blueprint Session** — see the 2026-09-01 entry: the blueprint page is now invitation-only and must never be linked publicly). Sweep verifies clean across all 91 tasks.
- **35 AEO blog drafts flagged DO-NOT-PUBLISH** rather than bulk-rewritten (prices are prose-embedded; mechanical substitution breaks sentences). Historical per-client project logs and meeting records left intact deliberately — rewriting them would make the vault lie about what was actually sold.
- **`blog.html`** meta description + author bio corrected (`~$100M in assets` now attributed to the wealth management firm, not Hertz). `tools.html` coach references → 0.

---

## Changelog — 2026-08-17b (Progressive draft save on the Blueprint intake)

- **`/mini-blueprint` now autosaves.** Client writes through the new **`intake-draft`** edge fn (v3, verify_jwt=false, service role, self-verifying by `draft_token`) — the browser no longer writes `intake_submissions` directly. Actions: `save` (upsert + recompute `completion_pct`), `resume`, `submit`, `email_link`. Debounced 1.5s on input, immediate on blur and step change, `draft_token` in `localStorage.ko_mb_draft`, resume via `?draft=<token>`. Free navigation between steps is preserved — **do not add blocking validation to `goTo()`**.
- **Draft state lives in `submission_state`, NOT `status`.** `intake_submissions.status` is the ADMIN WORKFLOW enum (`new|reviewed|contacted|proposal_sent|converted|archived`, enforced by `intake_submissions_status_check`). Writing draft state into `status` would overwrite pipeline position. Pre-existing rows have a null `submission_state` and read as submitted.
- **The lead is created only on submit.** Flipping `submission_state` draft→submitted is what fires `fn_sync_intake_to_lead` + `trigger_new_intake_notification`. The edge fn must never create the lead itself or every submission duplicates. Verified live: one intake → 1 inbound lead, 1 deal, **0 prospect-typed rows** (Rule 2 clean).
- **Admin → Forms & Surveys is draft-aware:** `Draft` badge, `Progress` column with idle-days, "Drafts In Progress" stat card + drafts-only filter, a detail banner stating plainly that no lead was created and nothing was sent, "📧 Email them a resume link" (`email_link` returns `{ok:true,skipped:'throttled'|'submitted'}` — 1h throttle), and `fsArchiveStaleDrafts()` for drafts idle 14+ days.
- **Verified** with jsdom against production: autosave badge Not saved→Saved, full field restore on a fresh DOM from `?draft=`, submit → success screen + localStorage cleared, zero window errors; test rows removed (intakes back to 63, inbound leads 185).

---

## Changelog — 2026-08-15e (Email bug, dedupe, invite search, rate ladder)

- **PARTNER WELCOME EMAIL WAS BROKEN AND HAD BEEN FOR A LONG TIME.** `partnerWelcomeEmail()` built its commission line with string concatenation **inside a template literal**, so every welcome email literally printed `' + d.commission_rate + '%`. It also said commissions were "paid via PayPal". Now renders the real rate pulled from `system_settings.commissions` and describes the Stripe/15th-of-next-month flow. If you edit these templates, note the file mixes `${}` and `'+ +'` styles — concatenation only works inside `${...}` arguments, never in the literal body.
- **SECURITY: the Resend API key was hardcoded in `partner-emails` source** (`re_29fo...`). Replaced with `Deno.env.get('RESEND_API_KEY')`. **Rotate that key in Resend** — it sat in plaintext in a deployed function.
- **Stripe onboarding links cannot be extended.** Stripe `account_links` are single-use and expire in minutes by design; there is no week-long option. The admin modal now leads with the partner's **portal link (never expires)** — the portal mints a fresh Stripe session on click — and offers "Email setup invite" via `partner-invite`. The raw Stripe link is kept only for in-person setup.
- **Invite picker is searchable**: type-ahead over clients + leads showing name, email, company; picking one autofills all three and links the record. De-duplicated by email so one person can't appear twice. Shows the current headline rate.
- **DEDUPE (destructive, done 2026-08-15).** `ko_merge_records(table, keep, drop)` walks the FK catalog (31 tables reference leads, 21 reference clients) and repoints every reference, deleting child rows only on unique-violation. Merged 11 inbound-lead duplicate groups + 39 groups where a scraped prospect shadowed a real inbound lead + 2 client duplicate groups. Survivor chosen by most linked history, then completeness, then oldest.
- **Duplicates now prevented:** unique `leads(lower(email)) where lead_type='inbound'` (prospects exempt — the scraper legitimately holds many, per Rule 2) and unique `clients(profile_id)`. A lead and a client MAY share an email; `clients.lead_id` links them, kept fresh by triggers from both sides.
- **Profile duplicates resolved.** Aabri Kimball, Daniel A Martinez and Matt each had a same-name empty shell alongside the real record — merged via `ko_merge_records('profiles', keep, drop)`. **Flory Graciano was NOT a duplicate**: different person, 5 deals + 1 project, sitting on `dknightunicorn@gmail.com` because Daniel uses his own address as a placeholder when a form demands one. Her profile was moved to `flory-graciano@placeholder.invalid` and kept intact.
- **PLACEHOLDER EMAIL CONVENTION:** when a real address is unknown use `name@placeholder.invalid`. `.invalid` is an IANA-reserved TLD that can never resolve, so no drip or notification can accidentally mail Daniel (or a stranger) believing it is the client. Never reuse a real inbox belonging to someone else — it silently merges two people once email-uniqueness is enforced.
- **`profiles.email` is now uniquely indexed** (`profiles_email_key`, lower(email)) alongside `leads_inbound_email_key` and `clients_profile_key`. All three duplicate classes are at zero.
- **Portal rate ladder** rebuilt as a 4-card grid with **marginal** labels (First $50K / Next $200K / Next $500K / Above $750K) instead of overlapping ranges that repeated the same number. Dark-themed calculator input, whole-dollar formatting via `koMoney0()`.

---

## Changelog — 2026-08-15d (Payments ledger, refunds/clawbacks, partner invites)

- **DEAL MODEL — one deal per contracted arrangement, payments stack against it.** Never create a deal per payment; that inflates the pipeline (a monthly retainer would look like 12 wins/yr). `stripe_payments` is now the full payments ledger: `payment_source` (stripe|manual|ach|wire|check|other), `payment_method_label`, `refunded_amount`, `refunded_at`, `refund_reason`, `notes`, `created_by`. Manual payments (check/wire) are inserted with `stripe_charge_id` null.
- **`deal_payment_summary` view** reconciles contracted_value vs gross/net collected, refunded, remaining, payment_count, first/last payment. Stephanie Frank's retainer correctly shows $2,497 contracted against $4,994 collected across 2 payments on ONE deal.
- **LEGACY CONSTRAINT BUG (was live).** `commissions_status_check` (original, `pending|approved|paid|rejected`) still existed alongside the newer `commissions_status_chk`. Two overlapping CHECKs means the strictest wins, so **every `void` / `payable` / `failed` write silently failed** — the admin Void button could never have worked. Dropped the legacy constraint and migrated `rejected` → `void`.
- **Refunds + clawbacks (`trg_handle_refund`).** Raising `refunded_amount` reverses commission automatically: **not yet paid → void** (or reduce pro-rata on a partial); **already paid → a NEGATIVE `clawback` commission** that nets against the partner's next payout. We never demand cash back from a partner. Both paths verified live. Industry standard, and the 15th-of-following-month payout rule already gives a 15–45 day natural holding period so most refunds land before payout.
- **Admin deal detail** gains a Payments Received card (contracted / collected / refunded / remaining + per-payment table, Record Payment, Refund). **Client detail** gains Deals & Payments — lifetime collected, contracted across deals, every deal, and every payment.
- **`partner-invite` edge fn + "Invite from Leads"** on the Partners view: pick an existing lead or client (or type a name/email), creates an **active** partner on the sliding schedule with a portal token, and emails a branded activation invite with their referral link. Re-invites reuse an existing partner row rather than duplicating.
- **Payout destination clarified:** platform balance → the partner's connected account → their bank on a **daily schedule with 2-day delay**. Because the account shape is `stripe_dashboard.type=none`, partners have **no Stripe dashboard** — they see commissions in the Knight Ops portal and money in their bank, never a Stripe balance. It does NOT appear in the 10xUnicorn Stripe account. Verified live with transfer `tr_1U4xWc3cMVgmMIujMeECpGNP`.

---

## Changelog — 2026-08-15c (Stripe import, client links, partner notifications)

- **Deals now link to clients.** Root cause: deals carried `lead_id` (163) but almost never `client_id` (3), and clients only resolve through `profiles.email`. Backfilled lead email → profile → client (**3 → 34 linked**). `trg_link_deal_client` (BEFORE insert/update on deals) keeps it resolved going forward and also inherits `partner_id` from the lead.
- **`stripe-backfill` edge fn** (admin JWT, **dry run unless `apply:true`**) pages `/v1/charges`, upserts `stripe_payments`, matches lead/client by email, creates `closed_won` deals, and accrues commissions through the sliding schedule. Platform charges only — Headliner tenant sales live on connected accounts and are never returned. Admin → Partners → **Import from Stripe** (with a days selector + preview table).
- **Imported 2026-08-15:** 6 charges scanned, 4 deals created + 1 matched to an existing deal, $17,494 tracked. `stripe-backfill` v2 adds **`min_amount` (default $5)** so test charges and card-verification pennies are skipped (the $2 "Subscription creation" charge was the reason).
- **Deal close date comes from the payment.** `trg_deal_close_from_payment` on `stripe_payments` sets `won_at` / `actual_close_date` to the **earliest** non-ignored payment on that deal (so installments don't push the date forward) and flips the deal to closed_won unless it's closed_lost. Fires for the webhook, the backfill, and manual attribution alike.
- **`commissions.deal_amount` and `commission_rate` are now nullable** — a flat manual commission (bonus/adjustment/spiff with no base) previously violated a NOT NULL constraint and could not be saved. `commission_amount` is the only required money column.
- **`partner_events` queue + DB triggers** emit `new_lead` (affiliate_leads insert), `stage_change` (leads.status), `deal_closed` (deals.stage → closed_won), `commission_earned` (commissions insert), `commission_paid` (status → paid). Triggers mean notifications don't depend on any code path remembering to fire them.
- **`partner-notify` edge fn** drains the queue, writes a `partner_notifications` row, and sends a branded Resend email per event type. pg_cron **`partner-notify-5min`** (`*/5 * * * *`). Verified live: all 5 event types fired and all 5 emails delivered. Inactive/emailless partners are marked handled so the queue can't stall.
- **Admin attribution is now bidirectional from every record:** partner detail gains **+ Commission** and **+ Attach Referral** (lead or client); client detail gains **Referred By**; lead and deal detail already had pickers. All routes go through `partner-commissions` so the triggers stay authoritative.
- **Portal:** Stripe-branded gradient CTA, an overview banner that persists until `stripe_payouts_enabled`, and earning tiers changed to **Night Build $10K · Night Build Pro $15K · Enterprise Build $50K+ · Fractional AI Ops $5–8K/mo** (Night Launch removed). Tier payouts are computed from the live schedule via `koBracketTotal()` — never hardcode them or they will contradict the calculator.

---

## Changelog — 2026-08-15b (Sliding commission schedule + master rate)

- **Commission is no longer a flat rate.** Master schedule lives in `system_settings.commissions`: `default_rate` 10, `active_partner_rate` 15, `recurring_term_months` 12, `use_brackets` true, and **brackets 10% ≤ $50K · 7.5% ≤ $250K · 3.5% ≤ $750K · 3% above**. Edit from admin → Partners → **Commission Rates** (live preview included).
- **Brackets are MARGINAL and applied against cash already collected on the deal**, so installments total the same as a lump sum — verified 3 × $25K = one $75K payment. `ko_bracket_total(amount, brackets)` + `ko_commission_for_payment(partner, deal, amount, prior)` return `{amount, rate, bracket_from, bracket_to, mode}`. Verified: $8.5K→$850 · $50K→$5,000 · $75K→$6,875 · $250K→$20,000 · $350K→$23,500 · $750K→$37,500 · $1M→$45,000.
- **Per-partner overrides:** `partners.rate_mode` (`default` follows the schedule, `flat` pins `commission_rate`) and `partners.commission_tier` (`referral` | `active_partner`, the latter earning the flat premium rate). Both verified live.
- **Recurring cutoff:** `ko_within_commission_term()` stops commissions on payments more than `recurring_term_months` after the referral's FIRST commissioned payment. 0 = unlimited.
- **`stripe-revenue-webhook` v2** calls both functions instead of `partner.commission_rate * amount`, and stamps `effective_rate` / `bracket_from` / `bracket_to` on each commission for audit.
- **`partner-portal-data` v3** returns `rate_schedule` (respecting flat/active-partner overrides). The portal renders the tier ladder + a live calculator from that payload — **never hardcode rates in the portal**, or displayed rates will drift from what pays. Browser `koBracketTotal()` mirrors `ko_bracket_total()`; both verified identical across 7 amounts.
- **Public `/partners` page says "up to 10%"** and no longer exposes the ladder or claims PayPal payment. Full breakdown + calculator live in the portal.
- **Decision: cash only, no retainer credit.** Credit and cash are identical on taxable profit, but cash defers outflow to the 15th of the following month (2–6 weeks of float) and keeps top-line revenue higher for borrowing.

---

## Changelog — 2026-08-15 (Partner commissions, Stripe Connect payouts, partner RLS lockdown)

- **SECURITY FIX (was live).** `partners` had anon `SELECT` (`status='active'`) + anon `UPDATE` (`USING true`), so the public anon key could read every partner's **`magic_link_token` and `password_hash`** (= log into any partner portal) and rewrite any partner's `commission_rate`/`paypal_email`. `commissions`, `affiliate_leads`, `partner_notifications` were fully anon-readable. All anon SELECT/UPDATE policies dropped. Public referral links still work via **column-level grants**: `GRANT SELECT (id,slug,name,company,avatar_url,bio,website,status) ON partners TO anon` + policy `status='active'` — RLS can't filter columns, column privileges can. Signup keeps `INSERT` but only on non-privileged columns, so a browser can no longer self-activate a partner at any rate. **Rotate all partner magic links.**
- **Schema** (`partner_commissions_stripe_connect` + follow-ups): `partners` +stripe_account_id/stripe_onboarded/stripe_charges_enabled/stripe_payouts_enabled/stripe_requirements/payout_method(stripe_connect|paypal|relay_ach|manual)/total_paid/total_pending. `commissions` +lead_id/client_id/source/description/currency/stripe_payment_intent_id/stripe_charge_id/stripe_transfer_id/cleared_at/**payable_on**/paid_method/payout_reference/void_reason/created_by; status now `pending|approved|payable|paid|void|failed` (**`rejected` is no longer valid** — `rejectCommission()` maps to `void`). `leads` +partner_id/referred_at, `clients` +partner_id. `affiliate_leads` +stage_override. New `stripe_payments` table (RLS on, **zero policies** = service-role only).
- **Payout rule in the DB:** `ko_commission_payable_on()` — a payment clearing in month M is payable on the **15th of M+1** (verified: Aug 14 → Sep 15, Dec 2 → Jan 15). Stamped by trigger `trg_commission_defaults`, which also derives `commission_amount` from base × rate.
- **`partner_referral_pipeline` view** — derived stage **Lead › Discovery › Blueprint App › Proposal › Closed › Paid** (+Lost) from lead status + furthest deal + `intake_submissions` (blueprint) + `proposals`, with `stage_override` to force it. `security_invoker=on`, revoked from anon/authenticated. Commission rollups match on affiliate_lead_id **or** lead_id.
- **Bidirectional attribution:** `trg_stamp_referred_at` (BEFORE) + `trg_sync_lead_partner` (AFTER — must be AFTER, the FK needs the lead row to exist) auto-create the `affiliate_leads` row when a lead is tagged to a partner; `trg_sync_affiliate_lead` stamps `leads.partner_id` in reverse. `trg_recalc_partner_totals` keeps partner rollups accurate.
- **Edge fns (all verify_jwt=false, self-verifying):** `partner-commissions` v1 (admin JWT + `profiles.role` in admin/super_admin — manual commission CRUD, set_status, assign_deal_partner, assign_lead_partner, set_referral_stage, referral_pipeline, **payout_run**, unmatched_payments); `partner-portal-data` v2 (token-gated portal reads/writes + `request_link` email login, no enumeration; never returns token/hash; profile allow-list excludes commission_rate); `partner-stripe-connect` v1 (Express onboarding, status sync, login links, **pay_commissions** transfer with idempotency key derived from the commission set); `stripe-revenue-webhook` v1 (charge.succeeded → `stripe_payments` → closed_won deal → commission on **cash collected**); `partner-signup` v1 (forces status=pending / rate=10).
- **HEADLINER ISOLATION (same Stripe account, different platform).** Headliner uses `type=standard` connected accounts with no metadata. Knight Ops partners are `type=express` **and** tagged `metadata.ko_platform='knight_ops_partners'`. `assertKoAccount()` refuses any account missing that tag, so a Headliner account can never receive a partner commission. The webhook also ignores any event with `event.account` set (connected-account events belong to the other platform).
- **Admin:** Partners view gains + Add Commission (full manual editor: base × rate or flat override, deal/lead links, cleared date, payable date), 💰 Payouts Due (groups everything due, pays via Stripe or marks manual), **Referral Pipeline** card, **Cleared Stripe Payments — Needs Attribution** queue. Deal detail gains a Partner Attribution card (picker + one-click commission); lead detail gains Referred By. Partner detail gains Stripe Connect status + onboarding link.
- **Portal:** referral tracker with stage counters + per-referral commission earned/owed, commission table showing **Payable On**, Getting Paid card with Stripe Connect onboarding and next payout date. All data now via `partner-portal-data`; zero direct table reads remain.
- **Stripe secrets are set** (`STRIPE_SECRET_KEY`, `STRIPE_REVENUE_WEBHOOK_SECRET`). Account creation is verified working live.
- **CONNECT ACCOUNT SHAPE — do not "simplify" this to type=express.** `partner-stripe-connect` v5 tries `SHAPES` in order and keeps the first Stripe accepts. On this platform the winner is **`recipient_no_dashboard`**: `controller.losses.payments=stripe`, `fees.payer=account`, `requirement_collection=stripe`, `stripe_dashboard.type=none`, capabilities `transfers`+`card_payments`, no `type`. Resulting account reports `type:"none"`. Rejected alternatives and why: `type=express` and `stripe_dashboard=express` both force the PLATFORM to accept loss liability, which requires acknowledging responsibilities in the Connect **platform profile that is shared with the Headliner platform on this same Stripe account**; transfers-only (no card_payments) returns "platform needs approval". Verified live: acct_1U4snw44ffDW18yd created with the ko_platform tag.
- **Idempotency keys are params-derived** (`idemKey()` = prefix + SHA-1 of params). A fixed key wedged onboarding for 24h after a failed attempt with older params — do not go back to a static key.
- **Connect site links: DONE** (2026-08-15, all six point at knightops.biz/partner-portal). Live onboarding URLs now generate — verified `https://connect.stripe.com/setup/c/acct_1U4snw44ffDW18yd/...`. Headliner unaffected: its Standard accounts connect via OAuth (`application: ca_Uxx3...` on its Connect webhook) and never use these links; the Stripe settings page confirmed the liability banner applies to **1** account (the KO test account).
- **ISOLATION GUARD VERIFIED LIVE.** Pointed a partner row at Headliner's 10xUnicorn account (`acct_1T8LvwBiXnUmQZ6k`) and all three partner actions (`status`, `onboard_start`, `dashboard_link`) refused with the ko_platform error. A Headliner account cannot be onboarded, linked, or paid through this system.
- **Connect fees:** our accounts set `controller.fees.payer='account'`, which maps to Stripe's "Stripe handles pricing for your users" column = **Included, no platform fees**. Worst case (if the other column applies) is $2/monthly-active-account + 0.25% + 25¢ per payout = ~0.55% on a $750 commission, ~0.26% on a $35K one. Either way negligible; the 15th-of-month batching is already fee-optimal (one active month + one payout fee per partner per month). Confirm the column with Stripe support before high volume.
- **Stripe webhook endpoint** on `charge.succeeded` → `/functions/v1/stripe-revenue-webhook` must exist for cleared-payment→deal automation.
- **Verified:** full pipeline walk lead→discovery→blueprint→proposal→closed→paid; commission $749.70 payable 2026-09-15; anon denied on partners/commissions/affiliate_leads/partner_notifications/stripe_payments; anon slug resolution + referral INSERT still work; privilege-escalation INSERT rejected; webhook rejects unsigned/forged events (0 rows landed); admin UI renders with clean console. All test data removed (deals back to 174).

---

## Changelog — 2026-08-14 (Knight Ops Recorder — Loom replacement)

- **Chrome extension** `chrome-extension/` (MV3): records screen / window / tab / camera, mic + system audio mixed via AudioContext, draggable camera bubble, draw-on-screen, countdown, pause/resume, screenshots (full tab + area crop). MediaRecorder runs in an **offscreen document** (service workers can't hold media). Uploads **stream during recording** as 8MB R2 multipart parts, so stopping is near-instant. Auth = `KO_VIDEO_SECRET` bearer, stored in `chrome.storage.local` via `options.html`.
- **Storage** = Cloudflare **R2 bucket `knight-ops-videos`** behind Worker `ko-video-worker/` (R2 binding, so no S3 keys exist to leak). Routes: `/upload/init|part|complete|abort|simple` (bearer-gated) and `GET /f/<key>` with full **Range-request** support for scrubbing. Deploy with `npx wrangler deploy` — **not** the site's git-push flow.
- **Tables** (migration `create_video_system`): `videos`, `video_transcripts`, `video_comments`, `video_reactions`, `video_views`. RLS on all five: staff roles read/write, **anon fully denied** (verified: anon SELECT `[]`, anon INSERT 401). Every public read goes through `video-api`, which enforces visibility / expiry / password server-side.
- **Edge fns** (all verify_jwt=false): `video-manage` v1 (create/finalize/update/delete/list/detail/retry_transcript/config — accepts EITHER the extension secret OR a staff session JWT), `video-api` v1 (watch/captions/comment/react/view — public, rate-limited comments, emails Daniel on each comment), `video-transcribe` v1 (Deepgram **nova-3** → words/paragraphs/VTT/SRT, then Claude sonnet writes title/summary/chapters/action_items), `video-serve` v1 (injects real OG tags into the static player shell so Slack/iMessage previews work).
- **Pages:** `watch.html` → `/v/:slug` (speed 0.25–4×, chapter markers on the scrubber, click-to-seek transcript with search + live highlight, captions, timestamped threaded comments, emoji reactions, PiP, download, embed builder, view analytics, password gate); `embed.html` → `/embed/:slug`; `videos.html` → `/videos`; **admin.html → Content → Videos** (grid, detail with visibility/password/expiry/embed controls, engagement stats, transcript, deep-link `#videos/{id}`).
- **vercel.json**: surgical additions only — two rewrites (`/v/:slug`, `/embed/:slug` → `/api/v`) above the catch-all, plus Content-Type and `frame-ancestors *` headers for embeds.
- **Setup still required by Daniel:** `wrangler login && wrangler deploy && wrangler secret put UPLOAD_SECRET`, then Supabase secrets `KO_VIDEO_SECRET`, `KO_VIDEO_WORKER`, `DEEPGRAM_API_KEY`. Full runbook: `ko-video-worker/DEPLOY.md`.
- **Cost:** R2 is $0.015/GB/mo with zero egress; Deepgram ~$0.26/hour of video. Replaces Loom Business at $17/seat/mo.

---

## Changelog — 2026-08-13 (Contract prompt + positioning shift)

- **New Contract Prompt generator** in `admin.html` (`generateContractPrompt`, `contractPromptUI`, `copyContractPrompt`). Available on Application detail and Lead detail. Designed to run in the SAME chat as the proposal so the agreement inherits that exact scope, pricing, and phase schedule.
- **Shared prompt constants** added above `// ═══ PROMPT GENERATORS ═══`: `KO_LANGUAGE_RULES`, `KO_BRAND_PRIORITY`, `KO_CONTINUITY_TERMS`, `KO_PHASING_LANGUAGE`. Edit these to change proposal, blueprint, and contract behavior in one place.
- **Continuity standard codified:** 6 months Included Continuity from launch on every build (concurrent for Fractional AI Ops engagements). Ongoing updates, feature requests, quarterly feature push, and quarterly strategy session require the $1,000/mo Continuity Plan.
- **Tagline changed** to "Create Your Impact on Autopilot." All "Built Overnight. Scaled Forever.", overnight, 48hr, and 24hr delivery claims removed from prompts and public pages.
- **Brand priority rule:** proposals and blueprints now pull the client's palette and typography from their website or a provided screenshot first; Knight Ops black/gold is subtle accent only, full fallback only if no client brand source exists.

## Changelog - 2026-08-07 (Diamond Crafts live application asset repair)

- **Scoped static application:** `/app/index-msjnuuz6` now rewrites to the tracked `diamond-crafts-flooring-live.html`, leaving every other `/app/:file` upload on the existing Supabase `serve-app` path.
- **Deployment-safe assets:** the Diamond Crafts logo, eight used portfolio images and downloadable project guide are stored under `/diamond-crafts-assets/` and referenced with root-absolute URLs.
- **Root cause:** the uploaded HTML used relative `assets/...` paths, which resolved under `/app/assets/...`; the flat `app_files` slug service cannot resolve that nested local directory structure.
- **Scope guard:** do not broaden this rewrite or replace the generic app-file proxy. Future uploaded multi-asset HTML should either use hosted root-absolute asset URLs or be deployed as a scoped static application using this pattern.
- **Required verification:** confirm all page images have non-zero natural dimensions, the guide returns a PDF, desktop/mobile have no horizontal overflow and the console is clean.

---

## Changelog — 2026-07-17b (The Shift — /shift guided breakthrough experience)

- **New page `/shift` (shift.html):** guided breakthrough experience (12 sections, 38 inputs, Journey + Mirror + Progress views). Served by the existing catch-all `/:path` → `/:path.html` rewrite — **vercel.json unchanged**.
- **Auth model — deliberately NOT Supabase Auth.** Token links only (same pattern as `project_intake_tokens`/`resolve-link`), so Shift participants never enter `auth.users` and never collide with admin/developer/sales/marketing/client roles or `roleGateNav()`. No passwords, no reset flow.
- **Anti-hijack rule:** `start` with a NEW email returns the token inline (frictionless first run, nothing to steal yet). `start` with an EXISTING email returns `{status:'returning'}` and emails the resume link instead — typing someone else's address never yields their journey.
- **Tables (migration `create_shift_system`):** `shift_users` (email, token, lead_id soft link, guide_calls/guide_day rate limit), `shift_sessions` (one row per user, full client state as `jsonb`), `shift_events`, `shift_deletions` (hashed audit surviving cascade). RLS enabled with **zero policies** — anon and authenticated fully denied, service role only. Verified: rows present, anon REST returns `[]`.
- **Portability by design:** all tables prefixed `shift_`, and `shift_users.lead_id` is intentionally **not** a foreign key. Spinning The Shift out to its own project later is a dump of 4 tables, not schema surgery.
- **Edge fns (both verify_jwt=false):** `shift-data` v2 — start/load/save/event/resend_link/delete_all; 400KB state cap; Resend branded resume email from daniel@knightops.biz. `shift-guide` v1 — server-side Anthropic proxy (claude-sonnet-4-6) using the existing **ANTHROPIC_API_KEY** secret so the key never reaches the browser; **40 messages/user/day** cap; crisis-safety instruction (988 / 741741) added to the system prompt.
- **Client sync:** `save()` still writes localStorage first (instant), then debounces a cloud save at 1.2s so the app's 36 `save()` call sites collapse into one request. `boot()`/`boot2()` are now invoked by an async initializer after `SHIFT.init()` pulls cloud state. Works fully offline and fully logged out; badge in the topbar shows Not saved / Saving / Saved.
- **Privacy:** plain-language notice in the save gate, and a self-service double-confirm **Erase everything** that hard-deletes (cascade) — this content is personal reflective writing, not lead-form data.
- **Lead capture (Rule 2 safe):** first save creates/updates a lead with `source='website'`, `lead_type='inbound'`, tag `the-shift`, `added_by='the-shift'`. Verified 0 prospect-typed rows. Existing leads are tagged rather than duplicated.
- **Verified:** 4 script blocks parse; jsdom boot suite 10/10 on both the token path and the fresh-visitor path with zero runtime errors; live `/shift` byte-identical to source (164,440 bytes); full E2E start → save → resume → delete; RLS denial proven; all test rows removed.
- **Cost note:** a complete journey serialises to ~574 bytes, so this rides on the existing Knight Ops project rather than a new $10/mo Supabase project.
- **Open:** if The Shift gets its own brand, alias a domain to the SAME Vercel project (no new infra). `shift.knightops.biz` or a bought domain both work.

---

## Changelog — 2026-07-17 (Continuity & Team system)

- **Backend (already deployed):** migrations `continuity_team_system` + `team_role_policies` — new tables `team_members` (role: admin/developer/sales/marketing/successor/backup_support, system_access, profile_id), `project_resources` (per-project resource visibility overrides), `system_settings` (jsonb KV: `successor`, `eden`), `eden_responses`; `projects` continuity columns (supabase_ref, supabase_org, build_folder, env_manifest jsonb, compliance_tier standard/hipaa/soc2/iso27001, domain_notes, spec_doc_url, continuity_override, brief_sent_at); `project_members` extended (team_member_id, client_visible, client_title); `resources` extended (category, is_global, client_visible_default, sort_order); role-scoped RLS for `profiles.role` developer/sales/marketing.
- **Edge fns:** `hub-data` v3 (new actions `continuity` — full ownership payload for the client hub — and `export_code` — streams the project repo as a ZIP; needs **GITHUB_TOKEN** Supabase secret for private repos), `team-access` v1 (verify_jwt=true; grant_access/revoke_access/resend_invite → creates auth user + profile role + invite email), `eden-respond` v1 + pg_cron `eden-respond-5min` (AI answers client emails to eden@knightops.biz with live project visibility).
- **Storage/content:** `resources` bucket made public; 7 branded continuity/security PDFs seeded in `resources` (`library/` path, is_global=true): ownership guide, backups, MFA, HIPAA/SOC2/ISO 27001 outlines, continuity plan.
- **client-hub.html:** new 🛡 Ownership tab — "You Own This Project" (repo/Vercel/Supabase/domain/live/spec + env-key manifest), Export Everything (ZIP codebase download via export_code), Team & Contacts (client-visible project members + Eden + successor block), collapsible Developer Handoff Prompt with copy, Resources & Security Docs list.
- **admin.html:** System Settings gains 👥 Team tab (team_members CRUD, role select, grant/revoke/resend via team-access, active toggle) and 🛡 Continuity tab (global successor form → system_settings upsert, Eden read-only info, global Resource Library default-visibility toggles). Project detail gains 🛡 Continuity & Ownership card: status checklist (repo/Vercel/Supabase/contact/brief), editable continuity fields + env-manifest editor, team assignment (project_members ↔ team_members with client_visible/client_title), per-project resource visibility (project_resources upsert), Mark Continuity Brief Sent.
- **Role-gated nav:** admin auth now reads `profiles.role` — admin/super_admin full; developer → Projects/Tasks/Features & Bugs; sales → Leads/Deals/Clients/Bookings/Forms; marketing → Blog/Resources/Education/KPIs; anything else → /portal. `roleGateNav()` hides nav + guards `activateView()`; RLS enforces the data layer.
- **Security amendment (same day):** `hub-data` v4 auth-gates `export_code` — requires a Supabase session JWT (admin/super_admin or the linked client); token links can NO LONGER download code (`continuity` returns can_export:false + portal_url for token calls). client-hub Export card replaced with "🔐 Full Codebase Export — sign in to your client portal" linking to /portal.
- **portal.html:** Overview gains 🛡 Ownership & Continuity card — per-project "⬇ Download complete codebase" button (authenticated POST to hub-data export_code with the session access token → ZIP blob download, JSON reason on failure).
- **admin.html:** Continuity card gains 📧 Send Continuity Brief — modal with editable To/Subject/HTML-body preview (client email resolved via projects→clients→profiles; body lists the project's currently-visible global resources, portal link, Daniel/Eden/continuity-partner contact block) → `send-plain-email` (BCC daniel@knightops.biz) + stamps `projects.brief_sent_at` on success. Mark-sent button kept as manual fallback.
- **Successor:** `system_settings.successor` = Tim Wolfe (tim@timwolf.com, 405-505-6221) — used in client hub, portal, and the brief email (14-day activation note).
- **portal.html Resources:** list cards AND the resource detail view now show 👁 View (opens `resource.url` in a new tab) + ⬇ Download (fetch→blob→anchor with filename from url; falls back to opening the url) whenever the resource has a url (`resBtns()`/`resDownload()`). Detail's legacy `file_url`-only logic replaced (resources table has NO `file_url` column — global docs live in `url`).
- **New public page `/resources` (resources.html):** branded Resource Library — queries `resources` where is_global=true via anon key, grouped by category (continuity → "Business Continuity & Ownership", security → "Security & Access", support → "Support & Delivery", pricing → "Hosting & Pricing", compliance → "Compliance Readiness") with View/Download per doc + /book CTA. RLS blocks anon SELECT on `resources`, so the page ships a static fallback array of the 10 public-bucket PDFs (used on query error/empty — currently the active path). No vercel.json change needed (catch-all `/:path` → `/:path.html` rewrite serves it).
- **build_folder edit confirmed:** the admin 🛡 Continuity & Ownership card already includes the editable "Build folder (Mac)" field (`contInput` build_folder), saved with the other continuity fields — no change needed.
- **Repos flipped private (via API today):** `be-a-better-brand` + `planet-calm` are now private — the **GITHUB_TOKEN** Supabase secret is REQUIRED for their portal codebase export (`hub-data` export_code) to work.
- **Admin Resources = full library CRUD:** admin.html Resources view now has add/edit/delete with Category select (continuity/security/support/pricing/compliance/administrative/general), Sort order, and toggles for `is_global` ("Library resource"), `client_visible_default`, and `public_visible` ("Show on public /resources page"); rows show Library/Public badges + View/Download; files go in the `resources` bucket (`library/` path) or paste any URL.
- **Public /resources is now LIVE-driven by the DB:** new anon RLS lets the public page SELECT `resources` where `is_global=true AND public_visible=true` (ordered by sort_order; 'administrative' + 'general' category groups added; unknown categories group under "General"); the static fallback array remains only as an emergency backup.
- **Master Guide v2:** `knight-ops-master-guide.pdf` replaced with the comprehensive `knight-ops-master-guide-v2.pdf` (resources.html fallback + DB row point at v2).

---

## Changelog — 2026-07-09 (Claude AI Assistant Workshop funnel)

- **New pages:** `/workshop` (registration, date-based tier switching + live countdown), `/workshop-confirmed` (Stripe redirect target: Google/Apple/Outlook add-to-calendar + prep checklist), `/workshop-invite.ics` (both days, 11am–1pm PT Jul 23–24), `/workshop-zoom` (redirect page — **TODO: paste real Zoom URL into `ZOOM_URL` const**, currently shows "room opens soon").
- **Event:** "Use Claude to Build Your AI Assistant" — live 2-day, Thu 7/23 + Fri 7/24 2026, 11:00–1:00 PT, 20-seat cap.
- **Pricing tiers (say "Early Bird", NEVER "Founding"):** Early Bird $197 ends Fri 7/10 midnight PT → Standard $249 ends Sun 7/19 midnight PT → Final $297 until event start. Boundaries in `workshop.html` TIERS array (UTC: 07-11T07:00Z / 07-20T07:00Z / 07-23T18:00Z).
- **Stripe (LIVE, 10xUnicorn acct):** product `prod_Ur6oPVY98cyVmG`; payment links (each capped 20 completed sessions, metadata `workshop=claude-ai-assistant-2026-07` + `tier`): Early Bird https://buy.stripe.com/5kQdR84XB5z49Rz9b08g00T · Standard https://buy.stripe.com/7sYbJ0blZ7HcbZHevk8g00U · Final https://buy.stripe.com/9B6dR8ahVf9EbZHevk8g00V. All redirect to `/workshop-confirmed?session_id={CHECKOUT_SESSION_ID}&tier=...`.
- **Auto confirmation email:** Stripe webhook `we_1TrOo0BiXnUmQZ6kqPEA6Jvj` (checkout.session.completed) → edge fn **`workshop-stripe-webhook`** v2 (verify_jwt=false, HMAC signature verification w/ endpoint signing secret in code). Filters by metadata, inserts `workshop_registrations` (migration `create_workshop_registrations`, RLS locked to service role, idempotent by stripe_session_id), emails attendee (branded, from daniel@mail.knightops.biz, reply-to daniel@knightops.biz, calendar links + Claude-desktop-app/Fathom prep) + owner seat-count alert (N/20, warns at cap). Optional hardening: add `STRIPE_SECRET_KEY` Supabase secret → fn re-fetches session from Stripe API.
- **Particles:** workshop pages use tuned network (speed 0.24, link alpha 0.32 w/ variable width, radii 0.8–3.2).

---

## Changelog — 2026-07-03b (Auto-fix loop fix — claim timestamp + attempt cap + mandatory completion)

- **Root cause of looping bug fixes:** `bug_reports` has no `updated_at`, so the orchestrator's "fixing" cooldown `coalesce(updated_at,created_at)` silently fell back to `created_at` (always stale) — a bug claimed `fixing` but never moved to `fixed` (desktop build finished the code but skipped the status update) was re-picked every run.
- **Schema:** migration `add_autofix_started_at` adds `autofix_started_at` to `bug_reports` + `feature_requests`.
- **`api-autofix` v6 (server-side guards):** skips items already fixed/closed (or built); CLAIMS with `status='fixing'` + `autofix_started_at=now()` + `autofix_attempts+1`; enforces a 20-min claim cooldown + a 3-attempt cap (then sets `autofix_error='max_attempts'`, emails Daniel with action buttons, and stops); reverts status to `new`/`approved` on every failure path so nothing is left stuck in `fixing`. `force:true` bypasses guards for manual re-runs.
- **Orchestrator scheduled task updated:** STEP 0/STEP 1 queues use `autofix_started_at` + `autofix_attempts < 3`; the Terminal claim records `autofix_started_at` + increments attempts; and the desktop bug-fix AND feature-build prompts now END with a MANDATORY `report-completion` curl (marks fixed/built + summary + emails the client 👍/👎) instead of a raw status update — closing the loop for desktop builds too. Bugs past 3 attempts are surfaced to Daniel, not retried.
- **Commit-marker idempotency (`api-autofix` v7):** every fix/build commit now carries a unique marker (`[ko-fix:<id>]` / `[ko-feat:<id>]`). Before fixing, api-autofix scans the repo's recent commits for that marker — if the fix already shipped (even if a prior run forgot to update the DB), it marks the item done + skips. The orchestrator's desktop prompts embed the same marker and pre-check for it. Fast, repo-truth verification that a bug was already completed.
- **RLS was the deeper root cause (Vision Espresso loop):** the admin DB blocks RAW writes to `bug_reports`/`feature_requests` from the anon key, so a desktop build that PATCHed the row directly to mark it fixed was rejected — status never flipped → loop. FIX: **`report-completion` v2** runs as service role (bypasses RLS) and is now the ONLY write path the desktop uses — for shipped (fixed/built) AND for unclaim-to-new/approved (new `status` + `note` params). The orchestrator prompt forbids raw desktop PATCH/SQL and routes every status write through `report-completion`. Note: git-less projects (e.g. Vision Espresso deploys via `vercel deploy --prod`) can't use the commit-marker, so they rely on this. Verified: `report-completion` marked the stuck Vision Espresso bug `fixed` (write succeeded despite RLS); loop stopped.
- **Verified:** `api-autofix` on a fixed bug returns `skipped:already_fixed`; the stuck `fixing` bugs were cleared (0 stuck now).

---

## Changelog — 2026-07-03 (Status control, client thumbs up/down loop, build contract, transcripts)

- **Admin inline status control.** Every bug + feature in the global Features & Bugs module AND the per-project cards now has a status `<select>` (bugs: new/fixing/fixed/closed; features: pending/approved/revisions/rejected/building/built) → `setItemStatus()` writes directly. Setting fixed/built fires the completion notifier; moving off it clears `completion_notified_at` (re-arms so a later completion re-notifies). `statusSelect()`, `BUG_STATUSES`/`FEAT_STATUSES`.
- **Client completion report + 👍/👎.** `notify-completion` v2 mints a `feedback_token`; the client's completion email shows a brief "What we did" report + 👍 Yes / 👎 Not quite. New edge fn **`completion-feedback`**: 👍 sets `client_rating='up'` (bug→closed) + pings Daniel; 👎 serves a branded form (details + screenshot upload to bug-attachments) → sets `client_rating='down'`, appends `client_feedback` + screenshots, **reopens** (bug→new / feature→revisions), re-arms the notifier, emails Daniel the details + deep-link. Admin shows the 👍/👎 badge + client feedback on every card. Migration `add_client_feedback_fields` (feedback_token, client_rating, client_feedback).
- **Build-completion contract.** New **`report-completion`** edge fn: a build (desktop Claude Code or any worker) POSTs `{kind,id,summary,commit_url}` when done → sets status fixed/built + summary + commit → fires the client/owner completion emails. `feature-action` v5 approve stamps the contract into `admin_notes` so orchestrator-built features carry "when done, call report-completion" automatically; admin has a 🛠 copy-contract button per item.
- **Transcript enrichment.** `bug-report` v5 + `feature-request` v3: on submit, any Loom/YouTube URL in the description with no transcript is auto-transcribed via `transcribe-url` and appended to the description (persists → used by autofix vision + desktop builds + admin). 13s timeout, best-effort.
- **Edge fns:** `notify-completion` v2, `completion-feedback` v1 (new), `report-completion` v1 (new), `feature-action` v5, `bug-report` v5, `feature-request` v3. All verify_jwt=false.

---

## Changelog — 2026-07-02b (Attachment-aware autofix + client uploads + completion emails)

- **Autofix now uses screenshots/files (vision).** `api-autofix` v5: a bug/feature's `attachment_paths` (public `bug-attachments` bucket = persistent + re-readable at build time) are passed to Claude sonnet as image blocks (png/jpg/gif/webp) + document blocks (pdf) in BOTH the file-selection and fix steps. Prompts treat screenshots as the primary evidence of which page/element/error is meant, and set `confident=false` when ambiguous. `attachBlocks()` + a `claude()` wrapper that auto-retries text-only if an attachment URL is unfetchable (never hard-fails).
- **Client uploads encouraged.** `client-hub.html` bug + feature forms now have a prominent "📸 Screenshots / files (highly recommended)" multi-upload (images/pdf/docs) → `hubUpload()` posts to `bug-attachments` (`hub/<token>/…`) and passes `attachment_paths` to `bug-report`/`feature-request`. (feedback.html already had attachments.)
- **Attachments visible in admin.** `attHtml()` renders image thumbnails + file chips (public bucket) in the global Features & Bugs module rows and the per-project ✨/🐞 cards, so you can see the evidence before approving/building.
- **Completion emails (owner + client).** New edge fn **`notify-completion`** (verify_jwt=false) + DB triggers `trg_bug_completion` (bug status→fixed) / `trg_feature_completion` (feature status→built) via pg_net. On completion it emails the CLIENT a friendly done note (reporter/requester email, else project client) AND Daniel a technical note (summary + commit + deep-link). Idempotent via `completion_notified_at` (migration `add_completion_notified_at`). `api-autofix` v5 dropped its own success email so completion is single-source (no owner dupes). Covers BOTH API autofix and desktop-built completions.
- **Edge fns:** `api-autofix` v5, `notify-completion` v1 (new). Backfilled `action_token` on all existing bugs.

---

## Changelog — 2026-07-02 (Deep-links, favorites, Features & Bugs module, link types, email actions)

Admin UX + client-link expansion. All in `admin.html` + one new page + edge fns; deployed via git push (commits `d69d6ec`, `385e5f3`).

- **Record-level deep-links.** `admin.html` routing now deep-links every record: `#leads/{id}`, `#clients/{id}`, `#deals/{id}`, `#tasks/{id}`, `#projects/{id}`, plus `#projects/{id}/bug/{bugId}` and `#projects/{id}/feature/{featureId}` (auto-scrolls + highlights the card). Central `routeFromHash()` + `setRecordHash()` + `_ROUTING` guard; every `show*Detail()` pushes its hash; `hashchange`/`popstate` restore it. Survives refresh + back/forward. Feature/bug emails now link to these hashes.
- **Favorite projects.** `projects.is_favorite` (bool, migration `add_projects_is_favorite`). Star toggle in the projects list + detail header (`favStar()`/`toggleProjectFav()`); favorites sort to the top in `renderProjects()`.
- **Features & Bugs module (Delivery).** New nav child + `#v-featbugs` view + `loadFeatBugs()`: all `feature_requests` + `bug_reports` across every project, with type/status/project/search filters. Multi-select + bulk "Approve & build selected", "Approve & build ALL pending features", "Reject selected"; per-row inline "Add details / revise" → approve-with-notes / request revisions (features) or save notes (bugs). Bulk approve loops `feature-action`; bug reject sets `status='closed'`.
- **New permanent link types (4).** `project-link` v2 + `LABELS`/`PATHS` extended: `all_in_one`, `credentials`, `proposal_invoice`, `portal_access` (all → `/client-hub`), alongside existing `features_bugs`/`files_details`. Admin `loadProjectLinks()` renders all 6 rows (generate/copy/open/expiry/revoke).
- **`client-hub.html` (`/client-hub?t=`).** New all-in-one client page: tabs Bugs & Features (reuses `bug-report`/`feature-request` by token), Files (`project-files-view`), Credentials & Access (new `hub-data` → inserts `login_credentials.added_via_token`), Proposal & Invoices (`hub-data` load → invoices by project_id + proposals by lead_id). Default tab chosen by `link_type` via `resolve-link`. New edge fn **`hub-data`** (load + submit_credential; verify_jwt=false).
- **Email-draft composer (#6).** `📧 Draft email` button on every link row → `emailLinkDraft()` opens the in-app editor prefilled per-type (`EMAIL_LINK_TEMPLATES`), editable, `sendLinkDraft()` → `send-plain-email` from daniel@knightops.biz.
- **One-click email actions (#4).** `feature-request` v2 email now has Approve / ✋ Reject / 📝 Add-note buttons (GET links to `feature-action`) + deep-links to `#projects/{id}/feature/{id}`. `feature-action` v4 adds `note` action + branded note-form page. `bug-report` v4 stamps each bug with `action_token` (migration `add_bug_reports_action_token`) and adds 📝 Add-note / ✋ Close / Open-in-admin (deep-link) buttons per bug; new **`bug-action`** edge fn (note/close/reopen GET + note form). Auto-fix trigger preserved.
- **Autofix review emails (#4b).** `api-autofix` v3: the "needs your review" (low_confidence) email now carries one-click Approve/Reject/Note (features) or Note/Close/Open (bugs) buttons via `actionBtns()`. Backfilled `action_token` on all existing `bug_reports`.
- **End-of-day pending digest.** New edge fn **`pending-digest`** (verify_jwt=false): emails a branded queue of pending feature requests (status pending/error) + open bugs (status new/fixing) with one-click action buttons + deep-links, and a link to `#featbugs`. Sends ONLY when the queue is non-empty. pg_cron job **`pending-digest-6pm-pt`** `0 1 * * *` (= 6pm PT / PDT; shift to `0 2 * * *` if PST). Calls the fn via pg_net with the anon apikey (same pattern as roundtable reminders).
- **Edge fns touched:** `project-link` v2, `hub-data` v1 (new), `feature-action` v4, `feature-request` v2, `bug-report` v4, `bug-action` v1 (new), `api-autofix` v3, `pending-digest` v1 (new). All verify_jwt=false.

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
- **Client Project Details hub (renamed from "Client Mockup Approval").** That card now holds a **🔌 Build target** block: GitHub repo (auto-fix), **Vercel project ID** (`projects.vercel_project_id`, for building/deploying when there is no repo), the **working folder** (build_folder or AutoBuilds/<slug>), and an auto-fix toggle. `module-injection` v3 injects this build target into every generated prompt so Claude Code is told which folder to cd into + repo/Vercel target to build with. `dashboard_modules` +`prompt_style` (build/interview/audit); curated specs added for courses, prompt_generator, portal, leads, partner (Affiliate & Partner), email_automation (interview), system_polish + system_test (audit). Link creation fixed (`project_intake_tokens.expires_at` made nullable so "never expire" works). Orchestrator: bug fixes no longer require a linked repo — the Terminal path resolves the repo from Vercel/vault and fixes it.

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

### Rule 5: Run git on the Mac, never from the sandbox mount — use `ko`
**Superseded 2026-08-12.** The old rule said to clone to `/tmp` and push from there, because the
sandbox mount reports an immutable `.git/index.lock`. That lock is a *sandbox artifact only* —
git writes fine natively on the Mac (verified). But every /tmp-clone push left
`~/knight-ops-site` stale, so it drifted further from origin each session. On 2026-08-12 it had
reached **253 commits ahead / 112 behind** after a `git pull --rebase` was aborted mid-conflict,
leaving an orphaned `.git/AUTO_MERGE`. Local content was 130 files / 25k lines behind production.

**Do this instead.** Run git through the Mac shell (osascript `do shell script`, or ask Daniel to
run it in Terminal) against `~/knight-ops-site`. Never `git commit`/`push` from `/sessions/...`.

A helper is installed at `~/bin/ko`:
- `ko status` — ahead/behind/uncommitted at a glance
- `ko sync` — safe fast-forward; auto-stashes, refuses if you'd lose commits
- `ko deploy "message"` — blocks if behind origin, shows the diff, confirms, commits, pushes, then curls production
- `ko rescue` — for a diverged repo: archives commits to `archive/pre-sync-<date>`, stashes the working tree, clears rebase residue, resets to origin. Nothing is destroyed.

**Start every session touching this repo with `ko status`.** If it isn't `IN SYNC`, fix that before
editing anything. Reading/editing files through the mount is fine — only git operations must run
on the Mac.

Recovery from 2026-08-12: old commits are on branch `archive/pre-sync-2026-08-12`; the old working
tree is in `git stash list`.

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
- `roundtable-24h-reminder` — `0 19 * * 3` (Wed 12pm PT) — Zoom link + add-to-calendar
- `roundtable-5min-reminder` — `55 18 * * 4` (Thu 11:55am PT) — "starting in 5 min" + Zoom
- `roundtable-thankyou` — `0 21 * * 4` (Thu 2pm PT) — thanks + book a call (/book)
  (Roundtable moved to **Thursdays 12pm PT** on 2026-09-03; these are the live `cron.job` values as of 2026-09-04 — the doc had drifted a day and 2 hours behind the DB. The Automations module now shows the live schedule, so read it there rather than here.)

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
| `book-tech-call.html` | /book-tech-call | Systems Blueprint Session &mdash; **invitation only, never link publicly** |
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
| `workshop.html` | /workshop | Claude AI Assistant Workshop registration (Jul 23–24, 2026) |
| `workshop-confirmed.html` | /workshop-confirmed | Workshop Stripe redirect: calendar buttons + prep checklist |
| `workshop-zoom.html` | /workshop-zoom | Workshop Zoom redirect (set ZOOM_URL) |
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

- **Night Launch** ($1,497) — Multi-page conversion website
- **Night Build** ($7,497) — Full-stack web/mobile app
- **Night Build Pro** ($14,997) — Full app store deployment
- **Unicorn Universe Premium** ($99/mo) — Entrepreneur community
- **10xUnicorn Mastermind** ($10k/yr) — High-performer mastermind
- **Speaker Lead Engine** ($297) — Event lead capture system
- **AI Marketing Machine** ($99/mo) — Marketing automation

Daniel is also a public speaker and music artist. Communities: Unicorn Universe, Future Self Universe, 10xUnicorn Mastermind.
## Changelog — 2026-08-09 (Scale with Systems Live event offers)
- Added /engine + /engine-confirmed: Automation Engine checkout ($5,000 PIF or $1,500 deposit, Stripe payment links, Knight Ops Stripe acct)
- Added /scale-dashboard + /scale-confirmed: Scale Dashboard checkout ($15,000 PIF or $1,500 deposit)
- Deposit flow: confirmed pages read ?opt= and surface balance completion options

