# Knight Ops Mobile App Builder — Master Spec & Source of Truth

> **Status:** spec + build plan, 2026-09-02
> **Sibling:** `DASHBOARD-BUILDER-SPEC.md` (the web/dashboard equivalent)
> **Owner:** Daniel Knight

---

## 1. What This Is

A self-serve builder that turns uploaded source material (HTML, PDF, DOCX, XLSX, transcripts, screenshots, anything) into a **fully scoped, approved, buildable native mobile app**, then hands it to the build system to be built for real and shipped.

### The Two Layers (critical distinction — same frame as the dashboard builder)

| | Layer A — the Builder | Layer B — the Generated App |
|---|---|---|
| Lives in | `knight-ops-site` (this repo) | Its own GitHub repo + Supabase project + EAS project |
| Is | `mobile-intake.html`, `mb.html`, `mobile-*` edge fns, `mobile_builds` table | An Expo / React Native app |
| Ships to | knightops.biz (git push → Vercel) | App Store + Play Store (EAS Build) + optional web on Vercel |
| Built by | This plan | Claude Code, from the `BUILD-PROMPT.md` this builder emits |

Layer A never contains React Native. It **emits** the app.

---

## 2. Why This Is Structurally Different From The Dashboard Builder

The dashboard builder is **module-driven**: 37 `os_modules` → consolidated into ≤7 sidebar workspaces (`navWorkspaces()`, `MAX_NAV=7`). That model is wrong for a phone.

| Dimension | Dashboard Builder | Mobile App Builder |
|---|---|---|
| Unit of composition | Business module (`l2_crm_pipeline`) | **Screen** (`chat_thread`, `checkout`, `scan_capture`) |
| Navigation | Sidebar, ≤7 workspaces | **Tab bar, ≤5 tabs** (Apple HIG) + stacks + modals |
| Mockup | One desktop page in an iframe | **Multiple phone frames** side by side, with a tab bar |
| Extra axis | — | **Native capabilities** (camera, push, biometrics, offline…) |
| Extra axis | — | **Store readiness** (bundle id, privacy labels, IAP, screenshots) |
| Payments | Stripe | **Stripe *or* StoreKit IAP** — Apple forces IAP for digital goods |
| Output target | Next.js on Vercel | Expo/RN → EAS binary (+ optional RN Web on Vercel) |

So: new catalogs (`SCREENS`, `CAPABILITIES`, `APP_ARCHETYPES`), a new consolidation engine (`tabPlan()` with `MAX_TABS=5`), a phone-frame mockup renderer, and a store-readiness section the dashboard builder has no equivalent of.

---

## 3. Hard Rules (inherited + new)

Inherited from `CLAUDE.md`:
1. **Never overwrite `vercel.json`** — and this feature needs **zero** changes to it. `mobile-intake.html` and `mb.html` are served by the existing catch-all `/:path` → `/:path.html` (rule 14). Precedent: `/shift`.
2. **Deploy by `git push` only.** Never Vercel CLI.
3. **`node --check` BOTH inline `<script>` blocks of `admin.html`** after editing, and read the full output — never `| tail -1`. Then run the onclick-target check.
4. **One app = one Supabase project** (Rule 7). Every generated app gets its own.
5. Anon-key-from-browser is the house pattern; every edge fn is `verify_jwt=false` and self-verifies by token.

New to this feature:
6. **Never emit a wrapper.** No Capacitor, no Cordova, no WebView-shell. App Store Guideline **4.2 (Minimum Functionality)** rejects repackaged websites. The generated app uses native navigation and native components or it does not ship.
7. **Digital goods must use StoreKit IAP**, not Stripe (Guideline 3.1.1). Stripe is only correct for physical goods and real-world services. The builder decides this and says so out loud.

---

## 4. The Classifier — "can this be an App Store app?"

Daniel's requirement: *"the app builder should determine if it's going to be something that can be deployed in the App Store and if so, then it needs to be actual code and not just a capacitor or a wrapper."*

`mobile-analyze` returns **`target`** ∈ `web` | `native` | `both`, plus `target_reason`.

Decision rules it is given:
- **native** if the app needs a device capability the browser can't do well: camera/scanning, push notifications, biometrics, background location, offline-first, HealthKit, BLE, widgets, Live Activities.
- **native** if it is consumer-facing and used daily/in-the-moment (habit, field work, social, booking-on-the-go).
- **web** if it is CRUD/admin/reporting/back-office — that is a **dashboard**, and the builder says so and points at `/dashboard-intake` instead of building a weak app.
- **both** if there is a real consumer app *and* an operator back-office.
- **Refuse-to-wrap gate:** if the honest answer is "this is a website in a shell", it returns `web` with a reason, rather than producing something Apple will reject under 4.2.

---

## 5. Store Readiness (the part that makes it real)

Encoded as a checklist the builder fills in and the build prompt enforces. These are the actual rejection traps:

| Guideline | Rule | Builder field |
|---|---|---|
| 4.2 | No minimum-functionality wrappers | enforced by §4 gate + native stack |
| 3.1.1 | Digital goods/subscriptions → **StoreKit IAP**, not Stripe | `monetization` (`none`/`iap`/`stripe_physical`/`both`) |
| 5.1.1(v) | Account creation ⇒ **in-app account deletion** required | `account_deletion` (forced true when auth is on) |
| 4.8 | Third-party social login ⇒ **Sign in with Apple** required | `auth_methods` |
| 5.1.1 | Privacy policy URL required; privacy "nutrition label" answers | `privacy_url`, `data_collected[]` |
| 2.1 | Demo account for review if login-gated | `review_demo_account` |
| — | Age rating, export compliance, APNs key for push | `age_rating`, `uses_encryption`, `push_enabled` |

Output artifact: **`STORE.md`** — bundle identifiers, listing copy (name ≤30 chars, subtitle ≤30, keywords ≤100, description), asset checklist (1024² icon, 6.7"/6.5"/5.5" screenshots, Play feature graphic), privacy answers, and the IAP decision with its reasoning.

**Depth of automation (Daniel's call):** the pipeline goes all the way to a **signed, store-ready binary via EAS Build**. It does **not** auto-submit — no Apple/Google credentials are stored in Knight Ops. Daniel does the final submit, which is also the right place for a human to read the listing.

---

## 6. Catalogs (Layer A data)

### 6.1 `APP_ARCHETYPES` — the preset row (like `PRESETS`)
`marketplace` · `booking_service` · `course_content` · `community_social` · `tracker_habit` · `commerce` · `field_ops` · `client_companion`

### 6.2 `SCREENS` — the composition unit (~32 entries)
Shape mirrors `MODULES`:
```js
{k:'chat_thread', t:'messages', l:'Chat Thread', d:'One conversation, realtime',
 cap:['push'], f:['Realtime messages','Typing indicator','Image attach','Read receipts']}
```
`k` key · `t` tab bucket · `l` label · `d` one-line benefit · `cap` capabilities it implies · `f` selectable features.

Tab buckets: `home` `discover` `create` `library` `activity` `profile` `commerce` `booking` `messages` `progress` `admin`.

Representative screens: onboarding, auth (sign in/up/reset/Apple), permission primer, home feed, item detail, search+filter, map, camera/scan capture, media upload, create/edit form, list/collection, saved, cart, checkout, order status, booking calendar, slot picker, chat list, chat thread, notification inbox, profile, edit profile, settings, paywall/subscription, progress stats, streak, leaderboard, admin moderation, offline queue, deep-link handler, **account deletion** (auto-added when auth is on).

### 6.3 `CAPABILITIES` — native surface
`push` `camera` `photos` `biometrics` `location` `location_bg` `maps` `offline` `files` `health` `calendar` `contacts` `share` `haptics` `iap` `deeplinks` `background_tasks` `widgets` `live_activities`
Each carries its Expo package and the `app.config` permission strings + usage-description copy (iOS rejects missing/vague `NS*UsageDescription`).

### 6.4 `tabPlan()` — the consolidation engine (mobile analogue of `navWorkspaces()`)
`MAX_TABS = 5`. Bucket selected screens by `t`; pin Home first and Profile/Settings last; rank the middle by screen count; anything over the cap **folds into a sibling tab as a segmented control** (not a "More" tab — Apple's More tab is a UX smell). Returns `[{t,label,purpose,screens[],merged[]}]`, ≤5 long.

---

## 7. Layer B — the generated app stack

- **Expo SDK (latest) + expo-router** (file-based, typed routes) + **TypeScript**
- **Supabase** — auth, Postgres, storage, realtime; its own project (Rule 7)
- **EAS Build** with `development` / `preview` / `production` profiles; `eas.json` + `app.config.ts` generated with the real bundle ids
- **expo-updates** for OTA fixes that don't need review
- **expo-notifications** when `push`
- **StoreKit via expo-in-app-purchases / RevenueCat** when `monetization=iap`
- **React Native Web + Vercel** only when `target` is `web` or `both`
- Design tokens generated from the brand palette; native components throughout (no WebView shells)

---

## 8. Data Model (Layer A)

**`mobile_builds`** — mirrors `dashboard_builds` (same lifecycle, tokens, mockup columns) plus:
`target`, `target_reason`, `archetype`, `screens jsonb`, `tabs jsonb`, `capabilities jsonb`, `monetization`, `auth_methods jsonb`, `store jsonb` (bundle ids, listing copy, privacy answers, asset checklist), `eas_project_id`, `store_md`, `build_live_url`, `build_repo_url`, `build_stage`, `build_progress`.

**`mobile_jobs`** — mirror of `dashboard_jobs` for segmented generation (RLS on, zero policies = service role only).

**Storage:** `mobile-assets` bucket (public read, anon insert) — same shape as `dashboard-assets`. Public is required because PDFs/screenshots are handed to Claude **by URL**; paths are timestamp-prefixed and the bucket is not listable.

**Lifecycle — ONE path, deliberately simpler than the dashboard's:**
`draft → submitted → reviewed → approved → building → built` (or `error`).

The dashboard builder has a real bug here worth *not* inheriting: two different approve paths write two different "ready" states — `dashboard-build:approve` writes `approved`, while `dashboard-mockups:approve_style` and `dashboard-kickoff` write `queued`. The orchestrator polled for `queued` and so silently skipped every `approved` build for months. **The mobile builder has exactly one ready state (`approved`) and one approve path.**

### Three security fixes — do NOT copy these from the dashboard builder

1. **No anon SELECT.** `dashboard_builds` carries `dashboard_builds_anon_read USING (true)`, so anyone holding the public anon key can read every column of every build — including `resume_token`, `share_edit_token`, `email` and `build_prompt`. `mobile_builds` gets **zero anon policies**: admin (`is_admin()`) + `service_role` only. Every read and write goes through an edge function, which is the trust boundary. `mobile_jobs` likewise (RLS on, zero policies — the pattern `dashboard_jobs` already gets right).
2. **Gate the AI spend.** `dashboard-analyze` and `dashboard-job` are fully unauthenticated — anyone with the anon key can burn Anthropic tokens. `mobile-analyze` and `mobile-job` require a valid `resume_token` (or a share token) on the row and enforce a per-build segment cap.
3. **One FIELDS allow-list.** `dashboard-build` (41 entries) and `dashboard-mockups` (34) have already drifted, so a field saved by one path is silently dropped by the other. The mobile set defines `FIELDS` **once** in `mobile-build` and every other function imports the same list.

---

## 9. Edge Functions

A parallel `mobile-*` set, deliberately **not** shared with `dashboard-*` (isolation over DRY — the dashboard path is live and working; its structural guard is nav-specific and would need to become tab-specific).

| Function | Actions | Notes |
|---|---|---|
| `mobile-analyze` | (single) | Reads brief + `uploads_text` + PDF/image URLs → returns `suggested` field map incl. `target`, `archetype`, `screens`, `capabilities`, `monetization`, store answers |
| `mobile-job` | `start` `step` `status` `cancel` | Segmented generation (copy of `dashboard-job`'s proven internals: assistant prefill, `thinking:disabled`, `stop_reason==='max_tokens'` loop, `textOf()` for thinking-model content arrays, ~150s edge wall). Guard swapped: **tab bar present + screen count ≥ 60% of base** on a patch |
| `mobile-build` | `save` `resume` `submit` `approve` `save_edit` | Explicit `FIELDS` allow-list (same discipline — a field not in the list is silently dropped). On `submit`: creates lead + project + an `intake_submissions` row with `form_type='mobile_app'` |
| `mobile-shared` | (token) | Token-scoped read for `/mb`; server decides `review` vs `edit` from which token was presented |
| `mobile-mockups` | `add` `choose` | SHA-256 dedupe (the duplicate-mockup bug), variation labels |

All `verify_jwt=false`, called with the anon key. Models via env: `MOBILE_ANALYZE_MODEL` (opus-class, runs once), `MOBILE_MOCKUP_MODEL` (sonnet-class, output-bound), `MOBILE_CLASSIFY_MODEL` (haiku), `MOBILE_SEG_TOKENS`.

---

## 10. Pages

### `mobile-intake.html` → `/mobile-intake`
Single file, no framework, gold-on-dark house style, two columns (form left, sticky **phone preview** right). Sections:
0. Archetype presets · 1. Client & app basics · 2. **Screens** (grouped by tab, collapsible) · 3. Features per screen · 4. **Native capabilities** · 5. Auth, roles & data · 6. **Monetization** (with the IAP verdict shown inline) · 7. **Store listing & privacy** · 8. Files, paths & final notes.

Reuses the proven upload pipeline verbatim: `TEXT_RE`/`DOCX_RE`/`SHEET_RE`/`PDF_RE`/`IMG_RE`, mammoth + SheetJS from CDN, PDFs/images handed to Claude **by public URL**, `S.reads` + `await Promise.allSettled(S.reads)` drained at the top of `analyzeApp()` (this is the fix for the silent "empty uploads_text" bug), `TEXT_BUDGET=400000`, amber "N not readable by AI" chip.

Reuses the job-loop verbatim: `start` → `step` ×N, `_runToken` staleness guard, `_prevMock` + Revert, `_mockRepair`, no progressive repaint while patching, 180s stall abort, non-streaming fallback.

### `mb.html` → `/mb?t=<token>`
Client-facing review/approve, mirroring `db.html`: phone-frame mockup + variation chips, "What we'll build" (screens by tab, capabilities, store target), approve / note / pick-style / revise, and a narrow edit form in edit mode.

---

## 11. Admin Integration (`admin.html`)

House patterns confirmed; five small, surgical edits:
1. **Nav + view** — `.nav-child data-view="mobileApps"` in the Delivery group + `<div class="view" id="v-mobileApps">`, a `titleMap` entry, `if(v==='mobileApps')loadMobileApps();` in `activateView`, and the key in `ROLE_VIEWS.developer`. Click binding is generic — nothing to wire.
2. **Deep link** — one `else if(view==='mobileApps'&&parts[1])` in `routeFromHash()`, and `setRecordHash('mobileApps',id)` at the top of `showMobileAppDetail()`.
3. **Project detail card** — "📱 Mobile App Build" using the house `table-card` pattern, modelled on `renderMockupCard()` / `_mockLifecycle()` (queued/building/built/error + 15s poll while building).
4. **Build Prompt Generator** — a 6th button `📱 Mobile App` → `showMobileAppPrompt(id)`. Touches the card string plus **both** hardcoded button-id arrays (`showBuildPrompt`, `dashHi`) and `showCCPrompt`'s copy.
5. **Forms & Surveys** — one line: `mobile_app:'Mobile App Build'` in `FS_FORM_LABELS`. Submissions surface as `intake_submissions` rows with `form_type='mobile_app'`; no `FS_TABLE_MAP` change needed.

Adjacent bug fixed while in there: `S.dashboardBuilds` is referenced by `showDashboardPrompt()` but **never initialized or populated**, so its "use the saved build_prompt" short-circuit has never fired. Initialize + load it, and mirror it correctly for mobile.

---

## 12. Build Pipeline (how it actually gets built and goes live)

New **STEP 4** in `~/Claude Home/Scheduled/knight-ops-autobuild-orchestrator/SKILL.md`, mirroring STEP 3:

```sql
select count(*) from mobile_builds
where status='approved' and chosen_mockup is not null
  and project_id is not null and built_at is null
```
Claim atomically: `update mobile_builds set status='building', build_started_at=now(), build_folder=… where id=… and status='approved'`.
Then STEP 0.5 folder resolution → `trust.py` → `run.sh` with the buildlock preamble → `claude --model claude-fable-5-1 --effort medium --dangerously-skip-permissions "$(cat BUILD-PROMPT.md)"` via `osascript`.

The desktop session writes `PLAN-<id>.md` before code, then: scaffolds the Expo app, stands up **new** Supabase + GitHub + EAS (+ Vercel when `target` includes web), implements every screen to match `MOCKUP.html`, wires the capabilities, runs `npx tsc --noEmit` + `expo-doctor` clean, produces an **EAS production build**, and verifies. Writes back `status='built'`, `built_at`, `build_repo_url`, `build_live_url`, `eas_project_id`, plus `projects.repo_url` / `build_folder` / `platform`.

Because the cloud worker now has push access to all 10xUnicorn repos, cloud can also carry mobile follow-up fixes; the initial scaffold stays on desktop (it provisions new infra and needs Xcode-adjacent tooling).

---

## 13. Phases

1. **Migration** — `mobile_builds`, `mobile_jobs`, `mobile-assets` bucket, RLS.
2. **Edge functions** — `mobile-analyze`, `mobile-job`, `mobile-build`, `mobile-shared`, `mobile-mockups`.
3. **`mobile-intake.html`** — catalogs, upload pipeline, phone preview, analyze, mockup job loop, prompt/spec/store generators, save/finalize/share.
4. **`mb.html`** — client review/approve.
5. **`admin.html`** — the five integration points + the `S.dashboardBuilds` fix.
6. **Orchestrator STEP 4** + `BUILD-PROMPT` template for Expo/EAS.
7. **Verify** — §14.

---

## 14. Verification

- `node --check` on **both** `admin.html` inline script blocks, full output read; onclick-target check passes.
- New pages parse; `/mobile-intake` and `/mb` resolve through the catch-all with **no `vercel.json` diff**.
- Round trip: upload a mixed doc set (PDF + DOCX + XLSX + HTML) → analyze pre-fills → mockup renders phone frames → save → resume by token → finalize → `/mb?t=` review → approve → row reaches `status='approved'`.
- Classifier sanity: a CRUD/back-office brief returns `web` (and points at the dashboard builder); a camera/push brief returns `native`.
- IAP gate: a "sell a course in-app" brief sets `monetization='iap'` and says why Stripe would be rejected.
- Anon cannot read `mobile_jobs`; `mobile-shared` refuses a bad token.
- Test rows removed afterward; counts back to baseline.

---

## 15. Open Decisions — resolved 2026-09-02

- **Native stack:** Expo + React Native (real native, matches Mad Fresh / Lil' Sass). ✔
- **Store depth:** build a store-ready binary; Daniel submits. No Apple/Google creds stored. ✔
- **Web companion:** the AI classifier decides `web | native | both`. ✔
- **`os_modules.l8_mobile`** ("Mobile Experience": responsive / install to home screen / push) stays as-is — it describes a *dashboard's* mobile behaviour, which is a different thing from a native app. The mobile builder does not replace it.
